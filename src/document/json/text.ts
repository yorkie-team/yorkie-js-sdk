import { logger } from '../../util/logger';
import { SplayNode, SplayTree } from '../../util/splay_tree';
import { Comparator, LLRBTree } from '../../util/llrb_tree';
import { InitialTimeTicket, MaxTimeTicket, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

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

      return p1.getOffset() - p2.getOffset();
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

  public setInsNext(insNext: TextNode<T>): void {
    this.insNext = insNext;
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

  public delete(editedAt: TimeTicket, maxCreatedAtByOwner: TimeTicket): boolean {
    if (!this.getCreatedAt().after(maxCreatedAtByOwner) &&
      (!this.deletedAt || editedAt.after(this.deletedAt))) {
      this.deletedAt = editedAt;
      return true;
    }

    return false;
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

export type TextNodeRange = [TextNodePos, TextNodePos];

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
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket
  ): [TextNodePos, Map<string, TimeTicket>] {
    // 01. split nodes with from and to
    const [fromLeft, fromRight] = this.findTextNodeWithSplit(range[0], editedAt);
    const [toLeft, toRight] = this.findTextNodeWithSplit(range[1], editedAt);

    // 02. delete between from and to
    const nodesToDelete = this.findBetween(fromRight, toRight);
    const maxCreatedAtMap = this.deleteNodes(nodesToDelete, maxCreatedAtMapByActor, editedAt);

    const caretID = toRight ? toRight.getID() : toLeft.getID();
    let caretPos = TextNodePos.of(caretID, 0);

    // 03. insert a new node
    if (content) {
      const inserted = this.insertAfter(
        fromLeft,
        TextNode.create(TextNodeID.of(editedAt, 0), content)
      );
      caretPos = TextNodePos.of(inserted.getID(), inserted.getContentLength());
    }
    
    return [caretPos, maxCreatedAtMap];
  }

  public findTextNodePos(idx: number): TextNodePos {
    const [node, offset] = this.treeByIndex.find(idx);
    const textNode = node as TextNode<T>;
    return TextNodePos.of(textNode.getID(), offset);
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
      insNext.setInsNext(splitNode);
    }
    splitNode.setInsPrev(node);

    return splitNode;
  }

  private deleteNodes(
    candidates: Array<TextNode<T>>,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket
  ): Map<string, TimeTicket> {
    const createdAtMapByActor = new Map();

    for (const node of candidates) {
      const actorID = node.getCreatedAt().toIDString();

      let maxCreatedAt;
      if (!maxCreatedAtMapByActor) {
        maxCreatedAt = MaxTimeTicket;
      } else {
        maxCreatedAt = maxCreatedAtMapByActor.has(actorID) ?
          maxCreatedAtMapByActor.get(actorID) : InitialTimeTicket;
      }

      if (node.delete(editedAt, maxCreatedAt)) {
        this.treeByIndex.splayNode(node);
        if (!createdAtMapByActor.has(actorID) || 
          node.getID().getCreatedAt().after(createdAtMapByActor.get(actorID))) {
          createdAtMapByActor.set(actorID, node.getID().getCreatedAt());
        }
      }
    }

    return createdAtMapByActor;
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

export class PlainText extends JSONElement {
  private rgaTreeSplit: RGATreeSplit<string>;

  constructor(rgaTreeSplit: RGATreeSplit<string>, createdAt: TimeTicket) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
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
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket
  ): [TextNodePos, Map<string, TimeTicket>] {
    return this.rgaTreeSplit.edit(range, content, maxCreatedAtMapByActor, editedAt);
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

  public getAnnotatedString(): string {
    return this.rgaTreeSplit.getAnnotatedString();
  }

  public deepcopy(): PlainText {
    return PlainText.create(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt()
    );
  }
}
