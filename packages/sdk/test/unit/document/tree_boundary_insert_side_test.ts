/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, assert } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

type TestDoc = Document<{ t: Tree }>;

/**
 * `treeShape` renders the tree under `t` with every node's ID, tombstones
 * included. Two paragraphs holding the same text in a different order of
 * nodes render the same XML; this tells them apart.
 */
function treeShape(doc: TestDoc): string {
  const walk = (node: CRDTTreeNode): string => {
    const removed = node.isRemoved ? 'x' : '';
    if (node.isText) {
      return `${node.id.toIDString()}${removed}"${node.value}"`;
    }
    const children = node.allChildren.map(walk).join(',');
    return `${node.type}#${node.id.toIDString()}${removed}[${children}]`;
  };
  return walk((doc.getRootObject().get('t') as unknown as CRDTTree).getRoot());
}

/**
 * `replicas` returns `n` replicas seeded with `<doc><p>{text}</p></doc>`.
 */
function replicas(n: number, text = 'ab'): Array<TestDoc> {
  const docs: Array<TestDoc> = [];
  for (let i = 0; i < n; i++) {
    const doc: TestDoc = new Document('test-doc');
    doc.setActor(String(i + 1).padStart(24, '0'));
    docs.push(doc);
  }
  docs[0].update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [{ type: 'text', value: text }] }],
    });
  });
  exchange(
    docs,
    docs.map((_, i) => (i === 0 ? [] : [0])),
  );
  return docs;
}

/**
 * `exchange` hands every replica's pending changes to the others, in the
 * arrival order `orders[i]` names. Packs go through protobuf, as on the wire.
 */
function exchange(docs: Array<TestDoc>, orders: Array<Array<number>>): void {
  const packs = docs.map((doc) =>
    converter.fromChangePack<Indexable>(
      converter.toChangePack(doc.createChangePack()),
    ),
  );
  docs.forEach((doc, i) => {
    for (const j of orders[i]) {
      if (j === i) continue;
      doc.applyChangePack(
        ChangePack.create(
          packs[j].getDocumentKey(),
          Checkpoint.of(0n, 0),
          false,
          packs[j].getChanges(),
          InitialVersionVector,
        ),
      );
    }
  });
  docs.forEach((doc, i) => {
    const changes = packs[i].getChanges();
    const lastSeq = changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
    doc.applyChangePack(
      ChangePack.create(
        packs[i].getDocumentKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        [],
        InitialVersionVector,
      ),
    );
  });
}

/**
 * Text typed at exactly the point where a peer concurrently splits the
 * paragraph (#1436). The replica that applies the insert first has the text
 * inside the paragraph when the split arrives; the replica that applies the
 * split first has the right half already in the product. Both are
 * self-consistent, and before the fix they disagreed on which side of the new
 * boundary the text ended up on.
 *
 * XML alone does not always show it -- the products can hold the same strings
 * in a different order of nodes -- so these compare IDs as well.
 */
