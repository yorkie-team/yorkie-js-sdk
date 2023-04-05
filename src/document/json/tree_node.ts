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
import { CRDTTreeNode } from '@yorkie-js-sdk/src/document/crdt/tree_node';
import {
  JSONElement,
  WrappedElement,
  toWrappedElement,
} from '@yorkie-js-sdk/src/document/json/element';
import { ArrayProxy } from '@yorkie-js-sdk/src/document/json/array';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import { PrimitiveValue } from '@yorkie-js-sdk/src/document/crdt/primitive';
import { Primitive } from '@yorkie-js-sdk/src/document/crdt/primitive';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { ObjectProxy } from '@yorkie-js-sdk/src/document/json/object';
import { logger, LogLevel } from '@yorkie-js-sdk/src/util/logger';
import { toJSONElement } from '@yorkie-js-sdk/src/document/json/element';
import { RemoveAttributeOperation } from '@yorkie-js-sdk/src/document/operation/remove_attribute_operation';
import { SetAttributeOperation } from '@yorkie-js-sdk/src/document/operation/set_attribute_operation';
/**
 * `TreeNode` is a custom data type that is used to represent a tree node.
 */
export class TreeNode {
  private context: ChangeContext;
  private node: CRDTTreeNode;

  constructor(context: ChangeContext, node: CRDTTreeNode) {
    this.context = context;
    this.node = node;
  }

  /**
   * `getID` returns the ID of this node.
   * @internal
   */
  public getID(): TimeTicket {
    return this.node.getCreatedAt();
  }

  /**
   * `getAttribute` returns the value of the given key.
   */
  public getAttribute(key: string) {
    return toJSONElement(this.context, this.node.getAttribute(key));
  }

