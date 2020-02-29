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
import { InitialTimeTicket, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';
import { JSONPrimitive } from './primitive';

class RGANode {
  private value: JSONElement;
  private removed: boolean;
  private prev: RGANode;
  private next: RGANode;

  constructor(value: JSONElement) {
    this.value = value;
    this.removed = false;
    this.prev = null;
    this.next = null;
  }

  public static createAfter(prev: RGANode, value: JSONElement, isRemoved?: boolean): RGANode {
    const newNode = new RGANode(value);
    const prevNext = prev.next;
    prev.next = newNode;
    newNode.prev = prev;
    newNode.next = prevNext;
    if (prevNext) {
      prevNext.prev = newNode;
    }
    newNode.removed = !!isRemoved;

    return newNode;
  }

  public remove(): void {
    this.removed = true;
  }

  public getCreatedAt(): TimeTicket {
    return this.value.getCreatedAt();
  }

  public getNext(): RGANode {
    return this.next;
  }

  public getValue(): JSONElement {
    return this.value;
  }

  public isRemoved(): boolean {
    return this.removed;
  }
}

/**
 * RGA is replicated growable array.
 */
export class RGA {
  private first: RGANode;
  private last: RGANode;
  private size: number;
  private nodeMapByCreatedAt: Map<String, RGANode>;

  constructor() {
    const dummyHead = new RGANode(JSONPrimitive.of('', InitialTimeTicket));

    this.first = dummyHead;
    this.last = dummyHead;
    this.size = 0;
    this.nodeMapByCreatedAt = new Map();

    this.nodeMapByCreatedAt.set(dummyHead.getCreatedAt().toIDString(), dummyHead);
  }

  public static create(): RGA {
    return new RGA();
  }

  private findByCreatedAt(prevCreatedAt: TimeTicket, createdAt: TimeTicket): RGANode {
    let node = this.nodeMapByCreatedAt.get(prevCreatedAt.toIDString());
    if (!node) {
      logger.fatal(`cant find the given node: ${prevCreatedAt.toIDString()}`);
    }

    while (node.getNext() && createdAt.after(node.getNext().getCreatedAt())) {
      node = node.getNext();
    }

    return node;
  }

  public insertAfter(prevCreatedAt: TimeTicket, value: JSONElement) {
    const prevNode = this.findByCreatedAt(prevCreatedAt, value.getCreatedAt());
    const newNode = RGANode.createAfter(prevNode, value);
    if (prevNode === this.last) {
      this.last = newNode;
    }

    this.size += 1;
    this.nodeMapByCreatedAt.set(newNode.getCreatedAt().toIDString(), newNode);
  }

  public remove(createdAt: TimeTicket): JSONElement {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    node.remove();
    return node.getValue();
  }

  // TODO introduce TreeList: O(n) -> O(log n)
  public removeByIndex(index: number): JSONElement {
    let node = this.first.getNext();
    while(index > 0) {
      if (!node.isRemoved()) {
        index -= 1;
      }
      node = node.getNext();
    }

    node.remove();
    return node.getValue();
  }

  public getLastCreatedAt(): TimeTicket {
    return this.last.getCreatedAt();
  }

  public *[Symbol.iterator](): IterableIterator<RGANode> {
    let node = this.first.getNext();
    while(node) {
      yield node
      node = node.getNext();
    }
  }

  public getAnnotatedString(): string {
    const json = [];

    let node = this.first.getNext();
    while(node) {
      if (node.isRemoved()) {
        json.push(`{${node.getCreatedAt().toIDString()}:${node.getValue().toJSON()}}`);
      } else {
        json.push(`[${node.getCreatedAt().toIDString()}:${node.getValue().toJSON()}]`);
      }
      node = node.getNext();
    }

    return json.join('');
  }
}
