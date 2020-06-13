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
import {HeapNode, Heap} from '../../src/util/heap';

describe('Heap', function () {
  it('Can push and pop', function () {
    const heap = new Heap<number, number>();

    for (const idx of shuffle(range(0, 10))) {
      heap.push(new HeapNode(idx, idx));
    }

    for (const idx of range(0, 10).reverse()) {
      assert.equal(idx, heap.pop().getValue());
    }
  });
});
