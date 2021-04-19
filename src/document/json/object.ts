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

import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONContainer, JSONElement } from './element';
import { RHTPQMap } from './rht_pq_map';
import { PlainText } from './plain_text';
import { RichText } from './rich_text';
import { CounterType } from './counter';
import { CounterProxy } from '../proxy/counter_proxy';

/**
 * @public
 * `JSONObject` represents a JSON object, but unlike regular JSON, it has time
 * tickets which is created by logical clock.
 */
export class JSONObject extends JSONContainer {
  private memberNodes: RHTPQMap;

  constructor(createdAt: TimeTicket, memberNodes: RHTPQMap) {
    super(createdAt);
    this.memberNodes = memberNodes;
  }

  /**
   * `create` creates a new instance of Object.
   */
  public static create(createdAt: TimeTicket): JSONObject {
    return new JSONObject(createdAt, RHTPQMap.create());
  }

  /**
   * Don't use createText directly. Be sure to use it through a proxy.
   * The reason for setting the PlainText type as the return value
   * is to provide the PlainText interface to the user.
   */
  public createText(key: string): PlainText {
    logger.fatal(`unsupported: this method should be called by proxy: ${key}`);
    // @ts-ignore
    return;
  }

  /**
   * Don't use createRichText directly. Be sure to use it through a proxy.
   * The reason for setting the RichText type as the return value
   * is to provide the RichText interface to the user.
   */
  public createRichText(key: string): RichText {
    logger.fatal(`unsupported: this method should be called by proxy: ${key}`);
    // @ts-ignore
    return;
  }

  /**
   * `keyOf` returns a key of RHTPQMap based on the given creation time.
   */
  public keyOf(createdAt: TimeTicket): string | undefined {
    return this.memberNodes.keyOf(createdAt);
  }

  /**
   * `purge` physically purges child element.
   */
  public purge(value: JSONElement): void {
    this.memberNodes.purge(value);
  }

  /**
   * Don't use createCounter directly. Be sure to use it through a proxy.
   * The reason for setting the CounterProxy type as the return value
   * is to provide the CounterProxy interface to the user.
   */
  public createCounter(
    key: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    value: CounterType,
  ): CounterProxy {
    logger.fatal(`unsupported: this method should be called by proxy: ${key}`);
    // @ts-ignore
    return;
  }

  /**
   * `set` sets the given element of the given key.
   */
  public set(key: string, value: JSONElement): void {
    this.memberNodes.set(key, value);
  }

  /**
   * `delete` deletes the element of the given key.
   */
  public delete(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    return this.memberNodes.delete(createdAt, executedAt);
  }

  /**
   * `deleteByKey` deletes the element of the given key and execution time.
   */
  public deleteByKey(
    key: string,
    executedAt: TimeTicket,
  ): JSONElement | undefined {
    return this.memberNodes.deleteByKey(key, executedAt);
  }

  /**
   * `get` returns the value of the given key.
   */
  public get(key: string): JSONElement | undefined {
    return this.memberNodes.get(key);
  }

  /**
   * `has` returns whether the element exists of the given key or not.
   */
  public has(key: string): boolean {
    return this.memberNodes.has(key);
  }

  /**
   * `toJSON` returns the JSON encoding of this object.
   */
  public toJSON(): string {
    const json = [];
    for (const [key, value] of this) {
      json.push(`"${key}":${value.toJSON()}`);
    }
    return `{${json.join(',')}}`;
  }

  /**
   * `getKeys` returns array of this object.
   */
  public getKeys(): Array<string> {
    const keys = Array<string>();
    for (const [key] of this) {
      keys.push(key);
    }

    return keys;
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this object.
   */
  public toSortedJSON(): string {
    const keys = Array<string>();
    for (const [key] of this) {
      keys.push(key);
    }

    const json = [];
    for (const key of keys.sort()) {
      const node = this.memberNodes.get(key);
      json.push(`"${key}":${node!.toSortedJSON()}`);
    }

    return `{${json.join(',')}}`;
  }

  /**
   * `getRHT` RHTNodes returns the RHTPQMap nodes.
   */
  public getRHT(): RHTPQMap {
    return this.memberNodes;
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): JSONObject {
    const clone = JSONObject.create(this.getCreatedAt());
    for (const node of this.memberNodes) {
      clone.memberNodes.set(node.getStrKey(), node.getValue().deepcopy());
    }
    clone.remove(this.getRemovedAt());
    return clone;
  }

  /**
   * `getDescendants` returns the descendants of this object by traversing.
   */
  public getDescendants(
    callback: (elem: JSONElement, parent: JSONContainer) => boolean,
  ): void {
    for (const node of this.memberNodes) {
      const element = node.getValue();
      if (callback(element, this)) {
        return;
      }

      if (element instanceof JSONContainer) {
        element.getDescendants(callback);
      }
    }
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<[string, JSONElement]> {
    const keySet = new Set<string>();
    for (const node of this.memberNodes) {
      if (!keySet.has(node.getStrKey())) {
        keySet.add(node.getStrKey());
        if (!node.isRemoved()) {
          yield [node.getStrKey(), node.getValue()];
        }
      }
    }
  }
}
