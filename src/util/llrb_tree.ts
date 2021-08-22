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

interface Entry<K, V> {
  key: K;
  value: V;
}

/**
 * `LLRBNode` is node of LLRBTree.
 */
class LLRBNode<K, V> {
  public key: K;
  public value: V;
  public parent?: LLRBNode<K, V>;
  public left?: LLRBNode<K, V>;
  public right?: LLRBNode<K, V>;
  public isRed: boolean;

  constructor(key: K, value: V, isRed: boolean) {
    this.key = key;
    this.value = value;
    this.isRed = isRed;
  }
}

/**
 * `SortedMapIterator` is a interator for traversing LLRBTree.
 */
export class SortedMapIterator<K, V> {
  public stack: Array<Entry<K, V>>;

  constructor(root: LLRBNode<K, V>) {
    this.stack = [];
    this.traverseInorder(root);
  }

  // TODO: Replace with iterative approach, if we encounter performance problem.
  private traverseInorder(node: LLRBNode<K, V>): void {
    if (!node) {
      return;
    }

    this.traverseInorder(node.left!);
    this.stack.push({
      key: node.key,
      value: node.value,
    });
    this.traverseInorder(node.right!);
  }
}

/**
 * LLRBTree is an implementation of Left-learning Red-Black Tree.
 *
 * Original paper on Left-leaning Red-Black Trees:
 * @see http://www.cs.princeton.edu/~rs/talks/LLRB/LLRB.pdf
 *
 * Invariant 1: No red node has a red child
 * Invariant 2: Every leaf path has the same number of black nodes
 * Invariant 3: Only the left child can be red (left leaning)
 */
export class LLRBTree<K, V> {
  private root?: LLRBNode<K, V>;
  private comparator: Comparator<K>;
  private counter: number;

  constructor(comparator?: Comparator<K>) {
    this.comparator =
      typeof comparator !== 'undefined' ? comparator : DefaultComparator;
    this.counter = 0;
  }

  /**
   * `put` puts the value of the given key.
   */
  public put(key: K, value: V): V {
    this.root = this.putInternal(key, value, this.root);
    this.root.isRed = false;
    return value;
  }

  /**
   * `get` gets a value of the given key.
   */
  public get(key: K): V | undefined {
    const node = this.getInternal(key, this.root);
    return node ? node.value : undefined;
  }

  /**
   * `remove` removes a element of key.
   */
  public remove(key: K): void {
    if (!this.isRed(this.root!.left!) && !this.isRed(this.root!.right!)) {
      this.root!.isRed = true;
    }

    this.root = this.removeInternal(this.root!, key);
    if (this.root) {
      this.root.isRed = false;
    }
  }

  /**
   * `getIterator` returns a new instance of SortedMapIterator.
   */
  public getIterator(): SortedMapIterator<K, V> {
    return new SortedMapIterator(this.root!);
  }

  /**
   * `values` returns value array of LLRBTree.
   */
  public values(): Array<V> {
    const values = [];
    for (const entry of this.getIterator().stack) {
      values.push(entry.value);
    }
    return values;
  }

  /**
   * `floorEntry` returns the entry for the greatest key less than or equal to the
   *  given key. If there is no such key, returns `undefined`.
   */
  public floorEntry(key: K): Entry<K, V> | undefined {
    let node = this.root;
    while (node) {
      const compare = this.comparator(key, node.key);
      if (compare > 0) {
        if (node.right) {
          node.right.parent = node;
          node = node.right;
        } else {
          return node;
        }
      } else if (compare < 0) {
        if (node.left) {
          node.left.parent = node;
          node = node.left;
        } else {
          let parent = node.parent;
          let childNode = node;
          while (parent && childNode === parent.left) {
            childNode = parent;
            parent = parent.parent;
          }
          return parent!;
        }
      } else {
        return node;
      }
    }
    return;
  }

  /**
   * `lastEntry` returns last entry of LLRBTree.
   */
  public lastEntry(): Entry<K, V> | undefined {
    if (!this.root) {
      return this.root;
    }

    let node = this.root;
    while (node.right) {
      node = node.right;
    }
    return node;
  }

  /**
   * `size` is a size of LLRBTree.
   */
  public size(): number {
    return this.counter;
  }

  /**
   * `isEmpty` checks if size is empty.
   */
  public isEmpty(): boolean {
    return this.counter === 0;
  }

