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

import { TimeTicket } from '../time/ticket';

export class RHTNode {
  private key: string;
  private value: string;
  private updatedAt: TimeTicket;

  constructor(key: string, value: string, updatedAt: TimeTicket) {
    this.key = key;
    this.value = value;
    this.updatedAt = updatedAt;
  }

  public static of(key: string, value: string, createdAt: TimeTicket): RHTNode {
    return new RHTNode(key, value, createdAt);
  }

  public getKey(): string {
    return this.key;
  }

  public getValue(): string {
    return this.value;
  }

  public getUpdatedAt(): TimeTicket {
    return this.updatedAt;
  }
}

/**
 * RHT is replicated hash table with priority queue by creation time.
 */
export class RHT {
  private nodeMapByKey: Map<string, RHTNode>;
  private nodeMapByCreatedAt: Map<string, RHTNode>;

  constructor() {
    this.nodeMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  public static create(): RHT {
    return new RHT();
  }

  public set(key: string, value: string, executedAt: TimeTicket): void {
    const prev = this.nodeMapByKey.get(key);

    if (prev === undefined || executedAt.after(prev.getUpdatedAt())) {
      const node = RHTNode.of(key, value, executedAt);
      this.nodeMapByKey.set(key, node);
      this.nodeMapByCreatedAt.set(executedAt.toIDString(), node);
    }
  }

  public has(key: string): boolean {
    return this.nodeMapByKey.has(key);
  }

  public get(key: string): string {
    if (!this.nodeMapByKey.has(key)) {
      return null;
    }

    return this.nodeMapByKey.get(key).getValue();
  }

  public deepcopy(): RHT {
    const rht = new RHT();
    for (const [, node] of this.nodeMapByKey) {
      rht.set(node.getKey(), node.getValue(), node.getUpdatedAt());
    }
    return rht;
  }

  public toJSON(): string {
    const items = [];
    for (const [key, node] of this.nodeMapByKey) {
      items.push(`"${key}":"${node.getValue()}"`);
    }
    return `{${items.join(',')}}`;
  }

  public toObject(): { [key: string]: string } {
    const obj = {} as { [key: string]: string };
    for (const [key, node] of this.nodeMapByKey) {
      obj[key as string] = node.getValue();
    }

    return obj;
  }

  public *[Symbol.iterator](): IterableIterator<RHTNode> {
    for (const [, node] of this.nodeMapByKey) {
      yield node as RHTNode;
    }
  }
}
