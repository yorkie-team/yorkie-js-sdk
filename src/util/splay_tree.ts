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

import { logger } from './logger';

export abstract class SplayNode<V> {
  protected value: V;

  private left: SplayNode<V>;
  private right: SplayNode<V>;
  private parent: SplayNode<V>;
  private weight: number;

  constructor(value: V) {
    this.value = value;
    this.initWeight();
  }

  abstract getLength(): number;

  public getNodeString(): string {
    return `${this.weight}${this.value}`;
  }

  public getValue(): V {
    return this.value;
  }

  public getLeftWeight(): number {
    return !this.hasLeft() ? 0 : this.left.getWeight();
  }

  public getRightWeight(): number {
    return !this.hasRight() ? 0 : this.right.getWeight();
  }

  public getWeight(): number {
    return this.weight;
  }

  public getLeft(): SplayNode<V> {
    return this.left;
  }

  public getRight(): SplayNode<V> {
    return this.right;
  }

  public setRight(right: SplayNode<V>): void {
    this.right = right;
  }

  public hasLeft(): boolean {
    return !!this.left;
  }

  public hasRight(): boolean {
    return !!this.right;
  }

  public hasParent(): boolean {
    return !!this.parent;
  }

  public setParent(parent: SplayNode<V>): void {
    this.parent = parent;
  }

  public setLeft(left: SplayNode<V>): void {
    this.left = left;
  }

  public getParent(): SplayNode<V> {
    return this.parent;
  }

  public increaseWeight(weight: number): void {
    this.weight += weight;
  }

  public initWeight(): void {
    this.weight = this.getLength();
  }
}

/**
 * SplayTree is weighted binary search tree which is based on Splay tree.
 * original paper on Splay Trees:
 *  - https://www.cs.cmu.edu/~sleator/papers/self-adjusting.pdf
 */
export class SplayTree<V> {
  private root: SplayNode<V>;

  constructor(root?: SplayNode<V>) {
    this.root = root;
  }

  public find(pos: number): [SplayNode<V>, number] {
    if (!this.root) {
      return [null, 0];
    }

    let node = this.root;
    for (;;) {
      if (node.hasLeft() && pos <= node.getLeftWeight()) {
        node = node.getLeft();
      } else if (
        node.hasRight() &&
        node.getLeftWeight() + node.getLength() < pos
      ) {
        pos -= node.getLeftWeight() + node.getLength();
        node = node.getRight();
      } else {
        pos -= node.getLeftWeight();
        break;
      }
    }
    if (pos > node.getLength()) {
      logger.fatal(
        `out of bound of text index: pos: ${pos} > node.length: ${node.getLength()}`,
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
    if (!node) {
      return -1;
    }

    let index = 0;
    let current = node;
    let prev = null;
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

  public getRoot(): SplayNode<V> {
    return this.root;
  }

  public insert(newNode: SplayNode<V>): SplayNode<V> {
    return this.insertAfter(this.root, newNode);
  }

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
      target.getRight().setParent(newNode);
    }
    newNode.setLeft(target);
    target.setParent(newNode);
    target.setRight(null);
    this.updateSubtree(target);
    this.updateSubtree(newNode);

    return newNode;
  }

  public updateSubtree(node: SplayNode<V>): void {
    node.initWeight();

    if (node.hasLeft()) {
      node.increaseWeight(node.getLeftWeight());
    }
    if (node.hasRight()) {
      node.increaseWeight(node.getRightWeight());
    }
  }

  public splayNode(node: SplayNode<V>): void {
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
        this.rotateRight(node.getParent());
        this.rotateRight(node);
      } else if (
        this.isRightChild(node.getParent()) &&
        this.isRightChild(node)
      ) {
        // zig-zig
        this.rotateLeft(node.getParent());
        this.rotateLeft(node);
      } else {
        // zig
        if (this.isLeftChild(node)) {
          this.rotateRight(node);
        } else if (this.isRightChild(node)) {
          this.rotateLeft(node);
        }
        return;
      }
    }
  }

  public delete(node: SplayNode<V>): void {
    this.splayNode(node);

    const leftTree = new SplayTree(node.getLeft());
    if (leftTree.root) {
      leftTree.root.setParent(null);
    }

    const rightTree = new SplayTree(node.getRight());
    if (rightTree.root) {
      rightTree.root.setParent(null);
    }

    if (leftTree.root) {
      const maxNode = leftTree.getMaximum();
      leftTree.splayNode(maxNode);
      leftTree.root.setRight(rightTree.root);
      this.root = leftTree.root;
    } else {
      this.root = rightTree.root;
    }
  }

  public getAnnotatedString(): string {
    const metaString: Array<SplayNode<V>> = [];
    this.traverseInorder(this.root, metaString);
    return metaString
      .map(
        (node) => `[${node.getWeight()},${node.getLength()}]${node.getValue()}`,
      )
      .join('');
  }

  private getMaximum(): SplayNode<V> {
    let node = this.root;
    while (node.hasRight()) {
      node = node.getRight();
    }
    return node;
  }

  private traverseInorder(
    node: SplayNode<V>,
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
    const root = pivot.getParent();
    if (root.hasParent()) {
      if (root === root.getParent().getLeft()) {
        root.getParent().setLeft(pivot);
      } else {
        root.getParent().setRight(pivot);
      }
    } else {
      this.root = pivot;
    }
    pivot.setParent(root.getParent());

    root.setRight(pivot.getLeft());
    if (root.hasRight()) {
      root.getRight().setParent(root);
    }

    pivot.setLeft(root);
    pivot.getLeft().setParent(pivot);

    this.updateSubtree(root);
    this.updateSubtree(pivot);
  }

  private rotateRight(pivot: SplayNode<V>): void {
    const root = pivot.getParent();
    if (root.hasParent()) {
      if (root === root.getParent().getLeft()) {
        root.getParent().setLeft(pivot);
      } else {
        root.getParent().setRight(pivot);
      }
    } else {
      this.root = pivot;
    }
    pivot.setParent(root.getParent());

    root.setLeft(pivot.getRight());
    if (root.hasLeft()) {
      root.getLeft().setParent(root);
    }

    pivot.setRight(root);
    pivot.getRight().setParent(pivot);

    this.updateSubtree(root);
    this.updateSubtree(pivot);
  }

  private isLeftChild(node: SplayNode<V>): boolean {
    return node && node.hasParent() && node.getParent().getLeft() === node;
  }

  private isRightChild(node: SplayNode<V>): boolean {
    return node && node.hasParent() && node.getParent().getRight() === node;
  }
}
