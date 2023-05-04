/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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
import { buildIndexTree } from '@yorkie-js-sdk/test/helper/helper';
import { CRDTTreeNode } from '@yorkie-js-sdk/src/document/crdt/tree';
import {
  findCommonAncestor,
  IndexTree,
} from '@yorkie-js-sdk/src/document/crdt/index_tree';

/**
 * `betweenEqual` is a helper function that checks the nodes between the given
 * indexes.
 */
function nodesBetweenEqual(
  tree: IndexTree<CRDTTreeNode>,
  from: number,
  to: number,
  expected: Array<string>,
) {
  const nodes: Array<CRDTTreeNode> = [];
  tree.nodesBetween(from, to, (node) => {
    nodes.push(node);
    return true;
  });
  assert.deepEqual(
    nodes.map((node) => {
      if (node.isInline) {
        return `${node.type}.${node.value}`;
      }
      return node.type;
    }),
    expected,
  );
}

describe('IndexTree', function () {
  it('Can find position from the given offset', function () {
    //    0   1 2 3 4 5 6    7   8 9  10 11 12 13    14
    // <r> <p> h e l l o </p> <p> w  o  r  l  d  </p>  </r>
    const tree = buildIndexTree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'hello' }] },
        { type: 'p', children: [{ type: 'text', value: 'world' }] },
      ],
    });

    let pos = tree.findTreePos(0);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'r']);
    pos = tree.findTreePos(1);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'text']);
    pos = tree.findTreePos(6);
    assert.deepEqual([pos.offset, pos.node.type], [5, 'text']);
    pos = tree.findTreePos(6, false);
    assert.deepEqual([pos.offset, pos.node.type], [1, 'p']);
    pos = tree.findTreePos(7);
    assert.deepEqual([pos.offset, pos.node.type], [1, 'r']);
    pos = tree.findTreePos(8);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'text']);
    pos = tree.findTreePos(13);
    assert.deepEqual([pos.offset, pos.node.type], [5, 'text']);
    pos = tree.findTreePos(14);
    assert.deepEqual([pos.offset, pos.node.type], [2, 'r']);
  });

  it('Can find right node from the given offset in postorder traversal', function () {
    //       0   1 2 3    4   6 7     8
    // <root> <p> a b </p> <p> c d</p> </root>
    const tree = buildIndexTree({
      type: 'root',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'ab' }] },
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
      ],
    });

    // postorder traversal: "ab", <b>, "cd", <p>, <root>
    assert.equal(tree.findPostorderRight(tree.findTreePos(0))!.type, 'text');
    assert.equal(tree.findPostorderRight(tree.findTreePos(1))!.type, 'text');
    assert.equal(tree.findPostorderRight(tree.findTreePos(3))!.type, 'p');
    assert.equal(tree.findPostorderRight(tree.findTreePos(4))!.type, 'text');
    assert.equal(tree.findPostorderRight(tree.findTreePos(5))!.type, 'text');
    assert.equal(tree.findPostorderRight(tree.findTreePos(7))!.type, 'p');
    assert.equal(tree.findPostorderRight(tree.findTreePos(8))!.type, 'root');
  });

  it('Can find common ancestor of two given nodes', function () {
    const tree = buildIndexTree({
      type: 'root',
      children: [
        {
          type: 'p',
          children: [
            { type: 'b', children: [{ type: 'text', value: 'ab' }] },
            { type: 'b', children: [{ type: 'text', value: 'cd' }] },
          ],
        },
      ],
    });

    assert.equal(
      findCommonAncestor(
        tree.findTreePos(3, true).node,
        tree.findTreePos(7, true).node,
      )!.type,
      'p',
    );
  });

  it('Can traverse nodes between two given positions', function () {
    const tree = buildIndexTree({
      type: 'root',
      children: [
        {
          type: 'p',
          children: [
            { type: 'text', value: 'a' },
            { type: 'text', value: 'b' },
          ],
        },
        { type: 'p', children: [{ type: 'text', value: 'cde' }] },
        { type: 'p', children: [{ type: 'text', value: 'fg' }] },
      ],
    });

    //       0   1 2 3    4   5 6 7 8    9   10 11 12   13
    // <root> <p> a b </p> <p> c d e </p> <p>  f  g  </p>  </root>
    nodesBetweenEqual(tree, 2, 11, [
      'text.b',
      'p',
      'text.cde',
      'p',
      'text.fg',
      'p',
    ]);
    nodesBetweenEqual(tree, 2, 6, ['text.b', 'p', 'text.cde', 'p']);
    nodesBetweenEqual(tree, 0, 1, ['p']);
    nodesBetweenEqual(tree, 3, 4, ['p']);
    nodesBetweenEqual(tree, 3, 5, ['p', 'p']);
  });
});
