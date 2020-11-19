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
import { range, shuffle } from '../helper/helper';
import { HeapNode, Heap } from '../../src/util/heap';

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
  describe('Can release', function () {
    it('if root node is deleted', function () {
      const heap = new Heap<number, number>();
      const root = new HeapNode(9, 9);
      for (const idx of range(0, 10)) {
        heap.push(new HeapNode(idx, idx));
      }

      heap.release(root);

      const expected = [8, 7, 5, 6, 2, 1, 4, 0, 3];
      for (const node of heap) {
        assert.equal(expected.shift(), node.getValue());
      }
    });

    it('if parent node is deleted', function () {
      const heap = new Heap<number, number>();
      const parentNode = new HeapNode(5, 5);
      for (const idx of range(0, 10)) {
        heap.push(new HeapNode(idx, idx));
      }

      heap.release(parentNode);

      const expected = [9, 8, 4, 6, 7, 1, 2, 0, 3];
      for (const node of heap) {
        assert.equal(expected.shift(), node.getValue());
      }
    });

    it('if leaf node is deleted', function () {
      const heap = new Heap<number, number>();
      const leaf = new HeapNode(3, 3);
      for (const idx of range(0, 10)) {
        heap.push(new HeapNode(idx, idx));
      }

      heap.release(leaf);

      const expected = [9, 8, 5, 6, 7, 1, 4, 0, 2];

      for (const node of heap) {
        assert.equal(expected.shift(), node.getValue());
      }
    });

    it('if a heap has one node', function () {
      const heap = new Heap<number, number>();
      const node = new HeapNode(0, 0);
      heap.push(node);

      heap.release(node);

      assert.equal(0, heap.len());
    });
  });
});
