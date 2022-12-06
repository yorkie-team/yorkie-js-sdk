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

import { logger } from '@yorkie-js-sdk/src/util/logger';
import { HeapNode, Heap } from '@yorkie-js-sdk/src/util/heap';
import {
  TicketComparator,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';

/**
 * `RHTPQMapNode` is a node of RHTPQMap.
 */
export class RHTPQMapNode extends HeapNode<TimeTicket, CRDTElement> {
  private strKey: string;

  constructor(strKey: string, value: CRDTElement) {
    super(value.getCreatedAt(), value);
    this.strKey = strKey;
  }

  /**
   * `of` creates a instance of RHTPQMapNode.
   */
  public static of(strKey: string, value: CRDTElement): RHTPQMapNode {
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
  public remove(removedAt: TimeTicket): boolean {
    return this.getValue().remove(removedAt);
  }
}

/**
 * RHTPQMap is a replicated hash table that uses a priority queue based on
 * creation time.
 *
 * @internal
 */
export class RHTPQMap {
  private elementQueueMapByKey: Map<string, Heap<TimeTicket, CRDTElement>>;
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
  public set(key: string, value: CRDTElement): CRDTElement | undefined {
    let removed;
    const queue = this.elementQueueMapByKey.get(key);
    if (queue && queue.len()) {
      const node = queue.peek() as RHTPQMapNode;
      if (!node.isRemoved() && node.remove(value.getCreatedAt())) {
        removed = node.getValue();
      }
    }

    this.setInternal(key, value);
    return removed;
  }

  /**
   * `setInternal` sets the value of the given key.
   */
  private setInternal(key: string, value: CRDTElement): void {
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
  public delete(createdAt: TimeTicket, executedAt: TimeTicket): CRDTElement {
    if (!this.nodeMapByCreatedAt.has(createdAt.toIDString())) {
      logger.fatal(`fail to find ${createdAt.toIDString()}`);
    }

    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString())!;
    node.remove(executedAt);
    return node.getValue();
  }

  /**
   * `subPathOf` returns the sub path of the given element.
   */
  public subPathOf(createdAt: TimeTicket): string | undefined {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      return;
    }

    return node.getStrKey();
  }

  /**
   * `purge` physically purge child element.
   */
  public purge(element: CRDTElement): void {
    const node = this.nodeMapByCreatedAt.get(
      element.getCreatedAt().toIDString(),
    );
    if (!node) {
      logger.fatal(`fail to find ${element.getCreatedAt().toIDString()}`);
      return;
    }

    const queue = this.elementQueueMapByKey.get(node.getStrKey());
    if (!queue) {
      logger.fatal(`fail to find queue of ${node.getStrKey()}`);
      return;
    }

    queue.release(node);
    this.nodeMapByCreatedAt.delete(node.getValue().getCreatedAt().toIDString());
  }

  /**
   * `deleteByKey` deletes the Element of the given key and removed time.
   */
  public deleteByKey(
    key: string,
    removedAt: TimeTicket,
  ): CRDTElement | undefined {
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
  public get(key: string): CRDTElement | undefined {
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
