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

import {
  TimeTicket,
  InitialTimeTicket,
  TimeTicketStruct,
  MaxTimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';

import {
  IndexTree,
  TreePos,
  IndexTreeNode,
  traverseAll,
  TokenType,
} from '@yorkie-js-sdk/src/util/index_tree';
import { RHT, RHTNode } from './rht';
import { ActorID } from './../time/actor_id';
import { LLRBTree } from '@yorkie-js-sdk/src/util/llrb_tree';
import { Comparator } from '@yorkie-js-sdk/src/util/comparator';
import { parseObjectValues } from '@yorkie-js-sdk/src/util/object';
import type {
  DefaultTextType,
  TreeNodeType,
  TreeToken,
} from '@yorkie-js-sdk/src/util/index_tree';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import type * as Devtools from '@yorkie-js-sdk/src/devtools/types';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';
import { GCChild, GCPair, GCParent } from '@yorkie-js-sdk/src/document/crdt/gc';
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';

/**
 * `TreeNode` represents a node in the tree.
 */
export type TreeNode = TextNode | ElementNode;

/**
 * `ElementNode` represents an element node. It has an attributes and children.
 */
export type ElementNode<A extends Indexable = Indexable> = {
  type: TreeNodeType;
  attributes?: A;
  children: Array<TreeNode>;
};

/**
 * `TextNode` represents a text node. It has a string value.
 */
export type TextNode = {
  type: typeof DefaultTextType;
  value: string;
};

/**
 * `TreeNodeForTest` represents the JSON representation of a node in the tree.
 * It is used for testing.
 */
export type TreeNodeForTest = TreeNode & {
  children?: Array<TreeNodeForTest>;
  size: number;
  isRemoved: boolean;
};

/**
 * `TreeChangeType` represents the type of change in the tree.
 */
export enum TreeChangeType {
  Content = 'content',
  Style = 'style',
  RemoveStyle = 'removeStyle',
}

/**
 * `TreeChange` represents the change in the tree.
 */
export type TreeChange =
  | {
      actor: ActorID;
      type: TreeChangeType.Content;
      from: number;
      to: number;
      fromPath: Array<number>;
      toPath: Array<number>;
      value?: Array<TreeNode>;
      splitLevel?: number;
    }
  | {
      actor: ActorID;
      type: TreeChangeType.Style;
      from: number;
      to: number;
      fromPath: Array<number>;
      toPath: Array<number>;
      value: { [key: string]: string };
      splitLevel?: number;
    }
  | {
      actor: ActorID;
      type: TreeChangeType.RemoveStyle;
      from: number;
      to: number;
      fromPath: Array<number>;
      toPath: Array<number>;
      value?: Array<string>;
      splitLevel?: number;
    };

/**
 * `CRDTTreePos` represent a position in the tree. It is used to identify a
 * position in the tree. It is composed of the parent ID and the left sibling
 * ID. If there's no left sibling in parent's children, then left sibling is
 * parent.
 */
export class CRDTTreePos {
  private parentID: CRDTTreeNodeID;
  private leftSiblingID: CRDTTreeNodeID;

  constructor(parentID: CRDTTreeNodeID, leftSiblingID: CRDTTreeNodeID) {
    this.parentID = parentID;
    this.leftSiblingID = leftSiblingID;
  }

  /**
   * `of` creates a new instance of CRDTTreePos.
   */
  public static of(parentID: CRDTTreeNodeID, leftSiblingID: CRDTTreeNodeID) {
    return new CRDTTreePos(parentID, leftSiblingID);
  }

  /**
   * `fromTreePos` creates a new instance of CRDTTreePos from the given TreePos.
   */
  public static fromTreePos(pos: TreePos<CRDTTreeNode>): CRDTTreePos {
    const { offset } = pos;
    let { node } = pos;
    let leftNode;

    if (node.isText) {
      if (node.parent!.children[0] === node && offset === 0) {
        leftNode = node.parent!;
      } else {
        leftNode = node;
      }

      node = node.parent!;
    } else {
      if (offset === 0) {
        leftNode = node;
      } else {
        leftNode = node.children[offset - 1];
      }
    }

    return CRDTTreePos.of(
      node.id,
      CRDTTreeNodeID.of(leftNode.getCreatedAt(), leftNode.getOffset() + offset),
    );
  }

  /**
   * `getParentID` returns the parent ID.
   */
  public getParentID() {
    return this.parentID;
  }

  /**
   * `fromStruct` creates a new instance of CRDTTreeNodeID from the given struct.
   */
  public static fromStruct(struct: CRDTTreePosStruct): CRDTTreePos {
    return CRDTTreePos.of(
      CRDTTreeNodeID.of(
        TimeTicket.fromStruct(struct.parentID.createdAt),
        struct.parentID.offset,
      ),
      CRDTTreeNodeID.of(
        TimeTicket.fromStruct(struct.leftSiblingID.createdAt),
        struct.leftSiblingID.offset,
      ),
    );
  }

  /**
   * `toStruct` returns the structure of this position.
   */
  public toStruct(): CRDTTreePosStruct {
    return {
      parentID: {
        createdAt: this.getParentID().getCreatedAt().toStruct(),
        offset: this.getParentID().getOffset(),
      },
      leftSiblingID: {
        createdAt: this.getLeftSiblingID().getCreatedAt().toStruct(),
        offset: this.getLeftSiblingID().getOffset(),
      },
    };
  }

  /**
   * `toTreeNodePair` converts the pos to parent and left sibling nodes.
   * If the position points to the middle of a node, then the left sibling node
   * is the node that contains the position. Otherwise, the left sibling node is
   * the node that is located at the left of the position.
   */
  public toTreeNodePair(tree: CRDTTree): TreeNodePair {
    const parentID = this.getParentID();
    const leftSiblingID = this.getLeftSiblingID();
    const parentNode = tree.findFloorNode(parentID);
    let leftNode = tree.findFloorNode(leftSiblingID);
    if (!parentNode || !leftNode) {
      throw new YorkieError(
        Code.ErrRefused,
        `cannot find node of CRDTTreePos(${parentID.toTestString()}, ${leftSiblingID.toTestString()})`,
      );
    }

    /**
     * NOTE(hackerwins): If the left node and the parent node are the same,
     * it means that the position is the left-most of the parent node.
     * We need to skip finding the left of the position.
     */
    if (
      !leftSiblingID.equals(parentID) &&
      leftSiblingID.getOffset() > 0 &&
      leftSiblingID.getOffset() === leftNode.id.getOffset() &&
      leftNode.insPrevID
    ) {
      leftNode = tree.findFloorNode(leftNode.insPrevID)!;
    }

    return [parentNode, leftNode];
  }

  /**
   * `getLeftSiblingID` returns the left sibling ID.
   */
  public getLeftSiblingID() {
    return this.leftSiblingID;
  }

  /**
   * `equals` returns whether the given pos equals to this or not.
   */
  public equals(other: CRDTTreePos): boolean {
    return (
      this.getParentID()
        .getCreatedAt()
        .equals(other.getParentID().getCreatedAt()) &&
      this.getParentID().getOffset() === other.getParentID().getOffset() &&
      this.getLeftSiblingID()
        .getCreatedAt()
        .equals(other.getLeftSiblingID().getCreatedAt()) &&
      this.getLeftSiblingID().getOffset() ===
        other.getLeftSiblingID().getOffset()
    );
  }
}

/**
 * `CRDTTreeNodeID` represent an ID of a node in the tree. It is used to
 * identify a node in the tree. It is composed of the creation time of the node
 * and the offset from the beginning of the node if the node is split.
 *
 * Some of replicas may have nodes that are not split yet. In this case, we can
 * use `map.floorEntry()` to find the adjacent node.
 */
export class CRDTTreeNodeID {
  /**
   * `createdAt` is the creation time of the node.
   */
  private createdAt: TimeTicket;

  /**
   * `offset` is the distance from the beginning of the node if the node is
   * split.
   */
  private offset: number;

  constructor(createdAt: TimeTicket, offset: number) {
    this.createdAt = createdAt;
    this.offset = offset;
  }

  /**
   * `of` creates a new instance of CRDTTreeNodeID.
   */
  public static of(createdAt: TimeTicket, offset: number): CRDTTreeNodeID {
    return new CRDTTreeNodeID(createdAt, offset);
  }

  /**
   * `fromStruct` creates a new instance of CRDTTreeNodeID from the given struct.
   */
  public static fromStruct(struct: CRDTTreeNodeIDStruct): CRDTTreeNodeID {
    return CRDTTreeNodeID.of(
      TimeTicket.fromStruct(struct.createdAt),
      struct.offset,
    );
  }

  /**
   * `createComparator` creates a comparator for CRDTTreeNodeID.
   */
  public static createComparator(): Comparator<CRDTTreeNodeID> {
    return (idA: CRDTTreeNodeID, idB: CRDTTreeNodeID) => {
      const compare = idA.getCreatedAt().compare(idB.getCreatedAt());
      if (compare !== 0) {
        return compare;
      }
      if (idA.getOffset() > idB.getOffset()) {
        return 1;
      } else if (idA.getOffset() < idB.getOffset()) {
        return -1;
      }
      return 0;
    };
  }

  /**
   * `getCreatedAt` returns the creation time of the node.
   */
  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  /**
   * `equals` returns whether given ID equals to this ID or not.
   */
  public equals(other: CRDTTreeNodeID): boolean {
    return (
      this.createdAt.compare(other.createdAt) === 0 &&
      this.offset === other.offset
    );
  }

  /**
   * `getOffset` returns returns the offset of the node.
   */
  public getOffset(): number {
    return this.offset;
  }

  /**
   * `setOffset` sets the offset of the node.
   */
  public setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * `toStruct` returns the structure of this position.
   */
  public toStruct(): CRDTTreeNodeIDStruct {
    return {
      createdAt: this.createdAt.toStruct(),
      offset: this.offset,
    };
  }

  /**
   * `toIDString` returns a string that can be used as an ID for this position.
   */
  public toIDString(): string {
    return `${this.createdAt.toIDString()}:${this.offset}`;
  }

  /**
   * `toTestString` returns a string containing the meta data of the ticket
   * for debugging purpose.
   */
  public toTestString(): string {
    return `${this.createdAt.toTestString()}/${this.offset}`;
  }
}

/**
 * `CRDTTreePosStruct` represents the structure of CRDTTreePos.
 */
export type CRDTTreePosStruct = {
  parentID: CRDTTreeNodeIDStruct;
  leftSiblingID: CRDTTreeNodeIDStruct;
};

/**
 * `CRDTTreeNodeIDStruct` represents the structure of CRDTTreeNodeID.
 * It is used to serialize and deserialize the CRDTTreeNodeID.
 */
export type CRDTTreeNodeIDStruct = {
  createdAt: TimeTicketStruct;
  offset: number;
};

/**
 * `TreePosRange` represents a pair of CRDTTreePos.
 */
export type TreePosRange = [CRDTTreePos, CRDTTreePos];

/**
 * `TreeNodePair` represents a pair of CRDTTreeNode. It represents the position
 * of the node in the tree with the left and parent nodes.
 */
type TreeNodePair = [CRDTTreeNode, CRDTTreeNode];

/**
 * `TreePosStructRange` represents the structure of TreeRange.
 * It is used to serialize and deserialize the TreeRange.
 */
export type TreePosStructRange = [CRDTTreePosStruct, CRDTTreePosStruct];

/**
 * `CRDTTreeNode` is a node of CRDTTree. It includes the logical clock and
 * links to other nodes to resolve conflicts.
 */
export class CRDTTreeNode
  extends IndexTreeNode<CRDTTreeNode>
  implements GCParent, GCChild
{
  id: CRDTTreeNodeID;
  removedAt?: TimeTicket;
  attrs?: RHT;

  /**
   * `insPrevID` is the previous node id of this node after the node is split.
   */
  insPrevID?: CRDTTreeNodeID;

  /**
   * `insNextID` is the previous node id of this node after the node is split.
   */
  insNextID?: CRDTTreeNodeID;

  _value = '';

  constructor(
    id: CRDTTreeNodeID,
    type: string,
    opts?: string | Array<CRDTTreeNode>,
    attributes?: RHT,
    removedAt?: TimeTicket,
  ) {
    super(type);
    this.id = id;
    this.removedAt = removedAt;
    attributes && (this.attrs = attributes);

    if (typeof opts === 'string') {
      this.value = opts;
    } else if (Array.isArray(opts)) {
      this._children = opts;
    }
  }

  /**
   * `toIDString` returns the IDString of this node.
   */
  toIDString(): string {
    return this.id.toIDString();
  }

  /**
   * `getRemovedAt` returns the time when this node was removed.
   */
  getRemovedAt(): TimeTicket | undefined {
    return this.removedAt;
  }

  /**
   * `create` creates a new instance of CRDTTreeNode.
   */
  static create(
    id: CRDTTreeNodeID,
    type: string,
    opts?: string | Array<CRDTTreeNode>,
    attributes?: RHT,
  ) {
    return new CRDTTreeNode(id, type, opts, attributes);
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  deepcopy(): CRDTTreeNode {
    const clone = new CRDTTreeNode(this.id, this.type);
    clone.removedAt = this.removedAt;
    clone._value = this._value;
    clone.size = this.size;
    clone.attrs = this.attrs?.deepcopy();
    clone._children = this._children.map((child) => {
      const childClone = child.deepcopy();
      childClone.parent = clone;
      return childClone;
    });
    clone.insPrevID = this.insPrevID;
    clone.insNextID = this.insNextID;
    return clone;
  }

  /**
   * `value` returns the value of the node.
   */
  get value() {
    if (!this.isText) {
      throw new YorkieError(
        Code.ErrInvalidType,
        `cannot get value of element node: ${this.type}`,
      );
    }

    return this._value;
  }

  /**
   * `value` sets the value of the node.
   */
  set value(v: string) {
    if (!this.isText) {
      throw new YorkieError(
        Code.ErrInvalidType,
        `cannot set value of element node: ${this.type}`,
      );
    }

    this._value = v;
    this.size = v.length;
  }

  /**
   * `isRemoved` returns whether the node is removed or not.
   */
  get isRemoved(): boolean {
    return !!this.removedAt;
  }

  /**
   * `remove` marks the node as removed.
   */
  remove(removedAt: TimeTicket): void {
    const alived = !this.removedAt;

    if (!this.removedAt || this.removedAt.compare(removedAt) > 0) {
      this.removedAt = removedAt;
    }

    if (alived) {
      this.updateAncestorsSize();
    }
  }

  /**
   * `cloneText` clones this text node with the given offset.
   */
  cloneText(offset: number): CRDTTreeNode {
    return new CRDTTreeNode(
      CRDTTreeNodeID.of(this.id.getCreatedAt(), offset),
      this.type,
      undefined,
      undefined,
      this.removedAt,
    );
  }

  /**
   * `cloneElement` clones this element node with the given issueTimeTicket function.
   */
  cloneElement(issueTimeTicket: () => TimeTicket): CRDTTreeNode {
    return new CRDTTreeNode(
      CRDTTreeNodeID.of(issueTimeTicket(), 0),
      this.type,
      undefined,
      undefined,
      this.removedAt,
    );
  }

  /**
   * `split` splits the given offset of this node.
   */
  public split(
    tree: CRDTTree,
    offset: number,
    issueTimeTicket?: () => TimeTicket,
  ): CRDTTreeNode | undefined {
    const split = this.isText
      ? this.splitText(offset, this.id.getOffset())
      : this.splitElement(offset, issueTimeTicket!);

    if (split) {
      split.insPrevID = this.id;
      if (this.insNextID) {
        const insNext = tree.findFloorNode(this.insNextID)!;
        insNext.insPrevID = split.id;
        split.insNextID = this.insNextID;
      }
      this.insNextID = split.id;
      tree.registerNode(split);
    }
    return split;
  }

  /**
   * `getCreatedAt` returns the creation time of this element.
   */
  public getCreatedAt(): TimeTicket {
    return this.id.getCreatedAt();
  }

  /**
   * `getOffset` returns the offset of a pos.
   */
  public getOffset(): number {
    return this.id.getOffset();
  }

  /**
   * `canDelete` checks if node is able to delete.
   */
  public canDelete(editedAt: TimeTicket, maxCreatedAt: TimeTicket): boolean {
    return (
      !this.getCreatedAt().after(maxCreatedAt) &&
      (!this.removedAt || editedAt.after(this.removedAt))
    );
  }

  /**
   * `canStyle` checks if node is able to style.
   */
  public canStyle(editedAt: TimeTicket, maxCreatedAt: TimeTicket): boolean {
    if (this.isText) {
      return false;
    }

    return (
      !this.getCreatedAt().after(maxCreatedAt) &&
      (!this.removedAt || editedAt.after(this.removedAt))
    );
  }

  /**
   * `setAttrs` sets the attributes of the node.
   */
  public setAttrs(
    attrs: { [key: string]: string },
    editedAt: TimeTicket,
  ): Array<[RHTNode | undefined, RHTNode | undefined]> {
    if (!this.attrs) {
      this.attrs = new RHT();
    }

    const pairs = new Array<[RHTNode | undefined, RHTNode | undefined]>();
    for (const [key, value] of Object.entries(attrs)) {
      pairs.push(this.attrs.set(key, value, editedAt));
    }

    return pairs;
  }

  /**
   * `purge` purges the given child node.
   */
  public purge(node: RHTNode): void {
    if (this.attrs) {
      this.attrs.purge(node);
    }
  }

  /**
   * `getGCPairs` returns the pairs of GC.
   */
  public getGCPairs(): Array<GCPair> {
    const pairs: Array<GCPair> = [];
    if (!this.attrs) {
      return pairs;
    }

    for (const node of this.attrs) {
      if (node.getRemovedAt()) {
        pairs.push({ parent: this, child: node });
      }
    }

    return pairs;
  }
}

/**
 * `toTreeNode` converts the given CRDTTreeNode to TreeNode.
 */
function toTreeNode(node: CRDTTreeNode): TreeNode {
  if (node.isText) {
    const currentNode = node;
    return {
      type: currentNode.type,
      value: currentNode.value,
    } as TextNode;
  }

  const treeNode: TreeNode = {
    type: node.type,
    children: node.children.map(toTreeNode),
  };

  if (node.attrs) {
    treeNode.attributes = parseObjectValues(node.attrs?.toObject());
  }

  return treeNode;
}

/**
 * `toXML` converts the given CRDTNode to XML string.
 */
export function toXML(node: CRDTTreeNode): string {
  if (node.isText) {
    const currentNode = node;
    return currentNode.value;
  }

  let attrs = '';
  if (node.attrs && node.attrs.size()) {
    attrs =
      ' ' +
      Array.from(node.attrs)
        .filter((n) => !n.isRemoved())
        .sort((a, b) => a.getKey().localeCompare(b.getKey()))
        .map((n) => {
          const obj = JSON.parse(n.getValue());
          if (typeof obj === 'string') {
            return `${n.getKey()}="${obj}"`;
          }
          return `${n.getKey()}="${escapeString(n.getValue())}"`;
        })
        .join(' ');
  }

  return `<${node.type}${attrs}>${node.children
    .map((child) => toXML(child))
    .join('')}</${node.type}>`;
}

/**
 * `toTestTreeNode` converts the given CRDTNode JSON for debugging.
 */
function toTestTreeNode(node: CRDTTreeNode): TreeNodeForTest {
  if (node.isText) {
    const currentNode = node;
    return {
      type: currentNode.type,
      value: currentNode.value,
      size: currentNode.size,
      isRemoved: currentNode.isRemoved,
    } as TreeNodeForTest;
  }

  return {
    type: node.type,
    children: node.children.map(toTestTreeNode),
    size: node.size,
    isRemoved: node.isRemoved,
  };
}

/**
 * `CRDTTree` is a CRDT implementation of a tree.
 */
export class CRDTTree extends CRDTElement implements GCParent {
  private indexTree: IndexTree<CRDTTreeNode>;
  private nodeMapByID: LLRBTree<CRDTTreeNodeID, CRDTTreeNode>;

  constructor(root: CRDTTreeNode, createdAt: TimeTicket) {
    super(createdAt);
    this.indexTree = new IndexTree<CRDTTreeNode>(root);
    this.nodeMapByID = new LLRBTree(CRDTTreeNodeID.createComparator());

    this.indexTree.traverseAll((node) => {
      this.nodeMapByID.put(node.id, node);
    });
  }

  /**
   * `create` creates a new instance of `CRDTTree`.
   */
  public static create(root: CRDTTreeNode, ticket: TimeTicket): CRDTTree {
    return new CRDTTree(root, ticket);
  }

  /**
   * `findFloorNode` finds node of given id.
   */
  public findFloorNode(id: CRDTTreeNodeID): CRDTTreeNode | undefined {
    const entry = this.nodeMapByID.floorEntry(id);
    if (!entry || !entry.key.getCreatedAt().equals(id.getCreatedAt())) {
      return;
    }

    return entry.value;
  }

  /**
   * `registerNode` registers the given node to the tree.
   */
  public registerNode(node: CRDTTreeNode): void {
    this.nodeMapByID.put(node.id, node);
  }

  /**
   * `findNodesAndSplitText` finds `TreePos` of the given `CRDTTreeNodeID` and
   * splits nodes if the position is in the middle of a text node.
   *
   * The ids of the given `pos` are the ids of the node in the CRDT perspective.
   * This is different from `TreePos` which is a position of the tree in the
   * physical perspective.
   *
   * If `editedAt` is given, then it is used to find the appropriate left node
   * for concurrent insertion.
   */
  public findNodesAndSplitText(
    pos: CRDTTreePos,
    editedAt?: TimeTicket,
  ): TreeNodePair {
    // 01. Find the parent and left sibling node of the given position.
    const [parent, leftSibling] = pos.toTreeNodePair(this);
    let leftNode = leftSibling;

    // 02. Determine whether the position is left-most and the exact parent
    // in the current tree.
    const isLeftMost = parent === leftNode;
    const realParent =
      leftNode.parent && !isLeftMost ? leftNode.parent : parent;

    // 03. Split text node if the left node is a text node.
    if (leftNode.isText) {
      leftNode.split(
        this,
        pos.getLeftSiblingID().getOffset() - leftNode.id.getOffset(),
      );
    }

    // 04. Find the appropriate left node. If some nodes are inserted at the
    // same position concurrently, then we need to find the appropriate left
    // node. This is similar to RGA.
    if (editedAt) {
      const allChildren = realParent.allChildren;
      const index = isLeftMost ? 0 : allChildren.indexOf(leftNode) + 1;

      for (let i = index; i < allChildren.length; i++) {
        const next = allChildren[i];
        if (!next.id.getCreatedAt().after(editedAt)) {
          break;
        }

        leftNode = next;
      }
    }

    return [realParent, leftNode];
  }

  /**
   * `style` applies the given attributes of the given range.
   */
  public style(
    range: [CRDTTreePos, CRDTTreePos],
    attributes: { [key: string]: string } | undefined,
    editedAt: TimeTicket,
    maxCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Map<string, TimeTicket>, Array<GCPair>, Array<TreeChange>] {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1], editedAt);

    const changes: Array<TreeChange> = [];
    const attrs: { [key: string]: any } = attributes
      ? parseObjectValues(attributes)
      : {};
    const createdAtMapByActor = new Map<string, TimeTicket>();
    const pairs: Array<GCPair> = [];
    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      ([node]) => {
        const actorID = node.getCreatedAt().getActorID();
        const maxCreatedAt = maxCreatedAtMapByActor
          ? maxCreatedAtMapByActor!.has(actorID)
            ? maxCreatedAtMapByActor!.get(actorID)!
            : InitialTimeTicket
          : MaxTimeTicket;

        if (node.canStyle(editedAt, maxCreatedAt) && attributes) {
          const maxCreatedAt = createdAtMapByActor!.get(actorID);
          const createdAt = node.getCreatedAt();
          if (!maxCreatedAt || createdAt.after(maxCreatedAt)) {
            createdAtMapByActor.set(actorID, createdAt);
          }

          const updatedAttrPairs = node.setAttrs(attributes, editedAt);
          const affectedAttrs = updatedAttrPairs.reduce(
            (acc: { [key: string]: string }, [, curr]) => {
              if (!curr) {
                return acc;
              }

              acc[curr.getKey()] = attrs[curr.getKey()];
              return acc;
            },
            {},
          );

          const parentOfNode = node.parent!;
          const previousNode = node.prevSibling || node.parent!;

          if (Object.keys(affectedAttrs).length > 0) {
            changes.push({
              type: TreeChangeType.Style,
              from: this.toIndex(parentOfNode, previousNode),
              to: this.toIndex(node, node),
              fromPath: this.toPath(parentOfNode, previousNode),
              toPath: this.toPath(node, node),
              actor: editedAt.getActorID(),
              value: affectedAttrs,
            });
          }

          for (const [prev] of updatedAttrPairs) {
            if (prev) {
              pairs.push({ parent: node, child: prev });
            }
          }
        }
      },
    );

    return [createdAtMapByActor, pairs, changes];
  }

  /**
   * `removeStyle` removes the given attributes of the given range.
   */
  public removeStyle(
    range: [CRDTTreePos, CRDTTreePos],
    attributesToRemove: Array<string>,
    editedAt: TimeTicket,
    maxCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Map<string, TimeTicket>, Array<GCPair>, Array<TreeChange>] {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1], editedAt);

    const changes: Array<TreeChange> = [];
    const createdAtMapByActor = new Map<string, TimeTicket>();
    const pairs: Array<GCPair> = [];
    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      ([node]) => {
        const actorID = node.getCreatedAt().getActorID();
        const maxCreatedAt = maxCreatedAtMapByActor
          ? maxCreatedAtMapByActor!.has(actorID)
            ? maxCreatedAtMapByActor!.get(actorID)!
            : InitialTimeTicket
          : MaxTimeTicket;

        if (node.canStyle(editedAt, maxCreatedAt) && attributesToRemove) {
          const maxCreatedAt = createdAtMapByActor!.get(actorID);
          const createdAt = node.getCreatedAt();
          if (!maxCreatedAt || createdAt.after(maxCreatedAt)) {
            createdAtMapByActor.set(actorID, createdAt);
          }

          if (!node.attrs) {
            node.attrs = new RHT();
          }

          for (const value of attributesToRemove) {
            const nodesTobeRemoved = node.attrs.remove(value, editedAt);
            for (const rhtNode of nodesTobeRemoved) {
              pairs.push({ parent: node, child: rhtNode });
            }
          }

          const parentOfNode = node.parent!;
          const previousNode = node.prevSibling || node.parent!;

          changes.push({
            actor: editedAt.getActorID()!,
            type: TreeChangeType.RemoveStyle,
            from: this.toIndex(parentOfNode, previousNode),
            to: this.toIndex(node, node),
            fromPath: this.toPath(parentOfNode, previousNode),
            toPath: this.toPath(node, node),
            value: attributesToRemove,
          });
        }
      },
    );

    return [createdAtMapByActor, pairs, changes];
  }

  /**
   * `edit` edits the tree with the given range and content.
   * If the content is undefined, the range will be removed.
   */
  public edit(
    range: [CRDTTreePos, CRDTTreePos],
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    editedAt: TimeTicket,
    issueTimeTicket: (() => TimeTicket) | undefined,
    maxCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Array<TreeChange>, Array<GCPair>, Map<string, TimeTicket>] {
    // 01. find nodes from the given range and split nodes.
    const [fromParent, fromLeft] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1], editedAt);

    const fromIdx = this.toIndex(fromParent, fromLeft);
    const fromPath = this.toPath(fromParent, fromLeft);

    const nodesToBeRemoved: Array<CRDTTreeNode> = [];
    const tokensToBeRemoved: Array<TreeToken<CRDTTreeNode>> = [];
    const toBeMovedToFromParents: Array<CRDTTreeNode> = [];
    const maxCreatedAtMap = new Map<string, TimeTicket>();
    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      ([node, tokenType], ended) => {
        // NOTE(hackerwins): If the node overlaps as a start tag with the
        // range then we need to move the remaining children to fromParent.
        if (tokenType === TokenType.Start && !ended) {
          // TODO(hackerwins): Define more clearly merge-able rules
          // between two parents. For now, we only merge two parents are
          // both element nodes having text children.
          // e.g. <p>a|b</p><p>c|d</p> -> <p>a|d</p>
          // if (!fromParent.hasTextChild() || !toParent.hasTextChild()) {
          //   return;
          // }

          for (const child of node.children) {
            toBeMovedToFromParents.push(child);
          }
        }

        const actorID = node.getCreatedAt().getActorID();
        const maxCreatedAt = maxCreatedAtMapByActor
          ? maxCreatedAtMapByActor!.has(actorID)
            ? maxCreatedAtMapByActor!.get(actorID)!
            : InitialTimeTicket
          : MaxTimeTicket;

        // NOTE(sejongk): If the node is removable or its parent is going to
        // be removed, then this node should be removed.
        if (
          node.canDelete(editedAt, maxCreatedAt) ||
          nodesToBeRemoved.includes(node.parent!)
        ) {
          const maxCreatedAt = maxCreatedAtMap.get(actorID);
          const createdAt = node.getCreatedAt();

          if (!maxCreatedAt || createdAt.after(maxCreatedAt)) {
            maxCreatedAtMap.set(actorID, createdAt);
          }

          // NOTE(hackerwins): If the node overlaps as an end token with the
          // range then we need to keep the node.
          if (tokenType === TokenType.Text || tokenType === TokenType.Start) {
            nodesToBeRemoved.push(node);
          }
          tokensToBeRemoved.push([node, tokenType]);
        }
      },
    );

    // NOTE(hackerwins): If concurrent deletion happens, we need to separate the
    // range(from, to) into multiple ranges.
    const changes: Array<TreeChange> = this.makeDeletionChanges(
      tokensToBeRemoved,
      editedAt,
    );

    // 02. Delete: delete the nodes that are marked as removed.
    const pairs: Array<GCPair> = [];
    for (const node of nodesToBeRemoved) {
      node.remove(editedAt);
      if (node.isRemoved) {
        pairs.push({ parent: this, child: node });
      }
    }

    // 03. Merge: move the nodes that are marked as moved.
    for (const node of toBeMovedToFromParents) {
      if (!node.removedAt) {
        fromParent.append(node);
      }
    }

    // 04. Split: split the element nodes for the given split level.
    if (splitLevel > 0) {
      let splitCount = 0;
      let parent = fromParent;
      let left = fromLeft;
      while (splitCount < splitLevel) {
        parent.split(this, parent.findOffset(left) + 1, issueTimeTicket);
        left = parent;
        parent = parent.parent!;
        splitCount++;
      }
      changes.push({
        type: TreeChangeType.Content,
        from: fromIdx,
        to: fromIdx,
        fromPath,
        toPath: fromPath,
        actor: editedAt.getActorID(),
      });
    }

    // 05. Insert: insert the given nodes at the given position.
    if (contents?.length) {
      const aliveContents: Array<CRDTTreeNode> = [];
      let leftInChildren = fromLeft; // tree
      for (const content of contents) {
        // 05-1. Insert the content nodes to the tree.
        if (leftInChildren === fromParent) {
          // 05-1-1. when there's no leftSibling, then insert content into very front of parent's children.
          fromParent.insertAt(content, 0);
        } else {
          // 05-1-2. insert after leftSibling
          fromParent.insertAfter(content, leftInChildren);
        }

        leftInChildren = content;
        traverseAll(content, (node) => {
          // If insertion happens during concurrent editing and parent node has been removed,
          // make new nodes as tombstone immediately.
          if (fromParent.isRemoved) {
            node.remove(editedAt);

            pairs.push({ parent: this, child: node });
          }

          this.nodeMapByID.put(node.id, node);
        });

        if (!content.isRemoved) {
          aliveContents.push(content);
        }
      }
      if (aliveContents.length) {
        const value = aliveContents.map((content) => toTreeNode(content));
        if (changes.length && changes[changes.length - 1].from === fromIdx) {
          changes[changes.length - 1].value = value;
        } else {
          changes.push({
            type: TreeChangeType.Content,
            from: fromIdx,
            to: fromIdx,
            fromPath,
            toPath: fromPath,
            actor: editedAt.getActorID(),
            value,
          });
        }
      }
    }

    return [changes, pairs, maxCreatedAtMap];
  }

  /**
   * `editT` edits the given range with the given value.
   * This method uses indexes instead of a pair of TreePos for testing.
   */
  public editT(
    range: [number, number],
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    editedAt: TimeTicket,
    issueTimeTicket: () => TimeTicket,
  ): void {
    const fromPos = this.findPos(range[0]);
    const toPos = this.findPos(range[1]);
    this.edit(
      [fromPos, toPos],
      contents,
      splitLevel,
      editedAt,
      issueTimeTicket,
    );
  }

  /**
   * `move` move the given source range to the given target range.
   */
  public move(
    target: [number, number],
    source: [number, number],
    ticket: TimeTicket,
  ): void {
    // TODO(hackerwins, easylogic): Implement this with keeping references of the nodes.
    throw new YorkieError(
      Code.ErrUnimplemented,
      `not implemented: ${target}, ${source}, ${ticket}`,
    );
  }

  /**
   * `purge` physically purges the given node.
   */
  public purge(node: CRDTTreeNode): void {
    node.parent?.removeChild(node);
    this.nodeMapByID.remove(node.id);

    const insPrevID = node.insPrevID;
    const insNextID = node.insNextID;

    if (insPrevID) {
      const insPrev = this.findFloorNode(insPrevID)!;
      insPrev.insNextID = insNextID;
    }

    if (insNextID) {
      const insNext = this.findFloorNode(insNextID)!;
      insNext.insPrevID = insPrevID;
    }

    node.insPrevID = undefined;
    node.insNextID = undefined;
  }

  /**
   * `getGCPairs` returns the pairs of GC.
   */
  public getGCPairs(): Array<GCPair> {
    const pairs: Array<GCPair> = [];
    this.indexTree.traverse((node) => {
      if (node.getRemovedAt()) {
        pairs.push({ parent: this, child: node });
      }

      for (const p of node.getGCPairs()) {
        pairs.push(p);
      }
    });

    return pairs;
  }

  /**
   * `findPos` finds the position of the given index in the tree.
   */
  public findPos(index: number, preferText = true): CRDTTreePos {
    const treePos = this.indexTree.findTreePos(index, preferText);
    return CRDTTreePos.fromTreePos(treePos);
  }

  /**
   * `pathToPosRange` converts the given path of the node to the range of the position.
   */
  public pathToPosRange(path: Array<number>): [CRDTTreePos, CRDTTreePos] {
    const fromIdx = this.pathToIndex(path);
    return [this.findPos(fromIdx), this.findPos(fromIdx + 1)];
  }

  /**
   * `pathToPos` finds the position of the given index in the tree by path.
   */
  public pathToPos(path: Array<number>): CRDTTreePos {
    const index = this.indexTree.pathToIndex(path);
    return this.findPos(index);
  }

  /**
   * `getRoot` returns the root node of the tree.
   */
  public getRoot(): CRDTTreeNode {
    return this.indexTree.getRoot();
  }

  /**
   * `getSize` returns the size of the tree.
   */
  public getSize(): number {
    return this.indexTree.size;
  }

  /**
   * `getNodeSize` returns the size of the LLRBTree.
   */
  public getNodeSize(): number {
    return this.nodeMapByID.size();
  }

  /**
   * `getIndexTree` returns the index tree.
   */
  public getIndexTree(): IndexTree<CRDTTreeNode> {
    return this.indexTree;
  }

  /**
   * toXML returns the XML encoding of this tree.
   */
  public toXML(): string {
    return toXML(this.indexTree.getRoot());
  }

  /**
   * `toJSON` returns the JSON encoding of this tree.
   */
  public toJSON(): string {
    return JSON.stringify(this.getRootTreeNode());
  }

  /**
   * `toJSForTest` returns value with meta data for testing.
   *
   * @internal
   */
  public toJSForTest(): Devtools.JSONElement {
    return {
      createdAt: this.getCreatedAt().toTestString(),
      value: JSON.parse(this.toJSON()),
      type: 'YORKIE_TREE',
    };
  }

  /**
   * `toJSInfoForTest` returns detailed TreeNode information for use in Devtools.
   *
   * @internal
   */
  public toJSInfoForTest(): Devtools.TreeNodeInfo {
    const rootNode = this.indexTree.getRoot();

    const toTreeNodeInfo = (
      node: CRDTTreeNode,
      parentNode: CRDTTreeNode | undefined = undefined,
      leftChildNode: CRDTTreeNode | undefined = undefined,
      depth = 0,
    ): Devtools.TreeNodeInfo => {
      let index, path, pos;

      const treePos = node.isText
        ? { node, offset: 0 }
        : parentNode && leftChildNode
        ? this.toTreePos(parentNode, leftChildNode)
        : null;

      if (treePos) {
        index = this.indexTree.indexOf(treePos);
        path = this.indexTree.treePosToPath(treePos);
        pos = CRDTTreePos.fromTreePos(treePos).toStruct();
      }

      const nodeInfo: Devtools.TreeNodeInfo = {
        type: node.type,
        parent: parentNode?.id.toTestString(),
        size: node.size,
        id: node.id.toTestString(),
        removedAt: node.removedAt?.toTestString(),
        insPrev: node.insPrevID?.toTestString(),
        insNext: node.insNextID?.toTestString(),
        value: node.isText ? node.value : undefined,
        isRemoved: node.isRemoved,
        children: [] as Array<Devtools.TreeNodeInfo>,
        depth,
        attributes: node.attrs
          ? parseObjectValues(node.attrs?.toObject())
          : undefined,
        index,
        path,
        pos,
      };

      for (let i = 0; i < node.allChildren.length; i++) {
        const leftChildNode = i === 0 ? node : node.allChildren[i - 1];
        nodeInfo.children.push(
          toTreeNodeInfo(node.allChildren[i], node, leftChildNode, depth + 1),
        );
      }

      return nodeInfo;
    };

    return toTreeNodeInfo(rootNode);
  }

  /**
   * `getRootTreeNode` returns the converted value of this tree to TreeNode.
   */
  public getRootTreeNode(): TreeNode {
    return toTreeNode(this.indexTree.getRoot());
  }

  /**
   * `toTestTreeNode` returns the JSON of this tree for debugging.
   */
  public toTestTreeNode(): TreeNodeForTest {
    return toTestTreeNode(this.indexTree.getRoot());
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this tree.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTTree {
    const root = this.getRoot();
    return new CRDTTree(root.deepcopy(), this.getCreatedAt());
  }

  /**
   * `toPath` converts the given CRDTTreeNodeID to the path of the tree.
   */
  public toPath(
    parentNode: CRDTTreeNode,
    leftNode: CRDTTreeNode,
  ): Array<number> {
    const treePos = this.toTreePos(parentNode, leftNode);
    if (!treePos) {
      return [];
    }

    return this.indexTree.treePosToPath(treePos);
  }

  /**
   * `toIndex` converts the given CRDTTreeNodeID to the index of the tree.
   */
  public toIndex(parentNode: CRDTTreeNode, leftNode: CRDTTreeNode): number {
    const treePos = this.toTreePos(parentNode, leftNode);
    if (!treePos) {
      return -1;
    }

    return this.indexTree.indexOf(treePos);
  }

  /**
   * `indexToPath` converts the given tree index to path.
   */
  public indexToPath(index: number): Array<number> {
    return this.indexTree.indexToPath(index);
  }

  /**
   * `pathToIndex` converts the given path to index.
   */
  public pathToIndex(path: Array<number>): number {
    return this.indexTree.pathToIndex(path);
  }

  /**
   * `indexRangeToPosRange` returns the position range from the given index range.
   */
  public indexRangeToPosRange(range: [number, number]): TreePosRange {
    const fromPos = this.findPos(range[0]);
    if (range[0] === range[1]) {
      return [fromPos, fromPos];
    }
    return [fromPos, this.findPos(range[1])];
  }

  /**
   * `indexRangeToPosStructRange` converts the integer index range into the Tree position range structure.
   */
  public indexRangeToPosStructRange(
    range: [number, number],
  ): TreePosStructRange {
    const [fromIdx, toIdx] = range;
    const fromPos = this.findPos(fromIdx);
    if (fromIdx === toIdx) {
      return [fromPos.toStruct(), fromPos.toStruct()];
    }

    return [fromPos.toStruct(), this.findPos(toIdx).toStruct()];
  }

  /**
   * `posRangeToPathRange` converts the given position range to the path range.
   */
  public posRangeToPathRange(
    range: TreePosRange,
  ): [Array<number>, Array<number>] {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(range[0]);
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1]);
    return [this.toPath(fromParent, fromLeft), this.toPath(toParent, toLeft)];
  }

  /**
   * `posRangeToIndexRange` converts the given position range to the path range.
   */
  public posRangeToIndexRange(range: TreePosRange): [number, number] {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(range[0]);
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1]);
    return [this.toIndex(fromParent, fromLeft), this.toIndex(toParent, toLeft)];
  }

  /**
   * `traverseInPosRange` traverses the tree in the given position range.
   */
  private traverseInPosRange(
    fromParent: CRDTTreeNode,
    fromLeft: CRDTTreeNode,
    toParent: CRDTTreeNode,
    toLeft: CRDTTreeNode,
    callback: (token: TreeToken<CRDTTreeNode>, ended: boolean) => void,
  ): void {
    const fromIdx = this.toIndex(fromParent, fromLeft);
    const toIdx = this.toIndex(toParent, toLeft);
    return this.indexTree.tokensBetween(fromIdx, toIdx, callback);
  }

  /**
   * `toTreePos` converts the given nodes to the position of the IndexTree.
   */
  private toTreePos(
    parentNode: CRDTTreeNode,
    leftNode: CRDTTreeNode,
  ): TreePos<CRDTTreeNode> | undefined {
    if (!parentNode || !leftNode) {
      return;
    }

    if (parentNode.isRemoved) {
      let childNode: CRDTTreeNode;
      while (parentNode.isRemoved) {
        childNode = parentNode;
        parentNode = childNode.parent!;
      }

      const offset = parentNode.findOffset(childNode!);
      return {
        node: parentNode,
        offset,
      };
    }

    if (parentNode === leftNode) {
      return {
        node: parentNode,
        offset: 0,
      };
    }

    let offset = parentNode.findOffset(leftNode);
    if (!leftNode.isRemoved) {
      if (leftNode.isText) {
        return {
          node: leftNode,
          offset: leftNode.paddedSize,
        };
      }

      offset++;
    }

    return {
      node: parentNode,
      offset,
    };
  }

  /**
   * `makeDeletionChanges` converts nodes to be deleted to deletion changes.
   */
  private makeDeletionChanges(
    candidates: Array<TreeToken<CRDTTreeNode>>,
    editedAt: TimeTicket,
  ): Array<TreeChange> {
    const changes: Array<TreeChange> = [];
    const ranges: Array<Array<TreeToken<CRDTTreeNode>>> = [];

    // Generate ranges by accumulating consecutive nodes.
    let start = null;
    let end = null;
    for (let i = 0; i < candidates.length; i++) {
      const cur = candidates[i];
      const next = candidates[i + 1];
      if (!start) {
        start = cur;
      }
      end = cur;

      const rightToken = this.findRightToken(cur);
      if (
        !rightToken ||
        !next ||
        rightToken[0] !== next[0] ||
        rightToken[1] !== next[1]
      ) {
        ranges.push([start, end]);
        start = null;
        end = null;
      }
    }

    // Convert each range to a deletion change.
    for (const range of ranges) {
      const [start, end] = range;
      const [fromLeft, fromLeftTokenType] = this.findLeftToken(start);
      const [toLeft, toLeftTokenType] = end;
      const fromParent =
        fromLeftTokenType === TokenType.Start ? fromLeft : fromLeft.parent!;
      const toParent =
        toLeftTokenType === TokenType.Start ? toLeft : toLeft.parent!;

      const fromIdx = this.toIndex(fromParent, fromLeft);
      const toIdx = this.toIndex(toParent, toLeft);
      if (fromIdx < toIdx) {
        // When the range is overlapped with the previous one, compact them.
        if (changes.length > 0 && fromIdx === changes[changes.length - 1].to) {
          changes[changes.length - 1].to = toIdx;
          changes[changes.length - 1].toPath = this.toPath(toParent, toLeft);
        } else {
          changes.push({
            type: TreeChangeType.Content,
            from: fromIdx,
            to: toIdx,
            fromPath: this.toPath(fromParent, fromLeft),
            toPath: this.toPath(toParent, toLeft),
            actor: editedAt.getActorID(),
          });
        }
      }
    }
    return changes.reverse();
  }

  /**
   * `findRightToken` returns the token to the right of the given token in the tree.
   */
  private findRightToken([
    node,
    tokenType,
  ]: TreeToken<CRDTTreeNode>): TreeToken<CRDTTreeNode> {
    if (tokenType === TokenType.Start) {
      const children = node.allChildren;
      if (children.length > 0) {
        return [
          children[0],
          children[0].isText ? TokenType.Text : TokenType.Start,
        ];
      }
      return [node, TokenType.End];
    }

    const parent = node.parent!;
    const siblings = parent.allChildren;
    const offset = siblings.indexOf(node);
    if (parent && offset === siblings.length - 1) {
      return [parent, TokenType.End];
    }

    const next = siblings[offset + 1];
    return [next, next.isText ? TokenType.Text : TokenType.Start];
  }

  /**
   * `findLeftToken` returns the token to the left of the given token in the tree.
   */
  private findLeftToken([
    node,
    tokenType,
  ]: TreeToken<CRDTTreeNode>): TreeToken<CRDTTreeNode> {
    if (tokenType === TokenType.End) {
      const children = node.allChildren;
      if (children.length > 0) {
        const lastChild = children[children.length - 1];
        return [lastChild, lastChild.isText ? TokenType.Text : TokenType.End];
      }

      return [node, TokenType.Start];
    }

    const parent = node.parent!;
    const siblings = parent.allChildren;
    const offset = siblings.indexOf(node);
    if (parent && offset === 0) {
      return [parent, TokenType.Start];
    }

    const prev = siblings[offset - 1];
    return [prev, prev.isText ? TokenType.Text : TokenType.End];
  }
}
