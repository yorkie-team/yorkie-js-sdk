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

import { logger } from '@yorkie-js-sdk/src/util/logger';

/**
 * `SplayNode` is a node of SplayTree.
 */
export abstract class SplayNode<V> {
  protected value: V;

  private left?: SplayNode<V>;
  private right?: SplayNode<V>;
  private parent?: SplayNode<V>;
  private weight!: number;

  constructor(value: V) {
    this.value = value;
    this.initWeight();
  }

  abstract getLength(): number;

  /**
   * `getNodeString` returns a string of weight and value of this node.
   */
  public getNodeString(): string {
    return `${this.weight}${this.value}`;
  }

  /**
   * `getValue` returns value of this node.
   */
  public getValue(): V {
    return this.value;
  }

  /**
   * `getLeftWeight` returns left weight of this node.
   */
  public getLeftWeight(): number {
    return !this.hasLeft() ? 0 : this.left!.getWeight();
  }

  /**
   * `getRightWeight` returns right weight of this node.
   */
  public getRightWeight(): number {
    return !this.hasRight() ? 0 : this.right!.getWeight();
  }

  /**
   * `getWeight` returns weight of this node.
   */
  public getWeight(): number {
    return this.weight;
  }

  /**
   * `getLeft` returns a left node.
   */
  public getLeft(): SplayNode<V> | undefined {
    return this.left;
  }

  /**
   * `getRight` returns a right node.
   */
  public getRight(): SplayNode<V> | undefined {
    return this.right;
  }

  /**
   * `setRight` sets a right node.
   */
  public setRight(right?: SplayNode<V>): void {
    this.right = right;
  }

  /**
   * `hasLeft` check if the left node exists
   */
  public hasLeft(): boolean {
    return !!this.left;
  }

  /**
   * `hasRight` check if the right node exists
   */
  public hasRight(): boolean {
    return !!this.right;
  }

  /**
   * `hasParent` check if the parent node exists
   */
  public hasParent(): boolean {
    return !!this.parent;
  }

  /**
   * `setParent` sets a parent node.
   */
  public setParent(parent?: SplayNode<V>): void {
    this.parent = parent;
  }

  /**
   * `setLeft` sets a left node.
   */
  public setLeft(left?: SplayNode<V>): void {
    this.left = left;
  }

  /**
   * `getParent` returns parent of this node.
   */
  public getParent(): SplayNode<V> | undefined {
    return this.parent;
  }

  /**
   * `unlink` unlink parent, right and left node.
   */
  public unlink(): void {
    this.parent = undefined;
    this.right = undefined;
    this.left = undefined;
  }

  /**
   * `hasLinks` checks if parent, right and left node exists.
   */
  public hasLinks(): boolean {
    return this.hasParent() || this.hasLeft() || this.hasRight();
  }

  /**
   * `increaseWeight` increases weight.
   */
  public increaseWeight(weight: number): void {
    this.weight! += weight;
  }

  /**
   * `initWeight` set initial weight of this node.
   */
  public initWeight(): void {
    this.weight = this.getLength();
  }
}

/**
 * SplayTree is weighted binary search tree which is based on Splay tree.
 * original paper on Splay Trees:
 * @see https://www.cs.cmu.edu/~sleator/papers/self-adjusting.pdf
 */
export class SplayTree<V> {
  private root?: SplayNode<V>;

  constructor(root?: SplayNode<V>) {
    this.root = root;
  }

  /**
   * `length` returns the size of this tree.
   */
  public get length(): number {
    return this.root ? this.root.getWeight() : 0;
  }

  /**
   * `find` returns the Node and offset of the given index.
   */
  public find(pos: number): [SplayNode<V> | undefined, number] {
    if (!this.root) {
      return [undefined, 0];
    }

    let node = this.root;
    for (;;) {
      if (node.hasLeft() && pos <= node.getLeftWeight()) {
        node = node.getLeft()!;
      } else if (
        node.hasRight() &&
        node.getLeftWeight() + node.getLength() < pos
      ) {
        pos -= node.getLeftWeight() + node.getLength();
        node = node.getRight()!;
      } else {
        pos -= node.getLeftWeight();
        break;
      }
    }
    if (pos > node.getLength()) {
      logger.fatal(
        `out of index range: pos: ${pos} > node.length: ${node.getLength()}`,
      );
    }
    return [node, pos];
  }

