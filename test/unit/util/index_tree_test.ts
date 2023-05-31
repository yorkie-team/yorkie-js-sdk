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
} from '@yorkie-js-sdk/src/util/index_tree';

/**
 * `toDiagnostic` is a helper function that converts the given node to a
 * diagnostic string.
 */
function toDiagnostic(node: CRDTTreeNode): string {
  if (node.isInline) {
    return `${node.type}.${node.value}`;
  }
  return node.type;
}

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
  assert.deepEqual(nodes.map(toDiagnostic), expected);
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
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['r', 0]);
    pos = tree.findTreePos(1);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.hello', 0]);
    pos = tree.findTreePos(6);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.hello', 5]);
    pos = tree.findTreePos(6, false);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['p', 1]);
    pos = tree.findTreePos(7);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['r', 1]);
    pos = tree.findTreePos(8);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.world', 0]);
    pos = tree.findTreePos(13);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.world', 5]);
    pos = tree.findTreePos(14);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['r', 2]);
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

    const nodeAB = tree.findTreePos(3, true).node;
    const nodeCD = tree.findTreePos(7, true).node;

    assert.equal(toDiagnostic(nodeAB), 'text.ab');
    assert.equal(toDiagnostic(nodeCD), 'text.cd');
    assert.equal(findCommonAncestor(nodeAB, nodeCD)!.type, 'p');
  });

  it('Can traverse nodes between two given positions', function () {
    //       0   1 2 3    4   5 6 7 8    9   10 11 12   13
    // <root> <p> a b </p> <p> c d e </p> <p>  f  g  </p>  </root>
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

  it('Can find index of the given node', function () {
    //       0   1 2 3    4   5 6 7 8    9   10 11 12   13
    // <root> <p> a b </p> <p> c d e </p> <p>  f  g  </p>  </root>
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

    let pos = tree.findTreePos(0, true);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['root', 0]);
    assert.equal(tree.indexOf(pos.node), 0);

    pos = tree.findTreePos(1, true);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.a', 0]);
    assert.equal(tree.indexOf(pos.node), 1);

    pos = tree.findTreePos(3, true);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.b', 1]);
    assert.equal(tree.indexOf(pos.node), 2);

    pos = tree.findTreePos(4, true);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['root', 1]);
    assert.equal(tree.indexOf(pos.node), 0);

    pos = tree.findTreePos(10, true);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.fg', 0]);
    assert.equal(tree.indexOf(pos.node), 10);

    const firstP = tree.getRoot().children[0];
    assert.deepEqual([toDiagnostic(firstP), tree.indexOf(firstP)], ['p', 0]);

    const secondP = tree.getRoot().children[1];
    assert.deepEqual([toDiagnostic(secondP), tree.indexOf(secondP)], ['p', 4]);

    const thirdP = tree.getRoot().children[2];
    assert.deepEqual([toDiagnostic(secondP), tree.indexOf(thirdP)], ['p', 9]);
  });

  // TODO(JOOHOJANG): Fix this test
  it.skip('Can find treePos from given path', function () {
    //       0   1 2 3    4   5 6 7 8    9   10 11 12   13
    // <root> <p> a b </p> <p> c d e </p> <p>  f  g  </p>  </root>
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

    let pos = tree.pathToTreePos([0]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['root', 0]);

    pos = tree.pathToTreePos([0, 0]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['p', 0]);

    pos = tree.pathToTreePos([0, 0, 0]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.a', 0]);

    pos = tree.pathToTreePos([0, 0, 1]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.a', 1]);

    pos = tree.pathToTreePos([0, 1, 0]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.b', 0]);

    pos = tree.pathToTreePos([0, 1, 1]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.b', 1]);

    pos = tree.pathToTreePos([1]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['p', 0]);

    pos = tree.pathToTreePos([1, 0]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['p', 0]);

    pos = tree.pathToTreePos([1, 0, 0]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.cde', 0]);

    pos = tree.pathToTreePos([1, 0, 1]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.cde', 1]);

    pos = tree.pathToTreePos([1, 0, 2]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.cde', 2]);

    pos = tree.pathToTreePos([1, 0, 3]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.cde', 3]);

    pos = tree.pathToTreePos([2]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['p', 1]);

    pos = tree.pathToTreePos([2, 0, 0]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.fg', 0]);

    pos = tree.pathToTreePos([2, 0, 1]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.fg', 1]);

    pos = tree.pathToTreePos([2, 0, 2]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['text.fg', 2]);

    pos = tree.pathToTreePos([3]);
    assert.deepEqual([toDiagnostic(pos.node), pos.offset], ['p', 2]);
  });

  it('Can find path from given treePos', function () {
    //       0   1 2 3    4   5 6 7 8    9   10 11 12   13
    // <root> <p> a b </p> <p> c d e </p> <p>  f  g  </p>  </root>
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

    let pos = tree.findTreePos(0);
    assert.deepEqual(tree.treePosToPath(pos), [0]);

    pos = tree.findTreePos(1);
    assert.deepEqual(tree.treePosToPath(pos), [0, 0, 0]);

    pos = tree.findTreePos(2);
    assert.deepEqual(tree.treePosToPath(pos), [0, 0, 1]);

    pos = tree.findTreePos(3);
    assert.deepEqual(tree.treePosToPath(pos), [0, 1, 1]);

    pos = tree.findTreePos(4);
    assert.deepEqual(tree.treePosToPath(pos), [1]);

    pos = tree.findTreePos(5);
    assert.deepEqual(tree.treePosToPath(pos), [1, 0, 0]);

    pos = tree.findTreePos(6);
    assert.deepEqual(tree.treePosToPath(pos), [1, 0, 1]);

    pos = tree.findTreePos(7);
    assert.deepEqual(tree.treePosToPath(pos), [1, 0, 2]);

    pos = tree.findTreePos(8);
    assert.deepEqual(tree.treePosToPath(pos), [1, 0, 3]);

    pos = tree.findTreePos(9);
    assert.deepEqual(tree.treePosToPath(pos), [2]);

    pos = tree.findTreePos(10);
    assert.deepEqual(tree.treePosToPath(pos), [2, 0, 0]);

    pos = tree.findTreePos(11);
    assert.deepEqual(tree.treePosToPath(pos), [2, 0, 1]);

    pos = tree.findTreePos(12);
    assert.deepEqual(tree.treePosToPath(pos), [2, 0, 2]);

    pos = tree.findTreePos(13);
    assert.deepEqual(tree.treePosToPath(pos), [3]);
  });
});
