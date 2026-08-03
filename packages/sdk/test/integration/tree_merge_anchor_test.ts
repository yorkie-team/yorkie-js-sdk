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
import yorkie, { Tree, SyncMode, converter } from '@yorkie-js/sdk/src/yorkie';
import { toXML } from '@yorkie-js/sdk/src/document/crdt/tree';
import {
  testRPCAddr,
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Tree.Edit concurrent insert into a merged range', () => {
  it('converges when inserting into a concurrently removed range', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<{ tree: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.tree = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'ab' }] },
            { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();

      d1.update((root) => root.tree.edit(6, 6, { type: 'p', children: [] }));
      d2.update((root) => root.tree.edit(0, 6));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p></p>d</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('converges with two inserts at the same anchor in a removed range', async ({
    task,
  }) => {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c3.activate();

    const docKey = `${toDocKey(task.name)}-${new Date().getTime()}`;
    const d1 = new yorkie.Document<{ tree: Tree }>(docKey);
    const d2 = new yorkie.Document<{ tree: Tree }>(docKey);
    const d3 = new yorkie.Document<{ tree: Tree }>(docKey);
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    await c3.attach(d3, { syncMode: SyncMode.Manual });

    d1.update((root) => {
      root.tree = new Tree({
        type: 'r',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'ab' }] },
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();
    await c3.sync();

    try {
      // c1 and c2 insert distinct elements at the same index 6; c3 removes
      // the range [0, 6) that the inserts anchor into.
      d1.update((root) => root.tree.edit(6, 6, { type: 'i', children: [] }));
      d2.update((root) => root.tree.edit(6, 6, { type: 'b', children: [] }));
      d3.update((root) => root.tree.edit(0, 6));

      // Full sync so every replica sees every operation.
      for (let i = 0; i < 3; i++) {
        await c1.sync();
        await c2.sync();
        await c3.sync();
      }

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal(d2.toSortedJSON(), d3.toSortedJSON());
    } finally {
      await c1.detach(d1);
      await c2.detach(d2);
      await c3.detach(d3);
      await c1.deactivate();
      await c2.deactivate();
      await c3.deactivate();
    }
  });

  // A concurrent insert anchored at the left-most position of a paragraph
  // removed by a chained merge (P->Q->R, the intermediate target Q itself
  // merged away). See yorkie-team/yorkie-js-sdk#1304.
  it('converges when insert is anchored in a chained merge', async ({
    task,
  }) => {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c3.activate();

    const docKey = `${toDocKey(task.name)}-${new Date().getTime()}`;
    const d1 = new yorkie.Document<{ t: Tree }>(docKey);
    const d2 = new yorkie.Document<{ t: Tree }>(docKey);
    const d3 = new yorkie.Document<{ t: Tree }>(docKey);
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    await c3.attach(d3, { syncMode: SyncMode.Manual });

    try {
      // Initial: <r><p>ab</p><p>cd</p><p>ef</p></r>.
      //   0   1 2 3    4   5 6 7    8   9 ...
      // <r> <p> a b </p> <p> c d </p> <p> e f </p> </r>
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'ab' }] },
            { type: 'p', children: [{ type: 'text', value: 'cd' }] },
            { type: 'p', children: [{ type: 'text', value: 'ef' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      await c3.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        '<r><p>ab</p><p>cd</p><p>ef</p></r>',
      );
      assert.equal(
        d3.getRoot().t.toXML(),
        '<r><p>ab</p><p>cd</p><p>ef</p></r>',
      );

      // c1 merges p2 into p1: edit(2, 6) removes b, </p>, <p>, c.
      d1.update((root) => root.t.edit(2, 6));
      // c2 merges p3 into p2: edit(6, 10) removes d, </p>, <p>, e.
      d2.update((root) => root.t.edit(6, 10));
      // c3 inserts <x> at the left-most position of p3: edit(9, 9).
      d3.update((root) => root.t.edit(9, 9, { type: 'x', children: [] }));
      assert.equal(d1.getRoot().t.toXML(), '<r><p>ad</p><p>ef</p></r>');
      assert.equal(d2.getRoot().t.toXML(), '<r><p>ab</p><p>cf</p></r>');
      assert.equal(
        d3.getRoot().t.toXML(),
        '<r><p>ab</p><p>cd</p><p><x></x>ef</p></r>',
      );

      // Full sync so every replica sees every operation.
      for (let i = 0; i < 3; i++) {
        await c1.sync();
        await c2.sync();
        await c3.sync();
      }

      // The insert must survive on every replica: <x> is anchored before e,
      // so it lands between the surviving a and f in the merge target.
      assert.equal(d1.getRoot().t.toXML(), '<r><p>a<x></x>f</p></r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal(d1.toSortedJSON(), d3.toSortedJSON());

      // Snapshot round-trip: a fresh client loading the post-chained-merge
      // snapshot must reconstruct the identical tree (no resurrected
      // tombstone, no lost insert).
      const runtimeNodes: Array<[string, number, boolean]> = [];
      const snapshotNodes: Array<[string, number, boolean]> = [];
      d1.getRoot()
        .t.getIndexTree()
        .traverseAll((node) => {
          runtimeNodes.push([toXML(node), node.visibleSize, node.isRemoved]);
        });
      const sRoot = converter.bytesToObject(
        converter.objectToBytes(d1.getRootObject()),
      );
      (sRoot.get('t') as unknown as Tree).getIndexTree().traverseAll((node) => {
        snapshotNodes.push([toXML(node), node.visibleSize, node.isRemoved]);
      });
      assert.deepEqual(runtimeNodes, snapshotNodes);
    } finally {
      await c1.detach(d1);
      await c2.detach(d2);
      await c3.detach(d3);
      await c1.deactivate();
      await c2.deactivate();
      await c3.deactivate();
    }
  });
});