  private getInternal(
    key: K,
    node?: LLRBNode<K, V>,
  ): LLRBNode<K, V> | undefined {
    while (node) {
      const compare = this.comparator(key, node.key);
      if (compare === 0) {
        return node;
      } else if (compare < 0) {
        node = node.left!;
      } else if (compare > 0) {
        node = node.right!;
      }
    }

    return;
  }

  private putInternal(key: K, value: V, node?: LLRBNode<K, V>): LLRBNode<K, V> {
    if (!node) {
      this.counter += 1;
      return new LLRBNode(key, value, true);
    }

    const compare = this.comparator(key, node.key);
    if (compare < 0) {
      node.left = this.putInternal(key, value, node.left);
    } else if (compare > 0) {
      node.right = this.putInternal(key, value, node.right);
    } else {
      node.value = value;
    }

    if (this.isRed(node.right!) && !this.isRed(node.left!)) {
      node = this.rotateLeft(node);
    }

    if (this.isRed(node.left!) && this.isRed(node.left!.left!)) {
      node = this.rotateRight(node);
    }

    if (this.isRed(node.left!) && this.isRed(node.right!)) {
      this.flipColors(node);
    }

    return node;
  }

  private removeInternal(
    node: LLRBNode<K, V>,
    key: K,
  ): LLRBNode<K, V> | undefined {
    if (this.comparator(key, node.key) < 0) {
      if (!this.isRed(node.left!) && !this.isRed(node.left!.left!)) {
        node = this.moveRedLeft(node);
      }
      node.left = this.removeInternal(node.left!, key);
    } else {
      if (this.isRed(node.left!)) {
        node = this.rotateRight(node);
      }

      if (this.comparator(key, node.key) === 0 && !node.right) {
        this.counter -= 1;
        return;
      }

      if (!this.isRed(node.right!) && !this.isRed(node.right!.left!)) {
        node = this.moveRedRight(node);
      }

      if (this.comparator(key, node.key) === 0) {
        this.counter -= 1;
        const smallest = this.min(node.right!);
        node.value = smallest.value;
        node.key = smallest.key;
        node.right = this.removeMin(node.right!);
      } else {
        node.right = this.removeInternal(node.right!, key);
      }
    }

    return this.fixUp(node);
  }

  private min(node: LLRBNode<K, V>): LLRBNode<K, V> {
    if (!node.left) {
      return node;
    } else {
      return this.min(node.left);
    }
  }

  private removeMin(node: LLRBNode<K, V>): LLRBNode<K, V> | undefined {
    if (!node.left) {
      return;
    }

    if (!this.isRed(node.left) && !this.isRed(node.left!.left!)) {
      node = this.moveRedLeft(node);
    }

    node.left = this.removeMin(node.left!);
    return this.fixUp(node);
  }

  private fixUp(node: LLRBNode<K, V>): LLRBNode<K, V> {
    if (this.isRed(node.right!)) {
      node = this.rotateLeft(node);
    }

    if (this.isRed(node.left!) && this.isRed(node.left!.left!)) {
      node = this.rotateRight(node);
    }

    if (this.isRed(node.left!) && this.isRed(node.right!)) {
      this.flipColors(node);
    }

    return node;
  }

  private moveRedLeft(node: LLRBNode<K, V>): LLRBNode<K, V> {
    this.flipColors(node);
    if (this.isRed(node.right!.left!)) {
      node.right = this.rotateRight(node.right!);
      node = this.rotateLeft(node);
      this.flipColors(node);
    }
    return node;
  }

  private moveRedRight(node: LLRBNode<K, V>): LLRBNode<K, V> {
    this.flipColors(node);
    if (this.isRed(node.left!.left!)) {
      node = this.rotateRight(node);
      this.flipColors(node);
    }
    return node;
  }

  private isRed(node: LLRBNode<K, V>): boolean {
    return node && node.isRed;
  }

  private rotateLeft(node: LLRBNode<K, V>): LLRBNode<K, V> {
    const x = node.right!;
    node.right = x.left;
    x.left = node;
    x.isRed = x.left.isRed;
    x.left.isRed = true;
    return x;
  }

  private rotateRight(node: LLRBNode<K, V>): LLRBNode<K, V> {
    const x = node.left!;
    node.left = x.right;
    x.right = node;
    x.isRed = x.right.isRed;
    x.right.isRed = true;
    return x;
  }

  private flipColors(node: LLRBNode<K, V>): void {
    node.isRed = !node.isRed!;
    node.left!.isRed = !node.left!.isRed;
    node.right!.isRed = !node.right!.isRed;
  }
}
