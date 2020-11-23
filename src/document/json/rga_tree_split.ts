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
import { ActorID } from '../time/actor_id';
import { Comparator } from '../../util/comparator';
import { SplayNode, SplayTree } from '../../util/splay_tree';
import { LLRBTree } from '../../util/llrb_tree';
import { InitialTimeTicket, MaxTimeTicket, TimeTicket } from '../time/ticket';

export enum ChangeType {
  Content = 'content',
  Selection = 'selection',
  Style = 'style',
}

export interface Change {
  type: ChangeType;
  actor: ActorID;
  from: number;
  to: number;
  content?: string;
  attributes?: { [key: string]: string };
}

interface RGATreeSplitValue {
  length: number;
  substring(indexStart: number, indexEnd?: number): RGATreeSplitValue;
}

export class RGATreeSplitNodeID {
  private createdAt: TimeTicket;
  private offset: number;

  constructor(createdAt: TimeTicket, offset: number) {
    this.createdAt = createdAt;
    this.offset = offset;
  }

  public static of(createdAt: TimeTicket, offset: number): RGATreeSplitNodeID {
    return new RGATreeSplitNodeID(createdAt, offset);
  }

  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  public getOffset(): number {
    return this.offset;
  }

  public equals(other: RGATreeSplitNodeID): boolean {
    return (
      this.createdAt.compare(other.createdAt) === 0 &&
      this.offset === other.offset
    );
  }

  public hasSameCreatedAt(other: RGATreeSplitNodeID): boolean {
    return this.createdAt.compare(other.createdAt) === 0;
  }

  public split(offset: number): RGATreeSplitNodeID {
    return new RGATreeSplitNodeID(this.createdAt, this.offset + offset);
  }

  public getAnnotatedString(): string {
    return `${this.createdAt.getAnnotatedString()}:${this.offset}`;
  }
}

const InitialRGATreeSplitNodeID = RGATreeSplitNodeID.of(InitialTimeTicket, 0);

export class RGATreeSplitNodePos {
  private id: RGATreeSplitNodeID;
  private relativeOffset: number;

  constructor(id: RGATreeSplitNodeID, relativeOffset: number) {
    this.id = id;
    this.relativeOffset = relativeOffset;
  }

  public static of(
    id: RGATreeSplitNodeID,
    relativeOffset: number,
  ): RGATreeSplitNodePos {
    return new RGATreeSplitNodePos(id, relativeOffset);
  }

  public getID(): RGATreeSplitNodeID {
    return this.id;
  }

  public getRelativeOffset(): number {
    return this.relativeOffset;
  }

  public getAbsoluteID(): RGATreeSplitNodeID {
    return RGATreeSplitNodeID.of(
      this.id.getCreatedAt(),
      this.id.getOffset() + this.relativeOffset,
    );
  }

  public getAnnotatedString(): string {
    return `${this.id.getAnnotatedString()}:${this.relativeOffset}`;
  }
}

export type RGATreeSplitNodeRange = [RGATreeSplitNodePos, RGATreeSplitNodePos];

export class RGATreeSplitNode<
  T extends RGATreeSplitValue
