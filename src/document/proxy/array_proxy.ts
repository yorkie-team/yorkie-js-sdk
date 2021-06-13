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

import { logger, LogLevel } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { AddOperation } from '../operation/add_operation';
import { MoveOperation } from '../operation/move_operation';
import { RemoveOperation } from '../operation/remove_operation';
import { ChangeContext } from '../change/context';
import { JSONElement } from '../json/element';
import { JSONObject } from '../json/object';
import { JSONArray } from '../json/array';
import { JSONPrimitive, PrimitiveValue } from '../json/primitive';
import { ObjectProxy } from './object_proxy';
import { toProxy } from './proxy';

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
 * `ArrayProxy` is a proxy representing Array.
 */
export class ArrayProxy {
  private context: ChangeContext;
  private handlers: any;
  private array: JSONArray;

  constructor(context: ChangeContext, array: JSONArray) {
    this.context = context;
    this.array = array;
    this.handlers = {
      set: (target: JSONArray, key: string, value: any): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`array[${key}]=${JSON.stringify(value)}`);
        }

        ArrayProxy.setInternal(context, target, key, value);
        return true;
      },
      get: (target: JSONArray, method: string | symbol, receiver: any): any => {
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
          return (prevID: TimeTicket, value: any): JSONElement => {
            const inserted = ArrayProxy.insertBeforeInternal(
              context,
              target,
              prevID,
              value,
            );
            return toProxy(context, inserted);
          };
        } else if (method === 'moveBefore') {
          return (prevID: TimeTicket, itemID: TimeTicket): void => {
            ArrayProxy.moveBeforeInternal(context, target, prevID, itemID);
          };
          // JavaScript Native API
        } else if (method === 'moveAfter') {
          return (prevID: TimeTicket, itemID: TimeTicket): void => {
            ArrayProxy.moveAfterInternal(context, target, prevID, itemID);
          };
        } else if (method === 'moveFront') {
          return (itemID: TimeTicket): void => {
            ArrayProxy.moveFrontInternal(context, target, itemID);
          };
        } else if (method === 'moveLast') {
          return (itemID: TimeTicket): void => {
            ArrayProxy.moveLastInternal(context, target, itemID);
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
        } else if (method === 'filter') {
          return (
            callback: (
              elem: JSONElement,
              idx: number,
              arr: Array<JSONElement>,
            ) => Array<JSONElement>,
          ): Array<JSONElement> => {
            return Array.from(target)
              .map((e) => toProxy(context, e))
              .filter(callback);
          };
        } else if (method === 'reduce') {
          return (
            callback: (accumulator: any, curr: JSONElement) => any,
            accumulator: any,
          ) => {
            return Array.from(target)
              .map((e) => toProxy(context, e))
              .reduce(callback, accumulator);
          };
        } else if (method === 'length') {
          return target.length;
        } else if (method === Symbol.iterator) {
          return ArrayProxy.iteratorInternal.bind(this, context, target);
        }

        // TODO we need to distinguish between the case we need to call default
        // behavior and the case where we need to call an internal method
        // throw new TypeError(`Unsupported method: ${String(method)}`);
        return Reflect.get(target, method, receiver);
      },
      deleteProperty: (target: JSONArray, key: string): boolean => {
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
    target: JSONArray,
  ): IterableIterator<any> {
    for (const elem of target) {
      yield toProxy(change, elem);
    }
  }

  /**
   * `create` creates a new instance of ArrayProxy.
   */
  public static create(context: ChangeContext, target: JSONArray): JSONArray {
    const arrayProxy = new ArrayProxy(context, target);
    return new Proxy(target, arrayProxy.getHandlers());
  }

  /**
   * `pushInternal` pushes the value to the target array.
   */
  public static pushInternal(
    context: ChangeContext,
    target: JSONArray,
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
    target: JSONArray,
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
    target: JSONArray,
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
    target: JSONArray,
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
    target: JSONArray,
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
    target: JSONArray,
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
      const array = JSONArray.create(ticket);
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
      const obj = JSONObject.create(ticket);
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
    target: JSONArray,
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
    target: JSONArray,
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
    target: JSONArray,
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
   * `setInternal` sets an Array for the given key
   */
  public static setInternal(
    context: ChangeContext,
    target: JSONArray,
    key: string,
    value: unknown,
  ): void {
    const index = Number(key);
    if (!Number.isInteger(index)) {
      return;
    }

    if (index < 0 || index >= target.length) {
      return;
    }

    ObjectProxy.setInternal(context, target, key, value);
  }

  /**
   * `getHandlers` gets handlers.
   */
  public getHandlers(): any {
    return this.handlers;
  }
}
