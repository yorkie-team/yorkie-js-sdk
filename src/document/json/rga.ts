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
  private prev: RGANode;
  private next: RGANode;

  constructor(value: JSONElement) {
    this.value = value;
    this.prev = null;
    this.next = null;
  }

  public static createAfter(prev: RGANode, value: JSONElement): RGANode {
    const newNode = new RGANode(value);
    const prevNext = prev.next;
    prev.next = newNode;
    newNode.prev = prev;
    newNode.next = prevNext;
    if (prevNext) {
      prevNext.prev = newNode;
    }

    return newNode;
  }

  public remove(deletedAt: TimeTicket): void {
    this.value.delete(deletedAt);
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
    return this.value.isDeleted();
  }
}

/**
 * RGA is replicated growable array.
 */
export class RGA {
  private first: RGANode;
  private last: RGANode;
  private size: number;
  private nodeMapByCreatedAt: Map<string, RGANode>;

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

  public get length(): number {
    return this.size; 
  }

  private findByCreatedAt(prevCreatedAt: TimeTicket, createdAt: TimeTicket): RGANode {
    let node = this.nodeMapByCreatedAt.get(prevCreatedAt.toIDString());
    if (!node) {
      logger.fatal(`cant find the given node: ${prevCreatedAt.toIDString()}`);
    }

    while (node.getNext() && node.getNext().getCreatedAt().after(createdAt)) {
      node = node.getNext();
    }

    return node;
  }

  public insertAfter(prevCreatedAt: TimeTicket, value: JSONElement): void {
    const prevNode = this.findByCreatedAt(prevCreatedAt, value.getCreatedAt());
    const newNode = RGANode.createAfter(prevNode, value);
    if (prevNode === this.last) {
      this.last = newNode;
    }

    this.size += 1;
    this.nodeMapByCreatedAt.set(newNode.getCreatedAt().toIDString(), newNode);
  }

  public insert(value: JSONElement): void {
    this.insertAfter(this.last.getCreatedAt(), value);
  }

  public get(createdAt: TimeTicket): JSONElement {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    return node.getValue();
  }

  public getByIndex(index: number): JSONElement {
    let idx = 0;
    for (const node of this) {
      if (!node.isRemoved()) {
        if (idx++ === index) {
          return node.getValue();
        }
      }
    }

    throw new Error('out of bound');
  }

  public remove(createdAt: TimeTicket, editedAt: TimeTicket): JSONElement {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    node.remove(editedAt);
    this.size -= 1;
    return node.getValue();
  }

  // TODO introduce TreeList: O(n) -> O(log n)
  public removeByIndex(index: number, editedAt: TimeTicket): JSONElement {
    let node = this.first.getNext();
    while(index > 0) {
      if (!node.isRemoved()) {
        index -= 1;
      }
      node = node.getNext();
    }

    node.remove(editedAt);
    this.size -= 1;
    return node.getValue();
  }

  public getLast(): JSONElement {
    return this.last.getValue();
  }

  public getLastCreatedAt(): TimeTicket {
    return this.last.getCreatedAt();
  }

  public getAnnotatedString(): string {
    const json = [];

    for (const node of this) {
      const elem = `${node.getCreatedAt().toIDString()}:${node.getValue().toJSON()}`;
      if (node.isRemoved()) {
        json.push(`{${elem}}`);
      } else {
        json.push(`[${elem}]`);
      }
    }

    return json.join('');
  }

  public *[Symbol.iterator](): IterableIterator<RGANode> {
    let node = this.first.getNext();
    while(node) {
      yield node;
      node = node.getNext();
    }
  }
}