> extends SplayNode<T> {
  private id: RGATreeSplitNodeID;
  private removedAt: TimeTicket;

  private prev: RGATreeSplitNode<T>;
  private next: RGATreeSplitNode<T>;
  private insPrev: RGATreeSplitNode<T>;
  private insNext: RGATreeSplitNode<T>;

  constructor(id: RGATreeSplitNodeID, value?: T, removedAt?: TimeTicket) {
    super(value);
    this.id = id;
    this.removedAt = removedAt;
  }

  public static create<T extends RGATreeSplitValue>(
    id: RGATreeSplitNodeID,
    value?: T,
  ): RGATreeSplitNode<T> {
    return new RGATreeSplitNode(id, value);
  }

  public static createComparator(): Comparator<RGATreeSplitNodeID> {
    return (p1: RGATreeSplitNodeID, p2: RGATreeSplitNodeID): number => {
      const compare = p1.getCreatedAt().compare(p2.getCreatedAt());
      if (compare !== 0) {
        return compare;
      }

      if (p1.getOffset() > p2.getOffset()) {
        return 1;
      } else if (p1.getOffset() < p2.getOffset()) {
        return -1;
      }
      return 0;
    };
  }

  public getID(): RGATreeSplitNodeID {
    return this.id;
  }

  public getCreatedAt(): TimeTicket {
    return this.id.getCreatedAt();
  }

  public getLength(): number {
    if (this.removedAt) {
      return 0;
    }
    return this.getContentLength();
  }

  public getContentLength(): number {
    return (this.value && this.value.length) || 0;
  }

  public getNext(): RGATreeSplitNode<T> {
    return this.next;
  }

  public getInsPrev(): RGATreeSplitNode<T> {
    return this.insPrev;
  }

  public getInsNext(): RGATreeSplitNode<T> {
    return this.insNext;
  }

  public getInsPrevID(): RGATreeSplitNodeID {
    return this.insPrev.getID();
  }

  public setPrev(node: RGATreeSplitNode<T>): void {
    this.prev = node;
    node.next = this;
  }

  public setInsPrev(node: RGATreeSplitNode<T>): void {
    this.insPrev = node;
    node.insNext = this;
  }

  public hasNext(): boolean {
    return !!this.next;
  }

  public hasInsPrev(): boolean {
    return !!this.insPrev;
  }

  public isRemoved(): boolean {
    return !!this.removedAt;
  }

  public getRemovedAt(): TimeTicket {
    return this.removedAt;
  }

  public split(offset: number): RGATreeSplitNode<T> {
    return new RGATreeSplitNode(this.id.split(offset), this.splitValue(offset));
  }

  public canDelete(editedAt: TimeTicket, latestCreatedAt: TimeTicket): boolean {
    return (
      !this.getCreatedAt().after(latestCreatedAt) &&
      (!this.removedAt || editedAt.after(this.removedAt))
    );
  }

  public remove(editedAt: TimeTicket): void {
    this.removedAt = editedAt;
  }

  public createRange(): RGATreeSplitNodeRange {
    return [
      RGATreeSplitNodePos.of(this.id, 0),
      RGATreeSplitNodePos.of(this.id, this.getLength()),
    ];
  }

  public deepcopy(): RGATreeSplitNode<T> {
    return new RGATreeSplitNode(this.id, this.value, this.removedAt);
  }

  public getAnnotatedString(): string {
    return `${this.id.getAnnotatedString()} ${this.value ? this.value : ''}`;
  }

  private splitValue(offset: number): T {
    const value = this.value;
    this.value = value.substring(0, offset) as T;
    return value.substring(offset, value.length) as T;
  }
}

export class RGATreeSplit<T extends RGATreeSplitValue> {
  private head: RGATreeSplitNode<T>;
  private treeByIndex: SplayTree<T>;
  private treeByID: LLRBTree<RGATreeSplitNodeID, RGATreeSplitNode<T>>;

  constructor() {
    this.head = RGATreeSplitNode.create(InitialRGATreeSplitNodeID);
    this.treeByIndex = new SplayTree();
    this.treeByID = new LLRBTree(RGATreeSplitNode.createComparator());

    this.treeByIndex.insert(this.head);
    this.treeByID.put(this.head.getID(), this.head);
  }

  public static create<T extends RGATreeSplitValue>(): RGATreeSplit<T> {
    return new RGATreeSplit();
  }

  public edit(
    range: RGATreeSplitNodeRange,
    value: T,
    latestCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket,
  ): [RGATreeSplitNodePos, Map<string, TimeTicket>, Array<Change>] {
    // 01. split nodes with from and to
    const [toLeft, toRight] = this.findNodeWithSplit(range[1], editedAt);
    const [fromLeft, fromRight] = this.findNodeWithSplit(range[0], editedAt);

    // 02. delete between from and to
    const nodesToDelete = this.findBetween(fromRight, toRight);
    const [changes, latestCreatedAtMap] = this.deleteNodes(
      nodesToDelete,
      latestCreatedAtMapByActor,
      editedAt,
    );

    const caretID = toRight ? toRight.getID() : toLeft.getID();
    let caretPos = RGATreeSplitNodePos.of(caretID, 0);

    // 03. insert a new node
    if (value) {
      const idx = this.findIdxFromNodePos(fromLeft.createRange()[1], true);

      const inserted = this.insertAfter(
        fromLeft,
        RGATreeSplitNode.create(RGATreeSplitNodeID.of(editedAt, 0), value),
      );

      changes.push({
        type: ChangeType.Content,
        actor: editedAt.getActorID(),
        from: idx,
        to: idx,
        content: value.toString(),
      });

      caretPos = RGATreeSplitNodePos.of(
        inserted.getID(),
        inserted.getContentLength(),
      );
    }

    return [caretPos, latestCreatedAtMap, changes];
  }

