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
import { JSONPrimitive } from '../json/primitive';
import { ObjectProxy } from './object_proxy';
import { toProxy } from './proxy';

function isNumericString(val: any): boolean {
  if (typeof val === 'string' || val instanceof String) {
    return !isNaN(val as any);
  }
  return false;
}

export class ArrayProxy {
  private context: ChangeContext;
  private handlers: any;
  private array: JSONArray;

  constructor(context: ChangeContext, array: JSONArray) {
    this.context = context;
    this.array = array;
    this.handlers = {
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
        } else if (method === 'moveBefore') {
          return (prevID: TimeTicket, itemID: TimeTicket): void => {
            ArrayProxy.moveBeforeInternal(context, target, prevID, itemID);
          };
          // JavaScript Native API
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
      deleteProperty: (target: JSONArray, key: number): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`array[${key}]`);
        }

        ArrayProxy.deleteInternalByIndex(context, target, key);
        return true;
      },
    };
  }

  public static *iteratorInternal(
    change: ChangeContext,
    target: JSONArray,
  ): IterableIterator<any> {
    for (const elem of target) {
      yield toProxy(change, elem);
    }
  }

  public static create(context: ChangeContext, target: JSONArray): JSONArray {
    const arrayProxy = new ArrayProxy(context, target);
    return new Proxy(target, arrayProxy.getHandlers());
  }

  public static pushInternal(
    context: ChangeContext,
    target: JSONArray,
    value: any,
  ): number {
    ArrayProxy.insertAfterInternal(
      context,
      target,
      target.getLastCreatedAt(),
      value,
    );
    return target.length;
  }

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

  public static insertAfterInternal(
    context: ChangeContext,
    target: JSONArray,
    prevCreatedAt: TimeTicket,
    value: any,
  ): JSONElement {
    const ticket = context.issueTimeTicket();
    if (JSONPrimitive.isSupport(value)) {
      const primitive = JSONPrimitive.of(value, ticket);
      target.insertAfter(prevCreatedAt, primitive);
      context.registerElement(primitive);
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
      target.insertAfter(prevCreatedAt, array);
      context.registerElement(array);
      context.push(
        AddOperation.create(
          target.getCreatedAt(),
          prevCreatedAt,
          array,
          ticket,
        ),
      );
      for (const element of value) {
        ArrayProxy.pushInternal(context, array, element);
      }
      return array;
    } else if (typeof value === 'object') {
      const obj = JSONObject.create(ticket);
      target.insertAfter(prevCreatedAt, obj);
      context.registerElement(obj);
      context.push(
        AddOperation.create(target.getCreatedAt(), prevCreatedAt, obj, ticket),
      );

      for (const [k, v] of Object.entries(value)) {
        ObjectProxy.setInternal(context, obj, k, v);
      }
      return obj;
    } else {
      throw new TypeError(`Unsupported type of value: ${typeof value}`);
    }
  }

  public static deleteInternalByIndex(
    context: ChangeContext,
    target: JSONArray,
    index: number,
  ): JSONElement {
    const ticket = context.issueTimeTicket();
    const deleted = target.deleteByIndex(index, ticket);
    context.push(
      RemoveOperation.create(
        target.getCreatedAt(),
        deleted.getCreatedAt(),
        ticket,
      ),
    );
    context.registerRemovedElementPair(target, deleted);
    return deleted;
  }

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
    context.registerRemovedElementPair(target, deleted);
    return deleted;
  }

  public getHandlers(): any {
    return this.handlers;
  }
}
