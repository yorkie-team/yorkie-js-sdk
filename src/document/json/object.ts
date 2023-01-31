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
import { SetOperation } from '@yorkie-js-sdk/src/document/operation/set_operation';
import { RemoveOperation } from '@yorkie-js-sdk/src/document/operation/remove_operation';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import {
  Primitive,
  PrimitiveValue,
} from '@yorkie-js-sdk/src/document/crdt/primitive';
import { RGATreeSplit } from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { CRDTText } from '@yorkie-js-sdk/src/document/crdt/text';
import { ArrayProxy } from '@yorkie-js-sdk/src/document/json/array';
import { Text } from '@yorkie-js-sdk/src/document/json/text';
import { toJSONElement } from '@yorkie-js-sdk/src/document/json/element';
import { CRDTCounter } from '@yorkie-js-sdk/src/document/crdt/counter';
import { Counter } from '@yorkie-js-sdk/src/document/json/counter';

/**
 * `JSONObject` represents a JSON object, but unlike regular JSON, it has time
 * tickets created by a logical clock to resolve conflicts.
 */
export type JSONObject<T> = {
  /**
   * `getID` returns the ID(time ticket) of this Object.
   */
  getID?(): TimeTicket;

  /**
   * `toJSON` returns the JSON encoding of this object.
   */
  toJSON?(): string;

  /**
   * `toJS` returns the JSON object of this object.
   */
  toJS?(): T;
} & T;

/**
 * `createJSONObject` creates a new instance of JSONObject.
 */
export function createJSONObject<T>(
  context: ChangeContext,
  target: CRDTObject,
): JSONObject<T> {
  const objectProxy = new ObjectProxy(context);
  return new Proxy(target, objectProxy.getHandlers()) as any;
}

/**
 * `ObjectProxy` is a proxy representing `Object`.
 */
export class ObjectProxy {
  private context: ChangeContext;
  private handlers: any;

  constructor(context: ChangeContext) {
    this.context = context;
    this.handlers = {
      set: (target: CRDTObject, key: string, value: any): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${key}]=${JSON.stringify(value)}`);
        }

        ObjectProxy.setInternal(context, target, key, value);
        return true;
      },

      get: (
        target: CRDTObject,
        keyOrMethod: Extract<keyof JSONObject<any>, 'string'>,
      ): any => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${keyOrMethod}]`);
        }

        if (keyOrMethod === 'getID') {
          return (): TimeTicket => {
            return target.getCreatedAt();
          };
        } else if (keyOrMethod === 'toJSON' || keyOrMethod === 'toString') {
          return (): string => {
            return target.toJSON();
          };
        } else if (keyOrMethod === 'toJS') {
          return (): object => {
            return target.toJS();
          };
        }

        return toJSONElement(context, target.get(keyOrMethod));
      },

      ownKeys: (target: CRDTObject): Array<string> => {
        return target.getKeys();
      },

      getOwnPropertyDescriptor: () => {
        return {
          enumerable: true,
          configurable: true,
        };
      },

      deleteProperty: (target: CRDTObject, key: string): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${key}]`);
        }

        ObjectProxy.deleteInternal(context, target, key);
        return true;
      },
    };
  }

  /**
   * `setInternal` sets a new Object for the given key
   */
  public static setInternal(
    context: ChangeContext,
    target: CRDTObject,
    key: string,
    value: unknown,
  ): void {
    const ticket = context.issueTimeTicket();

    const setAndRegister = function (elem: CRDTElement) {
      const removed = target.set(key, elem);
      context.registerElement(elem, target);
      if (removed) {
        context.registerRemovedElement(removed);
      }
    };

    if (Primitive.isSupport(value)) {
      const primitive = Primitive.of(value as PrimitiveValue, ticket);
      setAndRegister(primitive);
      context.push(
        SetOperation.create(key, primitive, target.getCreatedAt(), ticket),
      );
    } else if (Array.isArray(value)) {
      const array = CRDTArray.create(ticket);
      setAndRegister(array);
      context.push(
        SetOperation.create(
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
      if (value instanceof Text) {
        const text = CRDTText.create(RGATreeSplit.create(), ticket);
        target.set(key, text);
        context.registerElement(text, target);
        context.push(
          SetOperation.create(
            key,
            text.deepcopy(),
            target.getCreatedAt(),
            ticket,
          ),
        );
        value.initialize(context, text);
      } else if (value instanceof Counter) {
        const counter = CRDTCounter.of(
          value.getValueType(),
          value.getValue(),
          ticket,
        );
        target.set(key, counter);
        context.registerElement(counter, target);
        context.push(
          SetOperation.create(
            key,
            counter.deepcopy(),
            target.getCreatedAt(),
            ticket,
          ),
        );
        value.initialize(context, counter);
      } else {
        const obj = CRDTObject.create(ticket);
        setAndRegister(obj);
        context.push(
          SetOperation.create(
            key,
            obj.deepcopy(),
            target.getCreatedAt(),
            ticket,
          ),
        );
        for (const [k, v] of Object.entries(value!)) {
          ObjectProxy.setInternal(context, obj, k, v);
        }
      }
    } else {
      logger.fatal(`unsupported type of value: ${typeof value}`);
    }
  }

  /**
   * `deleteInternal` deletes the value of the given key.
   */
  public static deleteInternal(
    context: ChangeContext,
    target: CRDTObject,
    key: string,
  ): void {
    const ticket = context.issueTimeTicket();
    const deleted = target.deleteByKey(key, ticket);
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
  }

  /**
   * `getHandlers` gets handlers.
   */
  public getHandlers(): any {
    return this.handlers;
  }
}
