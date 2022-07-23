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
import { SplayNode, SplayTree } from '../../src/util/splay_tree';

class StringNode extends SplayNode<string> {
  constructor(value: string) {
    super(value);
  }

  public static create(value: string): StringNode {
    return new StringNode(value);
  }

  public getLength(): number {
    return this.value.length;
  }
}

describe('SplayTree', function () {
  it('Can insert values and splay them', function () {
    const tree = new SplayTree<string>();

    const nodeA = tree.insert(StringNode.create('A2'));
    assert.equal('[2,2]A2', tree.getAnnotatedString());
    const nodeB = tree.insert(StringNode.create('B23'));
    assert.equal('[2,2]A2[5,3]B23', tree.getAnnotatedString());
    const nodeC = tree.insert(StringNode.create('C234'));
    assert.equal('[2,2]A2[5,3]B23[9,4]C234', tree.getAnnotatedString());
    const nodeD = tree.insert(StringNode.create('D2345'));
    assert.equal(
      '[2,2]A2[5,3]B23[9,4]C234[14,5]D2345',
      tree.getAnnotatedString(),
    );

    tree.splayNode(nodeB);
    assert.equal(
      '[2,2]A2[14,3]B23[9,4]C234[5,5]D2345',
      tree.getAnnotatedString(),
    );

    assert.equal(tree.indexOf(nodeA), 0);
    assert.equal(tree.indexOf(nodeB), 2);
    assert.equal(tree.indexOf(nodeC), 5);
    assert.equal(tree.indexOf(nodeD), 9);
  });

  it('Can delete the given node', function () {
    const tree = new SplayTree<string>();

    const nodeH = tree.insert(StringNode.create('H'));
    assert.equal('[1,1]H', tree.getAnnotatedString());
    const nodeE = tree.insert(StringNode.create('E'));
    assert.equal('[1,1]H[2,1]E', tree.getAnnotatedString());
    const nodeL = tree.insert(StringNode.create('LL'));
    assert.equal('[1,1]H[2,1]E[4,2]LL', tree.getAnnotatedString());
    const nodeO = tree.insert(StringNode.create('O'));
    assert.equal('[1,1]H[2,1]E[4,2]LL[5,1]O', tree.getAnnotatedString());

    tree.delete(nodeE);
    assert.equal('[4,1]H[3,2]LL[1,1]O', tree.getAnnotatedString());

    assert.equal(tree.indexOf(nodeH), 0);
    assert.equal(tree.indexOf(nodeE), -1);
    assert.equal(tree.indexOf(nodeL), 1);
    assert.equal(tree.indexOf(nodeO), 3);
  });
});
