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

/**
 * `RHTPQMapNode` is a node of RHTPQMap.
 */
export class RHTPQMapNode extends HeapNode<TimeTicket, JSONElement> {
  private strKey: string;

  constructor(strKey: string, value: JSONElement) {
    super(value.getCreatedAt(), value);
    this.strKey = strKey;
  }

  /**
   * `of` creates a instance of RHTPQMapNode.
   */
  public static of(strKey: string, value: JSONElement): RHTPQMapNode {
    return new RHTPQMapNode(strKey, value);
  }

  /**
   * `isRemoved` checks whether this value was removed.
   */
  public isRemoved(): boolean {
    return this.getValue().isRemoved();
  }

  /**
   * `getStrKey` returns the key of this node.
   */
  public getStrKey(): string {
    return this.strKey;
  }

  /**
   * `remove` removes a value base on removing time.
   */
  public remove(removedAt: TimeTicket): void {
    this.getValue().remove(removedAt);
  }
}

/**
 * RHTPQMap is replicated hash table with priority queue by creation time.
 */
export class RHTPQMap {
  private elementQueueMapByKey: Map<string, Heap<TimeTicket, JSONElement>>;
  private nodeMapByCreatedAt: Map<string, RHTPQMapNode>;

  constructor() {
    this.elementQueueMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  /**
   * `create` creates a instance of RHTPQMap.
   */
  public static create(): RHTPQMap {
    return new RHTPQMap();
  }

  /**
   * `set` sets the value of the given key.
   */
  public set(key: string, value: JSONElement): void {
    if (!this.elementQueueMapByKey.has(key)) {
      this.elementQueueMapByKey.set(key, new Heap(TicketComparator));
    }

    const node = RHTPQMapNode.of(key, value);
    this.elementQueueMapByKey.get(key)!.push(node);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), node);
  }

  /**
   * `delete` deletes deletes the Element of the given key.
   */
  public delete(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    if (!this.nodeMapByCreatedAt.has(createdAt.toIDString())) {
      logger.fatal(`fail to find ${createdAt.toIDString()}`);
    }

    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString())!;
    node.remove(executedAt);
    return node.getValue();
  }

  /**
   * `keyOf` returns a key of node based on creation time
   */
  public keyOf(createdAt: TimeTicket): string | undefined {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      return;
    }

    return node.getStrKey();
  }

  /**
   * `purge` physically purge child element.
   */
  public purge(element: JSONElement): void {
    const current = this.nodeMapByCreatedAt.get(
      element.getCreatedAt().toIDString(),
    );
    if (!current) {
      logger.fatal(`fail to find ${element.getCreatedAt().toIDString()}`);
      return;
    }

    const queue = this.elementQueueMapByKey.get(current.getStrKey());
    if (!queue) {
      logger.fatal(
        `fail to find queue of ${element.getCreatedAt().toIDString()}`,
      );
      return;
    }

    // Removes nodes previously inserted into the heap.
    const nodesToRelease = [];
    for (const node of queue) {
      if (node.getValue().getCreatedAt().after(element.getCreatedAt())) {
        continue;
      }
      nodesToRelease.push(node);
    }

    for (const node of nodesToRelease) {
      queue.release(node);
      this.nodeMapByCreatedAt.delete(node.getValue().getCreatedAt().toIDString());
    }
  }

  /**
   * `deleteByKey` deletes the Element of the given key and removed time.
   */
  public deleteByKey(
    key: string,
    removedAt: TimeTicket,
  ): JSONElement | undefined {
    if (!this.elementQueueMapByKey.has(key)) {
      return;
    }

    const node = this.elementQueueMapByKey.get(key)!.peek() as RHTPQMapNode;
    node.remove(removedAt);
    return node.getValue();
  }

  /**
   * `has` returns whether the element exists of the given key or not.
   */
  public has(key: string): boolean {
    if (!this.elementQueueMapByKey.has(key)) {
      return false;
    }

    const node = this.elementQueueMapByKey.get(key)!.peek() as RHTPQMapNode;
    return !node.isRemoved();
  }

  /**
   * `get` returns the value of the given key.
   */
  public get(key: string): JSONElement | undefined {
    if (!this.elementQueueMapByKey.has(key)) {
      return;
    }

    return this.elementQueueMapByKey!.get(key)!.peek()!.getValue();
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<RHTPQMapNode> {
    for (const [, heap] of this.elementQueueMapByKey) {
      for (const node of heap) {
        yield node as RHTPQMapNode;
      }
    }
  }
}
