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
import { JSONElement } from '@yorkie-js-sdk/src/document/json/element';
import { ObjectInternal } from '@yorkie-js-sdk/src/document/json/object';
import { ArrayInternal } from '@yorkie-js-sdk/src/document/json/array';
import {
  JSONPrimitive,
  PrimitiveValue,
} from '@yorkie-js-sdk/src/document/json/primitive';
import { RGATreeSplit } from '@yorkie-js-sdk/src/document/json/rga_tree_split';
import { PlainTextInternal } from '@yorkie-js-sdk/src/document/json/plain_text';
import { RichTextInternal } from '@yorkie-js-sdk/src/document/json/rich_text';
import { ArrayProxy } from '@yorkie-js-sdk/src/document/proxy/array_proxy';
import { PlainText } from '@yorkie-js-sdk/src/document/proxy/text_proxy';
import { RichText } from '@yorkie-js-sdk/src/document/proxy/rich_text_proxy';
import { toProxy } from '@yorkie-js-sdk/src/document/proxy/proxy';
import {
  CounterType,
  CounterInternal,
} from '@yorkie-js-sdk/src/document/json/counter';
import { Counter } from '@yorkie-js-sdk/src/document/proxy/counter_proxy';
import { Indexable } from '../document';

/**
 * `JSONObject` represents a JSON object, but unlike regular JSON, it has time
 * tickets created by a logical clock to resolve conflicts.
 */
export type JSONObject<T extends Indexable> = {
  /**
   * `getID` returns the ID(time ticket) of this Object.
   */
  getID?(): TimeTicket;

  /**
   * `toJSON` returns the JSON encoding of this object.
   */
  toJSON?(): string;
} & T;

/**
 * `ObjectProxy` is a proxy representing `Object`.
 */
export class ObjectProxy {
  private context: ChangeContext;
  private handlers: any;

  constructor(context: ChangeContext) {
    this.context = context;
    this.handlers = {
      set: (target: ObjectInternal, key: string, value: any): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${key}]=${JSON.stringify(value)}`);
        }

        ObjectProxy.setInternal(context, target, key, value);
        return true;
      },

      get: (
        target: ObjectInternal,
        keyOrMethod: Extract<keyof JSONObject<any>, 'string'>,
      ): any => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${keyOrMethod}]`);
        }

        if (keyOrMethod === 'getID') {
          return (): TimeTicket => {
            return target.getCreatedAt();
          };
        } else if (keyOrMethod === 'toJSON') {
          return (): string => {
            return target.toJSON();
          };
        }

        return toProxy(context, target.get(keyOrMethod));
      },

      ownKeys: (target: ObjectInternal): Array<string> => {
        return target.getKeys();
      },

      getOwnPropertyDescriptor: () => {
        return {
          enumerable: true,
          configurable: true,
        };
      },

      deleteProperty: (target: ObjectInternal, key: string): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${key}]`);
        }

        ObjectProxy.deleteInternal(context, target, key);
        return true;
      },
    };
  }

  /**
   * `create` creates a new instance of ObjectProxy.
   */
  public static create(
    context: ChangeContext,
    target: ObjectInternal,
  ): ObjectInternal {
    const objectProxy = new ObjectProxy(context);
    return new Proxy(target, objectProxy.getHandlers());
  }

  /**
   * `setInternal` sets a new Object for the given key
   */
  public static setInternal(
    context: ChangeContext,
    target: ObjectInternal,
    key: string,
    value: unknown,
  ): void {
    const ticket = context.issueTimeTicket();

    const setAndRegister = function (elem: JSONElement) {
      const removed = target.set(key, elem);
      context.registerElement(elem, target);
      if (removed) {
        context.registerRemovedElement(removed);
      }
    };

    if (JSONPrimitive.isSupport(value)) {
      const primitive = JSONPrimitive.of(value as PrimitiveValue, ticket);
      setAndRegister(primitive);
      context.push(
        SetOperation.create(key, primitive, target.getCreatedAt(), ticket),
      );
    } else if (Array.isArray(value)) {
      const array = ArrayInternal.create(ticket);
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
      if (value instanceof PlainText) {
        const text = PlainTextInternal.create(RGATreeSplit.create(), ticket);
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
      } else if (value instanceof RichText) {
        const text = RichTextInternal.create(RGATreeSplit.create(), ticket);
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
        const counter = CounterInternal.of(value.getValue(), ticket);
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
        const obj = ObjectInternal.create(ticket);
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
   * `createText` creates a new Text for the given key
   */
  public static createText(
    context: ChangeContext,
    target: ObjectInternal,
    key: string,
  ): PlainText {
    const ticket = context.issueTimeTicket();
    const text = PlainTextInternal.create(RGATreeSplit.create(), ticket);
    target.set(key, text);
    context.registerElement(text, target);
    context.push(
      SetOperation.create(key, text.deepcopy(), target.getCreatedAt(), ticket),
    );
    return new PlainText(context, text);
  }

  /**
   * `createRichText` a new RichText for the given key.
   */
  public static createRichText(
    context: ChangeContext,
    target: ObjectInternal,
    key: string,
  ): RichText {
    const ticket = context.issueTimeTicket();
    const text = RichTextInternal.create(RGATreeSplit.create(), ticket);
    target.set(key, text);
    context.registerElement(text, target);
    context.push(
      SetOperation.create(key, text.deepcopy(), target.getCreatedAt(), ticket),
    );
    return new RichText(context, text);
  }

  /**
   * `createCounter` a new Counter for the given key.
   */
  public static createCounter(
    context: ChangeContext,
    target: ObjectInternal,
    key: string,
    value: CounterType,
  ): Counter {
    const ticket = context.issueTimeTicket();
    const counterInternal = CounterInternal.of(value, ticket);
    target.set(key, counterInternal);
    context.registerElement(counterInternal, target);
    context.push(
      SetOperation.create(
        key,
        counterInternal.deepcopy(),
        target.getCreatedAt(),
        ticket,
      ),
    );
    const counter = new Counter(0);
    counter.initialize(context, counterInternal);
    return counter;
  }

  /**
   * `deleteInternal` deletes the value of the given key.
   */
  public static deleteInternal(
    context: ChangeContext,
    target: ObjectInternal,
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
