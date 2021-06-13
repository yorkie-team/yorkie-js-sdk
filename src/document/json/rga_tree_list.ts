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

import { Heap, HeapNode } from '../../util/heap';
import { logger } from '../../util/logger';
import { SplayNode, SplayTree } from '../../util/splay_tree';
import {
  InitialTimeTicket,
  TicketComparator,
  TimeTicket,
} from '../time/ticket';
import { JSONElement } from './element';
import { JSONPrimitive } from './primitive';

/**
 * `RGATreeListNode` is a node of RGATreeList.
 */
class RGATreeListNode extends SplayNode<Heap<TimeTicket, JSONElement>> {
  private prev?: RGATreeListNode;
  private next?: RGATreeListNode;

  constructor(value: Heap<TimeTicket, JSONElement>) {
    super(value);
    this.value = value;
  }

  /**
   * `create` creates a new instance of RGATreeListNode.
   */
  public static create(value: JSONElement) {
    const heap = new Heap<TimeTicket, JSONElement>(TicketComparator);
    heap.push(new HeapNode(value.getCreatedAt(), value));
    return new RGATreeListNode(heap);
  }

  /**
   * `createAfter` creates a new node after the previous node.
   */
  public static createAfter(
    prev: RGATreeListNode,
    value: JSONElement,
  ): RGATreeListNode {
    const newNode = RGATreeListNode.create(value);
    const prevNext = prev.next;
    prev.next = newNode;
    newNode.prev = prev;
    newNode.next = prevNext;
    if (prevNext) {
      prevNext.prev = newNode;
    }

    return newNode;
  }

  /**
   * `remove` removes value based on removing time.
   */
  public remove(removedAt: TimeTicket): boolean {
    return this.getElementValue().remove(removedAt);
  }

  /**
   * `getCreatedAt` returns creation time of this element
   */
  public getCreatedAt(): TimeTicket {
    return this.getElementValue().getCreatedAt();
  }

  /**
   * `getPositionedAt` returns time this element was positioned in the array.
   */
  public getPositionedAt(): TimeTicket {
    const movedAt = this.getElementValue().getMovedAt();
    if (movedAt) {
      return movedAt;
    }

    return this.getElementValue().getCreatedAt();
  }

  /**
   * `release` releases prev and next node.
   */
  public release(): void {
    if (this.prev) {
      this.prev.next = this.next;
    }
    if (this.next) {
      this.next.prev = this.prev;
    }
    this.prev = undefined;
    this.next = undefined;
  }

  /**
   * `getLength` returns the length of this node.
   */
  public getLength(): number {
    return this.getElementValue().isRemoved() ? 0 : 1;
  }

  /**
   * `getPrev` returns a previous node.
   */
  public getPrev(): RGATreeListNode | undefined {
    return this.prev;
  }

  /**
   * `getNext` returns a next node.
   */
  public getNext(): RGATreeListNode | undefined {
    return this.next;
  }

  /**
   * `getValue` returns a heap with elements.
   */
  public getValue(): Heap<TimeTicket, JSONElement> {
    return this.value;
  }

  /**
   * `getElementValue` returns a element.
   */
  public getElementValue(): JSONElement {
    return this.value.peek()!.getValue();
  }

  /**
   * `setValue` sets a element value into heap.
   */
  public setValue(value: JSONElement) {
    this.value.push(new HeapNode(value.getCreatedAt(), value));
  }

  /**
   * `isRemoved` checks if the value was removed.
   */
  public isRemoved(): boolean {
    return this.getElementValue().isRemoved();
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<JSONElement> {
    for (const node of this.getValue()) {
      yield node.getValue();
    }
  }
}

/**
 * `RGATreeList` is replicated growable array.
 */
export class RGATreeList {
  private dummyHead: RGATreeListNode;
  private last: RGATreeListNode;
  private size: number;
  private nodeMapByIndex: SplayTree<Heap<TimeTicket, JSONElement>>;
  private nodeMapByCreatedAt: Map<string, RGATreeListNode>;

  constructor() {
    const dummyValue = JSONPrimitive.of(0, InitialTimeTicket);
    dummyValue.remove(InitialTimeTicket);
    this.dummyHead = RGATreeListNode.create(dummyValue);
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

  /**
   * `create` creates instance of RGATreeList.
   */
  public static create(): RGATreeList {
    return new RGATreeList();
  }

  /**
   * `length` returns size of RGATreeList.
   */
  public get length(): number {
    return this.size;
  }

  /**
   * `findNextBeforeExecutedAt` returns the node by the given createdAt and
   * executedAt. It passes through nodes created after executedAt from the
   * given node and returns the next node.
   * @param createdAt - created time
   * @param executedAt - executed time
   * @returns next node
   */
  private findNextBeforeExecutedAt(
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): RGATreeListNode {
    let node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      logger.fatal(`cant find the given node: ${createdAt.toIDString()}`);
    }

    while (
      node!.getNext() &&
      node!.getNext()!.getPositionedAt().after(executedAt)
    ) {
      node = node!.getNext();
    }

    return node!;
  }

