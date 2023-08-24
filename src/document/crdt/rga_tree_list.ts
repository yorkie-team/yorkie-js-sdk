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
import { SplayNode, SplayTree } from '@yorkie-js-sdk/src/util/splay_tree';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { Primitive } from '@yorkie-js-sdk/src/document/crdt/primitive';

/**
 * `RGATreeListNode` is a node of RGATreeList.
 */
class RGATreeListNode extends SplayNode<CRDTElement> {
  private prev?: RGATreeListNode;
  private next?: RGATreeListNode;

  constructor(value: CRDTElement) {
    super(value);
    this.value = value;
  }

  /**
   * `createAfter` creates a new node after the given node.
   */
  public static createAfter(
    prev: RGATreeListNode,
    value: CRDTElement,
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

  /**
   * `remove` removes value based on removing time.
   */
  public remove(removedAt: TimeTicket): boolean {
    return this.value.remove(removedAt);
  }

  /**
   * `getCreatedAt` returns creation time of this value
   */
  public getCreatedAt(): TimeTicket {
    return this.value.getCreatedAt();
  }

  /**
   * `getPositionedAt` returns time this element was positioned in the array.
   */
  public getPositionedAt(): TimeTicket {
    const movedAt = this.value.getMovedAt();
    if (movedAt) {
      return movedAt;
    }

    return this.value.getCreatedAt();
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
    return this.value.isRemoved() ? 0 : 1;
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
   * `getValue` returns a element value.
   */
  public getValue(): CRDTElement {
    return this.value;
  }

  /**
   * `isRemoved` checks if the value was removed.
   */
  public isRemoved(): boolean {
    return this.value.isRemoved();
  }
}

/**
 * `RGATreeList` is a replicated growable array.
 *
 * @internal
 */
export class RGATreeList {
  private dummyHead: RGATreeListNode;
  private last: RGATreeListNode;
  private nodeMapByIndex: SplayTree<CRDTElement>;
  private nodeMapByCreatedAt: Map<string, RGATreeListNode>;

  constructor() {
    const dummyValue = Primitive.of(0, InitialTimeTicket);
    dummyValue.setRemovedAt(InitialTimeTicket);
    this.dummyHead = new RGATreeListNode(dummyValue);
    this.last = this.dummyHead;
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
    return this.nodeMapByIndex.length;
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
    this.nodeMapByCreatedAt.delete(node.getValue().getCreatedAt().toIDString());
  }

  /**
   * `insertAfter` adds a new node with the value after the given node.
   */
  public insertAfter(
    prevCreatedAt: TimeTicket,
    value: CRDTElement,
    executedAt: TimeTicket = value.getCreatedAt(),
  ): void {
    const prevNode = this.findNextBeforeExecutedAt(prevCreatedAt, executedAt);
    const newNode = RGATreeListNode.createAfter(prevNode, value);
    if (prevNode === this.last) {
      this.last = newNode;
    }

    this.nodeMapByIndex.insertAfter(prevNode, newNode);
    this.nodeMapByCreatedAt.set(newNode.getCreatedAt().toIDString(), newNode);
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
      (!node!.getValue().getMovedAt() ||
        executedAt.after(node!.getValue().getMovedAt()!))
    ) {
      this.release(node!);
      this.insertAfter(prevNode!.getCreatedAt(), node!.getValue(), executedAt);
      node!.getValue().setMovedAt(executedAt);
    }
  }

  /**
   * `insert` adds the given element after the last node.
   */
  public insert(value: CRDTElement): void {
    this.insertAfter(this.last.getCreatedAt(), value);
  }

  /**
   * `get` returns the element of the given creation time.
   */
  public get(createdAt: TimeTicket): CRDTElement | undefined {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!node) {
      return;
    }

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
    return String(this.nodeMapByIndex.indexOf(node));
  }

  /**
   * `purge` physically purges element.
   */
  public purge(element: CRDTElement): void {
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
    return node.getValue().getCreatedAt();
  }

  /**
   * `delete` deletes the node of the given creation time.
   */
  public delete(createdAt: TimeTicket, editedAt: TimeTicket): CRDTElement {
    const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    const alreadyRemoved = node!.isRemoved();
    if (node!.remove(editedAt) && !alreadyRemoved) {
      this.nodeMapByIndex.splayNode(node);
    }
    return node!.getValue();
  }

  /**
   * `deleteByIndex` deletes the node of the given index.
   */
  public deleteByIndex(
    index: number,
    editedAt: TimeTicket,
  ): CRDTElement | undefined {
    const node = this.getByIndex(index);
    if (!node) {
      return;
    }

    if (node.remove(editedAt)) {
      this.nodeMapByIndex.splayNode(node);
    }
    return node.getValue();
  }

  /**
   * `getHead` returns the value of head elements.
   */
  public getHead(): CRDTElement {
    return this.dummyHead.getValue();
  }

  /**
   * `getLast` returns the value of last elements.
   */
  public getLast(): CRDTElement {
    return this.last.getValue();
  }

  /**
   * `getLastCreatedAt` returns the creation time of last element.
   */
  public getLastCreatedAt(): TimeTicket {
    return this.last.getCreatedAt();
  }

  /**
   * `toTestString` returns a String containing the meta data of the node id
   * for debugging purpose.
   */
  public toTestString(): string {
    const json = [];

    for (const node of this) {
      const elem = `${node.getCreatedAt().toIDString()}:${node
        .getValue()
        .toJSON()}`;
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
