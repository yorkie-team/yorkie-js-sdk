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
import { SetOperation } from '../operation/set_operation';
import { RemoveOperation } from '../operation/remove_operation';
import { ChangeContext } from '../change/context';
import { JSONElement } from '../json/element';
import { JSONObject } from '../json/object';
import { JSONArray } from '../json/array';
import { JSONPrimitive } from '../json/primitive';
import { PlainText, RGATreeSplit } from '../json/text';
import { ArrayProxy } from './array_proxy';
import { TextProxy } from './text_proxy';

export class ObjectProxy {
  private context: ChangeContext;
  private handlers: any;

  constructor(context: ChangeContext) {
    this.context = context;
    this.handlers = {
      set: (target: JSONObject, key: string, value: any): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${key}]=${JSON.stringify(value)}`);
        }

        ObjectProxy.setInternal(this.context, target, key, value);
        return true;
      },

      get: (target: JSONObject, keyOrMethod: string): any => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${keyOrMethod}]`);
        }

        if (keyOrMethod === 'toJSON') {
          return (): string => {
            return target.toJSON();
          };
        } else if (keyOrMethod === 'getOrCreateText') {
          return (key: string): PlainText => {
            if (logger.isEnabled(LogLevel.Trivial)) {
              logger.trivial(`obj[${key}]=Text`);
            }
            return ObjectProxy.getOrCreateText(this.context, target, key);
          };
        } else if (keyOrMethod === 'getText') {
          return (key: string): PlainText => {
            const text = target.get(key) as PlainText;
            return TextProxy.create(this.context, text);
          };
        }

        const elem = target.get(keyOrMethod);
        if (elem == null) {
          return null;
        } else if (elem instanceof JSONPrimitive) {
          const primitive = elem as JSONPrimitive;
          return primitive.getValue();
        } else if (elem instanceof JSONObject) {
          const obj = elem as JSONObject;
          return ObjectProxy.create(this.context, obj);
        } else if (elem instanceof JSONArray) {
          const array = elem as JSONArray;
          return ArrayProxy.create(this.context, array);
        }

        throw new TypeError(`Unsupported type of element: ${typeof elem}`);
      },

      deleteProperty: (target: JSONObject, key: string): boolean => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${key}]`);
        }

        ObjectProxy.removeInternal(this.context, target, key);
        return true;
      }
    }
  }

  public static create(context: ChangeContext, target: JSONObject): JSONObject {
    const objectProxy = new ObjectProxy(context);
    return new Proxy(target, objectProxy.getHandlers());
  }

  public static setInternal(context: ChangeContext, target: JSONObject, key: string, value: any): void {
    const ticket = context.issueTimeTicket();

    if (JSONPrimitive.isSupport(value)) {
      const primitive = JSONPrimitive.of(value, ticket);
      target.set(key, primitive);
      context.registerElement(primitive);
      context.push(SetOperation.create(key, primitive, target.getCreatedAt(), ticket));
    } else if (Array.isArray(value)) {
      const array = JSONArray.create(ticket);
      target.set(key, array);
      context.registerElement(array);
      context.push(SetOperation.create(key, array.deepcopy(), target.getCreatedAt(), ticket));
      for (const element of value) {
        ArrayProxy.pushInternal(context, array, element)
      }
    } else if (typeof value === 'object') {
      if (value instanceof PlainText) {
        target.set(key, value);
        context.registerElement(value);
        context.push(SetOperation.create(key, value.deepcopy(), target.getCreatedAt(), ticket));
      } else {
        const obj = JSONObject.create(ticket);
        target.set(key, obj);
        context.registerElement(obj);
        context.push(SetOperation.create(key, obj.deepcopy(), target.getCreatedAt(), ticket));
        for (const [k, v] of Object.entries(value)) {
          ObjectProxy.setInternal(context, obj, k, v);
        }
      }
    } else {
      logger.fatal(`unsupported type of value: ${typeof value}`);
    }
  }

  public static getOrCreateText(context: ChangeContext, target: JSONObject, key: string): PlainText {
    if (target.has(key)) {
      const text = target.get(key) as PlainText;
      return TextProxy.create(context, text);
    }

    const ticket = context.issueTimeTicket();
    const text = PlainText.create(RGATreeSplit.create(), ticket);
    target.set(key, text);
    context.registerElement(text);
    context.push(SetOperation.create(key, text.deepcopy(), target.getCreatedAt(), ticket));
    return TextProxy.create(context, text);
  }

  public static removeInternal(context: ChangeContext, target: JSONObject, key: string): void {
    const ticket = context.issueTimeTicket();
    const removed = target.removeByKey(key, ticket);
    context.push(RemoveOperation.create(target.getCreatedAt(), removed.getCreatedAt(), ticket));
  }

  public getHandlers(): any {
    return this.handlers;
  }
}
