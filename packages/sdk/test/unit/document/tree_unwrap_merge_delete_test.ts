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
 * `liveTreeShape` is `treeShape` minus the tombstones. Where two replicas
 * agree on every visible node's identity and order but not on where a
 * tombstone sits among them, this is the part of convergence that holds.
 */
function liveTreeShape(doc: TestDoc): string {
  const walk = (node: CRDTTreeNode): string => {
    if (node.isText) {
      return `${node.id.toIDString()}"${node.value}"`;
    }
    const children = node.children.map(walk).join(',');
    return `${node.type}#${node.id.toIDString()}[${children}]`;
  };
  return walk((doc.getRootObject().get('t') as unknown as CRDTTree).getRoot());
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
 * `twoParagraphReplicas` returns two replicas seeded with
 * `<r><p>ab</p><p>cd</p></r>`, whose token indexes are
 *
 *      0   1 2   3    4   5 6   7    8
 *     <r> <p> a b </p> <p> c d </p> </r>
 */
function twoParagraphReplicas(): Array<TestDoc> {
  const docs: Array<TestDoc> = [];
  for (let i = 0; i < 2; i++) {
    const doc: TestDoc = new Document('test-doc');
    doc.setActor(String(i + 1).padStart(24, '0'));
    docs.push(doc);
  }
  docs[0].update((root) => {
    root.t = new Tree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'ab' }] },
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
      ],
    });
  });
  exchange(docs, [[], [0]]);
  return docs;
}

/**
 * `editRangeOnEach` applies one content-less range delete per replica and
 * exchanges the two changes, so each replica sees the other's edit second.
 */
function editRangeOnEach(
  docs: Array<TestDoc>,
  ranges: Array<[number, number]>,
): void {
  docs.forEach((doc, i) => {
    doc.update((root) => root.t.edit(ranges[i][0], ranges[i][1]));
  });
  exchange(docs, [[1], [0]]);
}

/**
 * An unwrap -- a content-less edit over a paragraph's opening token, which
 * hoists its children into the root -- has to converge with a concurrent
 * delete that covered the same paragraph whole (#1331, yorkie#2042).
 *
 * §6.2 propagates a delete to the children a concurrent merge moved out of
 * the deleted node, but it used to skip that whenever the children had
 * landed in this edit's own merge destination. An unwrap moves them into the
 * root, and a delete that ends at the next paragraph's opening token merges
 * into the root too, so the skip fired and the hoisted text stayed alive on
 * the replica that unwrapped first. Mirrors yorkie's
 * TestTreeUnwrapAndMergeDelete.
 */
describe('Tree unwrap against a concurrent merge-delete', () => {
  it('tombstones the hoisted children a concurrent delete covered whole', () => {
    const docs = twoParagraphReplicas();

    // d1 unwraps p1: edit(0, 1) removes only its opening token, hoisting ab
    // into the root. d2 deletes p1 whole -- ab included -- and p2's opening
    // token: edit(0, 5).
    editRangeOnEach(docs, [
      [0, 1],
      [0, 5],
    ]);

    // d2's delete covered ab, so it is gone on both replicas.
    assert.equal(docs[0].getRoot().t.toXML(), '<r>cd</r>');
    assert.equal(docs[1].getRoot().t.toXML(), '<r>cd</r>');

    // The replicas agree on every live node and its order, but not on where
    // the tombstoned ab sits: the merge appends moved children to the end
    // of the destination, so each replica orders them by arrival. That is
    // yorkie's open merge-moved-child-order task, shared by both SDKs and
    // not introduced here. Pinned, so the day it is fixed this test says so.
    assert.equal(liveTreeShape(docs[0]), liveTreeShape(docs[1]));
    assert.notEqual(
      treeShape(docs[0]),
      treeShape(docs[1]),
      'merge-moved child ordering now converges: assert treeShape equality',
    );
  });

  it('keeps the hoisted children when both replicas run the same unwrap', () => {
    const docs = twoParagraphReplicas();

    // The skip §6.2 still needs: each replica sees the other's merge already
    // done and must not read it as a delete of the children it moved itself.
    // edit(4, 5) removes p2's opening token, hoisting cd into the root.
    editRangeOnEach(docs, [
      [4, 5],
      [4, 5],
    ]);

    assert.equal(docs[0].getRoot().t.toXML(), '<r><p>ab</p>cd</r>');
    assert.equal(docs[1].getRoot().t.toXML(), '<r><p>ab</p>cd</r>');
    assert.equal(treeShape(docs[0]), treeShape(docs[1]));
  });

  it('keeps the children of a paragraph a concurrent merge emptied', () => {
    const docs = twoParagraphReplicas();

    // d1 merges p2 into p1 (edit(1, 5) removes ab, p1's closing token and
    // p2's opening token), while d2 unwraps p2 by removing its closing token
    // (edit(7, 8)). d2's range starts inside p2, so it deletes nothing p2
    // held -- cd survives.
    editRangeOnEach(docs, [
      [1, 5],
      [7, 8],
    ]);

    assert.equal(docs[0].getRoot().t.toXML(), '<r><p>cd</p></r>');
    assert.equal(treeShape(docs[0]), treeShape(docs[1]));
  });
});
