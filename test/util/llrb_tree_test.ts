import { assert } from 'chai';
import { LLRBTree } from '../../src/util/llrb_tree';

function range(from: number, to: number): Array<number> {
  const list = [];
  for (let idx = from; idx < to; idx++) {
    list.push(idx);
  }
  return list;
}

function shuffle<T>(array: Array<T>): Array<T> {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

describe('LLRBTree', function() {
  it('Can put/remove while keeping order', function() {
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
});