  public findNodePos(idx: number): RGATreeSplitNodePos {
    const [node, offset] = this.treeByIndex.find(idx);
    const splitNode = node as RGATreeSplitNode<T>;
    return RGATreeSplitNodePos.of(splitNode.getID(), offset);
  }

  public findIndexesFromRange(range: RGATreeSplitNodeRange): [number, number] {
    const [fromPos, toPos] = range;
    return [
      this.findIdxFromNodePos(fromPos, false),
      this.findIdxFromNodePos(toPos, true),
    ];
  }

  public findIdxFromNodePos(
    pos: RGATreeSplitNodePos,
    preferToLeft: boolean,
  ): number {
    const absoluteID = pos.getAbsoluteID();
    const node = preferToLeft
      ? this.findFloorNodePerferToLeft(absoluteID)
      : this.findFloorNode(absoluteID);
    const index = this.treeByIndex.indexOf(node);
    if (!node) {
      logger.fatal(
        `the node of the given id should be found: ${absoluteID.getAnnotatedString()}`,
      );
    }
    const offset = node.isRemoved()
      ? 0
      : absoluteID.getOffset() - node.getID().getOffset();
    return index + offset;
  }

  public findNode(id: RGATreeSplitNodeID): RGATreeSplitNode<T> {
    return this.findFloorNode(id);
  }

  public toJSON(): string {
    const json = [];

    for (const node of this) {
      if (!node.isRemoved()) {
        json.push(node.getValue());
      }
    }

    return json.join('');
  }

  public *[Symbol.iterator](): IterableIterator<RGATreeSplitNode<T>> {
    let node = this.head.getNext();
    while (node) {
      yield node;
      node = node.getNext();
    }
  }

  public getHead(): RGATreeSplitNode<T> {
    return this.head;
  }

  public deepcopy(): RGATreeSplit<T> {
    const clone = new RGATreeSplit<T>();

    let node = this.head.getNext();

    let prev = clone.head;
    let current;
    while (node) {
      current = clone.insertAfter(prev, node.deepcopy());
      if (node.hasInsPrev()) {
        const insPrevNode = clone.findNode(node.getInsPrevID());
        current.setInsPrev(insPrevNode);
      }

      prev = current;
      node = node.getNext();
    }

    return clone;
  }

  public getAnnotatedString(): string {
    const result = [];

    let node = this.head;
    while (node) {
      if (node.isRemoved()) {
        result.push(`{${node.getAnnotatedString()}}`);
      } else {
        result.push(`[${node.getAnnotatedString()}]`);
      }

      node = node.getNext();
    }

    return result.join('');
  }

  public insertAfter(
    prevNode: RGATreeSplitNode<T>,
    newNode: RGATreeSplitNode<T>,
  ): RGATreeSplitNode<T> {
    const next = prevNode.getNext();
    newNode.setPrev(prevNode);
    if (next) {
      next.setPrev(newNode);
    }

    this.treeByID.put(newNode.getID(), newNode);
    this.treeByIndex.insertAfter(prevNode, newNode);

    return newNode;
  }

  public findNodeWithSplit(
    pos: RGATreeSplitNodePos,
    editedAt: TimeTicket,
  ): [RGATreeSplitNode<T>, RGATreeSplitNode<T>] {
    const absoluteID = pos.getAbsoluteID();
    let node = this.findFloorNodePerferToLeft(absoluteID);
    const relativeOffset = absoluteID.getOffset() - node.getID().getOffset();

    this.splitNode(node, relativeOffset);

    while (node.hasNext() && node.getNext().getCreatedAt().after(editedAt)) {
      node = node.getNext();
    }

    return [node, node.getNext()];
  }

