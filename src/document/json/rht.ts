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

import { HeapNode, Heap } from '../../util/heap';
import { TicketComparator, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

export class RHTNode extends HeapNode<TimeTicket, JSONElement> {
  private strKey: string;

  constructor(strKey: string, value: JSONElement) {
    super(value.getCreatedAt(), value);
    this.strKey = strKey;
  }

  public static of(strKey: string, value: JSONElement): RHTNode {
    return new RHTNode(strKey, value);
  }

  public isDeleted(): boolean {
    return this.getValue().isDeleted();
  }

  public getStrKey(): string {
    return this.strKey;
  }

  public remove(deletedAt: TimeTicket): void {
    this.getValue().delete(deletedAt);
  }
}

/**
 * RHT is replicated hash table.
 */
export class RHT {
  private elementQueueMapByKey: Map<string, Heap<TimeTicket, JSONElement>>;
  private nodeMapByCreatedAt: Map<string, RHTNode>;

  constructor() {
    this.elementQueueMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  public static create(): RHT {
    return new RHT()
  }

  public set(key: string, value: JSONElement): void {
    if (!this.elementQueueMapByKey.has(key)) {
      this.elementQueueMapByKey.set(key, new Heap(TicketComparator));
    }

    const node = RHTNode.of(key, value);
    this.elementQueueMapByKey.get(key).push(node);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), node);
  }

  public remove(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    if (!this.nodeMapByCreatedAt.has(createdAt.toIDString())) {
      return null;
    }

    this.nodeMapByCreatedAt.get(createdAt.toIDString()).remove(executedAt);
  }

  public removeByKey(key: string, deletedAt: TimeTicket): JSONElement {
    if (!this.elementQueueMapByKey.has(key)) {
      return null;
    }

    const node = this.elementQueueMapByKey.get(key).peek() as RHTNode;
    node.remove(deletedAt);
    return node.getValue();
  }

  public has(key: string): boolean {
    if (!this.elementQueueMapByKey.has(key)) {
      return false;
    }

    const node = this.elementQueueMapByKey.get(key).peek() as RHTNode;
    return !node.isDeleted();
  }

  public get(key: string): JSONElement {
    if (!this.elementQueueMapByKey.has(key)) {
      return null;
    }

    return this.elementQueueMapByKey.get(key).peek().getValue();
  }

  public *[Symbol.iterator](): IterableIterator<RHTNode> {
    for (const [, heap] of this.elementQueueMapByKey) {
      for (const node of heap) {
        yield node as RHTNode;
      }
    }
  }
}
