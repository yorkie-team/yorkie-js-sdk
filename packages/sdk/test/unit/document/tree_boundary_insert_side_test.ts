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
 * `replicas` returns `n` replicas seeded with `<doc><p>ab</p></doc>`.
 */
function replicas(n: number): Array<TestDoc> {
  const docs: Array<TestDoc> = [];
  for (let i = 0; i < n; i++) {
    const doc: TestDoc = new Document('test-doc');
    doc.setActor(String(i + 1).padStart(24, '0'));
    docs.push(doc);
  }
  docs[0].update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
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
