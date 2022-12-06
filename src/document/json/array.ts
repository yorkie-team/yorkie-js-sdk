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

import { logger, LogLevel } from '@yorkie-js-sdk/src/util/logger';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { AddOperation } from '@yorkie-js-sdk/src/document/operation/add_operation';
import { MoveOperation } from '@yorkie-js-sdk/src/document/operation/move_operation';
import { RemoveOperation } from '@yorkie-js-sdk/src/document/operation/remove_operation';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import {
  Primitive,
  PrimitiveValue,
} from '@yorkie-js-sdk/src/document/crdt/primitive';
import { ObjectProxy } from '@yorkie-js-sdk/src/document/json/object';
import {
  JSONElement,
  WrappedElement,
  toWrappedElement,
  toJSONElement,
} from '@yorkie-js-sdk/src/document/json/element';

/**
 * `JSONArray` represents JSON array, but unlike regular JSON, it has time
 * tickets created by a logical clock to resolve conflicts.
 */
export type JSONArray<T> = {
  /**
   * `getID` returns the ID, `TimeTicket` of this Object.
   */
  getID?(): TimeTicket;

  /**
   * `getElementByID` returns the element for the given ID.
   */
  getElementByID?(createdAt: TimeTicket): WrappedElement<T>;

  /**
   * `getElementByIndex` returns the element for the given index.
   */
  getElementByIndex?(index: number): WrappedElement<T>;

  /**
   * `getLast` returns the last element of this array.
   */
  getLast?(): WrappedElement<T>;

  /**
   * `deleteByID` deletes the element of the given ID.
   */
  deleteByID?(createdAt: TimeTicket): WrappedElement<T>;

  /**
   * `insertBefore` inserts a value before the given next element.
   */
  insertBefore?(nextID: TimeTicket, value: any): WrappedElement<T>;

  /**
   * `insertAfter` inserts a value after the given previous element.
   */
  insertAfter?(prevID: TimeTicket, value: any): WrappedElement<T>;

  /**
   * `moveBefore` moves the element before the given next element.
   */
  moveBefore?(nextID: TimeTicket, id: TimeTicket): void;

  /**
   * `moveAfter` moves the element after the given previous element.
   */
  moveAfter?(prevID: TimeTicket, id: TimeTicket): void;

  /**
   * `moveFront` moves the element before the first element.
   */
  moveFront?(id: TimeTicket): void;

  /**
   * `moveLast` moves the element after the last element.
   */
  moveLast?(id: TimeTicket): void;
} & Array<T>;

/**
 * `createJSONArray` creates a new instance of JSONArray.
 */
export function createJSONArray(
  context: ChangeContext,
  target: CRDTArray,
): JSONArray<WrappedElement> {
  const arrayProxy = new ArrayProxy(context, target);
  return new Proxy(target, arrayProxy.getHandlers()) as any;
}

/**
 * `isNumericString` checks if value is numeric string.
 */
function isNumericString(val: any): boolean {
  if (typeof val === 'string' || val instanceof String) {
    return !isNaN(val as any);
  }
  return false;
}

/**
 * `isReadOnlyArrayMethod` checks if the method is a standard array read-only operation.
 */
function isReadOnlyArrayMethod(method: string): boolean {
  return [
    'concat',
    'entries',
    'every',
    'filter',
    'find',
    'findIndex',
    'forEach',
    'join',
    'keys',
    'map',
    'reduce',
    'reduceRight',
    'slice',
    'some',
    'toLocaleString',
    'toString',
    'values',
  ].includes(method);
}

/**
 * `ArrayProxy` is a proxy for Array.
 */
export class ArrayProxy {
  private context: ChangeContext;
  private handlers: any;
  private array: CRDTArray;

