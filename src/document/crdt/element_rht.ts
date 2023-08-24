/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';

/**
 * `ElementRHTNode` is a node of ElementRHT.
 */
export class ElementRHTNode {
  private strKey: string;
  private value: CRDTElement;

  constructor(strKey: string, value: CRDTElement) {
    this.strKey = strKey;
    this.value = value;
  }

  /**
   * `of` creates a instance of ElementRHTNode.
   */
  public static of(strKey: string, value: CRDTElement): ElementRHTNode {
    return new ElementRHTNode(strKey, value);
  }

  /**
   * `isRemoved` checks whether this value was removed.
   */
  public isRemoved(): boolean {
    return this.value.isRemoved();
  }

  /**
   * `getStrKey` returns the key of this node.
   */
  public getStrKey(): string {
    return this.strKey;
  }

  /**
   * `getValue` return the value(element) of this node
   */
  public getValue(): CRDTElement {
    return this.value;
  }

  /**
   * `remove` removes a value base on removing time.
   */
  public remove(removedAt: TimeTicket): boolean {
    return this.value.remove(removedAt);
  }
}

/**
 * ElementRHT is a hashtable with logical clock(Replicated hashtable)
 *
 * @internal
 */
export class ElementRHT {
  private nodeMapByKey: Map<string, ElementRHTNode>;
  private nodeMapByCreatedAt: Map<string, ElementRHTNode>;

  constructor() {
    this.nodeMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  /**
   * `create` creates an instance of ElementRHT.
   */
  public static create(): ElementRHT {
    return new ElementRHT();
  }

  /**
   * `set` sets the value of the given key.
   */
  public set(key: string, value: CRDTElement): CRDTElement | undefined {
    let removed;
    const node = this.nodeMapByKey.get(key);
    if (
      node != null &&
      !node.isRemoved() &&
      node.remove(value.getCreatedAt())
    ) {
      removed = node.getValue();
    }

    const newNode = ElementRHTNode.of(key, value);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), newNode);
    if (
      node == null ||
      value.getCreatedAt().after(node.getValue().getCreatedAt())
    ) {
      this.nodeMapByKey.set(key, newNode);
    }
    return removed;
  }

  /**
   * `delete` deletes the Element of the given key.
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

    const nodeByKey = this.nodeMapByKey.get(node.getStrKey());
    if (node === nodeByKey) {
      this.nodeMapByKey.delete(nodeByKey.getStrKey());
    }

    this.nodeMapByCreatedAt.delete(node.getValue().getCreatedAt().toIDString());
  }

  /**
   * `deleteByKey` deletes the Element of the given key and removed time.
   */
  public deleteByKey(
    key: string,
    removedAt: TimeTicket,
  ): CRDTElement | undefined {
    const node = this.nodeMapByKey.get(key);
    if (node == null) {
      return;
    }

    if (!node.remove(removedAt)) {
      return;
    }

    return node.getValue();
  }

  /**
   * `has` returns whether the element exists of the given key or not.
   */
  public has(key: string): boolean {
    const node = this.nodeMapByKey.get(key);
    if (node == null) {
      return false;
    }
    return !node.isRemoved();
  }

  /**
   * `get` returns the value of the given key.
   */
  public get(key: string): CRDTElement | undefined {
    const node = this.nodeMapByKey.get(key);
    if (node == null) {
      return;
    }

    return node.getValue();
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<ElementRHTNode> {
    for (const [, node] of this.nodeMapByKey) {
      yield node;
    }
  }
}
