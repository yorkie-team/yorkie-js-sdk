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
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import type { TreeEditOpInfo } from '@yorkie-js/sdk/src/document/operation/operation';

/**
 * The editor shape the bug was found in: alice keeps typing at the end of an
 * inline element while bob presses Enter there. Bob's Enter is a split of
 * the inline element's text followed by a split of the paragraph. Alice's
 * concurrent text stays on the left of the split, so the split alice is told
 * about has to be after it.
 */
describe('Tree split OpInfo through the server', () => {
  it('reports the split after text the receiver typed at the boundary', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      // Given: <doc><p><t>가나다0123</t></p></doc> on both.
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [
                {
                  type: 't',
                  children: [{ type: 'text', value: '가나다0123' }],
                },
              ],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();

      // When: alice (d1) types "4", "5" at the end while bob (d2) presses
      // Enter at the end, the way the editor sends it.
      d1.update((root) =>
        root.t.editByPath([0, 0, 7], [0, 0, 7], { type: 'text', value: '4' }),
      );
      d1.update((root) =>
        root.t.editByPath([0, 0, 8], [0, 0, 8], { type: 'text', value: '5' }),
      );
      d2.update((root) => {
        root.t.editByPath([0, 0, 7], [0, 0, 7], undefined, 1);
        root.t.splitByPath([0, 1]);
      });

      const ops: Array<TreeEditOpInfo> = [];
      d1.subscribe((event) => {
        if (event.type !== 'remote-change') return;
        for (const op of event.value.operations) {
          if (op.type === 'tree-edit') ops.push(op as TreeEditOpInfo);
        }
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // Then: alice's tree keeps "45" left of the split, and the split she
      // is told about is at offset 9, after it.
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(
        d1.getRoot().t.toXML(),
        '<doc><p><t>가나다012345</t></p><p><t></t></p></doc>',
      );
      assert.deepEqual(
        ops.map(({ fromPath, toPath }) => [fromPath, toPath]),
        [
          [
            [0, 0, 9],
            [0, 0, 9],
          ],
          [
            [0, 1],
            [0, 1],
          ],
        ],
      );
    }, task.name);
  });
});