  constructor(context: ChangeContext, array: CRDTArray) {
    this.context = context;
    this.array = array;
    this.handlers = {
      get: (
        target: CRDTArray,
        method: keyof JSONArray<unknown>,
        receiver: any,
      ): any => {
        if (method === 'getID') {
          return (): TimeTicket => {
            return target.getCreatedAt();
          };
        } else if (method === 'getElementByID') {
          return (createdAt: TimeTicket): WrappedElement | undefined => {
            return toWrappedElement(context, target.get(createdAt));
          };
        } else if (method === 'getElementByIndex') {
          return (index: number): WrappedElement | undefined => {
            const elem = target.getByIndex(index);
            return toWrappedElement(context, elem);
          };
        } else if (method === 'getLast') {
          return (): WrappedElement | undefined => {
            return toWrappedElement(context, target.getLast());
          };
        } else if (method === 'deleteByID') {
          return (createdAt: TimeTicket): WrappedElement | undefined => {
            const deleted = ArrayProxy.deleteInternalByID(
              context,
              target,
              createdAt,
            );
            return toWrappedElement(context, deleted);
          };
        } else if (method === 'insertAfter') {
          return (
            prevID: TimeTicket,
            value: any,
          ): WrappedElement | undefined => {
            const inserted = ArrayProxy.insertAfterInternal(
              context,
              target,
              prevID,
              value,
            );
            return toWrappedElement(context, inserted);
          };
        } else if (method === 'insertBefore') {
          return (
            nextID: TimeTicket,
            value: any,
          ): WrappedElement | undefined => {
            const inserted = ArrayProxy.insertBeforeInternal(
              context,
              target,
              nextID,
              value,
            );
            return toWrappedElement(context, inserted);
          };
        } else if (method === 'moveBefore') {
          return (nextID: TimeTicket, id: TimeTicket): void => {
            ArrayProxy.moveBeforeInternal(context, target, nextID, id);
          };
          // JavaScript Native API
        } else if (method === 'moveAfter') {
          return (prevID: TimeTicket, id: TimeTicket): void => {
            ArrayProxy.moveAfterInternal(context, target, prevID, id);
          };
        } else if (method === 'moveFront') {
          return (id: TimeTicket): void => {
            ArrayProxy.moveFrontInternal(context, target, id);
          };
        } else if (method === 'moveLast') {
          return (id: TimeTicket): void => {
            ArrayProxy.moveLastInternal(context, target, id);
          };
        } else if (isNumericString(method)) {
          return toJSONElement(
            context,
            target.getByIndex(Number(method as string)),
          );
        } else if (method === 'push') {
          return (value: any): number => {
            return ArrayProxy.pushInternal(context, target, value);
          };
        } else if (method === 'splice') {
          return (
            start: number,
            deleteCount?: number,
            ...items: Array<any>
          ): JSONArray<JSONElement> => {
            return ArrayProxy.splice(
              context,
              target,
              start,
              deleteCount,
              ...items,
            );
          };
        } else if (method === 'length') {
          return target.length;
        } else if (typeof method === 'symbol' && method === Symbol.iterator) {
          return ArrayProxy.iteratorInternal.bind(this, context, target);
        } else if (method === 'includes') {
          return (searchElement: JSONElement, fromIndex?: number): boolean => {
            return ArrayProxy.includes(
              context,
              target,
              searchElement,
              fromIndex,
            );
          };
        } else if (method === 'indexOf') {
          return (searchElement: JSONElement, fromIndex?: number): number => {
            return ArrayProxy.indexOf(
              context,
              target,
              searchElement,
              fromIndex,
            );
          };
        } else if (method === 'lastIndexOf') {
          return (searchElement: JSONElement, fromIndex?: number): number => {
            return ArrayProxy.lastIndexOf(
              context,
              target,
              searchElement,
              fromIndex,
            );
          };
        } else if (
          typeof method === 'string' &&
          isReadOnlyArrayMethod(method)
        ) {
          return (...args: any) => {
            const arr = Array.from(target).map((elem) =>
              toJSONElement(context, elem),
            );
            return Array.prototype[method as any].apply(arr, args);
          };
        }

        // TODO we need to distinguish between the case we need to call default
        // behavior and the case where we need to call an internal method
        // throw new TypeError(`Unsupported method: ${String(method)}`);
        return Reflect.get(target, method, receiver);
      },

      deleteProperty: (target: CRDTArray, key: string): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`array[${key}]`);
        }
        ArrayProxy.deleteInternalByIndex(context, target, Number.parseInt(key));
        return true;
      },
    };
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public static *iteratorInternal(
    change: ChangeContext,
    target: CRDTArray,
  ): IterableIterator<WrappedElement> {
    for (const elem of target) {
      yield toWrappedElement(change, elem)!;
    }
  }

  /**
   * `pushInternal` pushes the value to the target array.
   */
  public static pushInternal(
    context: ChangeContext,
    target: CRDTArray,
    value: unknown,
  ): number {
    ArrayProxy.insertAfterInternal(
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
    target: CRDTArray,
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
    target: CRDTArray,
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
    target: CRDTArray,
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
    target: CRDTArray,
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
    target: CRDTArray,
    prevCreatedAt: TimeTicket,
    value: unknown,
  ): CRDTElement {
    const ticket = context.issueTimeTicket();
    if (Primitive.isSupport(value)) {
      const primitive = Primitive.of(value as PrimitiveValue, ticket);
      const clone = primitive.deepcopy();
      target.insertAfter(prevCreatedAt, clone);
      context.registerElement(clone, target);
      context.push(
        AddOperation.create(
          target.getCreatedAt(),
          prevCreatedAt,
          primitive,
          ticket,
        ),
      );
      return primitive;
    } else if (Array.isArray(value)) {
      const array = CRDTArray.create(ticket);
      const clone = array.deepcopy();
      target.insertAfter(prevCreatedAt, clone);
      context.registerElement(clone, target);
      context.push(
        AddOperation.create(
          target.getCreatedAt(),
          prevCreatedAt,
          array,
          ticket,
        ),
      );
      for (const element of value) {
        ArrayProxy.pushInternal(context, clone, element);
      }
      return array;
    } else if (typeof value === 'object') {
      const obj = CRDTObject.create(ticket);
      target.insertAfter(prevCreatedAt, obj);
      context.registerElement(obj, target);
      context.push(
        AddOperation.create(target.getCreatedAt(), prevCreatedAt, obj, ticket),
      );

      for (const [k, v] of Object.entries(value!)) {
        ObjectProxy.setInternal(context, obj, k, v);
      }
      return obj;
    }

    throw new TypeError(`Unsupported type of value: ${typeof value}`);
  }

  /**
   * `insertBeforeInternal` inserts the value before the previously created element.
   */
  public static insertBeforeInternal(
    context: ChangeContext,
    target: CRDTArray,
    nextCreatedAt: TimeTicket,
    value: unknown,
  ): CRDTElement {
    return ArrayProxy.insertAfterInternal(
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
    target: CRDTArray,
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
    target: CRDTArray,
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
   * `splice` is a method to remove elements from the array.
   */
  public static splice(
    context: ChangeContext,
    target: CRDTArray,
    start: number,
    deleteCount?: number,
    ...items: Array<any>
  ): JSONArray<JSONElement> {
    const length = target.length;
    const from =
      start >= 0 ? Math.min(start, length) : Math.max(length + start, 0);
    const to =
      deleteCount === undefined
        ? length
        : deleteCount < 0
        ? from
        : Math.min(from + deleteCount, length);
    const removeds: JSONArray<JSONElement> = [];
    for (let i = from; i < to; i++) {
      const removed = ArrayProxy.deleteInternalByIndex(context, target, from);
      if (removed) {
        removeds.push(toJSONElement(context, removed)!);
      }
    }
    if (items) {
      let previousID =
        from === 0
          ? target.getHead().getID()
          : target.getByIndex(from - 1)!.getID();
      for (const item of items) {
        const newElem = ArrayProxy.insertAfterInternal(
          context,
          target,
          previousID,
          item,
        );
        previousID = newElem.getID();
      }
    }
    return removeds;
  }

  /**
   * `includes` returns true if the given element is in the array.
   */
  public static includes(
    context: ChangeContext,
    target: CRDTArray,
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

    if (Primitive.isSupport(searchElement)) {
      const arr = Array.from(target).map((elem) =>
        toJSONElement(context, elem),
      );
      return arr.includes(searchElement, from);
    }

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
    target: CRDTArray,
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

    if (Primitive.isSupport(searchElement)) {
      const arr = Array.from(target).map((elem) =>
        toJSONElement(context, elem),
      );
      return arr.indexOf(searchElement, from);
    }

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
    target: CRDTArray,
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

    if (Primitive.isSupport(searchElement)) {
      const arr = Array.from(target).map((elem) =>
        toJSONElement(context, elem),
      );
      return arr.lastIndexOf(searchElement, from);
    }

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

  /**
   * `getHandlers` gets handlers.
   */
  public getHandlers(): any {
    return this.handlers;
  }
}