  /**
   * Find the index of the given node in BST.
   *
   * @param node - the given node
   * @returns the index of given node
   */
  public indexOf(node: SplayNode<V>): number {
    if (!node || !node.hasLinks()) {
      return -1;
    }

    let index = 0;
    let current: SplayNode<V> | undefined = node;
    let prev: SplayNode<V> | undefined;
    while (current) {
      if (!prev || prev === current.getRight()) {
        index +=
          current.getLength() +
          (current.hasLeft() ? current.getLeftWeight() : 0);
      }
      prev = current;
      current = current.getParent();
    }
    return index - node.getLength();
  }

  /**
   * `getRoot` returns root of this tree.
   */
  public getRoot(): SplayNode<V> {
    return this.root!;
  }

  /**
   * `insert` inserts the node at the last.
   */
  public insert(newNode: SplayNode<V>): SplayNode<V> {
    if (!this.root) {
      this.root = newNode;
      return newNode;
    }

    return this.insertAfter(this.root!, newNode);
  }

  /**
   * `insertAfter` inserts the node after the given previous node.
   */
  public insertAfter(
    target: SplayNode<V>,
    newNode: SplayNode<V>,
  ): SplayNode<V> {
    if (!target) {
      this.root = newNode;
      return newNode;
    }

    this.splayNode(target);
    this.root = newNode;
    newNode.setRight(target.getRight());
    if (target.hasRight()) {
      target.getRight()!.setParent(newNode);
    }
    newNode.setLeft(target);
    target.setParent(newNode);
    target.setRight();
    this.updateWeight(target);
    this.updateWeight(newNode);

    return newNode;
  }

  /**
   * `updateWeight` recalculates the weight of this node with the value and children.
   */
  public updateWeight(node: SplayNode<V>): void {
    node.initWeight();

    if (node.hasLeft()) {
      node.increaseWeight(node.getLeftWeight());
    }
    if (node.hasRight()) {
      node.increaseWeight(node.getRightWeight());
    }
  }

  /**
   * `updateTreeWeight` recalculates the weight of this tree from the given node to
   * the root.
   */
  public updateTreeWeight(node: SplayNode<V>): void {
    while (node) {
      this.updateWeight(node);
      node = node.getParent()!;
    }
  }

  /**
   * `splayNode` moves the given node to the root.
   */
  public splayNode(node: SplayNode<V> | undefined): void {
    if (!node) {
      return;
    }

    for (;;) {
      if (this.isLeftChild(node.getParent()) && this.isRightChild(node)) {
        // zig-zag
        this.rotateLeft(node);
        this.rotateRight(node);
      } else if (
        this.isRightChild(node.getParent()) &&
        this.isLeftChild(node)
      ) {
        // zig-zag
        this.rotateRight(node);
        this.rotateLeft(node);
      } else if (this.isLeftChild(node.getParent()) && this.isLeftChild(node)) {
        // zig-zig
        this.rotateRight(node.getParent()!);
        this.rotateRight(node);
      } else if (
        this.isRightChild(node.getParent()) &&
        this.isRightChild(node)
      ) {
        // zig-zig
        this.rotateLeft(node.getParent()!);
        this.rotateLeft(node);
      } else {
        // zig
        if (this.isLeftChild(node)) {
          this.rotateRight(node);
        } else if (this.isRightChild(node)) {
          this.rotateLeft(node);
        }
        this.updateWeight(node);
        return;
      }
    }
  }

  /**
   * `delete` deletes target node of this tree.
   */
  public delete(node: SplayNode<V>): void {
    this.splayNode(node);

    const leftTree = new SplayTree(node.getLeft());
    if (leftTree.root) {
      leftTree.root.setParent();
    }

    const rightTree = new SplayTree(node.getRight());
    if (rightTree.root) {
      rightTree.root.setParent();
    }

    if (leftTree.root) {
      const maxNode = leftTree.getMaximum();
      leftTree.splayNode(maxNode);
      leftTree.root.setRight(rightTree.root);
      if (rightTree.root) {
        rightTree.root.setParent(leftTree.root);
      }
      this.root = leftTree.root;
    } else {
      this.root = rightTree.root;
    }

    node.unlink();
    if (this.root) {
      this.updateWeight(this.root);
    }
  }

