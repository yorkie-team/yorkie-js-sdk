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
import { JSONElement } from '@yorkie-js-sdk/src/document/json/element';
import { ObjectInternal } from '@yorkie-js-sdk/src/document/json/object';
import { ArrayInternal } from '@yorkie-js-sdk/src/document/json/array';
import {
  JSONPrimitive,
  PrimitiveValue,
} from '@yorkie-js-sdk/src/document/json/primitive';
import { ObjectProxy } from '@yorkie-js-sdk/src/document/proxy/object_proxy';
import { toProxy } from '@yorkie-js-sdk/src/document/proxy/proxy';

/**
 * `JSONArray` represents JSON array, but unlike regular JSON, it has time
 * tickets created by a logical clock to resolve conflicts.
 */
export type JSONArray<T = unknown> = {
  /**
   * `getID` returns the ID, `TimeTicket` of this Object.
   */
  getID?(): TimeTicket;

  /**
   * `getElementByID` returns the element for the given ID.
   */
  getElementByID?(createdAt: TimeTicket): JSONElement & T;

  /**
   * `getElementByIndex` returns the element for the given index.
   */
  getElementByIndex?(index: number): JSONElement & T;

  /**
   * `getLast` returns the last element of this array.
   */
  getLast?(): JSONElement;

  /**
   * `deleteByID` deletes the element of the given ID.
   */
  deleteByID?(createdAt: TimeTicket): JSONElement & T;

  /**
   * `insertBefore` inserts a value before the given next element.
   */
  insertBefore?(nextID: TimeTicket, value: any): JSONElement & T;

  /**
   * `insertAfter` inserts a value after the given previous element.
   */
  insertAfter?(prevID: TimeTicket, value: any): JSONElement & T;

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
    'includes',
    'indexOf',
    'join',
    'keys',
    'lastIndexOf',
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
 * `ArrayProxy` is a proxy representing Array.
 */
export class ArrayProxy {
  private context: ChangeContext;
  private handlers: any;
  private array: ArrayInternal;

  constructor(context: ChangeContext, array: ArrayInternal) {
    this.context = context;
    this.array = array;
    this.handlers = {
      get: (
        target: ArrayInternal,
        method: keyof JSONArray<unknown>,
        receiver: any,
      ): any => {
        // Yorkie extension API

        if (method === 'getID') {
          return (): TimeTicket => {
            return target.getCreatedAt();
          };
        } else if (method === 'getElementByID') {
          return (createdAt: TimeTicket): JSONElement => {
            return toProxy(context, target.get(createdAt));
          };
        } else if (method === 'getElementByIndex') {
          return (index: number): JSONElement => {
            const elem = target.getByIndex(index);
            if (elem instanceof JSONPrimitive) {
              return elem;
            }
            return toProxy(context, elem);
          };
        } else if (method === 'getLast') {
          return (): JSONElement => {
            return toProxy(context, target.getLast());
          };
        } else if (method === 'deleteByID') {
          return (createdAt: TimeTicket): JSONElement => {
            const deleted = ArrayProxy.deleteInternalByID(
              context,
              target,
              createdAt,
            );
            return toProxy(context, deleted);
          };
        } else if (method === 'insertAfter') {
          return (prevID: TimeTicket, value: any): JSONElement => {
            const inserted = ArrayProxy.insertAfterInternal(
              context,
              target,
              prevID,
              value,
            );
            return toProxy(context, inserted);
          };
        } else if (method === 'insertBefore') {
          return (nextID: TimeTicket, value: any): JSONElement => {
            const inserted = ArrayProxy.insertBeforeInternal(
              context,
              target,
              nextID,
              value,
            );
            return toProxy(context, inserted);
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
          return toProxy(context, target.getByIndex(+(method as string)));
        } else if (method === 'push') {
          return (value: any): number => {
            if (logger.isEnabled(LogLevel.Trivial)) {
              logger.trivial(`array.push(${JSON.stringify(value)})`);
            }

            return ArrayProxy.pushInternal(context, target, value);
          };
        } else if (method === 'length') {
          return target.length;
        } else if (typeof method === 'symbol' && method === Symbol.iterator) {
          return ArrayProxy.iteratorInternal.bind(this, context, target);
        } else if (
          typeof method === 'string' &&
          isReadOnlyArrayMethod(method)
        ) {
          return (...args: any) => {
            const arr = Array.from(target).map((elem) =>
              toProxy(context, elem),
            );
            return Array.prototype[method as any].apply(arr, args);
          };
        }

        // TODO we need to distinguish between the case we need to call default
        // behavior and the case where we need to call an internal method
        // throw new TypeError(`Unsupported method: ${String(method)}`);
        return Reflect.get(target, method, receiver);
      },

      deleteProperty: (target: ArrayInternal, key: string): boolean => {
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
    target: ArrayInternal,
  ): IterableIterator<any> {
    for (const elem of target) {
      yield toProxy(change, elem);
    }
  }

  /**
   * `create` creates a new instance of ArrayProxy.
   */
  public static create(
    context: ChangeContext,
    target: ArrayInternal,
  ): ArrayInternal {
    const arrayProxy = new ArrayProxy(context, target);
    return new Proxy(target, arrayProxy.getHandlers());
  }

  /**
   * `pushInternal` pushes the value to the target array.
   */
  public static pushInternal(
    context: ChangeContext,
    target: ArrayInternal,
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
    target: ArrayInternal,
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
    target: ArrayInternal,
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
    target: ArrayInternal,
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
    target: ArrayInternal,
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
    target: ArrayInternal,
    prevCreatedAt: TimeTicket,
    value: unknown,
  ): JSONElement {
    const ticket = context.issueTimeTicket();
    if (JSONPrimitive.isSupport(value)) {
      const primitive = JSONPrimitive.of(value as PrimitiveValue, ticket);
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
      const array = ArrayInternal.create(ticket);
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
      const obj = ObjectInternal.create(ticket);
      target.insertAfter(prevCreatedAt, obj);
      context.registerElement(obj, target);
      context.push(
        AddOperation.create(target.getCreatedAt(), prevCreatedAt, obj, ticket),
      );

      for (const [k, v] of Object.entries(value!)) {
        ObjectProxy.setInternal(context, obj, k, v);
      }
      return obj;
    } else {
      throw new TypeError(`Unsupported type of value: ${typeof value}`);
    }
  }

  /**
   * `insertBeforeInternal` inserts the value before the previously created element.
   */
  public static insertBeforeInternal(
    context: ChangeContext,
    target: ArrayInternal,
    nextCreatedAt: TimeTicket,
    value: unknown,
  ): JSONElement {
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
    target: ArrayInternal,
    index: number,
  ): JSONElement | undefined {
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
   * `deleteInternalByID` deletes the element of the given index.
   */
  public static deleteInternalByID(
    context: ChangeContext,
    target: ArrayInternal,
    createdAt: TimeTicket,
  ): JSONElement {
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
   * `getHandlers` gets handlers.
   */
  public getHandlers(): any {
    return this.handlers;
  }
}
