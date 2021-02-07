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
 * JSONObject represents a JSON object, but unlike regular JSON, it has time
 * tickets which is created by logical clock.
 */
export class JSONObject extends JSONContainer {
  private memberNodes: RHTPQMap;

  constructor(createdAt: TimeTicket, memberNodes: RHTPQMap) {
    super(createdAt);
    this.memberNodes = memberNodes;
  }

  public static create(createdAt: TimeTicket): JSONObject {
    return new JSONObject(createdAt, RHTPQMap.create());
  }

  public createText(key: string): PlainText {
    logger.fatal(`unsupported: this method should be called by proxy: ${key}`);
    return null;
  }

  public createRichText(key: string): RichText {
    logger.fatal(`unsupported: this method should be called by proxy: ${key}`);
    return null;
  }

  public purge(value: JSONElement): void {
    this.memberNodes.purge(value);
  }

  /**
   * Don't use createCounter directly. Be sure to use it through a proxy.
   * The reason for setting the CounterProxy type as the return value
   * is to provide the CounterProxy interface to the user.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public createCounter(key: string, value: CounterType): CounterProxy {
    logger.fatal(`unsupported: this method should be called by proxy: ${key}`);
    return null;
  }

  public set(key: string, value: JSONElement): void {
    this.memberNodes.set(key, value);
  }

  public delete(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    return this.memberNodes.delete(createdAt, executedAt);
  }

  public deleteByKey(key: string, executedAt: TimeTicket): JSONElement {
    return this.memberNodes.deleteByKey(key, executedAt);
  }

  public get(key: string): JSONElement {
    return this.memberNodes.get(key);
  }

  public has(key: string): boolean {
    return this.memberNodes.has(key);
  }

  public toJSON(): string {
    const json = [];
    for (const [key, value] of this) {
      json.push(`"${key}":${value.toJSON()}`);
    }
    return `{${json.join(',')}}`;
  }

  public toSortedJSON(): string {
    const keys = Array<string>();
    for (const [key] of this) {
      keys.push(key);
    }

    const json = [];
    for (const key of keys.sort()) {
      const node = this.memberNodes.get(key);
      json.push(`"${key}":${node.toSortedJSON()}`);
    }

    return `{${json.join(',')}}`;
  }

  public getRHT(): RHTPQMap {
    return this.memberNodes;
  }

  public deepcopy(): JSONObject {
    const clone = JSONObject.create(this.getCreatedAt());
    for (const node of this.memberNodes) {
      clone.memberNodes.set(node.getStrKey(), node.getValue().deepcopy());
    }
    clone.remove(this.getRemovedAt());
    return clone;
  }

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
