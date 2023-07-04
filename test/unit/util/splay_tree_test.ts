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
import { SplayNode, SplayTree } from '@yorkie-js-sdk/src/util/splay_tree';

class StringNode extends SplayNode<string> {
  public removed: Boolean = false;
  constructor(value: string) {
    super(value);
  }

  public static create(value: string): StringNode {
    return new StringNode(value);
  }

  public getLength(): number {
    if (this.removed) {
      return 0;
    }
    return this.value.length;
  }
}

function makeSampleTree(): [SplayTree<string>, Array<StringNode>] {
  const tree = new SplayTree<string>();
  const nodes = new Array<StringNode>();

  nodes.push(tree.insert(StringNode.create('A')) as StringNode);
  nodes.push(tree.insert(StringNode.create('BB')) as StringNode);
  nodes.push(tree.insert(StringNode.create('CCC')) as StringNode);
  nodes.push(tree.insert(StringNode.create('DDDD')) as StringNode);
  nodes.push(tree.insert(StringNode.create('EEEEE')) as StringNode);
  nodes.push(tree.insert(StringNode.create('FFFF')) as StringNode);
  nodes.push(tree.insert(StringNode.create('GGG')) as StringNode);
  nodes.push(tree.insert(StringNode.create('HH')) as StringNode);
  nodes.push(tree.insert(StringNode.create('I')) as StringNode);

  return [tree, nodes];
}

// Make nodes in given range the same state as tombstone.
function removeNodes(nodes: Array<StringNode>, from: number, to: number): void {
  for (let i = from; i <= to; i++) {
    nodes[i].removed = true;
  }
}

function sumOfWeight(
  nodes: Array<StringNode>,
  from: number,
  to: number,
): number {
  let sum = 0;
  for (let i = from; i <= to; i++) {
    sum += nodes[i].getWeight();
  }
  return sum;
}

describe('SplayTree', function () {
  it('Can insert values and splay them', function () {
    const tree = new SplayTree<string>();

    const nodeA = tree.insert(StringNode.create('A2'));
    assert.equal('[2,2]A2', tree.toTestString());
    const nodeB = tree.insert(StringNode.create('B23'));
    assert.equal('[2,2]A2[5,3]B23', tree.toTestString());
    const nodeC = tree.insert(StringNode.create('C234'));
    assert.equal('[2,2]A2[5,3]B23[9,4]C234', tree.toTestString());
    const nodeD = tree.insert(StringNode.create('D2345'));
    assert.equal('[2,2]A2[5,3]B23[9,4]C234[14,5]D2345', tree.toTestString());

    tree.splayNode(nodeB);
    assert.equal('[2,2]A2[14,3]B23[9,4]C234[5,5]D2345', tree.toTestString());

    assert.equal(tree.indexOf(nodeA), 0);
    assert.equal(tree.indexOf(nodeB), 2);
    assert.equal(tree.indexOf(nodeC), 5);
    assert.equal(tree.indexOf(nodeD), 9);

    assert.deepEqual([undefined, 0], tree.find(-1));
  });

  it('Can delete the given node', function () {
    const tree = new SplayTree<string>();

    const nodeH = tree.insert(StringNode.create('H'));
    assert.equal('[1,1]H', tree.toTestString());
    const nodeE = tree.insert(StringNode.create('E'));
    assert.equal('[1,1]H[2,1]E', tree.toTestString());
    const nodeL = tree.insert(StringNode.create('LL'));
    assert.equal('[1,1]H[2,1]E[4,2]LL', tree.toTestString());
    const nodeO = tree.insert(StringNode.create('O'));
    assert.equal('[1,1]H[2,1]E[4,2]LL[5,1]O', tree.toTestString());

    tree.delete(nodeE);
    assert.equal('[4,1]H[3,2]LL[1,1]O', tree.toTestString());

    assert.equal(tree.indexOf(nodeH), 0);
    assert.equal(tree.indexOf(nodeE), -1);
    assert.equal(tree.indexOf(nodeL), 1);
    assert.equal(tree.indexOf(nodeO), 3);
  });

  it('Can delete range between the given 2 boundary nodes', function () {
    let [tree, nodes] = makeSampleTree();
    // check the filtering of rangeDelete
    removeNodes(nodes, 7, 8);
    tree.deleteRange(nodes[6], undefined);
    assert.equal(nodes[6], tree.getRoot());
    assert.equal(nodes[6].getWeight(), 22);
    assert.equal(sumOfWeight(nodes, 7, 8), 0);

    [tree, nodes] = makeSampleTree();
    // check the case 1 of rangeDelete
    removeNodes(nodes, 3, 6);
    tree.deleteRange(nodes[2], nodes[7]);
    assert.equal(nodes[7], tree.getRoot());
    assert.equal(nodes[2], tree.getRoot().getLeft());
    assert.equal(nodes[7].getWeight(), 9);
    assert.equal(nodes[2].getWeight(), 6);
    assert.equal(sumOfWeight(nodes, 3, 6), 0);

    [tree, nodes] = makeSampleTree();
    tree.splayNode(nodes[6]);
    tree.splayNode(nodes[2]);
    // check the case 2 of rangeDelete
    removeNodes(nodes, 3, 7);
    tree.deleteRange(nodes[2], nodes[8]);
    assert.equal(nodes[8], tree.getRoot());
    assert.equal(nodes[2], tree.getRoot()!.getLeft());
    assert.equal(nodes[8].getWeight(), 7);
    assert.equal(nodes[2].getWeight(), 6);
    assert.equal(sumOfWeight(nodes, 3, 7), 0);
  });

  it('should handle indexOf correctly with single node', function () {
    const tree = new SplayTree<string>();
    const nodeA = tree.insert(StringNode.create('A'));
    assert.equal(tree.indexOf(nodeA), 0);
    tree.delete(nodeA);
    assert.equal(tree.indexOf(nodeA), -1);
  });
});
