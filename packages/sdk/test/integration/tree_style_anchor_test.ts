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
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Tree.Style concurrent with a merge-removing edit', () => {
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
      // range that ends inside the second paragraph. The inserted <p> is
      // outside the styled range on d1's view.
      d1.update((root) => root.tree.edit(8, 8, { type: 'p', children: [] }));
      d1.update((root) => root.tree.style(0, 5, { bold: 'x' }));
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
      d1.update((root) => root.tree.removeStyle(0, 5, ['bold']));
      d2.update((root) => root.tree.edit(0, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p></p>cd</r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('converges when the range ends inside a chain-merged paragraph', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<{ tree: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.tree = new Tree({
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

      // d1: insert an empty <p> at the end, then style a range ending at
      // the leftmost position inside the third paragraph. d2 concurrently
      // chain-merges: p3 into p2, then p2 into p1, so the range boundary
      // resolves through a merge-source whose target is itself removed.
      d1.update((root) => root.tree.edit(12, 12, { type: 'p', children: [] }));
      d1.update((root) => root.tree.style(0, 9, { bold: 'x' }));
      d2.update((root) => root.tree.edit(7, 9));
      d2.update((root) => root.tree.edit(3, 5));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().tree.toXML(),
        '<r><p bold="x">abcdef</p><p></p></r>',
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('still styles the merged content when the range covers it', async ({
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

      // The styled range covers the second paragraph entirely, so the
      // style lands on it regardless of the concurrent merge removing
      // the first paragraph.
      d1.update((root) => root.tree.style(4, 8, { bold: 'x' }));
      d2.update((root) => root.tree.edit(0, 4));

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().tree.toXML(), '<r><p bold="x">cd</p></r>');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });
});
