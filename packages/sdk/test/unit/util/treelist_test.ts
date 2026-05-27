/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

import { describe, it, assert } from 'vitest';
import {
  TreeList,
  TreeListNode,
  TreeListValue,
} from '@yorkie-js/sdk/src/util/treelist';

class TestValue implements TreeListValue {
  public removed: boolean;
  public content: string;

  constructor(content: string, removed = false) {
    this.content = content;
    this.removed = removed;
  }

  public isRemoved(): boolean {
    return this.removed;
  }

  public toString(): string {
    return this.content;
  }
}

function newNode(content: string): TreeListNode<TestValue> {
  return new TreeListNode(new TestValue(content));
}

function newRemovedNode(content: string): TreeListNode<TestValue> {
  return new TreeListNode(new TestValue(content, true));
}

function rebuildLiveList(
  tree: TreeList<TestValue>,
): Array<TreeListNode<TestValue>> {
  const result: Array<TreeListNode<TestValue>> = [];
  for (let i = 0; i < tree.length; i++) {
    result.push(tree.find(i));
  }
  return result;
}

// Simple seeded LCG so the stress test is deterministic across runs/platforms.
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('TreeList', () => {
  it('insert and find test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    assert.equal(tree.length, 0);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    assert.equal(tree.length, 1);

    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);
    assert.equal(tree.length, 2);

    const nodeC = newNode('C');
    tree.insertAfter(nodeB, nodeC);
    assert.equal(tree.length, 3);

    assert.equal(tree.find(0), nodeA);
    assert.equal(tree.find(1), nodeB);
    assert.equal(tree.find(2), nodeC);
  });

  it('insert in the middle test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeC = newNode('C');
    tree.insertAfter(nodeA, nodeC);

    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);
    assert.equal(tree.length, 3);

    assert.equal(tree.find(0), nodeA);
    assert.equal(tree.find(1), nodeB);
    assert.equal(tree.find(2), nodeC);
  });

  it('insert after tombstone test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);

    nodeA.getValue().removed = true;
    tree.updateWeight(nodeA);
    assert.equal(tree.length, 1);

    const nodeC = newNode('C');
    tree.insertAfter(nodeA, nodeC);
    assert.equal(tree.length, 2);

    assert.equal(tree.find(0), nodeC);
    assert.equal(tree.find(1), nodeB);
  });

  it('delete test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);
    const nodeC = newNode('C');
    tree.insertAfter(nodeB, nodeC);
    assert.equal(tree.length, 3);

    tree.delete(nodeB);
    assert.equal(tree.length, 2);

    assert.equal(tree.find(0), nodeA);
    assert.equal(tree.find(1), nodeC);
  });

  it('delete preserves node identity test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodes: Array<TreeListNode<TestValue>> = [];
    let prev: TreeListNode<TestValue> = dummyHead;
    for (let i = 0; i < 5; i++) {
      const node = newNode(String.fromCharCode('A'.charCodeAt(0) + i));
      tree.insertAfter(prev, node);
      nodes.push(node);
      prev = node;
    }
    assert.equal(tree.length, 5);

    tree.delete(nodes[2]); // Delete C
    assert.equal(tree.length, 4);

    assert.equal(tree.find(0), nodes[0]); // A
    assert.equal(tree.find(1), nodes[1]); // B
    assert.equal(tree.find(2), nodes[3]); // D
    assert.equal(tree.find(3), nodes[4]); // E
  });

  it('delete first and last nodes test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);
    const nodeC = newNode('C');
    tree.insertAfter(nodeB, nodeC);

    tree.delete(nodeA);
    assert.equal(tree.length, 2);
    assert.equal(tree.find(0), nodeB);

    tree.delete(nodeC);
    assert.equal(tree.length, 1);
    assert.equal(tree.find(0), nodeB);
  });

  it('delete tombstoned node test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);
    const nodeC = newNode('C');
    tree.insertAfter(nodeB, nodeC);

    nodeB.getValue().removed = true;
    tree.updateWeight(nodeB);
    assert.equal(tree.length, 2);

    tree.delete(nodeB);
    assert.equal(tree.length, 2);

    assert.equal(tree.find(0), nodeA);
    assert.equal(tree.find(1), nodeC);
  });

  it('delete all nodes test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);

    tree.delete(nodeA);
    tree.delete(nodeB);
    tree.delete(dummyHead);

    assert.equal(tree.length, 0);
  });

  it('tombstone and update weight test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);
    const nodeC = newNode('C');
    tree.insertAfter(nodeB, nodeC);
    assert.equal(tree.length, 3);

    nodeB.getValue().removed = true;
    tree.updateWeight(nodeB);
    assert.equal(tree.length, 2);

    assert.equal(tree.find(0), nodeA);
    assert.equal(tree.find(1), nodeC);
    assert.throws(() => tree.find(2));
  });

  it('multiple tombstones test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodes: Array<TreeListNode<TestValue>> = [];
    let prev: TreeListNode<TestValue> = dummyHead;
    for (let i = 0; i < 6; i++) {
      const node = newNode(String.fromCharCode('A'.charCodeAt(0) + i));
      tree.insertAfter(prev, node);
      nodes.push(node);
      prev = node;
    }
    assert.equal(tree.length, 6);

    nodes[1].getValue().removed = true; // B
    tree.updateWeight(nodes[1]);
    nodes[3].getValue().removed = true; // D
    tree.updateWeight(nodes[3]);
    nodes[5].getValue().removed = true; // F
    tree.updateWeight(nodes[5]);
    assert.equal(tree.length, 3);

    assert.equal(tree.find(0), nodes[0]); // A
    assert.equal(tree.find(1), nodes[2]); // C
    assert.equal(tree.find(2), nodes[4]); // E
  });

  it('find out of bounds test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    assert.throws(() => tree.find(0));

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);

    assert.throws(() => tree.find(-1));
    assert.throws(() => tree.find(1));
  });

  it('single live node tree test', () => {
    const node = newNode('A');
    const tree = new TreeList<TestValue>(node);
    assert.equal(tree.length, 1);

    assert.equal(tree.find(0), node);

    tree.delete(node);
    assert.equal(tree.length, 0);
  });

  it('large sequential insert and find test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const n = 100;
    const nodes: Array<TreeListNode<TestValue>> = [];
    let prev: TreeListNode<TestValue> = dummyHead;
    for (let i = 0; i < n; i++) {
      const node = newNode(`${i}`);
      tree.insertAfter(prev, node);
      nodes.push(node);
      prev = node;
    }
    assert.equal(tree.length, n);

    for (let i = 0; i < n; i++) {
      assert.equal(tree.find(i), nodes[i]);
    }
  });

  it('large sequential insert, tombstone, and find test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const n = 100;
    const nodes: Array<TreeListNode<TestValue>> = [];
    let prev: TreeListNode<TestValue> = dummyHead;
    for (let i = 0; i < n; i++) {
      const node = newNode(`${i}`);
      tree.insertAfter(prev, node);
      nodes.push(node);
      prev = node;
    }

    for (let i = 0; i < n; i += 2) {
      nodes[i].getValue().removed = true;
      tree.updateWeight(nodes[i]);
    }
    assert.equal(tree.length, n / 2);

    let idx = 0;
    for (let i = 1; i < n; i += 2) {
      assert.equal(tree.find(idx), nodes[i]);
      idx++;
    }
  });

  it('large sequential insert and delete test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const n = 100;
    const nodes: Array<TreeListNode<TestValue>> = [];
    let prev: TreeListNode<TestValue> = dummyHead;
    for (let i = 0; i < n; i++) {
      const node = newNode(`${i}`);
      tree.insertAfter(prev, node);
      nodes.push(node);
      prev = node;
    }

    for (let i = 0; i < n; i += 2) {
      tree.delete(nodes[i]);
    }
    assert.equal(tree.length, n / 2);

    let idx = 0;
    for (let i = 1; i < n; i += 2) {
      assert.equal(tree.find(idx), nodes[i]);
      idx++;
    }
  });

  it('interleaved insert and delete test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);
    const nodeC = newNode('C');
    tree.insertAfter(nodeB, nodeC);

    tree.delete(nodeB);
    const nodeD = newNode('D');
    tree.insertAfter(nodeA, nodeD);
    assert.equal(tree.length, 3);

    assert.equal(tree.find(0), nodeA);
    assert.equal(tree.find(1), nodeD);
    assert.equal(tree.find(2), nodeC);
  });

  it('insert after dummy head with existing nodes test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeB = newNode('B');
    tree.insertAfter(dummyHead, nodeB);
    const nodeC = newNode('C');
    tree.insertAfter(nodeB, nodeC);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    assert.equal(tree.length, 3);

    assert.equal(tree.find(0), nodeA);
    assert.equal(tree.find(1), nodeB);
    assert.equal(tree.find(2), nodeC);
  });

  it('toTestString test', () => {
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    const nodeA = newNode('A');
    tree.insertAfter(dummyHead, nodeA);
    const nodeB = newNode('B');
    tree.insertAfter(nodeA, nodeB);

    const str = tree.toTestString();
    assert.include(str, 'dummy');
    assert.include(str, 'A');
    assert.include(str, 'B');
  });

  it('stress test with random operations', () => {
    const rng = makeRng(42);
    const dummyHead = newRemovedNode('dummy');
    const tree = new TreeList<TestValue>(dummyHead);

    let liveNodes: Array<TreeListNode<TestValue>> = [];
    let allNodes: Array<TreeListNode<TestValue>> = [dummyHead];

    const ops = 500;
    for (let i = 0; i < ops; i++) {
      const op = Math.floor(rng() * 3);

      if (op === 0 || allNodes.length < 3) {
        const prevIdx = Math.floor(rng() * allNodes.length);
        const prev = allNodes[prevIdx];
        const node = newNode(`n${i}`);
        tree.insertAfter(prev, node);
        allNodes.push(node);
        liveNodes = rebuildLiveList(tree);
      } else if (op === 1 && liveNodes.length > 0) {
        const idx = Math.floor(rng() * liveNodes.length);
        liveNodes[idx].getValue().removed = true;
        tree.updateWeight(liveNodes[idx]);
        liveNodes = rebuildLiveList(tree);
      } else if (op === 2 && allNodes.length > 1) {
        const delIdx = 1 + Math.floor(rng() * (allNodes.length - 1));
        tree.delete(allNodes[delIdx]);
        allNodes = allNodes.slice(0, delIdx).concat(allNodes.slice(delIdx + 1));
        liveNodes = rebuildLiveList(tree);
      }

      assert.equal(tree.length, liveNodes.length, `iteration ${i}`);

      for (let j = 0; j < liveNodes.length; j++) {
        assert.equal(
          tree.find(j),
          liveNodes[j],
          `iteration ${i}, find index ${j}`,
        );
      }
    }
  });
});
