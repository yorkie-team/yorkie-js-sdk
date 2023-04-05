import { TreeNode } from '@yorkie-js-sdk/src/document/json/tree_node';
import { CRDTTreeNode } from './../crdt/tree_node';
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

import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { AddOperation } from '@yorkie-js-sdk/src/document/operation/add_operation';
import { MoveOperation } from '@yorkie-js-sdk/src/document/operation/move_operation';
import { RemoveOperation } from '@yorkie-js-sdk/src/document/operation/remove_operation';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTTree } from '@yorkie-js-sdk/src/document/crdt/tree';
import {
  JSONElement,
  WrappedElement,
  toWrappedElement,
} from '@yorkie-js-sdk/src/document/json/element';

/**
 * `Tree` represents a tree structure that can be used as a JSON element.
 */
export class Tree {
  private context: ChangeContext;
  private tree: CRDTTree;

  constructor(context: ChangeContext, tree: CRDTTree) {
    this.context = context;
    this.tree = tree;
  }

  /**
   * `getID` returns the ID of this node.
   * @internal
   */
  public getID(): TimeTicket {
    return this.tree.getCreatedAt();
  }

  /**
   * `getElementByID` returns the child node with the given `createdAt` if exists.
   */
  public getElementByID(createdAt: TimeTicket): WrappedElement | undefined {
    return toWrappedElement(this.context, this.tree.get(createdAt));
  }

  /**
   * `getElementByIndex` returns the child node with the given `index` if exists.
   */
  public getElementByIndex(index: number): WrappedElement | undefined {
    return toWrappedElement(this.context, this.tree.getByIndex(index));
  }

  /**
   * `getFirstChild` returns the first child node if exists.
   */
  public getFirstChild(): WrappedElement | undefined {
    return toWrappedElement(this.context, this.tree.getHead());
  }

  /**
   * `getLastChild` returns the last child node if exists.
   */
  public getLastChild(): WrappedElement | undefined {
    return toWrappedElement(this.context, this.tree.getLast());
  }

  /**
   * `removeChild` removes the child node with the given `createdAt` if exists.
   */
  public removeChild(createdAt: TimeTicket): WrappedElement | undefined {
    const deleted = Tree.deleteInternalByID(this.context, this.tree, createdAt);
    return toWrappedElement(this.context, deleted);
  }

  /**
   * `insertAfter` inserts the given `value` after the previously created element.
   */
  public insertAfter(
    prevID: TimeTicket,
    value: any,
  ): WrappedElement | undefined {
    const inserted = Tree.insertAfterInternal(
      this.context,
      this.tree,
      prevID,
      value,
    );
    return toWrappedElement(this.context, inserted);
  }

  /**
   * `insertBefore` inserts the given `value` before the next created node.
   */
  public insertBefore(
    nextID: TimeTicket,
    value: any,
  ): WrappedElement | undefined {
    const inserted = Tree.insertBeforeInternal(
      this.context,
      this.tree,
      nextID,
      value,
    );
    return toWrappedElement(this.context, inserted);
  }

  /**
   * `moveBefore` moves the given `id` node
   */
  public moveBefore(nextID: TimeTicket, id: TimeTicket): void {
    Tree.moveBeforeInternal(this.context, this.tree, nextID, id);
  }

  /**
   * `moveAfter` moves the given `id` node
   */
  public moveAfter(prevID: TimeTicket, id: TimeTicket): void {
    Tree.moveAfterInternal(this.context, this.tree, prevID, id);
  }

  /**
   * `moveFront` moves the given `id` node
   */
  public moveFront(id: TimeTicket): void {
    Tree.moveFrontInternal(this.context, this.tree, id);
  }

