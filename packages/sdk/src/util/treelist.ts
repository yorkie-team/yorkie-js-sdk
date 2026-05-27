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

import { Code, YorkieError } from './error';

/**
 * `TreeListValue` represents the data stored in the nodes of TreeList.
 */
export interface TreeListValue {
  isRemoved(): boolean;
  toString(): string;
}

/**
 * `TreeListNode` is a node of TreeList.
 *
 * It tracks two aggregates over its subtree:
 *   - weight: number of non-removed (live) nodes (logical index)
 *   - count: total nodes including tombstones (structural index)
 */
export class TreeListNode<V extends TreeListValue> {
  private value: V;

  private left?: TreeListNode<V>;
  private right?: TreeListNode<V>;
  private parent?: TreeListNode<V>;

  private weight: number;
  private count: number;

  private red: boolean;

  constructor(value: V) {
    this.value = value;
    this.red = true;
    this.weight = this.size();
    this.count = 1;
  }

  /**
   * `getValue` returns the value of this node.
   */
  public getValue(): V {
    return this.value;
  }

  /**
   * `size` returns 1 if the node is live, 0 if removed (tombstone).
   */
  public size(): number {
    return this.value.isRemoved() ? 0 : 1;
  }

  /**
   * `getLeft` returns the left child.
   */
  public getLeft(): TreeListNode<V> | undefined {
    return this.left;
  }

  /**
   * `setLeft` sets the left child.
   */
  public setLeft(node: TreeListNode<V> | undefined): void {
    this.left = node;
  }

  /**
   * `getRight` returns the right child.
   */
  public getRight(): TreeListNode<V> | undefined {
    return this.right;
  }

  /**
   * `setRight` sets the right child.
   */
  public setRight(node: TreeListNode<V> | undefined): void {
    this.right = node;
  }

  /**
   * `getParent` returns the parent.
   */
  public getParent(): TreeListNode<V> | undefined {
    return this.parent;
  }

  /**
   * `setParent` sets the parent.
   */
  public setParent(node: TreeListNode<V> | undefined): void {
    this.parent = node;
  }

  /**
   * `getWeight` returns the cached live-node weight of this subtree.
   */
  public getWeight(): number {
    return this.weight;
  }

  /**
   * `setWeight` sets the cached live-node weight of this subtree.
   */
  public setWeight(w: number): void {
    this.weight = w;
  }

  /**
   * `getCount` returns the cached total node count of this subtree.
   */
  public getCount(): number {
    return this.count;
  }

  /**
   * `setCount` sets the cached total node count of this subtree.
   */
  public setCount(c: number): void {
    this.count = c;
  }

  /**
   * `isRed` reports whether this node is colored red.
   */
  public isRed(): boolean {
    return this.red;
  }

  /**
   * `setRed` sets the color of this node.
   */
  public setRed(red: boolean): void {
    this.red = red;
  }

  /**
   * `leftWeight` returns the live-node weight of the left subtree, or 0 if absent.
   */
  public leftWeight(): number {
    return this.left ? this.left.weight : 0;
  }

  /**
   * `rightWeight` returns the live-node weight of the right subtree, or 0 if absent.
   */
  public rightWeight(): number {
    return this.right ? this.right.weight : 0;
  }

  /**
   * `leftCount` returns the total node count of the left subtree, or 0 if absent.
   */
  public leftCount(): number {
    return this.left ? this.left.count : 0;
  }

  /**
   * `rightCount` returns the total node count of the right subtree, or 0 if absent.
   */
  public rightCount(): number {
    return this.right ? this.right.count : 0;
  }
}

/**
 * `isRed` reports whether the given node is a red link. An undefined node is
 * treated as black, matching the standard LLRB convention.
 */
function isRed<V extends TreeListValue>(
  node: TreeListNode<V> | undefined,
): boolean {
  return !!node && node.isRed();
}

/**
 * `updateNode` recomputes the cached weight and count aggregates of node from
 * its children. Call this whenever the structure or liveness of a child
 * changes.
 */
