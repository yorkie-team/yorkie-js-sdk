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
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { SetOperation } from '@yorkie-js-sdk/src/document/operation/set_operation';
import { RemoveOperation } from '@yorkie-js-sdk/src/document/operation/remove_operation';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import {
  toJSONElement,
  buildCRDTElement,
} from '@yorkie-js-sdk/src/document/json/element';
import * as Devtools from '@yorkie-js-sdk/src/devtools/types';

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

  /**
   * `toJSForTest` returns the JSON object of this object for debugging.
   * @internal
   */
  toJSForTest?(): Devtools.JSONElement;
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
        } else if (keyOrMethod === 'toJSForTest') {
          return (): Devtools.JSONElement => {
            return target.toJSForTest();
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
    if (key.includes('.')) {
      throw new YorkieError(
        Code.ErrInvalidObjectKey,
        `key must not contain the '.'.`,
      );
    }

    const createdAt = context.issueTimeTicket();
    const element = buildCRDTElement(context, value, createdAt);
    const removed = target.set(key, element, createdAt);
    context.registerElement(element, target);
    if (removed) {
      context.registerRemovedElement(removed);
    }
    context.push(
      SetOperation.create(
        key,
        element.deepcopy(),
        target.getCreatedAt(),
        createdAt,
      ),
    );
  }

  /**
   * `buildObjectMembers` constructs an object where all values from the
   * user-provided object are transformed into CRDTElements.
   * This function takes an object and iterates through its values,
   * converting each value into a corresponding CRDTElement.
   */
  public static buildObjectMembers(
    context: ChangeContext,
    value: object,
  ): { [key: string]: CRDTElement } {
    const members: { [key: string]: CRDTElement } = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.includes('.')) {
        throw new YorkieError(
          Code.ErrInvalidObjectKey,
          `key must not contain the '.'.`,
        );
      }

      const createdAt = context.issueTimeTicket();
      const elem = buildCRDTElement(context, v, createdAt);
      members[k] = elem;
    }
    return members;
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
