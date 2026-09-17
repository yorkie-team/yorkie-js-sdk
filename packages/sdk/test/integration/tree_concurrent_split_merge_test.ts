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

      // The tail survives once, not twice.
      //
      // KNOWN LIMITATION (tracked): each replica still contributes its own
      // boundary, so an empty node sits between them. Collapsing the two into
      // one would mean recognizing a concurrent split at the same position,
      // which the §7.5 advance does not do today. The empty node is asserted
      // rather than tolerated, so lifting the limitation fails here and says
      // so.
      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><span>abc</span><span></span><span>de</span></p></doc>',
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
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

  it('keeps every span when two replicas merge neighbouring boundaries', async ({
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
                { type: 'span', children: [{ type: 'text', value: 'ab' }] },
                { type: 'span', children: [{ type: 'text', value: 'cd' }] },
                { type: 'span', children: [{ type: 'text', value: 'ef' }] },
              ],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((r) => r.t.mergeByPath([0, 1]), 'd1 merge first boundary');
      d2.update((r) => r.t.mergeByPath([0, 2]), 'd2 merge second boundary');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // Both merges land, so all three spans end up as one. Copying the
      // children lost a span instead: each replica deleted the node it
      // merged and re-inserted its children into a left sibling the other
      // replica had already removed, and both agreed on `abcd`.
      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><span>abcdef</span></p></doc>',
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('keeps the text in order when two replicas split at different positions', async ({
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

      d1.update((r) => r.t.splitByPath([0, 0, 1]), 'd1 split after a');
      d2.update((r) => r.t.splitByPath([0, 0, 4]), 'd2 split before e');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // Two boundaries in one node give three pieces. Copying the tail wrote
      // each replica's view of it into the tree, landing on `aebcde`.
      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><span>a</span><span>bcd</span><span>e</span></p></doc>',
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('applies a concurrent style change to both halves of a split', async ({
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
              ],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((r) => r.t.splitByPath([0, 0, 2]), 'd1 split');
      d2.update(
        (r) => r.t.removeStyleByPath([0, 0], [0, 1], ['bold']),
        'd2 clear the formatting',
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // The half the split opened is the same node to the style, so clearing
      // the formatting reaches it. A copied node was one the concurrent
      // style had never seen, so it kept `bold` and the text came back half
      // formatted — the shape an editor hits when one person clears
      // formatting while another splits.
      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><span>ab</span><span>cde</span></p></doc>',
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('keeps the text in order when a split meets a merge', async ({ task }) => {
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
      d2.update((r) => r.t.splitByPath([0, 0, 1]), 'd2 split');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // The two structural changes compose: the split boundary stands and the
      // rest merges behind it. Copying the content moved it instead, landing
      // on `<span>ade</span><span>bc</span>` — the same text, reordered, on
      // both replicas.
      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><span>a</span><span>bcde</span></p></doc>',
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });
});
