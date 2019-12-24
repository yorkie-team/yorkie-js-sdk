import { assert } from 'chai';
import { range, shuffle } from '../helper/helper';
import { HeapNode, Heap } from '../../src/util/heap';

describe('Heap', function() {
  it('Can push and pop', function () {
    const heap = new Heap<number, number>();

    for (const idx of shuffle(range(0, 10))) {
      heap.push(new HeapNode(idx, idx));
    }

    for (const idx of range(0, 10).reverse()) {
      assert.equal(idx, heap.pop().getValue())
    }
  });
});

