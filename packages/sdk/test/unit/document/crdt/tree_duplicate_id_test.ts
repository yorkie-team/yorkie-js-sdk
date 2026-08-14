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
import { posT, timeT } from '@yorkie-js/sdk/test/helper/helper';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';

/**
 * A CRDTTreeNodeID (createdAt + offset) is the identity every position anchors
 * to, so it must name a single node. An undo that reverses a deletion by
 * re-inserting a copy of the removed nodes keeps their IDs, which leaves two
 * nodes under one ID; `nodeMapByID.put` then picks a winner by insertion
 * order, and that order differs between a live document and one rebuilt from
 * a snapshot. These mirror the server-side rules in yorkie#1927.
 */

/**
 * `buildDigitTree` builds <r><p>0123456789</p></r> under the key "t" of a root
 * object, and returns the tree with the id of its text node.
 */
function buildDigitTree(): [CRDTRoot, CRDTTree, CRDTTreeNodeID] {
  const root = new CRDTRoot(new CRDTObject(timeT(), ElementRHT.create()));
  const tree = new CRDTTree(new CRDTTreeNode(posT(), 'r'), timeT());
  tree.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], 0, timeT(), timeT);

  const textID = posT();
  tree.editT(
    [1, 1],
    [new CRDTTreeNode(textID, 'text', '0123456789')],
    0,
    timeT(),
    timeT,
  );
  assert.equal(tree.toXML(), /*html*/ `<r><p>0123456789</p></r>`);

  root.getObject().set('t', tree, timeT());
  root.registerElement(tree, root.getObject());

  return [root, tree, textID];
}

/**
 * `duplicatedIDs` returns the ids that name more than one node in the tree.
 */
