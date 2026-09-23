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
import {
  CRDTTree,
  CRDTTreeNode,
  ElementNode,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

type TestDoc = Document<{ t: Tree }>;

/**
 * `treeShape` renders the tree under `t` with every node's ID, tombstones
 * included. XML cannot tell two empty `<p>`s apart; this can, so it is what
 * the convergence checks below compare.
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
 * `replicas` returns `n` replicas seeded with
 * `<doc><p><span>abcde</span></p></doc>`.
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
      children: [
        {
          type: 'p',
          children: [
            { type: 'span', children: [{ type: 'text', value: 'abcde' }] },
          ],
        },
      ],
    });
  });
  exchange(
    docs,
    docs.map((_, i) => (i === 0 ? [] : [0])),
  );
  return docs;
}

/**
 * `exchange` hands every replica's pending changes to the others.
 * `orders[i]` lists, in arrival order, whose changes replica `i` receives, so
 * each replica can see the concurrent changes in a different order. Packs go
 * through protobuf, as on the wire: handing a change object to another
 * document lets the receiver rewrite its version vector in place.
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
 * Concurrent element splits of one node at one boundary have to end up in
 * the same order on every replica, whatever order the replicas apply them in.
 *
 * The products of those splits are placed directly after the node they
 * split, so without an ordering rule they sit in arrival order. XML hides it
 * -- all but the last product are empty -- until a position-based operation
 * lands on the difference: a range delete over the root then leaves an empty
 * node on one replica for good, and an empty node between two halves carries
 * different attributes on each replica.
 */
describe('Tree concurrent split at the same boundary', () => {
  const cases: Array<[string, (t: Tree) => void]> = [
    ['paragraph split', (t) => t.splitByPath([0, 1])],
    ['span split', (t) => t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1)],
    [
      'span and paragraph split in one edit',
      (t) => t.editByPath([0, 0, 3], [0, 0, 3], undefined, 2),
    ],
    [
      'span split, then paragraph split in a second edit',
      (t) => {
        t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1);
        t.splitByPath([0, 1]);
      },
    ],
    [
      'the same at the end of the text',
      (t) => {
        t.editByPath([0, 0, 5], [0, 0, 5], undefined, 1);
        t.splitByPath([0, 1]);
      },
    ],
  ];

  for (const [name, split] of cases) {
    it(`${name}: two replicas, and a range delete afterwards`, () => {
      const docs = replicas(2);
      docs.forEach((doc) => doc.update((root) => split(root.t)));
      exchange(docs, [[1], [0]]);

      assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
      assert.equal(treeShape(docs[1]), treeShape(docs[0]));

      docs[0].update((root) => {
        const tree = root.t;
        tree.editByPath(
          [0],
          [(tree.getRootTreeNode() as ElementNode).children.length],
        );
      });
      exchange(docs, [[1], [0]]);

      assert.equal(docs[0].getRoot().t.toXML(), '<doc></doc>');
      assert.equal(docs[1].getRoot().t.toXML(), '<doc></doc>');
    });

    it(`${name}: three replicas, each in a different arrival order`, () => {
      const docs = replicas(3);
      docs.forEach((doc) => doc.update((root) => split(root.t)));
      exchange(docs, [
        [2, 1],
        [0, 2],
        [1, 0],
      ]);

      const shape = treeShape(docs[0]);
      assert.equal(treeShape(docs[1]), shape);
      assert.equal(treeShape(docs[2]), shape);
      assert.include(docs[0].getRoot().t.toXML(), 'abc');
    });
  }

  it('the empty node between two halves carries the same attributes everywhere', () => {
    const docs = replicas(2);
    docs[0].update((root) => {
      root.t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1);
      root.t.styleByPath([0, 0], { bold: 'true' });
    });
    docs[1].update((root) => {
      root.t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1);
      root.t.styleByPath([0, 1], { italic: 'true' });
    });
    exchange(docs, [[1], [0]]);

    assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
  });
});
