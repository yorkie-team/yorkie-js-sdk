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

import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';

/**
 * `RHTNode` is a node of RHT(Replicated Hashtable).
 */
export class RHTNode {
  private key: string;
  private value: string;
  private updatedAt: TimeTicket;
  private _isRemoved: boolean;

  constructor(
    key: string,
    value: string,
    updatedAt: TimeTicket,
    isRemoved: boolean,
  ) {
    this.key = key;
    this.value = value;
    this.updatedAt = updatedAt;
    this._isRemoved = isRemoved;
  }

  /**
   * `of` creates a new instance of RHTNode.
   */
  public static of(
    key: string,
    value: string,
    createdAt: TimeTicket,
    isRemoved: boolean,
  ): RHTNode {
    return new RHTNode(key, value, createdAt, isRemoved);
  }

  /**
   * `getKey` returns a key of node.
   */
  public getKey(): string {
    return this.key;
  }

  /**
   * `getValue` returns a value of node.
   */
  public getValue(): string {
    return this.value;
  }

  /**
   * `getUpdatedAt` returns updated time of node.
   */
  public getUpdatedAt(): TimeTicket {
    return this.updatedAt;
  }

  /**
   * `isRemoved` returns whether the node has been removed or not.
   */
  public isRemoved(): boolean {
    return this._isRemoved;
  }
}

/**
 * RHT is replicated hash table by creation time.
 * For more details about RHT: @see http://csl.skku.edu/papers/jpdc11.pdf
 */
export class RHT {
  private nodeMapByKey: Map<string, RHTNode>;
  private numberOfRemovedElement: number;

  constructor() {
    this.nodeMapByKey = new Map();
    this.numberOfRemovedElement = 0;
  }

  /**
   * `create` creates a new instance of RHT.
   */
  public static create(): RHT {
    return new RHT();
  }

  /**
   * `set` sets the value of the given key.
   */
  public set(key: string, value: string, executedAt: TimeTicket): void {
    const prev = this.nodeMapByKey.get(key);

    if (prev === undefined || executedAt.after(prev.getUpdatedAt())) {
      // NOTE(raararaara): This logic is implemented without considering gc.
      if (prev !== undefined && prev.isRemoved()) {
        this.numberOfRemovedElement -= 1;
      }
      const node = RHTNode.of(key, value, executedAt, false);
      this.nodeMapByKey.set(key, node);
    }
  }

  /**
   * `remove` removes the Element of the given key.
   */
  public remove(key: string, executedAt: TimeTicket): string {
    const prev = this.nodeMapByKey.get(key);

    if (prev === undefined || executedAt.after(prev.getUpdatedAt())) {
      if (prev === undefined) {
        this.numberOfRemovedElement += 1;
        const node = RHTNode.of(key, '', executedAt, true);
        this.nodeMapByKey.set(key, node);

        return '';
      }

      const alreadyRemoved = prev.isRemoved();
      if (!alreadyRemoved) {
        this.numberOfRemovedElement += 1;
      }
      const node = RHTNode.of(key, prev.getValue(), executedAt, true);
      this.nodeMapByKey.set(key, node);

      if (alreadyRemoved) {
        return '';
      }

      return prev.getValue();
    }

    return '';
  }

  /**
   * `has` returns whether the element exists of the given key or not.
   */
  public has(key: string): boolean {
    if (this.nodeMapByKey.has(key)) {
      const node = this.nodeMapByKey.get(key);
      return node !== undefined && !node.isRemoved();
    }
    return false;
  }

  /**
   * `get` returns the value of the given key.
   */
  public get(key: string): string | undefined {
    if (!this.nodeMapByKey.has(key)) {
      return;
    }

    return this.nodeMapByKey.get(key)!.getValue();
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): RHT {
    const rht = new RHT();
    for (const [, node] of this.nodeMapByKey) {
      rht.set(node.getKey(), node.getValue(), node.getUpdatedAt());
    }
    return rht;
  }

  /**
   * `toJSON` returns the JSON encoding of this hashtable.
   */
  public toJSON(): string {
    if (!this.size()) {
      return '{}';
    }

    const items = [];
    for (const [key, node] of this.nodeMapByKey) {
      if (!node.isRemoved()) {
        items.push(`"${escapeString(key)}":"${escapeString(node.getValue())}"`);
      }
    }
    return `{${items.join(',')}}`;
  }

  /**
   * `toXML` converts the given RHT to XML string.
   */
  public toXML(): string {
    if (!this.size()) {
      return '';
    }

    const attrs = [...this.nodeMapByKey]
      .filter(([, v]) => v instanceof RHTNode && !v.isRemoved())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}="${JSON.parse(v.getValue())}"`);

    return ` ${attrs.join(' ')}`;
  }

  /**
   * `size` returns the size of RHT
   */
  public size(): number {
    return this.nodeMapByKey.size - this.numberOfRemovedElement;
  }

  /**
   * `toObject` returns the object of this hashtable.
   */
  public toObject(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [key, node] of this.nodeMapByKey) {
      if (!node.isRemoved()) {
        obj[key] = node.getValue();
      }
    }

    return obj;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<RHTNode> {
    for (const [, node] of this.nodeMapByKey) {
      if (node.isRemoved()) continue;
      yield node as RHTNode;
    }
  }
}