  private findFloorNodePerferToLeft(
    id: RGATreeSplitNodeID,
  ): RGATreeSplitNode<T> {
    let node = this.findFloorNode(id);
    if (!node) {
      logger.fatal(
        `the node of the given id should be found: ${id.getAnnotatedString()}`,
      );
    }

    if (id.getOffset() > 0 && node.getID().getOffset() == id.getOffset()) {
      if (!node.hasInsPrev()) {
        logger.fatal('insPrev should be presence');
      }
      node = node.getInsPrev();
    }

    return node;
  }

  private findFloorNode(id: RGATreeSplitNodeID): RGATreeSplitNode<T> {
    const entry = this.treeByID.floorEntry(id);
    if (!entry) {
      return null;
    }

    if (!entry.key.equals(id) && !entry.key.hasSameCreatedAt(id)) {
      return null;
    }

    return entry.value;
  }

  public findBetween(
    fromNode: RGATreeSplitNode<T>,
    toNode: RGATreeSplitNode<T>,
  ): Array<RGATreeSplitNode<T>> {
    const nodes = [];

    let current = fromNode;
    while (current && current !== toNode) {
      nodes.push(current);
      current = current.getNext();
    }

    return nodes;
  }

  private splitNode(
    node: RGATreeSplitNode<T>,
    offset: number,
  ): RGATreeSplitNode<T> {
    if (offset > node.getContentLength()) {
      logger.fatal('offset should be less than or equal to length');
    }

    if (offset === 0) {
      return node;
    } else if (offset === node.getContentLength()) {
      return node.getNext();
    }

    const splitNode = node.split(offset);
    this.treeByIndex.updateSubtree(splitNode);
    this.insertAfter(node, splitNode);

    const insNext = node.getInsNext();
    if (insNext) {
      insNext.setInsPrev(splitNode);
    }
    splitNode.setInsPrev(node);

    return splitNode;
  }

  private deleteNodes(
    candidates: Array<RGATreeSplitNode<T>>,
    latestCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket,
  ): [Array<Change>, Map<string, TimeTicket>] {
    const isRemote = !!latestCreatedAtMapByActor;
    const changes: Array<Change> = [];
    const createdAtMapByActor = new Map();
    const nodesToDelete: Array<RGATreeSplitNode<T>> = [];

    // NOTE: We need to collect indexes for change first then delete the nodes.
    for (const node of candidates) {
      const actorID = node.getCreatedAt().getActorID();

      const latestCreatedAt = isRemote
        ? latestCreatedAtMapByActor.has(actorID)
          ? latestCreatedAtMapByActor.get(actorID)
          : InitialTimeTicket
        : MaxTimeTicket;

      // Delete nodes created before the latest time remaining in the replica that performed the deletion.
      if (node.canDelete(editedAt, latestCreatedAt)) {
        nodesToDelete.push(node);

        const [fromIdx, toIdx] = this.findIndexesFromRange(node.createRange());
        const change = {
          type: ChangeType.Content,
          actor: editedAt.getActorID(),
          from: fromIdx,
          to: toIdx,
        };

        // Reduce adjacent deletions: i.g) [(1, 2), (2, 3)] => [(1, 3)]
        if (changes.length && changes[0].to === change.from) {
          changes[0].to = change.to;
        } else {
          changes.unshift(change);
        }

        if (
          !createdAtMapByActor.has(actorID) ||
          node.getID().getCreatedAt().after(createdAtMapByActor.get(actorID))
        ) {
          createdAtMapByActor.set(actorID, node.getID().getCreatedAt());
        }
      }
    }

    for (const node of nodesToDelete) {
      node.remove(editedAt);
      this.treeByIndex.splayNode(node);
    }

    return [changes, createdAtMapByActor];
  }
}

export class Selection {
  private from: RGATreeSplitNodePos;
  private to: RGATreeSplitNodePos;
  private updatedAt: TimeTicket;

  constructor(
    from: RGATreeSplitNodePos,
    to: RGATreeSplitNodePos,
    updatedAt: TimeTicket,
  ) {
    this.from = from;
    this.to = to;
    this.updatedAt = updatedAt;
  }

  public static of(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): Selection {
    return new Selection(range[0], range[1], updatedAt);
  }

  public getUpdatedAt(): TimeTicket {
    return this.updatedAt;
  }
}
