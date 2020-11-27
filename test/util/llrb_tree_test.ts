/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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

import { assert } from 'chai';
import { LLRBTree } from '../../src/util/llrb_tree';

const arrays = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [8, 5, 7, 9, 1, 3, 6, 0, 4, 2],
  [7, 2, 0, 3, 1, 9, 8, 4, 6, 5],
  [2, 0, 3, 5, 8, 6, 4, 1, 9, 7],
  [8, 4, 7, 9, 2, 6, 0, 3, 1, 5],
  [7, 1, 5, 2, 8, 6, 3, 4, 0, 9],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

describe('LLRBTree', function () {
  it('Can put/remove while keeping order', function () {
    for (const array of arrays) {
      const tree = new LLRBTree<number, number>();
      for (const idx of array) {
        tree.put(idx, idx);
      }

      assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], tree.values());

      tree.remove(8);
      assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 9], tree.values());

      tree.remove(2);
      assert.deepEqual([0, 1, 3, 4, 5, 6, 7, 9], tree.values());

      tree.remove(5);
      assert.deepEqual([0, 1, 3, 4, 6, 7, 9], tree.values());
    }
  });

  it('Can floor entry', function () {
    for (const array of arrays) {
      const tree = new LLRBTree<number, number>();
      for (const idx of array) {
        tree.put(idx, idx);
      }

      assert.equal(8, tree.floorEntry(8).value);

      tree.remove(8);
      assert.equal(7, tree.floorEntry(8).value);

      tree.remove(7);
      assert.equal(6, tree.floorEntry(8).value);
    }
  });
});
