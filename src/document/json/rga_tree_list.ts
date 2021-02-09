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
import { SplayNode, SplayTree } from '../../util/splay_tree';
import { InitialTimeTicket, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';
import { JSONPrimitive } from './primitive';

class RGATreeListNode extends SplayNode<JSONElement> {
  private prev: RGATreeListNode;
  private next: RGATreeListNode;

  constructor(value: JSONElement) {
    super(value);
    this.value = value;
    this.prev = null;
    this.next = null;
  }

  public static createAfter(
    prev: RGATreeListNode,
    value: JSONElement,
  ): RGATreeListNode {
    const newNode = new RGATreeListNode(value);
    const prevNext = prev.next;
    prev.next = newNode;
    newNode.prev = prev;
    newNode.next = prevNext;
    if (prevNext) {
      prevNext.prev = newNode;
    }

    return newNode;
  }

  public remove(removedAt: TimeTicket): boolean {
    return this.value.remove(removedAt);
  }

  public getCreatedAt(): TimeTicket {
    return this.value.getCreatedAt();
  }

  public release(): void {
    this.prev.next = this.next;
    if (this.next) {
      this.next.prev = this.prev;
    }
    this.prev = null;
    this.next = null;
  }

  public getLength(): number {
    return this.value.isRemoved() ? 0 : 1;
  }

  public getPrev(): RGATreeListNode {
    return this.prev;
  }

  public getNext(): RGATreeListNode {
    return this.next;
  }

  public getValue(): JSONElement {
    return this.value;
  }

  public isRemoved(): boolean {
    return this.value.isRemoved();
  }
}

/**
 * RGATreeList is replicated growable array.
 */
export class RGATreeList {
  private dummyHead: RGATreeListNode;
  private last: RGATreeListNode;
  private size: number;
  private nodeMapByIndex: SplayTree<JSONElement>;
  private nodeMapByCreatedAt: Map<string, RGATreeListNode>;

  constructor() {
    const dummyValue = JSONPrimitive.of(0, InitialTimeTicket);
    dummyValue.remove(InitialTimeTicket);
    this.dummyHead = new RGATreeListNode(dummyValue);
    this.last = this.dummyHead;
    this.size = 0;
    this.nodeMapByIndex = new SplayTree();
    this.nodeMapByCreatedAt = new Map();

    this.nodeMapByIndex.insert(this.dummyHead);
    this.nodeMapByCreatedAt.set(
      this.dummyHead.getCreatedAt().toIDString(),
      this.dummyHead,
    );
  }

  public static create(): RGATreeList {
    return new RGATreeList();
  }

  public get length(): number {
    return this.size;
  }

  /**
   * findNextBeforeExecutedAt returns the node by the given createdAt and
   * executedAt. It passes through nodes created after executedAt from the
   * given node and returns the next node.
   */
  private findNextBeforeExecutedAt(
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): RGATreeListNode {
    let node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      logger.fatal(`cant find the given node: ${createdAt.toIDString()}`);
    }

    while (node.getNext() && node.getNext().getCreatedAt().after(executedAt)) {
      node = node.getNext();
    }

    return node;
  }

  private release(node: RGATreeListNode): void {
    if (this.last == node) {
      this.last = node.getPrev();
    }

    node.release();
    this.nodeMapByIndex.delete(node);
    this.nodeMapByCreatedAt.delete(node.getValue().getCreatedAt().toIDString());

    if (!node.isRemoved()) {
      this.size -= 1;
    }
  }

  public insertAfter(
    prevCreatedAt: TimeTicket,
    value: JSONElement,
    executedAt: TimeTicket = value.getCreatedAt(),
  ): void {
    const prevNode = this.findNextBeforeExecutedAt(prevCreatedAt, executedAt);
    const newNode = RGATreeListNode.createAfter(prevNode, value);
    if (prevNode === this.last) {
      this.last = newNode;
    }

    this.nodeMapByIndex.insertAfter(prevNode, newNode);
    this.nodeMapByCreatedAt.set(newNode.getCreatedAt().toIDString(), newNode);

    this.size += 1;
  }

  public moveAfter(
    prevCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): void {
    const prevNode = this.nodeMapByCreatedAt.get(prevCreatedAt.toIDString());
    if (!prevNode) {
      logger.fatal(`cant find the given node: ${prevCreatedAt.toIDString()}`);
    }

    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      logger.fatal(`cant find the given node: ${createdAt.toIDString()}`);
    }

    if (
      !node.getValue().getMovedAt() ||
      executedAt.after(node.getValue().getMovedAt())
    ) {
      node.release();
      this.insertAfter(prevNode.getCreatedAt(), node.getValue(), executedAt);
      node.getValue().setMovedAt(executedAt);
    }
  }

  public insert(value: JSONElement): void {
    this.insertAfter(this.last.getCreatedAt(), value);
  }

  public get(createdAt: TimeTicket): JSONElement {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    return node.getValue();
  }

  public purge(element: JSONElement): void {
    const node = this.nodeMapByCreatedAt.get(
      element.getCreatedAt().toIDString(),
    );
    if (!node) {
      logger.fatal(
        `fail to find the given createdAt: ${element
          .getCreatedAt()
          .toIDString()}`,
      );
    }
    this.release(node);
  }

  public getByIndex(idx: number): RGATreeListNode {
    const [node, offset] = this.nodeMapByIndex.find(idx);
    let rgaNode = node as RGATreeListNode;

    if (idx === 0 && node === this.dummyHead) {
      do {
        rgaNode = rgaNode.getNext();
      } while (rgaNode.isRemoved());
    } else if (offset > 0) {
      do {
        rgaNode = rgaNode.getNext();
      } while (rgaNode.isRemoved());
    }

    return rgaNode;
  }

  public getPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    let node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    do {
      node = node.getPrev();
    } while (this.dummyHead !== node && node.isRemoved());
    return node.getValue().getCreatedAt();
  }

  public delete(createdAt: TimeTicket, editedAt: TimeTicket): JSONElement {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (node.remove(editedAt)) {
      this.nodeMapByIndex.splayNode(node);
      this.size -= 1;
    }
    return node.getValue();
  }

  public deleteByIndex(index: number, editedAt: TimeTicket): JSONElement {
    const node = this.getByIndex(index);
    if (node.remove(editedAt)) {
      this.nodeMapByIndex.splayNode(node);
      this.size -= 1;
    }
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
      const elem = `${node
        .getCreatedAt()
        .toIDString()}:${node.getValue().toJSON()}`;
      if (node.isRemoved()) {
        json.push(`{${elem}}`);
      } else {
        json.push(`[${elem}]`);
      }
    }

    return json.join('');
  }

  public *[Symbol.iterator](): IterableIterator<RGATreeListNode> {
    let node = this.dummyHead.getNext();
    while (node) {
      yield node;
      node = node.getNext();
    }
  }
}
