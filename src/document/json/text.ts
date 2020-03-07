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

import { LogLevel, logger } from '../../util/logger';
import { ActorID } from '../time/actor_id';
import { Comparator } from '../../util/comparator';
import { SplayNode, SplayTree } from '../../util/splay_tree';
import { LLRBTree } from '../../util/llrb_tree';
import { InitialTimeTicket, MaxTimeTicket, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

enum ChangeType {
  Content = 'content',
  Selection = 'selection',
}

export interface Change<T> {
  type: ChangeType;
  actor: ActorID;
  from: number;
  to: number;
  content?: T;
}

interface TextNodeValue {
  length: number;
  substring(indexStart: number, indexEnd?: number): TextNodeValue;
}

export class TextNodeID {
  private createdAt: TimeTicket;
  private offset: number;

  constructor(createdAt: TimeTicket, offset: number) {
    this.createdAt = createdAt;
    this.offset = offset;
  }

  public static of(createdAt: TimeTicket, offset: number): TextNodeID {
    return new TextNodeID(createdAt, offset);
  }

  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  public getOffset(): number {
    return this.offset;
  }

  public equals(other: TextNodeID): boolean {
    return this.createdAt.compare(other.createdAt) === 0
      && this.offset === other.offset;
  }

  public hasSameCreatedAt(other: TextNodeID): boolean {
    return this.createdAt.compare(other.createdAt) === 0;
  }

  public split(offset: number): TextNodeID {
    return new TextNodeID(this.createdAt, this.offset + offset);
  }

  public getAnnotatedString(): string {
    return `${this.createdAt.getAnnotatedString()}:${this.offset}`;
  }
}

const InitialTextNodeID = TextNodeID.of(InitialTimeTicket, 0);

export class TextNodePos {
  private id: TextNodeID;
  private relativeOffset: number;

  constructor(id: TextNodeID, relativeOffset: number) {
    this.id = id;
    this.relativeOffset = relativeOffset;
  }

  public static of(id: TextNodeID, relativeOffset: number): TextNodePos {
    return new TextNodePos(id, relativeOffset);
  }

  public getID(): TextNodeID {
    return this.id;
  }

  public getRelativeOffset(): number {
    return this.relativeOffset;
  }

  public getAbsoluteID(): TextNodeID {
    return TextNodeID.of(
      this.id.getCreatedAt(),
      this.id.getOffset() + this.relativeOffset,
    );
  }

  public getAnnotatedString(): string {
    return `${this.id.getAnnotatedString()}:${this.relativeOffset}`;
  }
}

export type TextNodeRange = [TextNodePos, TextNodePos];

class TextNode<T extends TextNodeValue> extends SplayNode<T> {
  private id: TextNodeID;
  private deletedAt: TimeTicket;

  private prev: TextNode<T>;
  private next: TextNode<T>;
  private insPrev: TextNode<T>;
  private insNext: TextNode<T>;

  constructor(id: TextNodeID, value?: T, deletedAt?: TimeTicket) {
    super(value);
    this.id = id;
    this.deletedAt = deletedAt;
  }

  public static create<T extends TextNodeValue>(id: TextNodeID, value?: T): TextNode<T> {
    return new TextNode(id, value);
  }

  public static createComparator(): Comparator<TextNodeID> {
    return (p1: TextNodeID, p2: TextNodeID) => {
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
    }
  }

  public getID(): TextNodeID {
    return this.id;
  }

  public getCreatedAt(): TimeTicket {
    return this.id.getCreatedAt();
  }

  public getLength(): number {
    if (this.deletedAt) {
      return 0;
    }
    return this.getContentLength();
  }

  public getContentLength(): number {
    return this.value && this.value.length || 0;
  }

  public getNext(): TextNode<T> {
    return this.next;
  }

  public getInsPrev(): TextNode<T> {
    return this.insPrev;
  }

  public getInsNext(): TextNode<T> {
    return this.insNext;
  }

  public getInsPrevID(): TextNodeID {
    return this.insPrev.getID();
  }

  public setPrev(node: TextNode<T>): void {
    this.prev = node;
    node.next = this;
  }

  public setInsPrev(node: TextNode<T>): void {
    this.insPrev = node;
    node.insNext = this;
  }

  public hasNext(): boolean {
    return !!this.next;
  }

  public hasInsPrev(): boolean {
    return !!this.insPrev;
  }

  public isDeleted(): boolean {
    return !!this.deletedAt;
  }

  public split(offset: number): TextNode<T> {
    return new TextNode(
      this.id.split(offset),
      this.splitContent(offset)
    );
  }

  public canDelete(editedAt: TimeTicket, latestCreatedAt: TimeTicket): boolean {
    return (!this.getCreatedAt().after(latestCreatedAt) &&
      (!this.deletedAt || editedAt.after(this.deletedAt)));
  }

  public delete(editedAt: TimeTicket): void {
    this.deletedAt = editedAt;
  }

  public createRange(): TextNodeRange {
    return [
      TextNodePos.of(this.id, 0),
      TextNodePos.of(this.id, this.getLength())
    ];
  }

  public deepcopy(): TextNode<T> {
    return new TextNode(
      this.id,
      this.value,
      this.deletedAt
    );
  }

  public getAnnotatedString(): string {
    return `${this.id.getAnnotatedString()} ${this.value ? this.value : ''}`;
  }

  private splitContent(offset: number): T {
    const value = this.value;
    this.value = value.substring(0, offset) as T;
    return value.substring(offset, value.length) as T;
  }
}

export class RGATreeSplit<T extends TextNodeValue> {
  private head: TextNode<T>;
  private treeByIndex: SplayTree<T>;
  private treeByID: LLRBTree<TextNodeID, TextNode<T>>;

  constructor() {
    this.head = TextNode.create(InitialTextNodeID);
    this.treeByIndex = new SplayTree();
    this.treeByID = new LLRBTree(TextNode.createComparator());

    this.treeByIndex.insert(this.head);
    this.treeByID.put(this.head.getID(), this.head);
  }

  public static create<T extends TextNodeValue>(): RGATreeSplit<T> {
    return new RGATreeSplit();
  }

  public edit(
    range: TextNodeRange,
    content: T,
    latestCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket
  ): [TextNodePos, Map<string, TimeTicket>, Array<Change<T>>] {
    // 01. split nodes with from and to
    const [toLeft, toRight] = this.findTextNodeWithSplit(range[1], editedAt);
    const [fromLeft, fromRight] = this.findTextNodeWithSplit(range[0], editedAt);

    // 02. delete between from and to
    const nodesToDelete = this.findBetween(fromRight, toRight);
    const [changes, latestCreatedAtMap] = this.deleteNodes(
      nodesToDelete, latestCreatedAtMapByActor, editedAt
    );

    const caretID = toRight ? toRight.getID() : toLeft.getID();
    let caretPos = TextNodePos.of(caretID, 0);

    // 03. insert a new node
    if (content) {
      const idx = this.findIdxFromTextNodePos(fromLeft.createRange()[1], true);

      const inserted = this.insertAfter(
        fromLeft,
        TextNode.create(TextNodeID.of(editedAt, 0), content)
      );

      changes.push({
        type: ChangeType.Content,
        actor: editedAt.getActorID(),
        from: idx,
        to: idx,
        content: content
      });

      caretPos = TextNodePos.of(inserted.getID(), inserted.getContentLength());
    }

    return [caretPos, latestCreatedAtMap, changes];
  }

  public findTextNodePos(idx: number): TextNodePos {
    const [node, offset] = this.treeByIndex.find(idx);
    const textNode = node as TextNode<T>;
    return TextNodePos.of(textNode.getID(), offset);
  }

  public findIndexesFromRange(range: TextNodeRange): [number, number] {
    const [fromPos, toPos] = range;
    return [
      this.findIdxFromTextNodePos(fromPos, false),
      this.findIdxFromTextNodePos(toPos, true)
    ];
  }

  public findIdxFromTextNodePos(pos: TextNodePos, preferToLeft: boolean): number {
    const absoluteID = pos.getAbsoluteID();
    const textNode = preferToLeft ?
      this.findFloorTextNodePreferToLeft(absoluteID) : this.findFloorTextNode(absoluteID);
    const index = this.treeByIndex.indexOf(textNode);
    if (!textNode) {
      logger.fatal(`the node of the given id should be found: ${absoluteID.getAnnotatedString()}`);
    }
    const offset = textNode.isDeleted() ? 0 : absoluteID.getOffset() - textNode.getID().getOffset();
    return index + offset;
  }

  public findTextNode(id: TextNodeID): TextNode<T> {
    return this.findFloorTextNode(id);
  }

  public toJSON(): string {
    const json = [];

    let node = this.head;
    while(node) {
      if (!node.isDeleted()) {
        json.push(node.getValue());
      }
      node = node.getNext();
    }

    return json.join('');
  }

  public deepcopy(): RGATreeSplit<T> {
    const clone = new RGATreeSplit<T>();

    let node = this.head.getNext();

    let prev = clone.head;
    let current
    while (node) {
      current = clone.insertAfter(prev, node.deepcopy());
      if (node.hasInsPrev()) {
        const insPrevNode = clone.findTextNode(node.getInsPrevID());
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
    while(node) {
      if (node.isDeleted()) {
        result.push(`{${node.getAnnotatedString()}}`);
      } else {
        result.push(`[${node.getAnnotatedString()}]`);
      }

      node = node.getNext();
    }

    return result.join('');
  }

  private findTextNodeWithSplit(pos: TextNodePos, editedAt: TimeTicket): [TextNode<T>, TextNode<T>] {
    const absoluteID = pos.getAbsoluteID();
    let node = this.findFloorTextNodePreferToLeft(absoluteID);
    const relativeOffset = absoluteID.getOffset() - node.getID().getOffset();

    this.splitTextNode(node, relativeOffset);

    while(node.hasNext() && node.getNext().getCreatedAt().after(editedAt)) {
      node = node.getNext();
    }

    return [node, node.getNext()];
  }

  private findFloorTextNodePreferToLeft(id: TextNodeID): TextNode<T> {
    let node = this.findFloorTextNode(id);
    if (!node) {
      logger.fatal(`the node of the given id should be found: ${id.getAnnotatedString()}`);
    }

    if (id.getOffset() > 0 && node.getID().getOffset() == id.getOffset()) {
      if (!node.hasInsPrev()) {
        logger.fatal('insPrev should be presence');
      }
      node = node.getInsPrev()
    }

    return node;
  }

  private findFloorTextNode(id: TextNodeID): TextNode<T> {
    const entry = this.treeByID.floorEntry(id);
    if (!entry) {
      return null;
    }

    if (!entry.key.equals(id) && !entry.key.hasSameCreatedAt(id)) {
      return null;
    }

    return entry.value;
  }

  private findBetween(fromNode: TextNode<T>, toNode: TextNode<T>): Array<TextNode<T>> {
    const nodes = [];

    let current = fromNode;
    while (current && current !== toNode) {
      nodes.push(current);
      current = current.getNext();
    }

    return nodes;
  }

  private splitTextNode(node: TextNode<T>, offset: number) {
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
    candidates: Array<TextNode<T>>,
    latestCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket
  ): [Array<Change<T>>, Map<string, TimeTicket>] {
    const isRemote = !!latestCreatedAtMapByActor;
    const changes: Array<Change<T>> = [];
    const createdAtMapByActor = new Map();
    const nodesToDelete = [];

    // NOTE: We need to collect indexes for change first then delete the nodes.
    for (const node of candidates) {
      const actorID = node.getCreatedAt().toIDString();

      const latestCreatedAt = isRemote ? (
        latestCreatedAtMapByActor.has(actorID) ? latestCreatedAtMapByActor.get(actorID) : InitialTimeTicket
      ) : MaxTimeTicket;

      // Delete nodes created before the latest time remaining in the replica that performed the deletion.
      if (node.canDelete(editedAt, latestCreatedAt)) {
        nodesToDelete.push(node);

        const [fromIdx, toIdx] = this.findIndexesFromRange(node.createRange());
        const change = { 
          type: ChangeType.Content,
          actor: editedAt.getActorID(),
          from: fromIdx,
          to: toIdx
        };

        // Reduce adjacent deletions: i.g) [(1, 2), (2, 3)] => [(1, 3)]
        if (changes.length && changes[0].to === change.from) {
          changes[0].to = change.to;
        } else {
          changes.unshift(change);
        }

        if (!createdAtMapByActor.has(actorID) || 
          node.getID().getCreatedAt().after(createdAtMapByActor.get(actorID))) {
          createdAtMapByActor.set(actorID, node.getID().getCreatedAt());
        }
      }
    }

    for (const node of nodesToDelete) {
      node.delete(editedAt);
      this.treeByIndex.splayNode(node);
    }

    return [changes, createdAtMapByActor];
  }

  private insertAfter(prevNode: TextNode<T>, newNode: TextNode<T>): TextNode<T> {
    const next = prevNode.getNext();
    newNode.setPrev(prevNode);
    if (next) {
      next.setPrev(newNode);
    }

    this.treeByID.put(newNode.getID(), newNode);
    this.treeByIndex.insertAfter(prevNode, newNode);

    return newNode;
  }
}

class Selection {
  private from: TextNodePos;
  private to: TextNodePos;
  private updatedAt: TimeTicket;

  constructor(from: TextNodePos, to: TextNodePos, updatedAt: TimeTicket) {
    this.from = from;
    this.to = to;
    this.updatedAt = updatedAt;
  }

  public static of(range: TextNodeRange, updatedAt: TimeTicket): Selection {
    return new Selection(range[0], range[1], updatedAt);
  }

  public getUpdatedAt(): TimeTicket {
    return this.updatedAt;
  }
}

export class PlainText extends JSONElement {
  private onChangesHandler: (changes: Array<Change<string>>) => void;
  private rgaTreeSplit: RGATreeSplit<string>;
  private selectionMap: Map<string, Selection>;
  private remoteChangeLock: boolean;

  constructor(rgaTreeSplit: RGATreeSplit<string>, createdAt: TimeTicket) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = new Map();
    this.remoteChangeLock = false;
  }

  public static create(rgaTreeSplit: RGATreeSplit<string>, createdAt: TimeTicket): PlainText {
    return new PlainText(rgaTreeSplit, createdAt);
  }

  public edit(fromIdx: number, toIdx: number, content: string): PlainText {
    logger.fatal('unsupported: this method should be called by proxy');
    return null;
  }

  public editInternal(
    range: TextNodeRange,
    content: string,
    latestCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket
  ): [TextNodePos, Map<string, TimeTicket>] {
    const [caretPos, latestCreatedAtMap, changes] = this.rgaTreeSplit.edit(
      range,
      content,
      latestCreatedAtMapByActor, editedAt,
    );

    const selectionChange = this.updateSelectionInternal([caretPos, caretPos], editedAt);
    if (selectionChange) {
      changes.push(selectionChange);
    }

    if (this.onChangesHandler) {
      this.remoteChangeLock = true;
      this.onChangesHandler(changes);
      this.remoteChangeLock = false;
    }

    return [caretPos, latestCreatedAtMap];
  }

  public updateSelection(range: TextNodeRange, updatedAt: TimeTicket): void {
    if (this.remoteChangeLock) {
      return;
    }

    const change = this.updateSelectionInternal(range, updatedAt);
    if (this.onChangesHandler && change) {
      this.remoteChangeLock = true;
      this.onChangesHandler([change]);
      this.remoteChangeLock = false;
    }
  }

  public hasRemoteChangeLock(): boolean {
    return this.remoteChangeLock;
  }

  public onChanges(handler: (changes: Array<Change<string>>) => void): void {
    this.onChangesHandler = handler;
  }

  public createRange(fromIdx: number, toIdx: number): TextNodeRange {
    const fromPos = this.rgaTreeSplit.findTextNodePos(fromIdx);
    if (fromIdx === toIdx) {
      return [fromPos, fromPos];
    }

    return [fromPos, this.rgaTreeSplit.findTextNodePos(toIdx)];
  }

  public toJSON(): string {
    return `"${this.rgaTreeSplit.toJSON()}"`;
  }

  public getValue(): string {
    return this.rgaTreeSplit.toJSON();
  }

  public getAnnotatedString(): string {
    return this.rgaTreeSplit.getAnnotatedString();
  }

  public deepcopy(): PlainText {
    const text = PlainText.create(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt()
    );
    text.delete(this.getDeletedAt());
    return text;
  }

  private updateSelectionInternal(range: TextNodeRange, updatedAt: TimeTicket): Change<string> {
    if (!this.selectionMap.has(updatedAt.getActorID())) {
      this.selectionMap.set(updatedAt.getActorID(), Selection.of(range, updatedAt));
      return null;
    }

    const prevSelection = this.selectionMap.get(updatedAt.getActorID());
    if (updatedAt.after(prevSelection.getUpdatedAt())) {
      this.selectionMap.set(updatedAt.getActorID(), Selection.of(range, updatedAt));

      const [from, to] = this.rgaTreeSplit.findIndexesFromRange(range);
      return {
        type: ChangeType.Selection,
        actor: updatedAt.getActorID(),
        from,
        to,
      };
    }
  }
}