function updateNode<V extends TreeListValue>(node: TreeListNode<V>): void {
  node.setWeight(node.leftWeight() + node.size() + node.rightWeight());
  node.setCount(node.leftCount() + 1 + node.rightCount());
}

/**
 * `rotateLeft` performs a standard LLRB left rotation around node, promoting
 * its right child. Parent pointers and aggregate counters are refreshed and
 * the new subtree root is returned.
 */
function rotateLeft<V extends TreeListValue>(
  node: TreeListNode<V>,
): TreeListNode<V> {
  const right = node.getRight()!;

  node.setRight(right.getLeft());
  if (node.getRight()) {
    node.getRight()!.setParent(node);
  }

  right.setLeft(node);
  right.setParent(node.getParent());
  node.setParent(right);

  right.setRed(node.isRed());
  node.setRed(true);

  updateNode(node);
  updateNode(right);
  return right;
}

/**
 * `rotateRight` performs a standard LLRB right rotation around node, promoting
 * its left child. Parent pointers and aggregate counters are refreshed and
 * the new subtree root is returned.
 */
function rotateRight<V extends TreeListValue>(
  node: TreeListNode<V>,
): TreeListNode<V> {
  const left = node.getLeft()!;

  node.setLeft(left.getRight());
  if (node.getLeft()) {
    node.getLeft()!.setParent(node);
  }

  left.setRight(node);
  left.setParent(node.getParent());
  node.setParent(left);

  left.setRed(node.isRed());
  node.setRed(true);

  updateNode(node);
  updateNode(left);
  return left;
}

/**
 * `flipColors` toggles the colors of node and both of its children, used
 * during LLRB splits and merges.
 */
function flipColors<V extends TreeListValue>(node: TreeListNode<V>): void {
  node.setRed(!node.isRed());
  node.getLeft()!.setRed(!node.getLeft()!.isRed());
  node.getRight()!.setRed(!node.getRight()!.isRed());
}

/**
 * `moveRedLeft` ensures the left child or one of its children is red so a
 * deletion descending to the left can proceed without violating LLRB
 * invariants. The new subtree root is returned.
 */
function moveRedLeft<V extends TreeListValue>(
  node: TreeListNode<V>,
): TreeListNode<V> {
  flipColors(node);
  if (isRed(node.getRight()!.getLeft())) {
    node.setRight(rotateRight(node.getRight()!));
    node.getRight()!.setParent(node);
    node = rotateLeft(node);
    flipColors(node);
  }
  return node;
}

/**
 * `moveRedRight` ensures the right child or one of its children is red so a
 * deletion descending to the right can proceed without violating LLRB
 * invariants. The new subtree root is returned.
 */
function moveRedRight<V extends TreeListValue>(
  node: TreeListNode<V>,
): TreeListNode<V> {
  flipColors(node);
  if (isRed(node.getLeft()!.getLeft())) {
    node = rotateRight(node);
    flipColors(node);
  }
  return node;
}

/**
 * `removeMin` removes the minimum (left-most) node from the subtree rooted at
 * node and returns the rebalanced subtree root. Used by Delete when splicing
 * in the in-order successor.
 */
function removeMin<V extends TreeListValue>(
  node: TreeListNode<V>,
): TreeListNode<V> | undefined {
  if (!node.getLeft()) {
    return undefined;
  }

  if (!isRed(node.getLeft()) && !isRed(node.getLeft()!.getLeft())) {
    node = moveRedLeft(node);
  }

  node.setLeft(removeMin(node.getLeft()!));
  if (node.getLeft()) {
    node.getLeft()!.setParent(node);
  }

  return fixUp(node);
}

/**
 * `minNode` returns the left-most node of the subtree rooted at node, which
 * is the in-order successor used during deletion.
 */
function minNode<V extends TreeListValue>(
  node: TreeListNode<V>,
): TreeListNode<V> {
  while (node.getLeft()) {
    node = node.getLeft()!;
  }
  return node;
}

/**
 * `fixUp` restores LLRB invariants on the way back up after an insertion or
 * deletion: it leans right-red links left, splits 4-nodes, and refreshes the
 * node's aggregate counters.
 */
