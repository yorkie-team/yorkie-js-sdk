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
   * `getParent` returns parent of this node.
   */
  public getParent(): SplayNode<V> | undefined {
    return this.parent;
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
   * `setLeft` sets a left node.
   */
  public setLeft(left?: SplayNode<V>): void {
    this.left = left;
  }

  /**
   * `setRight` sets a right node.
   */
  public setRight(right?: SplayNode<V>): void {
    this.right = right;
  }

  /**
   * `setParent` sets a parent node.
   */
  public setParent(parent?: SplayNode<V>): void {
    this.parent = parent;
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
   * `initWeight` sets initial weight of this node.
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
    if (!this.root || pos < 0) {
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
    if (!node || (node !== this.root && !node.hasLinks())) {
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
    return this.insertAfter(this.root, newNode);
  }

  /**
   * `insertAfter` inserts the node after the given previous node.
   */
  public insertAfter(
    target: SplayNode<V> | undefined,
    newNode: SplayNode<V>,
  ): SplayNode<V> {
    // TODO(Eithea): Consider moving the code below to insert()
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

  private updateTreeWeight(node: SplayNode<V>): void {
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
      const rightmostNode = leftTree.getRightmost();
      leftTree.splayNode(rightmostNode);
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
   * `deleteRange` separates the range between given 2 boundaries from this Tree.
   * This function separates the range to delete as a subtree
   * by splaying outer boundary nodes.
   * leftBoundary must exist because of 0-indexed initial dummy node of tree,
   * but rightBoundary can be nil means range to delete includes the end of tree.
   * Refer to the design document in https://github.com/yorkie-team/yorkie/tree/main/design
   */
  public deleteRange(
    leftBoundary: SplayNode<V>,
    rightBoundary: SplayNode<V> | undefined,
  ): void {
    if (!rightBoundary) {
      this.splayNode(leftBoundary);
      this.cutOffRight(leftBoundary);
      return;
    }
    this.splayNode(leftBoundary);
    this.splayNode(rightBoundary);
    if (rightBoundary.getLeft() != leftBoundary) {
      this.rotateRight(leftBoundary);
    }
    this.cutOffRight(leftBoundary);
  }

  private cutOffRight(root: SplayNode<V>): void {
    const nodesToFreeWeight: Array<SplayNode<V>> = [];
    this.traversePostorder(root.getRight(), nodesToFreeWeight);
    for (const node of nodesToFreeWeight) {
      node.initWeight();
    }
    this.updateTreeWeight(root);
  }

  /**
   * `getStructureAsString` returns a string containing the meta data of the Node
   * for debugging purpose.
   */
  public getStructureAsString(): string {
    const metaString: Array<SplayNode<V>> = [];
    this.traverseInorder(this.root!, metaString);
    return metaString
      .map((n) => `[${n.getWeight()},${n.getLength()}]${n.getValue() || ''}`)
      .join('');
  }

  /**
   * `checkWeight` returns false when there is an incorrect weight node.
   * for debugging purpose.
   */
  public checkWeight(): boolean {
    const nodes: Array<SplayNode<V>> = [];
    this.traverseInorder(this.root!, nodes);
    for (const node of nodes) {
      if (
        node.getWeight() !=
        node.getLength() + node.getLeftWeight() + node.getRightWeight()
      ) {
        return false;
      }
    }
    return true;
  }

  private getRightmost(): SplayNode<V> {
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

  private traversePostorder(
    node: SplayNode<V> | undefined,
    stack: Array<SplayNode<V>>,
  ): void {
    if (!node) {
      return;
    }

    this.traversePostorder(node.getLeft(), stack);
    this.traversePostorder(node.getRight(), stack);
    stack.push(node);
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
