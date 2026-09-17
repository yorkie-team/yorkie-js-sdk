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

type TestDoc = { t: Tree };

/** `textOf` returns the text content of the tree, with the tags stripped. */
function textOf(tree: Tree): string {
  return tree.toXML().replace(/<[^>]*>/g, '');
}

describe('Tree.SplitByPath/MergeByPath concurrency', () => {
  it('does not duplicate content when two replicas split the same position', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((r) => {
        r.t = new Tree({
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
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((r) => r.t.splitByPath([0, 0, 3]), 'd1 split');
      d2.update((r) => r.t.splitByPath([0, 0, 3]), 'd2 split');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(textOf(d1.getRoot().t), 'abcde');
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  // KNOWN LIMITATION (tracked, skipped): two replicas splitting the same
  // position each contribute a boundary, so the merged tree carries an empty
  // node between them. The content is intact and the replicas converge — only
  // the extra node remains. Collapsing the two boundaries into one would mean
  // recognizing a concurrent split at the same position, which the §7.5
  // advance does not do today.
  it.skip('KNOWN: two replicas splitting the same position leave an empty node', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((r) => {
        r.t = new Tree({
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
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((r) => r.t.splitByPath([0, 0, 3]), 'd1 split');
      d2.update((r) => r.t.splitByPath([0, 0, 3]), 'd2 split');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><span>abc</span><span>de</span></p></doc>',
      );
    }, task.name);
  });

  it('does not duplicate content when two replicas merge the same boundary', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((r) => {
        r.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [
                { type: 'span', children: [{ type: 'text', value: 'abc' }] },
                { type: 'span', children: [{ type: 'text', value: 'de' }] },
              ],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((r) => r.t.mergeByPath([0, 1]), 'd1 merge');
      d2.update((r) => r.t.mergeByPath([0, 1]), 'd2 merge');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><span>abcde</span></p></doc>',
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  // KNOWN LIMITATION (tracked, skipped): a merge concurrent with a
  // split-and-style leaves the attribute on one replica only. The text
  // converges; the attribute never does, and both replicas stay attached with
  // later edits propagating normally.
  //
  // On the merging replica the style's from-anchor resolves onto the
  // merge-source tombstone, the range collapses (start past end) and
  // `traverseInPosRange` yields nothing, so the style is a silent no-op.
  // `reversedFromAnchorRecovery` covers exactly this collapsed range, but it
  // delegates to `mergedAnchorInterloperGuard`, which keys on the declared
  // parent (`!declaredParent.isRemoved` returns early). Here the from
  // position's parent `<p>` is still alive; it is the left-sibling anchor that
  // the merge removed, so the guard bails and the recovery never runs.
  //
  // #1329 recovered the shape where the range start was declared inside a
  // parent that the merge removed; this is the neighbouring shape where the
  // parent stayed live.
  it.skip('KNOWN: a merge concurrent with a split-and-style drops the attribute on the merging replica', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((r) => {
        r.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [
                {
                  type: 'span',
                  attributes: { bold: 'true' },
                  children: [{ type: 'text', value: 'abcde' }],
                },
                { type: 'span', children: [{ type: 'text', value: 'fghij' }] },
              ],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1 drops the attribute and merges the two spans.
      d1.update((r) => {
        r.t.removeStyleByPath([0, 0], [0, 1], ['bold']);
        r.t.editByPath([0, 0, 5], [0, 1, 0]);
      }, 'd1 unstyle and merge');

      // d2 splits the second span twice and styles the middle piece.
      d2.update((r) => {
        r.t.editByPath([0, 1, 4], [0, 1, 4], undefined, 1);
        r.t.editByPath([0, 1, 2], [0, 1, 2], undefined, 1);
        r.t.styleByPath([0, 2], { bold: 'true' });
      }, 'd2 split and style');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });
});