function fixUp<V extends TreeListValue>(
  node: TreeListNode<V>,
): TreeListNode<V> {
  if (isRed(node.getRight()) && !isRed(node.getLeft())) {
    node = rotateLeft(node);
  }
  if (isRed(node.getLeft()) && isRed(node.getLeft()!.getLeft())) {
    node = rotateRight(node);
  }
  if (isRed(node.getLeft()) && isRed(node.getRight())) {
    flipColors(node);
  }
  updateNode(node);
  return node;
}

/**
 * `traverseInOrder` walks the subtree rooted at node in left-root-right
 * order, invoking cb on every node (live and tombstoned).
 */
function traverseInOrder<V extends TreeListValue>(
  node: TreeListNode<V> | undefined,
  cb: (n: TreeListNode<V>) => void,
): void {
  if (!node) {
    return;
  }
  traverseInOrder(node.getLeft(), cb);
  cb(node);
  traverseInOrder(node.getRight(), cb);
}

/**
 * `TreeList` is an order-statistic tree based on Left-leaning Red-Black Tree.
 * It is used by RGATreeList to support index-based operations on a list with
 * tombstones, guaranteeing O(log N) worst-case for all operations.
 *
 * It maintains two weights per node:
 *   - weight: count of non-removed nodes (for index-based lookup)
 *   - count: total nodes including tombstones (for structural operations)
 */
export class TreeList<V extends TreeListValue> {
  private root?: TreeListNode<V>;

  constructor(root?: TreeListNode<V>) {
    if (root) {
      root.setRed(false);
    }
    this.root = root;
  }

  /**
   * `length` returns the number of non-removed (live) nodes.
   */
  public get length(): number {
    return this.root ? this.root.getWeight() : 0;
  }

  /**
   * `insertAfter` inserts the target node right after prev in the in-order
   * traversal. It uses structural (count-based) indexing to correctly handle
   * tombstone nodes.
   */
  public insertAfter(prev: TreeListNode<V>, target: TreeListNode<V>): void {
    if (!prev || !target) {
      return;
    }

    target.setLeft(undefined);
    target.setRight(undefined);
    target.setParent(undefined);
    target.setRed(true);
    target.setWeight(target.size());
    target.setCount(1);

    const idx = this.structuralIndexOf(prev);
    this.root = this.insertByCount(this.root, idx + 1, target);
    this.root!.setRed(false);
    this.root!.setParent(undefined);
  }

  /**
   * `insertByCount` inserts newNode at the given structural index within the
   * subtree rooted at node, descending the tree using each node's left count
   * (tombstones included) and rebalancing on the way back up.
   */
  private insertByCount(
    node: TreeListNode<V> | undefined,
    index: number,
    newNode: TreeListNode<V>,
  ): TreeListNode<V> {
    if (!node) {
      return newNode;
    }

    if (index <= node.leftCount()) {
      node.setLeft(this.insertByCount(node.getLeft(), index, newNode));
      node.getLeft()!.setParent(node);
    } else {
      node.setRight(
        this.insertByCount(
          node.getRight(),
          index - node.leftCount() - 1,
          newNode,
        ),
      );
      node.getRight()!.setParent(node);
    }

    return fixUp(node);
  }

  /**
   * `find` returns the node at the given logical index (among non-removed
   * nodes). Throws when the index is out of range.
   */
  public find(index: number): TreeListNode<V> {
    if (!this.root || index < 0 || index >= this.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `out of index: tree size ${this.length}, index ${index}`,
      );
    }

