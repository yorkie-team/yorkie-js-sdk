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

import { SplayNode, SplayTree } from '@yorkie-js/sdk/src/util/splay_tree';
import {
  InitialTimeTicket,
  TimeTicket,
  TimeTicketSize,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import { GCChild, GCParent } from '@yorkie-js/sdk/src/document/crdt/gc';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { DataSize } from '@yorkie-js/sdk/src/util/resource';

/**
 * `ElementEntry` is the stable identity of an element in the RGATreeList.
 * It holds the element value and tracks which position node currently owns
 * it.
 */
export class ElementEntry {
  public elem: CRDTElement;
  public positionNode!: RGATreeListNode;
  public posMovedAt?: TimeTicket;

  constructor(elem: CRDTElement) {
    this.elem = elem;
  }
}

/**
 * `RGATreeListNode` is a position slot in the RGA linked list.
 * When `elementEntry` is undefined, it is a dead slot abandoned by a move.
 */
export class RGATreeListNode
  extends SplayNode<CRDTElement | undefined>
  implements GCChild
{
  private _elementEntry?: ElementEntry;
  private _createdAt: TimeTicket;
  private _removedAt?: TimeTicket;

  private prev?: RGATreeListNode;
  private next?: RGATreeListNode;

  constructor(elem: CRDTElement | undefined, createdAt: TimeTicket) {
    // SplayNode requires a value; we pass undefined for bare position
    // nodes. getLength() controls splay weight.
    super(elem);
    this._createdAt = createdAt;
  }

  /**
   * `createWithElement` creates a new node that owns an element.
   */
  public static createWithElement(elem: CRDTElement): RGATreeListNode {
    const entry = new ElementEntry(elem);
    const node = new RGATreeListNode(elem, elem.getCreatedAt());
    entry.positionNode = node;
    node._elementEntry = entry;
    return node;
  }

  /**
   * `createBarePosition` creates a position node without an element
   * (used for move).
   */
  public static createBarePosition(createdAt: TimeTicket): RGATreeListNode {
    return new RGATreeListNode(undefined, createdAt);
  }

  /**
   * `createAfter` creates a new node with the given element after
   * the given prev node.
   */
  public static createAfter(
    prev: RGATreeListNode,
    elem: CRDTElement,
  ): RGATreeListNode {
    const newNode = RGATreeListNode.createWithElement(elem);
    RGATreeListNode.insertNodeAfter(prev, newNode);
    return newNode;
  }

  /**
   * `insertNodeAfter` inserts a node after the given prev node.
   */
  public static insertNodeAfter(
    prev: RGATreeListNode,
    newNode: RGATreeListNode,
  ): void {
    const prevNext = prev.next;
    prev.next = newNode;
    newNode.prev = prev;
    newNode.next = prevNext;
    if (prevNext) {
      prevNext.prev = newNode;
    }
  }

  /**
   * `remove` removes the element based on removing time.
   */
  public remove(removedAt: TimeTicket): boolean {
    if (!this._elementEntry) {
      return false;
    }
    return this._elementEntry.elem.remove(removedAt);
  }

  /**
   * `getCreatedAt` returns the creation time. For live nodes with
   * elements, returns the element's createdAt for backward
   * compatibility.
   */
  public getCreatedAt(): TimeTicket {
    if (this._elementEntry) {
      return this._elementEntry.elem.getCreatedAt();
    }
    return this._createdAt;
  }

  /**
   * `getPositionedAt` returns the time this element was positioned.
   * For live nodes, the position register (posMovedAt) is the source
   * of truth. For dead nodes (no element), the position node's own
   * createdAt is used.
   */
  public getPositionedAt(): TimeTicket {
    if (this._elementEntry) {
      if (this._elementEntry.posMovedAt) {
        return this._elementEntry.posMovedAt;
      }
      return this._elementEntry.elem.getCreatedAt();
    }
    return this._createdAt;
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
   * Dead nodes (no element) return 0, removed elements return 0.
   */
  public getLength(): number {
    if (!this._elementEntry || this.isRemoved()) {
      return 0;
    }
    return 1;
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
   * `getValue` returns the element value.
   */
  public getValue(): CRDTElement {
    if (!this._elementEntry) {
      // Should not be called on dead position nodes in normal usage.
      // Return the super value for compatibility.
      return this.value as CRDTElement;
    }
    return this._elementEntry.elem;
  }

  /**
   * `getElement` returns the element or undefined if dead position.
   */
  public getElement(): CRDTElement | undefined {
    return this._elementEntry?.elem;
  }

  /**
   * `isRemoved` checks if the value was removed.
   */
  public isRemoved(): boolean {
    if (!this._elementEntry) {
      return true;
    }
    return this._elementEntry.elem.isRemoved();
  }

  /**
   * `getElementEntry` returns the element entry.
   */
  public getElementEntry(): ElementEntry | undefined {
    return this._elementEntry;
  }

  /**
   * `setElementEntry` sets the element entry.
   */
  public setElementEntry(entry: ElementEntry | undefined): void {
    this._elementEntry = entry;
  }

  /**
   * `getPositionCreatedAt` returns the position node's own createdAt.
   */
  public getPositionCreatedAt(): TimeTicket {
    return this._createdAt;
  }

  /**
   * `getPositionMovedAt` returns the LWW timestamp of the element's
   * move into this position. Undefined for insert-created positions.
   */
  public getPositionMovedAt(): TimeTicket | undefined {
    if (!this._elementEntry) {
      return undefined;
    }
    return this._elementEntry.posMovedAt;
  }

  /**
   * `getRemovedAt` returns the time this dead position node was
   * removed (for GC).
   */
  public getRemovedAt(): TimeTicket | undefined {
    return this._removedAt;
  }

  /**
   * `setRemovedAt` sets the removal time of this position node.
   */
  public setRemovedAt(removedAt: TimeTicket): void {
    this._removedAt = removedAt;
  }

  /**
   * `toIDString` returns a unique identifier for this position node
   * (for GC).
   */
  public toIDString(): string {
    return this._createdAt.toIDString();
  }

  /**
   * `getDataSize` returns the data size of this position node
   * (for GC).
   */
  public getDataSize(): DataSize {
    let meta = TimeTicketSize;
    if (this._removedAt) {
      meta += TimeTicketSize;
    }
    return { data: 0, meta };
  }
}

/**
 * `RGATreeList` is a replicated growable array with LWW position
 * register semantics for moves.
 */
export class RGATreeList implements GCParent {
  private dummyHead: RGATreeListNode;
  private last: RGATreeListNode;
  private nodeMapByIndex: SplayTree<CRDTElement | undefined>;
  private nodeMapByCreatedAt: Map<string, RGATreeListNode>;
  private elementMapByCreatedAt: Map<string, ElementEntry>;

  constructor() {
    const dummyValue = Primitive.of(0, InitialTimeTicket);
    dummyValue.setRemovedAt(InitialTimeTicket);
    this.dummyHead = RGATreeListNode.createWithElement(dummyValue);
    this.last = this.dummyHead;
    this.nodeMapByIndex = new SplayTree();
    this.nodeMapByCreatedAt = new Map();
    this.elementMapByCreatedAt = new Map();

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
   * `findNextBeforeExecutedAt` walks forward from the given node,
   * skipping nodes positioned after executedAt (RGA insertion rule).
   */
  private findNextBeforeExecutedAt(
    node: RGATreeListNode,
    executedAt: TimeTicket,
  ): RGATreeListNode {
    while (
      node.getNext() &&
      node.getNext()!.getPositionedAt().after(executedAt)
    ) {
      node = node.getNext()!;
    }
    return node;
  }

  private release(node: RGATreeListNode): void {
    if (this.last === node) {
      this.last = node.getPrev()!;
    }

    node.release();
    this.nodeMapByIndex.delete(node);
    this.nodeMapByCreatedAt.delete(node.getPositionCreatedAt().toIDString());
  }

  /**
   * `insertAfter` adds a new node with the value after the given
   * position. prevCreatedAt is a position node identity. Looks up
   * nodeMapByCreatedAt first, then elementMapByCreatedAt for backward
   * compatibility.
   */
  public insertAfter(
    prevCreatedAt: TimeTicket,
    value: CRDTElement,
    executedAt: TimeTicket = value.getCreatedAt(),
  ): RGATreeListNode {
    let startNode = this.nodeMapByCreatedAt.get(prevCreatedAt.toIDString());
    if (!startNode) {
      const entry = this.elementMapByCreatedAt.get(prevCreatedAt.toIDString());
      if (entry) {
        startNode = entry.positionNode;
      }
    }
    if (!startNode) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${prevCreatedAt.toIDString()}`,
      );
    }

    const prevNode = this.findNextBeforeExecutedAt(startNode, executedAt);
    const newNode = RGATreeListNode.createAfter(prevNode, value);
    if (prevNode === this.last) {
      this.last = newNode;
    }

    this.nodeMapByIndex.insertAfter(prevNode, newNode);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), newNode);
    this.elementMapByCreatedAt.set(
      value.getCreatedAt().toIDString(),
      newNode.getElementEntry()!,
    );
    return newNode;
  }

  /**
   * `insertPositionAfter` creates a bare position node after
   * resolving position via forward skip (RGA insertion rule).
   * Used by moveAfter. prevCreatedAt is a POSITION node identity.
   */
  private insertPositionAfter(
    prevCreatedAt: TimeTicket,
    executedAt: TimeTicket,
  ): RGATreeListNode {
    const startNode = this.nodeMapByCreatedAt.get(prevCreatedAt.toIDString());
    if (!startNode) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${prevCreatedAt.toIDString()}`,
      );
    }

    const prevNode = this.findNextBeforeExecutedAt(startNode, executedAt);

    const newNode = RGATreeListNode.createBarePosition(executedAt);
    RGATreeListNode.insertNodeAfter(prevNode, newNode);
    if (prevNode === this.last) {
      this.last = newNode;
    }

    this.nodeMapByIndex.insertAfter(prevNode, newNode);
    this.nodeMapByCreatedAt.set(executedAt.toIDString(), newNode);
    return newNode;
  }

  /**
   * `moveAfter` moves the given `createdAt` element after the
   * `prevCreatedAt` element using LWW position register semantics.
   * Returns the dead position node (if any) for GC registration.
   */
  public moveAfter(
    prevCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): RGATreeListNode | undefined {
    if (!this.nodeMapByCreatedAt.has(prevCreatedAt.toIDString())) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${prevCreatedAt.toIDString()}`,
      );
    }

    const entry = this.elementMapByCreatedAt.get(createdAt.toIDString());
    if (!entry) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${createdAt.toIDString()}`,
      );
    }

    // LWW check: if a newer move already won, this move is
    // discarded. But we still create the position node so that
    // operations referencing this move's position can find it.
    if (entry.posMovedAt && !executedAt.after(entry.posMovedAt)) {
      if (this.nodeMapByCreatedAt.has(executedAt.toIDString())) {
        return undefined;
      }

      const deadPosNode = this.insertPositionAfter(prevCreatedAt, executedAt);
      deadPosNode.setRemovedAt(executedAt);
      this.nodeMapByIndex.splayNode(deadPosNode);
      return deadPosNode;
    }

    // Create a new position node after the target position.
    const newPosNode = this.insertPositionAfter(prevCreatedAt, executedAt);

    // Mark old position as dead.
    const oldPosNode = entry.positionNode;
    oldPosNode.setElementEntry(undefined);
    oldPosNode.setRemovedAt(executedAt);
    this.nodeMapByIndex.splayNode(oldPosNode);

    // Attach element to new position.
    newPosNode.setElementEntry(entry);
    entry.positionNode = newPosNode;
    entry.posMovedAt = executedAt;
    entry.elem.setMovedAt(executedAt);

    this.nodeMapByIndex.splayNode(newPosNode);

    return oldPosNode;
  }

  /**
   * `insert` adds the given element after the last node.
   */
  public insert(value: CRDTElement): void {
    this.insertAfter(this.last.getCreatedAt(), value);
  }

  /**
   * `getByID` returns the node of the given creation time.
   * Checks elementMapByCreatedAt first (for moved elements whose
   * position node createdAt differs), then nodeMapByCreatedAt.
   */
  public getByID(createdAt: TimeTicket): RGATreeListNode | undefined {
    const entry = this.elementMapByCreatedAt.get(createdAt.toIDString());
    if (entry) {
      return entry.positionNode;
    }
    return this.nodeMapByCreatedAt.get(createdAt.toIDString());
  }

  /**
   * `subPathOf` returns the sub path of the given element.
   */
  public subPathOf(createdAt: TimeTicket): string | undefined {
    const entry = this.elementMapByCreatedAt.get(createdAt.toIDString());
    if (!entry) {
      // Fall back to nodeMapByCreatedAt for position node lookup.
      const node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
      if (!node) {
        return;
      }
      return String(this.nodeMapByIndex.indexOf(node));
    }
    return String(this.nodeMapByIndex.indexOf(entry.positionNode));
  }

  /**
   * `purge` physically purges the given child. Handles both dead
   * position nodes (GCChild from GCParent path) and CRDTElements
   * (from CRDTContainer path).
   */
  public purge(child: GCChild | CRDTElement): void {
    if (child instanceof RGATreeListNode) {
      // GC of a dead position node.
      this.release(child);
      return;
    }

    // GC of an element.
    const element = child as CRDTElement;
    const entry = this.elementMapByCreatedAt.get(
      element.getCreatedAt().toIDString(),
    );
    if (!entry) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to find the given createdAt: ${element
          .getCreatedAt()
          .toIDString()}`,
      );
    }

    const node = entry.positionNode;
    this.elementMapByCreatedAt.delete(element.getCreatedAt().toIDString());
    this.release(node);
  }

  /**
   * `getByIndex` returns node of the given index.
   */
  public getByIndex(idx: number): RGATreeListNode | undefined {
    if (idx >= this.length) {
      return;
    }

    const node = this.nodeMapByIndex.findForArray(idx);
    return node as RGATreeListNode | undefined;
  }

  /**
   * `findPrevCreatedAt` returns the position node's createdAt of the
   * previous element. This returns a position identity suitable for
   * use as prevCreatedAt in moveAfter.
   */
  public findPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    const entry = this.elementMapByCreatedAt.get(createdAt.toIDString());
    if (!entry) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${createdAt.toIDString()}`,
      );
    }

    let node: RGATreeListNode = entry.positionNode;
    do {
      node = node.getPrev()!;
      // Skip dead position nodes (no element).
      if (!node.getElementEntry()) {
        continue;
      }
      if (this.dummyHead === node || !node.isRemoved()) {
        break;
      }
    } while (node);

    // Return position node's createdAt (stable identity).
    return node.getPositionCreatedAt();
  }

  /**
   * `getPrevCreatedAt` returns a creation time of the previous node.
   * This is the legacy API that returns element identity. For move
   * operations, use findPrevCreatedAt.
   */
  public getPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    const entry = this.elementMapByCreatedAt.get(createdAt.toIDString());
    if (entry) {
      return this.findPrevCreatedAt(createdAt);
    }

    // Fall back to nodeMapByCreatedAt for backward compatibility.
    let node = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    do {
      node = node!.getPrev()!;
    } while (this.dummyHead !== node && node.isRemoved());
    return node.getPositionCreatedAt();
  }

  /**
   * `delete` deletes the node of the given creation time.
   */
  public delete(createdAt: TimeTicket, editedAt: TimeTicket): CRDTElement {
    const entry = this.elementMapByCreatedAt.get(createdAt.toIDString());
    if (!entry) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${createdAt.toIDString()}`,
      );
    }

    const node = entry.positionNode;
    const alreadyRemoved = node.isRemoved();
    if (entry.elem.remove(editedAt) && !alreadyRemoved) {
      this.nodeMapByIndex.splayNode(node);
    }
    return entry.elem;
  }

  /**
   * `set` sets the given element at the given creation time.
   */
  public set(
    createdAt: TimeTicket,
    element: CRDTElement,
    executedAt: TimeTicket,
  ): CRDTElement {
    if (!this.elementMapByCreatedAt.has(createdAt.toIDString())) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${createdAt.toIDString()}`,
      );
    }

    this.insertAfter(createdAt, element, executedAt);
    return this.delete(createdAt, executedAt);
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
   * `getLastCreatedAt` returns the position node's createdAt of the
   * last node in the linked list. This is a position identity
   * suitable for use as prevCreatedAt.
   */
  public getLastCreatedAt(): TimeTicket {
    return this.last.getPositionCreatedAt();
  }

  /**
   * `posCreatedAt` returns the createdAt of the position node
   * currently holding the element. Used to convert element identity
   * to position identity.
   */
  public posCreatedAt(elemCreatedAt: TimeTicket): TimeTicket {
    const entry = this.elementMapByCreatedAt.get(elemCreatedAt.toIDString());
    if (!entry) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `cant find the given node: ${elemCreatedAt.toIDString()}`,
      );
    }
    return entry.positionNode.getPositionCreatedAt();
  }

  /**
   * `addDeadPosition` appends a dead position node during snapshot
   * restoration.
   */
  public addDeadPosition(
    posCreatedAt: TimeTicket,
    removedAt: TimeTicket,
  ): void {
    const node = RGATreeListNode.createBarePosition(posCreatedAt);
    node.setRemovedAt(removedAt);
    const prevNode = this.last;
    RGATreeListNode.insertNodeAfter(prevNode, node);
    this.last = node;
    this.nodeMapByIndex.insertAfter(prevNode, node);
    this.nodeMapByCreatedAt.set(posCreatedAt.toIDString(), node);
  }

  /**
   * `addMovedElement` appends an element with explicit position
   * identity during snapshot restoration.
   */
  public addMovedElement(
    elem: CRDTElement,
    posCreatedAt: TimeTicket,
    posMovedAt: TimeTicket,
  ): void {
    const entry = new ElementEntry(elem);
    entry.posMovedAt = posMovedAt;

    const node = RGATreeListNode.createBarePosition(posCreatedAt);
    node.setElementEntry(entry);
    entry.positionNode = node;

    const prevNode = this.last;
    RGATreeListNode.insertNodeAfter(prevNode, node);
    this.last = node;

    this.nodeMapByIndex.insertAfter(prevNode, node);
    this.nodeMapByCreatedAt.set(posCreatedAt.toIDString(), node);
    this.elementMapByCreatedAt.set(elem.getCreatedAt().toIDString(), entry);
  }

  /**
   * `allNodes` returns all nodes including dead position nodes.
   */
  public allNodes(): Array<RGATreeListNode> {
    const nodes: Array<RGATreeListNode> = [];
    let current = this.dummyHead.getNext();
    while (current) {
      nodes.push(current);
      current = current.getNext();
    }
    return nodes;
  }

  /**
   * `toTestString` returns a String containing the meta data of the
   * node id for debugging purpose.
   */
  public toTestString(): string {
    const json = [];

    for (const node of this) {
      if (!node.getElementEntry()) {
        continue;
      }
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
