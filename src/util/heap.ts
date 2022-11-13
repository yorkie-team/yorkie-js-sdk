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

import {
  Comparator,
  DefaultComparator,
} from '@yorkie-js-sdk/src/util/comparator';

/**
 * `HeapNode` is a node of `Heap`.
 */
export class HeapNode<K, V> {
  private key: K;
  private value: V;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }

  /**
   * `getKey` returns a key of HeapNode.
   */
  public getKey(): K {
    return this.key;
  }

  /**
   * `getValue` returns a value of HeapNode.
   */
  public getValue(): V {
    return this.value;
  }
}

/**
 * `Heap` is a heap implemented with max heap.
 */
export class Heap<K, V> {
  private nodes: Array<HeapNode<K, V>>;
  private comparator: Comparator<K>;

  constructor(comparator?: Comparator<K>) {
    this.comparator = comparator || DefaultComparator;
    this.nodes = [];
  }

  /**
   * `peek` returns the maximum element from this Heap.
   */
  public peek(): HeapNode<K, V> | undefined {
    if (!this.nodes.length) {
      return;
    }

    return this.nodes[0];
  }

  /**
   * `len` is the number of elements in this Heap.
   */
  public len(): number {
    return this.nodes.length;
  }

  /**
   * `release` deletes the given value from this Heap.
   */
  public release(node: HeapNode<K, V>): void {
    const lastIndexBeforeRelease = this.nodes.length - 1;
    const targetIndex = this.nodes.findIndex(
      (_node) => _node.getValue() === node.getValue(),
    );
    const lastNode = this.nodes.pop()!;

    if (
      targetIndex < 0 ||
      !this.len() ||
      targetIndex === lastIndexBeforeRelease
    ) {
      return;
    }

    this.nodes[targetIndex] = lastNode;

    this.heapify(this.getParentIndex(targetIndex), targetIndex);
  }

  /**
   * `push` pushes the given node onto this Heap.
   */
  public push(node: HeapNode<K, V>): void {
    this.nodes.push(node);
    this.moveUp(this.nodes.length - 1);
  }

  /**
   * `pop` removes and returns the maximum element from this Heap.
   */
  public pop(): HeapNode<K, V> | undefined {
    const count = this.nodes.length;
    const head = this.nodes[0];
    if (count <= 0) {
      return;
    } else if (count == 1) {
      // clear array
      this.nodes.length = 0;
    } else {
      this.nodes[0] = this.nodes.pop()!;
      this.moveDown(0);
    }

    return head;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<HeapNode<K, V>> {
    for (const node of this.nodes) {
      yield node;
    }
  }

  private heapify(parentIndex: number, targetIndex: number): void {
    if (
      parentIndex > -1 &&
      this.comparator(
        this.nodes[parentIndex].getKey(),
        this.nodes[targetIndex].getKey(),
      ) < 0
    ) {
      this.moveUp(targetIndex);
    } else {
      this.moveDown(targetIndex);
    }
  }

  private moveUp(index: number): void {
    const node = this.nodes[index];

    while (index > 0) {
      const parentIndex = this.getParentIndex(index);
      if (
        this.comparator(this.nodes[parentIndex].getKey(), node.getKey()) < 0
      ) {
        this.nodes[index] = this.nodes[parentIndex];
        index = parentIndex;
      } else {
        break;
      }
    }
    this.nodes[index] = node;
  }

  private moveDown(index: number): void {
    const count = this.nodes.length;

    const node = this.nodes[index];
    while (index < count >> 1) {
      const leftChildIndex = this.getLeftChildIndex(index);
      const rightChildIndex = this.getRightChildIndex(index);

      const smallerChildIndex =
        rightChildIndex < count &&
        this.comparator(
          this.nodes[leftChildIndex].getKey(),
          this.nodes[rightChildIndex].getKey(),
        ) < 0
          ? rightChildIndex
          : leftChildIndex;

      if (
        this.comparator(this.nodes[smallerChildIndex].getKey(), node.getKey()) <
        0
      ) {
        break;
      }

      this.nodes[index] = this.nodes[smallerChildIndex];
      index = smallerChildIndex;
    }
    this.nodes[index] = node;
  }

  private getParentIndex(index: number): number {
    return (index - 1) >> 1;
  }

  private getLeftChildIndex(index: number): number {
    return index * 2 + 1;
  }

  private getRightChildIndex(index: number): number {
    return index * 2 + 2;
  }
}