  /**
   * `cutOffRange` cuts the given range from this Tree.
   * This function separates the range from `fromInner` to `toInner` as a subtree
   * by splaying outer nodes then cuts the subtree. 'xxxOuter' could be nil and
   * means to delete the entire subtree in that direction.
   *
   * CAUTION: This function does not filter out invalid argument inputs,
   * such as non-consecutive indices in fromOuter and fromInner.
   */
  public cutOffRange(
    fromOuter: SplayNode<V> | undefined,
    fromInner: SplayNode<V> | undefined,
    toInner: SplayNode<V> | undefined,
    toOuter: SplayNode<V> | undefined,
  ): void {
    this.splayNode(toInner);
    this.splayNode(fromInner);

    if (!fromOuter && !toOuter) {
      this.root = undefined;
      return;
    }

    if (!fromOuter) {
      this.splayNode(toOuter);
      this.cutOffLeft(toOuter!);
      return;
    }

    if (!toOuter) {
      this.splayNode(toOuter);
      this.cutOffRight(fromOuter);
      return;
    }

    this.splayNode(toOuter);
    this.splayNode(fromOuter);
    this.cutOffLeft(toOuter);
  }

  /**
   * `cutOffLeft` cuts off left subtree of node.
   */
  public cutOffLeft(node: SplayNode<V>): void {
    if (!node.hasLeft()) {
      return;
    }
    node.getLeft()!.setParent(undefined);
    node.setLeft(undefined);
    this.updateTreeWeight(node);
  }

  /**
   * `cutOffRight` cuts off right subtree of node.
   */
  public cutOffRight(node: SplayNode<V>): void {
    if (!node.hasRight()) {
      return;
    }
    node.getRight()!.setParent(undefined);
    node.setRight(undefined);
    this.updateTreeWeight(node);
  }

  /**
   * `getAnnotatedString` returns a string containing the meta data of the Node
   * for debugging purpose.
   */
  public getAnnotatedString(): string {
    const metaString: Array<SplayNode<V>> = [];
    this.traverseInorder(this.root!, metaString);
    return metaString
      .map((n) => `[${n.getWeight()},${n.getLength()}]${n.getValue() || ''}`)
      .join('');
  }

  private getMaximum(): SplayNode<V> {
    let node = this.root!;
    while (node.hasRight()) {
      node = node.getRight()!;
    }
    return node;
  }

  private traverseInorder(
    node: SplayNode<V> | undefined,
    stack: Array<SplayNode<V>>,
  ): void {
    if (!node) {
      return;
    }

    this.traverseInorder(node.getLeft(), stack);
    stack.push(node);
    this.traverseInorder(node.getRight(), stack);
  }

  private rotateLeft(pivot: SplayNode<V>): void {
    const root = pivot.getParent()!;
    if (root.hasParent()) {
      if (root === root.getParent()!.getLeft()) {
        root.getParent()!.setLeft(pivot);
      } else {
        root.getParent()!.setRight(pivot);
      }
    } else {
      this.root = pivot;
    }
    pivot.setParent(root.getParent());

    root.setRight(pivot.getLeft());
    if (root.hasRight()) {
      root.getRight()!.setParent(root);
    }

    pivot.setLeft(root);
    pivot.getLeft()!.setParent(pivot);

    this.updateWeight(root);
    this.updateWeight(pivot);
  }

  private rotateRight(pivot: SplayNode<V>): void {
    const root = pivot.getParent()!;
    if (root.hasParent()) {
      if (root === root.getParent()!.getLeft()) {
        root.getParent()!.setLeft(pivot);
      } else {
        root.getParent()!.setRight(pivot);
      }
    } else {
      this.root = pivot;
    }
    pivot.setParent(root.getParent());

    root.setLeft(pivot.getRight());
    if (root.hasLeft()) {
      root.getLeft()!.setParent(root);
    }

    pivot.setRight(root);
    pivot.getRight()!.setParent(pivot);

    this.updateWeight(root);
    this.updateWeight(pivot);
  }

  private isLeftChild(node?: SplayNode<V>): boolean {
    if (node && node.hasParent()) {
      return node.getParent()!.getLeft() === node;
    }
    return false;
  }

  private isRightChild(node?: SplayNode<V>): boolean {
    if (node && node.hasParent()) {
      return node.getParent()!.getRight() === node;
    }
    return false;
  }
}