  /**
   * `setAttribute` ?
   */
  public setAttribute(key: string, value: any) {
    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`attribute[${key}]=${JSON.stringify(value)}`);
    }

    return TreeNode.setAttributeInternal(this.context, this.node, key, value);
  }

  /**
   * `setInternal` sets a new Object for the given key
   */
  public static setAttributeInternal(
    context: ChangeContext,
    target: CRDTTreeNode,
    key: string,
    value: unknown,
  ): void {
    const ticket = context.issueTimeTicket();

    const setAndRegister = function (elem: CRDTElement) {
      const removed = target.setAttribute(key, elem);
      context.registerElement(elem, target);
      if (removed) {
        context.registerRemovedElement(removed);
      }
    };

    if (Primitive.isSupport(value)) {
      const primitive = Primitive.of(value as PrimitiveValue, ticket);
      setAndRegister(primitive);
      context.push(
        SetAttributeOperation.create(
          key,
          primitive,
          target.getCreatedAt(),
          ticket,
        ),
      );
    } else if (Array.isArray(value)) {
      const array = CRDTArray.create(ticket);
      setAndRegister(array);
      context.push(
        SetAttributeOperation.create(
          key,
          array.deepcopy(),
          target.getCreatedAt(),
          ticket,
        ),
      );
      for (const element of value) {
        ArrayProxy.pushInternal(context, array, element);
      }
    } else if (typeof value === 'object') {
      const obj = CRDTObject.create(ticket);
      setAndRegister(obj);
      context.push(
        SetAttributeOperation.create(
          key,
          obj.deepcopy(),
          target.getCreatedAt(),
          ticket,
        ),
      );
      for (const [k, v] of Object.entries(value!)) {
        ObjectProxy.setInternal(context, obj, k, v);
      }
    } else {
      logger.fatal(`unsupported type of value: ${typeof value}`);
    }
  }

  /**
   * `removeAttribute` deletes the value of the given key.
   */
  public removeAttribute(key: string) {
    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`remove attribute[${key}]`);
    }

    TreeNode.removeAttributeInternal(this.context, this.node, key);
  }

  /**
   * `removeAttributeInternal` deletes the value of the given key.
   */
  public static removeAttributeInternal(
    context: ChangeContext,
    target: CRDTTreeNode,
    key: string,
  ): void {
    const ticket = context.issueTimeTicket();
    const deleted = target.removeAttributeByKey(key, ticket);
    if (!deleted) {
      return;
    }

    context.push(
      RemoveAttributeOperation.create(
        target.getCreatedAt(),
        deleted.getCreatedAt(),
        ticket,
      ),
    );
    context.registerRemovedElement(deleted);
  }

  /**
   * `getElementByID` returns the child node with the given `createdAt` if exists.
   */
  public getElementByID(createdAt: TimeTicket): WrappedElement | undefined {
    return toWrappedElement(this.context, this.node.get(createdAt));
  }

  /**
   * `getElementByIndex` returns the child node with the given `index` if exists.
   */
  public getElementByIndex(index: number): WrappedElement | undefined {
    return toWrappedElement(this.context, this.node.getAt(index));
  }

  /**
   * `getFirstChild` returns the first child node if exists.
   */
  public getFirstChild(): WrappedElement | undefined {
    return toWrappedElement(this.context, this.node.getHead());
  }

  /**
   * `getLastChild` returns the last child node if exists.
   */
  public getLastChild(): WrappedElement | undefined {
    return toWrappedElement(this.context, this.node.getLast());
  }

  /**
   * `removeChild` removes the child node with the given `createdAt` if exists.
   */
  public removeChild(createdAt: TimeTicket): WrappedElement | undefined {
    const deleted = TreeNode.deleteInternalByID(
      this.context,
      this.node,
      createdAt,
    );
    return toWrappedElement(this.context, deleted);
  }

  /**
   * `insertAfter` inserts the given `value` after the previously created element.
   */
  public insertAfter(
    prevID: TimeTicket,
    value: any,
  ): WrappedElement | undefined {
    const inserted = TreeNode.insertAfterInternal(
      this.context,
      this.node,
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
    const inserted = TreeNode.insertBeforeInternal(
      this.context,
      this.node,
      nextID,
      value,
    );
    return toWrappedElement(this.context, inserted);
  }

  /**
   * `moveBefore` moves the given `id` node
   */
  public moveBefore(nextID: TimeTicket, id: TimeTicket): void {
    TreeNode.moveBeforeInternal(this.context, this.node, nextID, id);
  }

  /**
   * `moveAfter` moves the given `id` node
   */
  public moveAfter(prevID: TimeTicket, id: TimeTicket): void {
    TreeNode.moveAfterInternal(this.context, this.node, prevID, id);
  }

  /**
   * `moveFront` moves the given `id` node
   */
  public moveFront(id: TimeTicket): void {
    TreeNode.moveFrontInternal(this.context, this.node, id);
  }

  /**
   * `moveLast` moves the given `id` node
   */
  public moveLast(id: TimeTicket): void {
    TreeNode.moveLastInternal(this.context, this.node, id);
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
    target: CRDTTreeNode,
    value: CRDTTreeNode,
  ): number {
    TreeNode.insertAfterInternal(
      context,
      target,
      target.getLastCreatedAt(),
      value,
    );
    return target.length;
  }

  /**
   * `moveBeforeInternal` moves the given `createdAt` element
   * after the previously created element.
   */
  public static moveBeforeInternal(
    context: ChangeContext,
    target: CRDTTreeNode,
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
    target: CRDTTreeNode,
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
    target: CRDTTreeNode,
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
    target: CRDTTreeNode,
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
    target: CRDTTreeNode,
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
    target: CRDTTreeNode,
    nextCreatedAt: TimeTicket,
    value: unknown,
  ): CRDTElement {
    return TreeNode.insertAfterInternal(
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
    target: CRDTTreeNode,
    index: number,
  ): CRDTElement | undefined {
    const ticket = context.issueTimeTicket();
    const deleted = target.removeByIndex(index, ticket);
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
    target: CRDTTreeNode,
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
    target: CRDTTreeNode,
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
        target.getAt(i)?.getID() === (searchElement as WrappedElement).getID!()
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
    target: CRDTTreeNode,
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
        target.getAt(i)?.getID() === (searchElement as WrappedElement).getID!()
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
    target: CRDTTreeNode,
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
        target.getAt(i)?.getID() === (searchElement as WrappedElement).getID!()
      ) {
        return i;
      }
    }
    return -1;
  }
}
