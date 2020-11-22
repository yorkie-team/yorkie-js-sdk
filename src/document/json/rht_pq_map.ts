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
import { HeapNode, Heap } from '../../util/heap';
import { TicketComparator, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

export class RHTPQMapNode extends HeapNode<TimeTicket, JSONElement> {
  private strKey: string;

  constructor(strKey: string, value: JSONElement) {
    super(value.getCreatedAt(), value);
    this.strKey = strKey;
  }

  public static of(strKey: string, value: JSONElement): RHTPQMapNode {
    return new RHTPQMapNode(strKey, value);
  }

  public isRemoved(): boolean {
    return this.getValue().isRemoved();
  }

  public getStrKey(): string {
    return this.strKey;
  }

  public remove(removedAt: TimeTicket): void {
    this.getValue().remove(removedAt);
  }
}

/**
 * RHT is replicated hash table with priority queue by creation time.
 */
export class RHTPQMap {
  private elementQueueMapByKey: Map<string, Heap<TimeTicket, JSONElement>>;
  private nodeMapByCreatedAt: Map<string, RHTPQMapNode>;

  constructor() {
    this.elementQueueMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  public static create(): RHTPQMap {
    return new RHTPQMap();
  }

  public set(key: string, value: JSONElement): void {
    if (!this.elementQueueMapByKey.has(key)) {
      this.elementQueueMapByKey.set(key, new Heap(TicketComparator));
    }

    const node = RHTPQMapNode.of(key, value);
    this.elementQueueMapByKey.get(key).push(node);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), node);
  }

  public delete(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    if (!this.nodeMapByCreatedAt.has(createdAt.toIDString())) {
      return null;
    }

    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    node.remove(executedAt);
    return node.getValue();
  }

  public purge(element: JSONElement): void {
    const node = this.nodeMapByCreatedAt.get(
      element.getCreatedAt().toIDString(),
    );
    if (!node) {
      logger.fatal(`fail to find ${element.getCreatedAt().toIDString()}`);
    }

    const queue = this.elementQueueMapByKey.get(node.getStrKey());
    if (!queue) {
      logger.fatal(
        `fail to find queue of ${element.getCreatedAt().toIDString()}`,
      );
    }

    queue.release(node);

    this.nodeMapByCreatedAt.delete(element.getCreatedAt().toIDString());
  }

  public deleteByKey(key: string, removedAt: TimeTicket): JSONElement {
    if (!this.elementQueueMapByKey.has(key)) {
      return null;
    }

    const node = this.elementQueueMapByKey.get(key).peek() as RHTPQMapNode;
    node.remove(removedAt);
    return node.getValue();
  }

  public has(key: string): boolean {
    if (!this.elementQueueMapByKey.has(key)) {
      return false;
    }

    const node = this.elementQueueMapByKey.get(key).peek() as RHTPQMapNode;
    return !node.isRemoved();
  }

  public get(key: string): JSONElement {
    if (!this.elementQueueMapByKey.has(key)) {
      return null;
    }

    return this.elementQueueMapByKey.get(key).peek().getValue();
  }

  public *[Symbol.iterator](): IterableIterator<RHTPQMapNode> {
    for (const [, heap] of this.elementQueueMapByKey) {
      for (const node of heap) {
        yield node as RHTPQMapNode;
      }
    }
  }
}