    let node = this.root;
    for (;;) {
      if (index < node.leftWeight()) {
        node = node.getLeft()!;
      } else if (index < node.leftWeight() + node.size()) {
        break;
      } else {
        index -= node.leftWeight() + node.size();
        node = node.getRight()!;
      }
    }
    return node;
  }

  /**
   * `delete` physically removes a node from the tree. Unlike tombstoning,
   * this completely removes the node from the tree structure. It uses
   * structural (count-based) indexing and swaps the node structure (not
   * values) with its successor to preserve node identity.
   */
  public delete(node: TreeListNode<V>): void {
    if (!node || !this.root) {
      return;
    }

    if (!isRed(this.root.getLeft()) && !isRed(this.root.getRight())) {
      this.root.setRed(true);
    }

    const idx = this.structuralIndexOf(node);
    this.root = this.deleteByCount(this.root, idx);

    if (this.root) {
      this.root.setRed(false);
      this.root.setParent(undefined);
    }
  }

  /**
   * `deleteByCount` removes the node at the given structural index within the
   * subtree rooted at node. When deleting an internal node, it swaps in the
   * in-order successor by re-parenting rather than copying values so external
   * references to the surviving node remain valid.
   */
  private deleteByCount(
    node: TreeListNode<V>,
    index: number,
  ): TreeListNode<V> | undefined {
    if (index < node.leftCount()) {
      if (!isRed(node.getLeft()) && !isRed(node.getLeft()!.getLeft())) {
        node = moveRedLeft(node);
      }
      node.setLeft(this.deleteByCount(node.getLeft()!, index));
      if (node.getLeft()) {
        node.getLeft()!.setParent(node);
      }
    } else {
      if (isRed(node.getLeft())) {
        node = rotateRight(node);
      }

      if (index === node.leftCount() && !node.getRight()) {
        return undefined;
      }

      if (!isRed(node.getRight()) && !isRed(node.getRight()!.getLeft())) {
        node = moveRedRight(node);
      }

      if (index === node.leftCount()) {
        // Swap the successor into this position instead of copying values.
        // This preserves node identity so external references remain valid.
        const successor = minNode(node.getRight()!);
        const newRight = removeMin(node.getRight()!);

        successor.setLeft(node.getLeft());
        successor.setRight(newRight);
        successor.setRed(node.isRed());
        if (successor.getLeft()) {
          successor.getLeft()!.setParent(successor);
        }
        if (successor.getRight()) {
          successor.getRight()!.setParent(successor);
        }

        node.setLeft(undefined);
        node.setRight(undefined);
        node.setParent(undefined);

        node = successor;
      } else {
        node.setRight(
          this.deleteByCount(node.getRight()!, index - node.leftCount() - 1),
        );
        if (node.getRight()) {
          node.getRight()!.setParent(node);
        }
      }
    }

    return fixUp(node);
  }

  /**
   * `updateWeight` propagates weight changes from the given node up to the
   * root. Call this after a node's isRemoved() status changes (i.e., after
   * tombstoning).
   */
  public updateWeight(node: TreeListNode<V>): void {
    for (
      let cur: TreeListNode<V> | undefined = node;
      cur !== undefined;
      cur = cur.getParent()
    ) {
      cur.setWeight(cur.leftWeight() + cur.size() + cur.rightWeight());
    }
  }

  /**
   * `toTestString` returns a string containing the metadata of the node for
   * debugging purpose.
   */
  public toTestString(): string {
    let s = '';
    traverseInOrder(this.root, (node) => {
      s += `[${node.getWeight()},${node.size()}]${node.getValue().toString()}`;
    });
    return s;
  }

  /**
   * `indexOf` returns the logical (live-node) index of the given node, or -1
   * if the node is a tombstone.
   */
  public indexOf(node: TreeListNode<V>): number {
    if (node.size() === 0) {
      return -1;
    }
    let index = node.leftWeight();
    for (
      let cur: TreeListNode<V> = node;
      cur.getParent() !== undefined;
      cur = cur.getParent()!
    ) {
      if (cur === cur.getParent()!.getRight()) {
        index += cur.getParent()!.leftWeight() + cur.getParent()!.size();
      }
    }
    return index;
  }

  /**
   * `structuralIndexOf` returns the structural position of the node, counting
   * all nodes including tombstones.
   */
  private structuralIndexOf(node: TreeListNode<V>): number {
    let index = node.leftCount();
    for (
      let cur: TreeListNode<V> = node;
      cur.getParent() !== undefined;
      cur = cur.getParent()!
    ) {
      if (cur === cur.getParent()!.getRight()) {
        index += cur.getParent()!.leftCount() + 1;
      }
    }
    return index;
  }
}