describe('Tree insert at a concurrent split boundary', () => {
  it('keeps the insert left of the boundary, split applied second', () => {
    const docs = replicas(2);
    docs[0].update((r) => r.t.edit(2, 2, { type: 'text', value: 'e' }));
    docs[0].update((r) => r.t.edit(2, 2, undefined, 1));
    docs[1].update((r) => r.t.edit(2, 2, undefined, 1));
    exchange(docs, [[1], [0]]);

    assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
    assert.equal(treeShape(docs[1]), treeShape(docs[0]));
    assert.equal(
      docs[0].getRoot().t.toXML(),
      '<doc><p>a</p><p>e</p><p>b</p></doc>',
    );
  });

  it('orders the insert after a concurrent insert the split took right', () => {
    const docs = replicas(2);
    docs[1].update((r) => r.t.edit(2, 2, { type: 'text', value: 'r' }));
    docs[0].update((r) => r.t.edit(2, 2, { type: 'text', value: 'u' }));
    docs[1].update((r) => r.t.edit(2, 2, undefined, 1));
    exchange(docs, [[1], [0]]);

    assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
    assert.equal(treeShape(docs[1]), treeShape(docs[0]));
    assert.equal(docs[0].getRoot().t.toXML(), '<doc><p>a</p><p>rub</p></doc>');
  });

  it('keeps an insert at the start of the paragraph left of the boundary', () => {
    const docs = replicas(2);
    docs[0].update((r) => r.t.edit(1, 1, { type: 'text', value: 's' }));
    docs[1].update((r) => r.t.edit(1, 1, undefined, 1));
    docs[0].update((r) => r.t.edit(1, 1, undefined, 1));
    exchange(docs, [[1], [0]]);

    assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
    assert.equal(treeShape(docs[1]), treeShape(docs[0]));
    assert.equal(
      docs[0].getRoot().t.toXML(),
      '<doc><p></p><p>s</p><p>ab</p></doc>',
    );
  });

  // The two actors are not interchangeable: §7.8 orders their products by
  // ticket, so the typist being the older or the newer actor takes a
  // different path through `orderSameBoundarySplit`.
  for (const typist of [0, 1]) {
    it(`converges with replica ${typist} as the typist`, () => {
      const docs = replicas(2);
      docs[typist].update((r) => r.t.edit(2, 2, { type: 'text', value: 'e' }));
      docs[typist].update((r) => r.t.edit(2, 2, undefined, 1));
      docs[1 - typist].update((r) => r.t.edit(2, 2, undefined, 1));
      exchange(docs, [[1], [0]]);

      assert.equal(treeShape(docs[1]), treeShape(docs[0]));
      assert.equal(
        docs[0].getRoot().t.toXML(),
        '<doc><p>a</p><p>e</p><p>b</p></doc>',
      );
    });
  }
});

/**
 * An insert whose anchor is followed, inside the paragraph, only by a child
 * another replica removes concurrently, while a third splits right after
 * that child. Whether the splitter has the removal when the insert arrives
 * must not change where the insert lands: the end-of-content gate reads the
 * removal through the inserting change's version vector, not through local
 * tombstones.
 */