function duplicatedIDs(tree: CRDTTree): Array<string> {
  const counts = new Map<string, number>();
  tree.getIndexTree().traverseAll((node) => {
    const key = node.id.toIDString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const dupes: Array<string> = [];
  for (const [id, count] of counts) {
    if (count > 1) {
      dupes.push(`${id} x${count}`);
    }
  }
  return dupes;
}

/**
 * `corruptWithDuplicatedNodeID` reproduces the state an older SDK left in
 * stored documents: the character at text offset 5 is deleted, and a copy of
 * it is attached under the tombstone's ORIGINAL id. It bypasses `edit` so the
 * test keeps exercising an already-corrupted document even once the edit path
 * refuses to create duplicates.
 */
function corruptWithDuplicatedNodeID(
  tree: CRDTTree,
  textID: CRDTTreeNodeID,
): void {
  tree.editT([6, 7], undefined, 0, timeT(), timeT);
  assert.equal(tree.toXML(), /*html*/ `<r><p>012346789</p></r>`);

  const p = tree.getRoot().allChildren[0];
  const tombstone = tree.findFloorNode(
    CRDTTreeNodeID.of(textID.getCreatedAt(), 5),
  )!;
  assert.isTrue(tombstone.isRemoved);

  // The copy lands before the tombstone, where an insert at the same index
  // puts it, and wins nodeMapByID because it is registered last.
  const dupe = new CRDTTreeNode(
    CRDTTreeNodeID.of(textID.getCreatedAt(), 5),
    'text',
    '5',
  );
  p.insertAt(dupe, p.allChildren.indexOf(tombstone));
  tree.registerNode(dupe);
  assert.equal(tree.toXML(), /*html*/ `<r><p>0123456789</p></r>`);
}

/**
 * `rebuildFromSnapshot` round-trips the root object through the snapshot
 * encoding, as a client does when it loads a document.
 */
function rebuildFromSnapshot(root: CRDTRoot): CRDTTree {
  const bytes = converter.objectToBytes(root.getObject());
  const obj = converter.bytesToObject(bytes);
  return obj.get('t') as CRDTTree;
}

describe('CRDTTree with a duplicated node id', function () {
  it('drops content that reuses an id from an earlier change', function () {
    const [, tree, textID] = buildDigitTree();

    tree.editT([6, 7], undefined, 0, timeT(), timeT);
    assert.equal(tree.toXML(), /*html*/ `<r><p>012346789</p></r>`);

    // The undo arrives as a later change, so it carries a later lamport than
    // the id its content reuses.
    const undoAt = TimeTicket.of(timeT().getLamport() + 1n, 1, InitialActorID);
    tree.editT(
      [6, 6],
      [
        new CRDTTreeNode(
          CRDTTreeNodeID.of(textID.getCreatedAt(), 5),
          'text',
          '5',
        ),
      ],
      0,
      undoAt,
      () => undoAt,
    );

    assert.deepEqual(duplicatedIDs(tree), [], 'an id names at most one node');
    assert.equal(
      tree.toXML(),
      /*html*/ `<r><p>012346789</p></r>`,
      'the copy is not inserted',
    );
  });

  it('drops content that reuses an id from another actor', function () {
    const [, tree, textID] = buildDigitTree();

    tree.editT([6, 7], undefined, 0, timeT(), timeT);

    const undoAt = TimeTicket.of(
      timeT().getLamport(),
      1,
      '0123456789abcdef01234567',
    );
    tree.editT(
      [6, 6],
      [
        new CRDTTreeNode(
          CRDTTreeNodeID.of(textID.getCreatedAt(), 5),
          'text',
          '5',
        ),
      ],
      0,
      undoAt,
      () => undoAt,
    );

    assert.deepEqual(duplicatedIDs(tree), [], 'an id names at most one node');
    assert.equal(tree.toXML(), /*html*/ `<r><p>012346789</p></r>`);
  });

  it('keeps colliding content issued by this change', function () {
    const [, tree] = buildDigitTree();

    // The delimiters an element split consumes are simulated rather than
    // replayed, so an id issued by this edit can collide with one already in
    // the tree. That content belongs to the document.
    const existingID = tree.getRoot().allChildren[0].id;
    const editedAt = TimeTicket.of(
      existingID.getCreatedAt().getLamport(),
      existingID.getCreatedAt().getDelimiter() + 1,
      existingID.getCreatedAt().getActorID(),
    );
    tree.editT(
      [12, 12],
      [new CRDTTreeNode(CRDTTreeNodeID.of(existingID.getCreatedAt(), 0), 'p')],
      0,
      editedAt,
      () => editedAt,
    );

    assert.equal(
      tree.toXML(),
      /*html*/ `<r><p>0123456789</p><p></p></r>`,
      'content issued by this change is inserted even when its id collides',
    );
  });

  it('resolves a duplicated id to the same node after a snapshot rebuild', function () {
    const [root, tree, textID] = buildDigitTree();

    corruptWithDuplicatedNodeID(tree, textID);
    const rebuilt = rebuildFromSnapshot(root);
    assert.equal(rebuilt.toXML(), tree.toXML());

    const id = CRDTTreeNodeID.of(textID.getCreatedAt(), 5);
    const live = tree.findFloorNode(id)!;
    const cold = rebuilt.findFloorNode(id)!;
    assert.equal(
      cold.isRemoved,
      live.isRemoved,
      `live resolves to a ${live.isRemoved ? 'tombstone' : 'live node'}, ` +
        `rebuilt to a ${cold.isRemoved ? 'tombstone' : 'live node'}`,
    );
  });

  it('applies an edit anchored at a duplicated id after a rebuild', function () {
    const [root, tree, textID] = buildDigitTree();

    corruptWithDuplicatedNodeID(tree, textID);

    // Keep editing before the duplicated id: this splits the run owning
    // offsets 0..5, so the piece at offset 0 no longer spans up to offset 5.
    tree.editT(
      [4, 4],
      [new CRDTTreeNode(posT(), 'text', 'x')],
      0,
      timeT(),
      timeT,
    );
    assert.equal(tree.toXML(), /*html*/ `<r><p>012x3456789</p></r>`);

    const rebuilt = rebuildFromSnapshot(root);
    const parentID = rebuilt.getRoot().allChildren[0].id;
    const editedAt = timeT();
    assert.doesNotThrow(() => {
      rebuilt.edit(
        [
          CRDTTreePos.of(parentID, CRDTTreeNodeID.of(textID.getCreatedAt(), 5)),
          CRDTTreePos.of(parentID, CRDTTreeNodeID.of(textID.getCreatedAt(), 6)),
        ],
        undefined,
        0,
        editedAt,
        () => editedAt,
      );
    });
  });

  it('keeps the live node resolvable when its tombstone is purged', function () {
    const [, tree, textID] = buildDigitTree();

    corruptWithDuplicatedNodeID(tree, textID);

    const id = CRDTTreeNodeID.of(textID.getCreatedAt(), 5);
    const live = tree.findFloorNode(id)!;
    assert.isFalse(live.isRemoved);

    let tombstone: CRDTTreeNode | undefined;
    tree.getIndexTree().traverseAll((node) => {
      if (node.id.equals(id) && node.isRemoved) {
        tombstone = node;
      }
    });
    assert.isDefined(tombstone);
    tree.purge(tombstone!);

    assert.equal(
      tree.findFloorNode(id),
      live,
      'the live node keeps the id after its tombstone is collected',
    );
    assert.equal(tree.toXML(), /*html*/ `<r><p>0123456789</p></r>`);
  });

  it('does not let a dropped copy widen the reverse operation', function () {
    const [root, tree, textID] = buildDigitTree();

    tree.editT([6, 7], undefined, 0, timeT(), timeT);
    assert.equal(tree.toXML(), /*html*/ `<r><p>012346789</p></r>`);

    // The undo of that deletion, as the copy-reinsert path builds it: one
    // content node carrying the id of the piece just tombstoned.
    const undoAt = TimeTicket.of(timeT().getLamport() + 1n, 1, InitialActorID);
    const pos = tree.findPos(6);
    const op = TreeEditOperation.create(
      tree.getCreatedAt(),
      pos,
      pos,
      [
        new CRDTTreeNode(
          CRDTTreeNodeID.of(textID.getCreatedAt(), 5),
          'text',
          '5',
        ),
      ],
      0,
      undoAt,
    );

    const { reverseOp } = op.execute(root, OpSource.Local);
    assert.equal(
      tree.toXML(),
      /*html*/ `<r><p>012346789</p></r>`,
      'the copy is not inserted',
    );

    // The undo stack shifts its stored indices by this size when a remote
    // edit arrives, so it has to match what the tree accepted.
    assert.equal(
      op.getContentSize(),
      0,
      'an edit whose content was dropped inserted nothing',
    );

    // Redoing must not delete a neighbour that this edit never inserted.
    if (reverseOp) {
      const redo = reverseOp as TreeEditOperation;
      assert.isTrue(
        redo.getFromPos().equals(redo.getToPos()),
        'the reverse of an edit that inserted nothing spans nothing',
      );
    }
  });

  it('refuses to split a text node past its end', function () {
    const node = new CRDTTreeNode(posT(), 'text', 'hello');

    try {
      node.splitText(node.visibleSize + 1, 0);
      assert.fail('splitText must refuse an out-of-range offset');
    } catch (error) {
      assert.instanceOf(error, YorkieError);
      assert.equal((error as YorkieError).code, Code.ErrInvalidArgument);
    }
    assert.equal(node.value, 'hello', 'a refused split leaves the node alone');
  });
});
