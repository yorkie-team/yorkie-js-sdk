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
import yorkie, { Tree, SyncMode } from '@yorkie-js/sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Tree.Style range ending after a merge-moved child', () => {
  it('does not style a node concurrently inserted at the merged anchor', async ({
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

      // d1 inserts an empty <p> after the second paragraph, then styles a
      // range ending after `c`, a non-leftmost position inside the second
      // paragraph. The inserted <p> is outside the styled range on d1.
      d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
      d1.update((root) => root.tree.style(0, 6, { bold: 'x' }));
      // d2 concurrently removes the range, merging across the paragraphs.
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p></p>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('does not leave attributes from removeStyle on a concurrently inserted node', async ({
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

      d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
      d1.update((root) => root.tree.removeStyle(0, 6, ['bold']));
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p></p>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('still styles an own insert that was inside the styled range', async ({
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

      // d1 inserts <b> inside the second paragraph, before `c`, and styles
      // a range that covers it. The insert resolves into the merge target
      // on d2, and must stay styled on both replicas.
      d1.update((root) => root.tree.edit(5, 5, { type: 'b', children: [] }));
      d1.update((root) => root.tree.style(0, 8, { bold: 'x' }));
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><b bold="x"></b>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('skips descendants of a node inserted at the merged anchor', async ({
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

      // The inserted <p> carries a nested <b>; both are outside the styled
      // range on d1, so neither may be styled on the merging replica.
      d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
      d1.update((root) => root.tree.edit(9, 9, { type: 'b', children: [] }));
      d1.update((root) => root.tree.style(0, 6, { bold: 'x' }));
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p><b></b></p>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('still styles a sibling before the merge-source tombstone', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<{ tree: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.tree = new Tree({
          type: 'r',
          children: [
            { type: 'b', children: [] },
            { type: 'p', children: [{ type: 'text', value: 'ab' }] },
            { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();

      // The leading <b> is inside the styled range on both replicas and
      // sits before the merge-source tombstone after the merge.
      d1.update((root) => root.tree.style(0, 8, { bold: 'x' }));
      d2.update((root) => root.tree.edit(2, 7));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><b bold="x"></b>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('still styles a child that arrived via an earlier synced merge', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<{ tree: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.tree = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'ab' }] },
            { type: 's', children: [{ type: 'i', children: [] }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();

      // Fully synced merge: <s> into <p> — <i> moves into <p> and keeps
      // mergedFrom=s forever (stamped only on the first move).
      d1.update((root) => root.tree.edit(3, 5));
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().tree.toXML(), '<r><p>ab<i></i></p></r>');
      assert.equal(d2.getRoot().tree.toXML(), '<r><p>ab<i></i></p></r>');

      // d1 styles a range ending after <i>, a non-leftmost position
      // inside <p>, covering <i>. d2 concurrently merges <p> into <r>.
      d1.update((root) => root.tree.style(0, 5, { bold: 'x' }));
      d2.update((root) => root.tree.edit(0, 1));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r>ab<i bold="x"></i></r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('converges when a third client inserts at the merged anchor', async ({
    task,
  }) => {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c3.activate();

    const docKey = `${toDocKey(task.name)}-${c1.getKey()}`;
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

    // d3's insert is unknown to d1's style, so the version-vector check
    // keeps it unstyled on every replica.
    d1.update((root) => root.tree.style(0, 6, { bold: 'x' }));
    d2.update((root) => root.tree.edit(0, 5));
    d3.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));

    for (const client of [c1, c2, c3]) {
      await client.sync();
    }
    await c1.sync();
    await c2.sync();

    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    assert.equal(d2.toSortedJSON(), d3.toSortedJSON());

    for (const [client, doc] of [
      [c1, d1],
      [c2, d2],
      [c3, d3],
    ] as const) {
      await client.detach(doc);
      await client.deactivate();
    }
  });
});

describe('Tree.Style range starting after a merge-moved child', () => {
  it('styles the writer insert when a merge reverses the range', async ({
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

      // d1 inserts an empty <p> after the second paragraph, then styles a
      // range starting after `c` and ending inside its own insert. On d2
      // the concurrent merge moves `cd` behind the insert, so the resolved
      // range collapses and would miss the insert entirely.
      d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
      d1.update((root) => root.tree.style(6, 9, { bold: 'x' }));
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p bold="x"></p>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('applies removeStyle to the writer insert on both replicas', async ({
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

      // Same shape as above with removeStyle: the removal tombstone must
      // materialize on both replicas, not only on the writer.
      d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
      d1.update((root) => root.tree.removeStyle(6, 9, ['bold']));
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('keeps a range that stays ordered away from the insert', async ({
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

      // Both anchors sit inside the merged paragraph, so the resolved
      // range moves with the merge and stays ordered. The recovery must
      // not widen it onto the insert.
      d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
      d1.update((root) => root.tree.style(6, 7, { bold: 'x' }));
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p></p>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('keeps a reversed range away from an insert unknown to the styler', async ({
    task,
  }) => {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c3.activate();

    const docKey = `${toDocKey(task.name)}-${c1.getKey()}`;
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

    // d3's insert is unknown to d1's style, so the version-vector check
    // keeps it unstyled even when the recovered traversal passes it.
    d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
    d1.update((root) => root.tree.style(6, 9, { bold: 'x' }));
    d2.update((root) => root.tree.edit(0, 5));
    d3.update((root) => root.tree.edit(8, 8, { type: 'b', children: [] }));

    for (const client of [c1, c2, c3]) {
      await client.sync();
    }
    await c1.sync();
    await c2.sync();

    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    assert.equal(d2.toSortedJSON(), d3.toSortedJSON());
    assert.include(
      d1.toSortedJSON(),
      '{"type":"p","children":[],"attributes":{"bold":"x"}}',
    );
    assert.include(d1.toSortedJSON(), '{"type":"b","children":[]}');

    for (const [client, doc] of [
      [c1, d1],
      [c2, d2],
      [c3, d3],
    ] as const) {
      await client.detach(doc);
      await client.deactivate();
    }
  });
});
