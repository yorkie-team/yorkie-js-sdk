import { assert } from 'chai';
import { range, shuffle } from '../helper/helper';
import { LLRBTree } from '../../src/util/llrb_tree';

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

  it('Can floor entry', function() {
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
