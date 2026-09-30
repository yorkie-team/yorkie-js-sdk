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
import { InitialChangeID } from '@yorkie-js/sdk/src/document/change/change_id';
import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/document/json/tree';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

type TreeDoc = { t: Tree };

/**
 * `assertMatchesRebuild` asserts the running `docSize` and garbage count
 * equal what a root rebuilt from the same content computes.
 */
function assertMatchesRebuild(d: Document<TreeDoc>, msg: string): void {
  const r = new CRDTRoot(d.getRootObject().deepcopy());
  assert.deepEqual(d.getDocSize(), r.getDocSize(), `${msg}: docSize`);
  assert.equal(d.getGarbageLen(), r.getGarbageLen(), `${msg}: garbage`);
}

/**
 * `tombstonesIn` counts the removed nodes still linked into the tree.
 */
function tombstonesIn(d: Document<TreeDoc>): number {
  const tree = d.getRootObject().get('t') as unknown as CRDTTree;
  const walk = (node: CRDTTreeNode): number =>
    (node.isRemoved ? 1 : 0) +
    (node.isText ? 0 : node.allChildren.reduce((s, c) => s + walk(c), 0));
  return walk(tree.getRoot());
}

/**
 * `deliver` applies `from`'s pending changes to `to` and acks them at `from`.
 */
function deliver(from: Document<TreeDoc>, to: Document<TreeDoc>): void {
  const pack = from.createChangePack();
  to.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges(),
      InitialVersionVector,
    ),
  );
  const changes = pack.getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  from.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
}

describe('registerElement books internal GC pairs', function () {
  // Port of Go TestRegisterElementBooksInternalTombstones (yorkie#2033).
  it('books a tombstone inside the registered element', function () {
    const root = CRDTRoot.create();
    const cc = ChangeContext.create(InitialChangeID, root, {});
    const nodeID = () => CRDTTreeNodeID.of(cc.issueTimeTicket(), 0);

    const treeRoot = CRDTTreeNode.create(nodeID(), 'r');
    const para = CRDTTreeNode.create(nodeID(), 'p');
    treeRoot.append(para);
    const text = CRDTTreeNode.create(nodeID(), 'text', 'hello');
    para.append(text);

    // The payload was captured while this node was already a tombstone.
    text.removedAt = cc.issueTimeTicket();

    const ticket = cc.issueTimeTicket();
    const tree = CRDTTree.create(treeRoot, ticket);
    root.getObject().set('tree', tree, ticket);

    const before = root.getGarbageLen();
    root.registerElement(tree, root.getObject());
    assert.equal(
      root.getGarbageLen(),
      before + 1,
      'a tombstone inside the registered element has to be collectable',
    );
    const gc = root.getDocSize().gc;
    assert.notEqual(gc.data + gc.meta, 0, 'its bytes belong to gc');

    assert.equal(
      root.garbageCollect(maxVectorOf([cc.getNextID().getActorID()])),
      1,
    );
    assert.deepEqual(root.getDocSize().gc, { data: 0, meta: 0 });
  });

  // Port of Go TestRegisterElementSkipsTombstonedTreeRoot (yorkie#2033).
  it('never books the tree root', function () {
    const root = CRDTRoot.create();
    const cc = ChangeContext.create(InitialChangeID, root, {});
    const nodeID = () => CRDTTreeNodeID.of(cc.issueTimeTicket(), 0);

    const treeRoot = CRDTTreeNode.create(nodeID(), 'r');
    const para = CRDTTreeNode.create(nodeID(), 'p');
    treeRoot.append(para);

    // A crafted payload marks every node removed, the root included.
    treeRoot.removedAt = cc.issueTimeTicket();
    para.removedAt = cc.issueTimeTicket();

    const ticket = cc.issueTimeTicket();
    const tree = CRDTTree.create(treeRoot, ticket);
    root.getObject().set('tree', tree, ticket);

    const before = root.getGarbageLen();
    root.registerElement(tree, root.getObject());
    assert.equal(
      root.getGarbageLen(),
      before + 1,
      'only the parented tombstone is booked, never the root',
    );
    assert.equal(
      root.garbageCollect(maxVectorOf([cc.getNextID().getActorID()])),
      1,
    );
  });

  it('books the tombstones an undone container removal brings back', function () {
    const doc = new Document<TreeDoc>('test-doc');
    doc.setActor(A1);
    doc.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abc' }] }],
      });
    });
    doc.update((root) => root.t.edit(2, 3));
    doc.update((root) => {
      delete (root as Partial<TreeDoc>).t;
    });
    doc.history.undo();
    assert.equal(doc.getRoot().t.toXML(), '<r><p>ac</p></r>');
    // No rebuild check here: the orphaned tombstone tree still holds its own
    // pair for `b` until collection, as it does in Go. See the lessons file.

    doc.garbageCollect(maxVectorOf([A1]));
    assert.equal(tombstonesIn(doc), 0, 'the restored tombstone is collected');
    assert.equal(doc.getGarbageLen(), 0);
    assertMatchesRebuild(doc, 'after gc');
  });

  it('books them on a replica that decodes the same Set', function () {
    const d1 = new Document<TreeDoc>('test-doc');
    const d2 = new Document<TreeDoc>('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abc' }] }],
      });
    });
    d1.update((root) => root.t.edit(2, 3));
    d1.update((root) => {
      delete (root as Partial<TreeDoc>).t;
    });
    deliver(d1, d2);

    // The undo carries a Set whose tree still holds the tombstoned `b`.
    d1.history.undo();
    deliver(d1, d2);

    assert.equal(d2.getRoot().t.toXML(), '<r><p>ac</p></r>');

    d2.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(tombstonesIn(d2), 0, 'the decoded tombstone is collected');
    assert.equal(d2.getGarbageLen(), 0);
    assertMatchesRebuild(d2, 'remote after gc');
  });
});