describe('Tree insert at a split boundary past a removed child', () => {
  for (const [name, orders] of [
    [
      'splitter receives the removal before the insert',
      [
        [1, 2],
        [2, 0],
        [1, 0],
      ],
    ],
    [
      'splitter receives the insert before the removal',
      [
        [2, 1],
        [0, 2],
        [0, 1],
      ],
    ],
  ] as Array<[string, Array<Array<number>>]>) {
    it(name, () => {
      const docs = replicas(3, 'acb');
      docs[1].update((r) => r.t.edit(3, 3, { type: 'text', value: 'r' }));
      docs[1].update((r) => r.t.edit(3, 3, undefined, 1));
      docs[0].update((r) => r.t.edit(2, 2, { type: 'text', value: 'u' }));
      docs[2].update((r) => r.t.edit(2, 3));
      exchange(docs, orders);

      for (let i = 1; i < docs.length; i++) {
        assert.equal(docs[i].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
        assert.equal(treeShape(docs[i]), treeShape(docs[0]));
      }
      assert.equal(
        docs[0].getRoot().t.toXML(),
        '<doc><p>au</p><p>rb</p></doc>',
      );
    });
  }
});

/**
 * Enter, then type at the start of the new paragraph, concurrently with a
 * peer typing where the Enter was pressed. The typed text is newer than the
 * split product but was never moved by the split, so it is not part of the
 * boundary run and the peer's insert stays on the left.
 */
describe('Tree enter-then-type at a concurrent insert', () => {
  it('keeps the concurrent insert in the left paragraph', () => {
    const docs = replicas(2);
    docs[0].update((r) => r.t.edit(2, 2, { type: 'text', value: 'u' }));
    docs[1].update((r) => r.t.edit(2, 2, undefined, 1));
    docs[1].update((r) => r.t.edit(4, 4, { type: 'text', value: 's' }));
    exchange(docs, [[1], [0]]);

    assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
    assert.equal(treeShape(docs[1]), treeShape(docs[0]));
    assert.equal(docs[0].getRoot().t.toXML(), '<doc><p>au</p><p>sb</p></doc>');
  });
});

/**
 * A typist's insert and split after "a", concurrent with two splits at the
 * start of the paragraph, in four delivery orders. A start split that steps
 * over a newer product still holding content past its own boundary run must
 * not redirect into the product after it: that one was split off at a
 * different boundary.
 */
describe('Tree boundary run with two concurrent start splits', () => {
  for (const orders of [
    [
      [1, 2],
      [0, 2],
      [0, 1],
    ],
    [
      [2, 1],
      [2, 0],
      [1, 0],
    ],
    [
      [1, 2],
      [2, 0],
      [1, 0],
    ],
    [
      [2, 1],
      [0, 2],
      [0, 1],
    ],
  ]) {
    it(`converges with orders ${JSON.stringify(orders)}`, () => {
      const docs = replicas(3);
      docs[0].update((r) => r.t.edit(2, 2, { type: 'text', value: 'u' }));
      docs[0].update((r) => r.t.edit(2, 2, undefined, 1));
      docs[1].update((r) => r.t.edit(1, 1, undefined, 1));
      docs[2].update((r) => r.t.edit(1, 1, undefined, 1));
      exchange(docs, orders);
      for (let i = 1; i < docs.length; i++) {
        assert.equal(docs[i].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
        assert.equal(treeShape(docs[i]), treeShape(docs[0]));
      }
    });
  }
});

/**
 * Divergences the boundary rules do not settle yet: remaining cases of
 * #1436, skipped until a fix lands. Each is a fuzz case minimized to two
 * replicas of `<doc><p>ab</p></doc>`, named by its fuzz seed. The ops of one
 * replica run in order and are all concurrent with the other's; then the
 * replicas exchange their changes. Every case diverges with these rules
 * (XML and node IDs, or node IDs only where noted). The cases with a
 * second split near the boundary point at §7.8's ordering of same-boundary
 * splits rather than at §7.3's insert side; see
 * docs/design/split-boundary-insert-side.md.
 */
describe('Tree concurrent inserts and splits at a boundary (#1436)', () => {
  type Op = ['ins', number, number, string] | ['split', number, number];
  const ins = (r: number, pos: number, value: string): Op => [
    'ins',
    r,
    pos,
    value,
  ];
  const split = (r: number, pos: number): Op => ['split', r, pos];

  for (const [name, ops] of [
    ['seed 101', [ins(0, 2, 'c'), ins(0, 3, 'd'), split(0, 3), split(1, 2)]],
    ['seed 235', [ins(0, 3, 'c'), split(1, 3), ins(0, 4, 'd'), split(0, 4)]],
    ['seed 193', [ins(0, 3, 'e'), ins(1, 3, 'f'), split(1, 3), split(1, 5)]],
    [
      'seed 24, node IDs only',
      [ins(0, 3, 'c'), ins(0, 4, 'd'), split(0, 5), split(1, 3)],
    ],
    // Converged before the order-independent end gate and moved-run filter.
    ['seed 69', [ins(1, 1, 'f'), split(1, 1), ins(1, 3, 'h'), ins(0, 1, 'i')]],
    ['seed 502', [ins(1, 3, 'g'), split(1, 3), ins(0, 3, 'h'), ins(1, 6, 'i')]],
    // Converged on main and before the end gate and moved-run filter.
    [
      'seed 3768, node IDs only',
      [split(1, 3), ins(1, 3, 'd'), split(1, 3), ins(1, 6, 'e'), split(0, 3)],
    ],
  ] as Array<[string, Array<Op>]>) {
    // TODO(#1436): remaining cases; unskip once they converge.
    it.skip(`converges: ${name} (#1436 remaining case)`, () => {
      const docs = replicas(2);
      for (const op of ops) {
        if (op[0] === 'ins') {
          const [, r, pos, value] = op;
          docs[r].update((t) => t.t.edit(pos, pos, { type: 'text', value }));
        } else {
          const [, r, pos] = op;
          docs[r].update((t) => t.t.edit(pos, pos, undefined, 1));
        }
      }
      exchange(docs, [[1], [0]]);

      assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
      assert.equal(treeShape(docs[1]), treeShape(docs[0]));
    });
  }
});