  /**
   * `moveLast` moves the given `id` node
   */
  public moveLast(id: TimeTicket): void {
    Tree.moveLastInternal(this.context, this.tree, id);
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public static *iteratorInternal(
    change: ChangeContext,
    target: CRDTTreeNode,
  ): IterableIterator<WrappedElement> {
    for (const child of target) {
      yield toWrappedElement(change, child)!;
    }
  }

  /**
   * `pushInternal` pushes the value to the target array.
   */
  public static pushInternal(
    context: ChangeContext,
    target: CRDTTree,
    value: CRDTTreeNode,
  ): number {
    Tree.insertAfterInternal(context, target, target.getLastCreatedAt(), value);
    return target.length;
  }

  /**
   * `moveBeforeInternal` moves the given `createdAt` element
   * after the previously created element.
   */
  public static moveBeforeInternal(
    context: ChangeContext,
    target: CRDTTree,
    nextCreatedAt: TimeTicket,
    createdAt: TimeTicket,
  ): void {
    const ticket = context.issueTimeTicket();
    const prevCreatedAt = target.getPrevCreatedAt(nextCreatedAt);
    target.moveAfter(prevCreatedAt, createdAt, ticket);
    context.push(
      MoveOperation.create(
        target.getCreatedAt(),
        prevCreatedAt,
        createdAt,
        ticket,
      ),
    );
  }

  /**
   * `moveAfterInternal` moves the given `createdAt` element
   * after the specific element.
   */
  public static moveAfterInternal(
    context: ChangeContext,
    target: CRDTTree,
    prevCreatedAt: TimeTicket,
    createdAt: TimeTicket,
  ): void {
    const ticket = context.issueTimeTicket();
    target.moveAfter(prevCreatedAt, createdAt, ticket);
    context.push(
      MoveOperation.create(
        target.getCreatedAt(),
        prevCreatedAt,
        createdAt,
        ticket,
      ),
    );
  }

  /**
   * `moveFrontInternal` moves the given `createdAt` element
   * at the first of array.
   */
  public static moveFrontInternal(
    context: ChangeContext,
    target: CRDTTree,
    createdAt: TimeTicket,
  ): void {
    const ticket = context.issueTimeTicket();
    const head = target.getHead();
    target.moveAfter(head.getCreatedAt(), createdAt, ticket);
    context.push(
      MoveOperation.create(
        target.getCreatedAt(),
        head.getCreatedAt(),
        createdAt,
        ticket,
      ),
    );
  }

  /**
   * `moveAfterInternal` moves the given `createdAt` element
   * at the last of array.
   */
  public static moveLastInternal(
    context: ChangeContext,
    target: CRDTTree,
    createdAt: TimeTicket,
  ): void {
    const ticket = context.issueTimeTicket();
    const last = target.getLastCreatedAt();
    target.moveAfter(last, createdAt, ticket);
    context.push(
      MoveOperation.create(target.getCreatedAt(), last, createdAt, ticket),
    );
  }

  /**
   * `insertAfterInternal` inserts the value after the previously created element.
   */
  public static insertAfterInternal(
    context: ChangeContext,
    target: CRDTTree,
    prevCreatedAt: TimeTicket,
    value: unknown,
  ): CRDTTreeNode {
    const ticket = context.issueTimeTicket();
    if (value instanceof CRDTTreeNode) {
      const node = CRDTTreeNode.create(ticket, value.getTag());
      const clone = node.deepcopy();
      target.insertAfter(prevCreatedAt, clone);
      context.registerElement(clone, target);
      context.push(
        AddOperation.create(target.getCreatedAt(), prevCreatedAt, node, ticket),
      );
      for (const element of value) {
        TreeNode.pushInternal(context, clone, element);
      }
      return node;
    }

    throw new TypeError(`Unsupported type of value: ${typeof value}`);
  }

  /**
   * `insertBeforeInternal` inserts the value before the previously created element.
   */
  public static insertBeforeInternal(
    context: ChangeContext,
    target: CRDTTree,
    nextCreatedAt: TimeTicket,
    value: unknown,
  ): CRDTElement {
    return Tree.insertAfterInternal(
      context,
      target,
      target.getPrevCreatedAt(nextCreatedAt),
      value,
    );
  }

  /**
   * `deleteInternalByIndex` deletes target element of given index.
   */
  public static deleteInternalByIndex(
    context: ChangeContext,
    target: CRDTTree,
    index: number,
  ): CRDTElement | undefined {
    const ticket = context.issueTimeTicket();
    const deleted = target.deleteByIndex(index, ticket);
    if (!deleted) {
      return;
    }

    context.push(
      RemoveOperation.create(
        target.getCreatedAt(),
        deleted.getCreatedAt(),
        ticket,
      ),
    );
    context.registerRemovedElement(deleted);
    return deleted;
  }

  /**
   * `deleteInternalByID` deletes the element of the given ID.
   */
  public static deleteInternalByID(
    context: ChangeContext,
    target: CRDTTree,
    createdAt: TimeTicket,
  ): CRDTElement {
    const ticket = context.issueTimeTicket();
    const deleted = target.delete(createdAt, ticket);
    context.push(
      RemoveOperation.create(
        target.getCreatedAt(),
        deleted.getCreatedAt(),
        ticket,
      ),
    );
    context.registerRemovedElement(deleted);
    return deleted;
  }

  /**
   * `includes` returns true if the given element is in the array.
   */
  public static includes(
    context: ChangeContext,
    target: CRDTTree,
    searchElement: JSONElement,
    fromIndex?: number,
  ): boolean {
    const length = target.length;
    const from =
      fromIndex === undefined
        ? 0
        : fromIndex < 0
        ? Math.max(fromIndex + length, 0)
        : fromIndex;

    if (from >= length) return false;

    for (let i = from; i < length; i++) {
      if (
        target.getByIndex(i)?.getID() ===
        (searchElement as WrappedElement).getID!()
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * `indexOf` returns the index of the given element.
   */
  public static indexOf(
    context: ChangeContext,
    target: CRDTTree,
    searchElement: JSONElement,
    fromIndex?: number,
  ): number {
    const length = target.length;
    const from =
      fromIndex === undefined
        ? 0
        : fromIndex < 0
        ? Math.max(fromIndex + length, 0)
        : fromIndex;

    if (from >= length) return -1;

    for (let i = from; i < length; i++) {
      if (
        target.getByIndex(i)?.getID() ===
        (searchElement as WrappedElement).getID!()
      ) {
        return i;
      }
    }
    return -1;
  }

  /**
   * `lastIndexOf` returns the last index of the given element.
   */
  public static lastIndexOf(
    context: ChangeContext,
    target: CRDTTree,
    searchElement: JSONElement,
    fromIndex?: number,
  ): number {
    const length = target.length;
    const from =
      fromIndex === undefined || fromIndex >= length
        ? length - 1
        : fromIndex < 0
        ? fromIndex + length
        : fromIndex;

    if (from < 0) return -1;

    for (let i = from; i > 0; i--) {
      if (
        target.getByIndex(i)?.getID() ===
        (searchElement as WrappedElement).getID!()
      ) {
        return i;
      }
    }
    return -1;
  }
}
