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

import {assert} from 'chai';
import {range, shuffle} from '../helper/helper';
import {LLRBTree} from '../../src/util/llrb_tree';

describe('LLRBTree', function () {
  it('Can put/remove while keeping order', function () {
    const tree = new LLRBTree<number, number>();
    for (const idx of shuffle(range(0, 10))) {
      tree.put(idx, idx);
    }

    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], tree.values());

    tree.remove(8);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 9], tree.values());

    tree.remove(2);
    assert.deepEqual([0, 1, 3, 4, 5, 6, 7, 9], tree.values());

    tree.remove(5);
    assert.deepEqual([0, 1, 3, 4, 6, 7, 9], tree.values());
  });

  it('Can floor entry', function () {
    const tree = new LLRBTree<number, number>();
    for (const idx of shuffle(range(0, 10))) {
      tree.put(idx, idx);
    }

    assert.equal(8, tree.floorEntry(8).value);

    tree.remove(8);
    assert.equal(7, tree.floorEntry(8).value);

    tree.remove(7);
    assert.equal(6, tree.floorEntry(8).value);
  });
});