  private release(node: RGATreeListNode): void {
    if (this.last === node) {
      this.last = node.getPrev()!;
    }

    node.release();
    this.nodeMapByIndex.delete(node);

    for (const value of node) {
      this.nodeMapByCreatedAt.delete(value.getCreatedAt().toIDString());
    }

    if (!node.isRemoved()) {
      this.size -= 1;
    }
  }

  /**
   * `insertAfter` adds next element of previously created node.
   */
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

  /**
   * `moveAfter` moves the given `createdAt` element
   * after the `prevCreatedAt` element.
   */
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
      prevNode !== node &&
      (!node!.getElementValue().getMovedAt() ||
        executedAt.after(node!.getElementValue().getMovedAt()!))
    ) {
      this.release(node!);
      this.insertAfter(
        prevNode!.getCreatedAt(),
        node!.getElementValue(),
        executedAt,
      );
      node!.getElementValue().setMovedAt(executedAt);
    }
  }

  /**
   * `insert` adds the given element after  the last creation time.
   */
  public insert(value: JSONElement): void {
    this.insertAfter(this.last.getCreatedAt(), value);
  }

  /**
   * `get` returns the element of the given index.
   */
  public get(createdAt: TimeTicket): JSONElement | undefined {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      return;
    }

    return node.getElementValue();
  }

  /**
   * `set` sets the given element.
   */
  public set(key: string, value: JSONElement): void {
    const index = Number(key);
    const rgaNode = this.getByIndex(index);

    if (!rgaNode) {
      return;
    }

    rgaNode.setValue(value);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), rgaNode);
  }

  /**
   * `keyOf` key based on the creation time of the node.
   */
  public keyOf(createdAt: TimeTicket): string | undefined {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      return;
    }
    return String(this.nodeMapByIndex.indexOf(node));
  }

  /**
   * `purge` physically purges child element.
   */
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
    this.release(node!);
  }

  /**
   * `getByIndex` returns node of the given index.
   */
  public getByIndex(idx: number): RGATreeListNode | undefined {
    if (idx >= this.length) {
      return;
    }

    const [node, offset] = this.nodeMapByIndex.find(idx);
    let rgaNode = node as RGATreeListNode | undefined;

    if ((idx === 0 && node === this.dummyHead) || offset > 0) {
      do {
        if (rgaNode) {
          rgaNode = rgaNode.getNext();
        }
      } while (rgaNode && rgaNode.isRemoved());
    }

    return rgaNode;
  }

  /**
   * `getPrevCreatedAt` returns a creation time of the previous node.
   */
  public getPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    let node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    do {
      node = node!.getPrev()!;
    } while (this.dummyHead !== node && node.isRemoved());
    return node.getElementValue().getCreatedAt();
  }

  /**
   * `delete` deletes the node of the given creation time.
   */
  public delete(createdAt: TimeTicket, editedAt: TimeTicket): JSONElement {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (node!.remove(editedAt)) {
      this.nodeMapByIndex.splayNode(node!);
      this.size -= 1;
    }
    return node!.getElementValue();
  }

  /**
   * `deleteByIndex` deletes the node of the given index.
   */
  public deleteByIndex(
    index: number,
    editedAt: TimeTicket,
  ): JSONElement | undefined {
    const node = this.getByIndex(index);
    if (!node) {
      return;
    }

    if (node.remove(editedAt)) {
      this.nodeMapByIndex.splayNode(node);
      this.size -= 1;
    }
    return node.getElementValue();
  }

  /**
   * `getHead` returns the value of head elements.
   */
  public getHead(): JSONElement {
    return this.dummyHead.getElementValue();
  }

  /**
   * `getLast` returns the value of last elements.
   */
  public getLast(): JSONElement {
    return this.last.getElementValue();
  }

  /**
   * `getLastCreatedAt` returns the creation time of last elements.
   */
  public getLastCreatedAt(): TimeTicket {
    return this.last.getCreatedAt();
  }

  /**
   * `getAnnotatedString` returns a String containing the meta data of the node id
   * for debugging purpose.
   */
  public getAnnotatedString(): string {
    const json = [];

    for (const node of this) {
      const elem = `${node
        .getCreatedAt()
        .toIDString()}:${node.getElementValue().toJSON()}`;
      if (node.isRemoved()) {
        json.push(`{${elem}}`);
      } else {
        json.push(`[${elem}]`);
      }
    }

    return json.join('');
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<RGATreeListNode> {
    let node = this.dummyHead.getNext();
    while (node) {
      yield node;
      node = node.getNext();
    }
  }
}
