import { DefaultTextType } from './../../util/index_tree';
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
import { CRDTGCElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  IndexTree,
  TreePos,
  IndexTreeNode,
  TreeNodeType,
  traverseAll,
  TagContained,
  traverse,
  findCommonAncestor,
  getAncestors,
} from '@yorkie-js-sdk/src/util/index_tree';
import { RHT } from './rht';
import { ActorID } from './../time/actor_id';
import { LLRBTree } from '@yorkie-js-sdk/src/util/llrb_tree';
import { Comparator } from '@yorkie-js-sdk/src/util/comparator';
import { parseObjectValues } from '@yorkie-js-sdk/src/util/object';
import { getUpperBound } from '@yorkie-js-sdk/src/util/array';

/**
 * `TreeNode` represents the JSON representation of a node in the tree.
 * It is used to serialize and deserialize the tree.
 */
export type TreeNode = {
  type: TreeNodeType;
  children?: Array<TreeNode>;
  value?: string;
  attributes?: { [key: string]: any };
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
}

enum InternalOperationType {
  Edit = 'edit',
  Style = 'style',
  Move = 'move',
}

enum TreeMoveRange {
  Separated = 'separated',
  Contained = 'contained',
  None = 'none',
}

/**
 * `TreeChange` represents the change in the tree.
 */
export interface TreeChange {
  actor: ActorID;
  type: TreeChangeType;
  from: number;
  to: number;
  fromPath: Array<number>;
  toPath: Array<number>;
  value?: Array<TreeNode> | { [key: string]: any };
}

/**
 * `InternalOperation`
 */
abstract class InternalOperation {
  private type: InternalOperationType;
  private editedAt: TimeTicket;

  constructor(editedAt: TimeTicket, type: InternalOperationType) {
    this.editedAt = editedAt;
    this.type = type;
  }

  /**
   * `getEditedAt` returns editedAt
   */
  public getEditedAt() {
    return this.editedAt;
  }

  /**
   * `getType` returns operation type
   */
  public getType() {
    return this.type;
  }
}

/**
 * `InternalEditOperation`
 */
class InternalEditOperation extends InternalOperation {
  private from: CRDTTreePos;
  private to: CRDTTreePos;
  private contents: Array<CRDTTreeNode> | undefined;

  constructor(
    from: CRDTTreePos,
    to: CRDTTreePos,
    contents: Array<CRDTTreeNode> | undefined,
    timeTicket: TimeTicket,
  ) {
    super(timeTicket, InternalOperationType.Edit);

    this.from = from;
    this.to = to;
    this.contents = contents;
  }

  /**
   * `getFrom` returns from of operation
   */
  public getFrom() {
    return this.from;
  }

  /**
   * `getTo` returns to of operation
   */
  public getTo() {
    return this.to;
  }

  /**
   * `getContents` returns contents of operation
   */
  public getContents() {
    return this.contents;
  }
}

/**
 * `InternalOperation`
 */
class InternalStyleOperation extends InternalOperation {
  private from: CRDTTreePos;
  private to: CRDTTreePos;
  private attributes: { [key: string]: any } | undefined;

  constructor(
    from: CRDTTreePos,
    to: CRDTTreePos,
    attributes: { [key: string]: any } | undefined,
    timeTicket: TimeTicket,
  ) {
    super(timeTicket, InternalOperationType.Style);

    this.from = from;
    this.to = to;
    this.attributes = attributes;
  }

  /**
   * `getFrom` returns from of operation
   */
  public getFrom() {
    return this.from;
  }

  /**
   * `getTo` returns to of operation
   */
  public getTo() {
    return this.to;
  }

  /**
   * `attributes` returns contents of operation
   */
  public getAttributes() {
    return this.attributes;
  }
}

/**
 * `InternalOperation`
 */
class InternalMoveOperation extends InternalOperation {
  private from: CRDTTreePos;
  private to: CRDTTreePos;
  private gapFrom: CRDTTreePos;
  private gapTo: CRDTTreePos;
  private slice: Array<CRDTTreeNode>;

  constructor(
    from: CRDTTreePos,
    to: CRDTTreePos,
    gapFrom: CRDTTreePos,
    gapTo: CRDTTreePos,
    slice: Array<CRDTTreeNode>,
    timeTicket: TimeTicket,
  ) {
    super(timeTicket, InternalOperationType.Style);

    this.from = from;
    this.to = to;
    this.gapFrom = gapFrom;
    this.gapTo = gapTo;
    this.slice = slice;
  }

  /**
   * `getFrom` returns from of operation
   */
  public getFrom() {
    return this.from;
  }

  /**
   * `getTo` returns to of operation
   */
  public getTo() {
    return this.to;
  }

  /**
   * `getGapFrom` returns gapFrom of operation
   */
  public getGapFrom() {
    return this.gapFrom;
  }

  /**
   * `getGapTo` returns gapTo of operation
   */
  public getGapTo() {
    return this.gapTo;
  }

  /**
   * `slice` returns slice of moved tree nodes
   */
  public getSlice() {
    return this.slice;
  }
}

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
 * `TreePosStructRange` represents the structure of TreeRange.
 * It is used to serialize and deserialize the TreeRange.
 */
export type TreePosStructRange = [CRDTTreePosStruct, CRDTTreePosStruct];

/**
 * `CRDTTreeNode` is a node of CRDTTree. It is includes the logical clock and
 * links to other nodes to resolve conflicts.
 */
export class CRDTTreeNode extends IndexTreeNode<CRDTTreeNode> {
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

    if (this.insNextID) {
      clone.insNextID = this.insNextID;
    }

    if (this.insPrevID) {
      clone.insPrevID = this.insPrevID;
    }

    clone._children = this._children.map((child) => {
      const childClone = child.deepcopy();
      childClone.parent = clone;
      return childClone;
    });
    return clone;
  }

  /**
   * `value` returns the value of the node.
   */
  get value() {
    if (!this.isText) {
      throw new Error(`cannot get value of element node: ${this.type}`);
    }

    return this._value;
  }

  /**
   * `value` sets the value of the node.
   */
  set value(v: string) {
    if (!this.isText) {
      throw new Error(`cannot set value of element node: ${this.type}`);
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
   * `clone` clones this node with the given offset.
   */
  clone(offset: number): CRDTTreeNode {
    return new CRDTTreeNode(
      CRDTTreeNodeID.of(this.id.getCreatedAt(), offset),
      this.type,
      undefined,
      undefined,
      this.removedAt,
    );
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
  public canDelete(editedAt: TimeTicket, latestCreatedAt: TimeTicket): boolean {
    return (
      !this.getCreatedAt().after(latestCreatedAt) &&
      (!this.removedAt || editedAt.after(this.removedAt))
    );
  }
}

/**
 * toTreeNode converts the given CRDTTreeNode to TreeNode.
 */
function toTreeNode(node: CRDTTreeNode): TreeNode {
  if (node.isText) {
    const currentNode = node;
    return {
      type: currentNode.type,
      value: currentNode.value,
    };
  }

  return {
    type: node.type,
    children: node.children.map(toTreeNode),
    attributes: node.attrs
      ? parseObjectValues(node.attrs?.toObject())
      : undefined,
  };
}

/**
 * toXML converts the given CRDTNode to XML string.
 */
export function toXML(node: CRDTTreeNode): string {
  if (node.isText) {
    const currentNode = node;
    return currentNode.value;
  }

  return `<${node.type}${node.attrs?.toXML() || ''}>${node.children
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
    };
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
export class CRDTTree extends CRDTGCElement {
  private indexTree: IndexTree<CRDTTreeNode>;
  private nodeMapByID: LLRBTree<CRDTTreeNodeID, CRDTTreeNode>;
  private removedNodeMap: Map<string, CRDTTreeNode>;
  private operationLog: Array<InternalOperation>;
  private trashNode: Map<TimeTicket, Array<CRDTTreeNode>>;

  constructor(root: CRDTTreeNode, createdAt: TimeTicket) {
    super(createdAt);
    this.indexTree = new IndexTree<CRDTTreeNode>(root);
    this.nodeMapByID = new LLRBTree(CRDTTreeNodeID.createComparator());
    this.removedNodeMap = new Map();
    this.operationLog = [];
    this.trashNode = new Map<TimeTicket, Array<CRDTTreeNode>>();

    this.indexTree.traverse((node) => {
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
  private findFloorNode(id: CRDTTreeNodeID) {
    const entry = this.nodeMapByID.floorEntry(id);

    if (!entry || !entry.key.getCreatedAt().equals(id.getCreatedAt())) {
      return;
    }

    return entry.value;
  }

  /**
   * `findNodesAndSplitText` finds `TreePos` of the given `CRDTTreeNodeID` and
   * splits the text node if necessary.
   *
   * `CRDTTreeNodeID` is a position in the CRDT perspective. This is
   * different from `TreePos` which is a position of the tree in the local
   * perspective.
   */
  public findNodesAndSplitText(pos: CRDTTreePos): [CRDTTreeNode, CRDTTreeNode] {
    const treeNodes = this.toTreeNodes(pos);

    if (!treeNodes) {
      throw new Error(`cannot find node at ${pos}`);
    }
    const [parentNode] = treeNodes;
    const [, leftSiblingNode] = treeNodes;

    // Find the appropriate position. This logic is similar to the logical to
    // handle the same position insertion of RGA.

    if (leftSiblingNode.isText) {
      const absOffset = leftSiblingNode.id.getOffset();
      const split = leftSiblingNode.split(
        pos.getLeftSiblingID().getOffset() - absOffset,
        absOffset,
      );

      if (split) {
        split.insPrevID = leftSiblingNode.id;
        this.nodeMapByID.put(split.id, split);

        if (leftSiblingNode.insNextID) {
          const insNext = this.findFloorNode(leftSiblingNode.insNextID)!;

          insNext.insPrevID = split.id;
          split.insNextID = leftSiblingNode.insNextID;
        }
        leftSiblingNode.insNextID = split.id;
      }
    }

    return [parentNode, leftSiblingNode];
  }

  private do<T extends InternalOperation>(
    operation: T,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ) {
    switch (operation.getType()) {
      case InternalOperationType.Edit: {
        return this.doEdit(
          operation as unknown as InternalEditOperation,
          latestCreatedAtMapByActor,
        );
      }
      case InternalOperationType.Style: {
        return this.doStyle(operation as unknown as InternalStyleOperation);
      }
      case InternalOperationType.Move: {
        return this.doMove(operation as unknown as InternalMoveOperation);
      }
    }
  }

  private undo<T extends InternalOperation>(operation: T) {
    switch (operation.getType()) {
      case InternalOperationType.Edit: {
        return this.undoEdit(operation as unknown as InternalEditOperation);
      }
      case InternalOperationType.Style: {
        return this.undoStyle(operation as unknown as InternalStyleOperation);
      }
      case InternalOperationType.Move: {
        return this.undoMove(operation as unknown as InternalMoveOperation);
      }
    }
  }

  private getOperationsToUndo<T extends InternalOperation>(operation: T) {
    const upperBoundIndex = getUpperBound(
      this.operationLog,
      operation,
      (existOp, newOp) => {
        const existOpEditedAt = existOp.getEditedAt();
        const newOpEditedAt = newOp.getEditedAt();

        return existOpEditedAt.compare(newOpEditedAt);
      },
    );
    const operationsToUndo = this.operationLog.slice(
      upperBoundIndex,
      this.operationLog.length,
    );

    this.operationLog.splice(upperBoundIndex, 0, operation);

    return operationsToUndo;
  }

  /**
   * `style` applies the given attributes of the given range.
   */
  public style(
    range: [CRDTTreePos, CRDTTreePos],
    attributes: { [key: string]: string } | undefined,
    editedAt: TimeTicket,
  ) {
    const operation = new InternalStyleOperation(
      range[0],
      range[1],
      attributes,
      editedAt,
    );
    const operationsToUndo = this.getOperationsToUndo(operation);

    [...operationsToUndo].reverse().forEach((op) => this.undo(op));

    const changes = this.doStyle(operation);

    operationsToUndo.forEach((op) => this.do(op));

    return changes;
  }

  private doStyle(operation: InternalStyleOperation) {
    const from = operation.getFrom();
    const to = operation.getTo();
    const attributes = operation.getAttributes();
    const editedAt = operation.getEditedAt();

    const [fromParent, fromLeft] = this.findNodesAndSplitText(from);
    const [toParent, toLeft] = this.findNodesAndSplitText(to);
    const changes: Array<TreeChange> = [];

    changes.push({
      type: TreeChangeType.Style,
      from: this.toIndex(fromParent, fromLeft),
      to: this.toIndex(toParent, toLeft),
      fromPath: this.toPath(fromParent, fromLeft),
      toPath: this.toPath(toParent, toLeft),
      actor: editedAt.getActorID()!,
      value: attributes ? parseObjectValues(attributes) : undefined,
    });

    this.traverseInPosRange(fromParent, fromLeft, toParent, toLeft, (node) => {
      if (!node.isRemoved && !node.isText && attributes) {
        if (!node.attrs) {
          node.attrs = new RHT();
        }

        for (const [key, value] of Object.entries(attributes)) {
          node.attrs.set(key, value, editedAt);
        }
      }
    });

    return changes;
  }

  private undoStyle(operation: InternalStyleOperation) {
    const from = operation.getFrom();
    const to = operation.getTo();
    const attributes = operation.getAttributes();
    const editedAt = operation.getEditedAt();

    if (!attributes) {
      return;
    }

    const [fromParent, fromLeft] = this.findNodesAndSplitText(from);
    const [toParent, toLeft] = this.findNodesAndSplitText(to);

    this.traverseInPosRange(fromParent, fromLeft, toParent, toLeft, (node) => {
      const attrs = [...(node.attrs ?? [])].reduce((acc, attr) => {
        const key = attr.getKey();
        const updatedAt = attr.getUpdatedAt();

        acc[key] = updatedAt;

        return acc;
      }, {} as { [key: string]: TimeTicket });
      for (const [key] of Object.entries(attributes)) {
        if (
          !node.isRemoved &&
          !node.isText &&
          node.attrs?.has(key) &&
          editedAt.equals(attrs[key])
        ) {
          node.attrs?.delete(key);
        }
      }
    });
  }

  private undoEdit(operation: InternalEditOperation) {
    const from = operation.getFrom();
    const to = operation.getTo();
    const content = operation.getContents();
    const editedAt = operation.getEditedAt();

    // 1. remove inserted tree nodes
    content?.forEach((treeNode) => {
      // 1-1 remove subtree from nodeMapByID and recalculate parent size
      traverse(treeNode, (node) => {
        this.nodeMapByID.remove(node.id);

        if (!node.isRemoved) {
          node.remove(MaxTimeTicket);
          node.removedAt = undefined;
        }
      });

      // 1-2 remove subtree from its parent
      treeNode.parent!.removeChild(treeNode);
    });

    const latestCreatedAtMap = new Map<string, TimeTicket>();

    // 2. restore deleted nodes
    if (!from.equals(to)) {
      const removeds = this.trashNode.get(editedAt);

      if (removeds?.length) {
        // 2. restore removed nodes
        removeds.forEach((node) => {
          const createdAt = node.getCreatedAt();
          const actorID = createdAt.getActorID()!;
          const latestCreatedAt = latestCreatedAtMap.get(actorID);

          // 2-1. restore lastestCreatedAtMap to protect nodes when redo operation
          if (!latestCreatedAt) {
            latestCreatedAtMap.set(actorID, createdAt);
          } else {
            createdAt.after(latestCreatedAt) &&
              latestCreatedAtMap.set(actorID, createdAt);
          }

          node.removedAt = undefined;
          node.updateAncestorsSize();
          if (this.removedNodeMap.has(node.id.toIDString())) {
            this.removedNodeMap.delete(node.id.toIDString());
          }
        });

        this.trashNode.delete(editedAt);
      }
    }

    return latestCreatedAtMap;
  }

  private doEdit(
    operation: InternalEditOperation,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Array<TreeChange>, Map<string, TimeTicket>] {
    const from = operation.getFrom();
    const to = operation.getTo();
    const editedAt = operation.getEditedAt();
    const contents = operation.getContents();

    // 01. split text nodes at the given range if needed.
    const [fromParent, fromLeft] = this.findNodesAndSplitText(from);
    const [toParent, toLeft] = this.findNodesAndSplitText(to);

    // TODO(hackerwins): If concurrent deletion happens, we need to seperate the
    // range(from, to) into multiple ranges.
    const changes: Array<TreeChange> = [];
    changes.push({
      type: TreeChangeType.Content,
      from: this.toIndex(fromParent, fromLeft),
      to: this.toIndex(toParent, toLeft),
      fromPath: this.toPath(fromParent, fromLeft),
      toPath: this.toPath(toParent, toLeft),
      actor: editedAt.getActorID()!,
      value: contents?.length
        ? contents.map((content) => toTreeNode(content))
        : undefined,
    });

    const toBeRemoveds: Array<CRDTTreeNode> = [];
    const latestCreatedAtMap = new Map<string, TimeTicket>();

    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      (node, contain) => {
        // If node is a element node and half-contained in the range,
        // it should not be removed.

        if (!node.isText && contain != TagContained.All) {
          return;
        }

        const actorID = node.getCreatedAt().getActorID()!;
        const latestCreatedAt = latestCreatedAtMapByActor
          ? latestCreatedAtMapByActor!.has(actorID!)
            ? latestCreatedAtMapByActor!.get(actorID!)!
            : InitialTimeTicket
          : MaxTimeTicket;

        if (node.canDelete(editedAt, latestCreatedAt)) {
          const latestCreatedAt = latestCreatedAtMap.get(actorID);
          const createdAt = node.getCreatedAt();

          if (!latestCreatedAt || createdAt.after(latestCreatedAt)) {
            latestCreatedAtMap.set(actorID, createdAt);
          }

          toBeRemoveds.push(node);
        }
      },
    );

    for (const node of toBeRemoveds) {
      node.remove(editedAt);

      this.removedNodeMap.set(node.id.toIDString(), node);
    }

    // 03. insert the given node at the given position.
    if (contents?.length) {
      let leftInChildren = fromLeft; // tree

      for (const content of contents!) {
        // 03-1. insert the content nodes to the tree.
        if (leftInChildren === fromParent) {
          // 03-1-1. when there's no leftSibling, then insert content into very front of parent's children List
          fromParent.insertAt(content, 0);
        } else {
          // 03-1-2. insert after leftSibling
          fromParent.insertAfter(content, leftInChildren);
        }

        leftInChildren = content;
        traverseAll(content, (node) => {
          // if insertion happens during concurrent editing and parent node has been removed,
          // make new nodes as tombstone immediately
          if (fromParent.isRemoved) {
            node.remove(editedAt);

            this.removedNodeMap.set(node.id.toIDString(), node);
          }

          this.nodeMapByID.put(node.id, node);
        });
      }
    }

    return [changes, latestCreatedAtMap];
  }

  /**
   * `edit` edits the tree with the given range and content.
   * If the content is undefined, the range will be removed.
   */
  public edit(
    range: [CRDTTreePos, CRDTTreePos],
    contents: Array<CRDTTreeNode> | undefined,
    editedAt: TimeTicket,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Array<TreeChange>, Map<string, TimeTicket>] {
    const operation = new InternalEditOperation(
      range[0],
      range[1],
      contents,
      editedAt,
    );
    const operationsToUndo = this.getOperationsToUndo(operation);

    [...operationsToUndo].reverse().forEach((op) => this.undo(op));

    const [changes, latestCreatedAtMap] = this.doEdit(
      operation,
      latestCreatedAtMapByActor,
    );

    operationsToUndo.forEach((op) =>
      this.do(op, latestCreatedAtMap.size ? latestCreatedAtMap : undefined),
    );

    return [changes, latestCreatedAtMap];
  }

  private traverseInPosRange(
    fromParent: CRDTTreeNode,
    fromLeft: CRDTTreeNode,
    toParent: CRDTTreeNode,
    toLeft: CRDTTreeNode,
    callback: (node: CRDTTreeNode, contain: TagContained) => void,
  ): void {
    const fromIdx = this.toIndex(fromParent, fromLeft);
    const toIdx = this.toIndex(toParent, toLeft);

    return this.indexTree.nodesBetween(fromIdx, toIdx, callback);
  }

  /**
   * `editByIndex` edits the given range with the given value.
   * This method uses indexes instead of a pair of TreePos for testing.
   */
  public editByIndex(
    range: [number, number],
    contents: Array<CRDTTreeNode> | undefined,
    editedAt: TimeTicket,
  ): void {
    const fromPos = this.findPos(range[0]);
    const toPos = this.findPos(range[1]);
    this.edit([fromPos, toPos], contents, editedAt);
  }

  /**
   * `moveByIndex` moves the given range with the given value.
   * This method uses indexes instead of a pair of TreePos for testing.
   */
  public moveByIndex(
    target: [number, number],
    source: [number, number],
    editedAt: TimeTicket,
  ): void {
    const [from, to] = [this.findPos(target[0]), this.findPos(target[1])];
    const [gapFrom, gapTo] = [this.findPos(source[0]), this.findPos(source[1])];

    return this.move([from, to], [gapFrom, gapTo], editedAt);
  }

  /**
   * `split` splits the node at the given index.
   */
  public split(index: number, depth = 1): TreePos<CRDTTreeNode> {
    // TODO(hackerwins, easylogic): Implement this with keeping references in the list.
    // return this.treeByIndex.split(index, depth);
    throw new Error(`not implemented, ${index} ${depth}`);
  }

  private createSlice(from: CRDTTreePos, to: CRDTTreePos): Array<CRDTTreeNode> {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(from);
    const [toParent, toLeft] = this.findNodesAndSplitText(to);

    // TOOD(JOOHOJANG): Have to discuss supporting multi level or not.
    if (fromParent !== toParent) {
      return [];
    }

    const startIndex =
      fromParent === fromLeft
        ? 0
        : fromParent.allChildren.indexOf(fromLeft) + 1;
    const endIndex = toParent.allChildren.indexOf(toLeft);

    return fromParent.allChildren.slice(startIndex, endIndex + 1);
  }

  private detectCycle(newParent: CRDTTreeNode, child: CRDTTreeNode) {
    while (newParent) {
      if (newParent === child) {
        return true;
      }

      newParent = newParent.parent!;
    }

    return false;
  }

  private undoMove(operation: InternalMoveOperation) {
    const from = operation.getFrom();
    const to = operation.getTo();
    const gapFrom = operation.getGapFrom();
    const editedAt = operation.getEditedAt();
    const slice = operation.getSlice();
    const [fromParent, fromLeft] = this.findNodesAndSplitText(from);
    const [toParent, toLeft] = this.findNodesAndSplitText(to);
    const [gapFromParent, gapFromLeft] = this.findNodesAndSplitText(gapFrom);

    // remove slice from parent.
    const sliceToLeft = this.findFloorNode(slice[slice.length - 1].id)!;
    this.traverseInPosRange(
      fromParent,
      fromLeft,
      fromParent,
      sliceToLeft,
      (node) => {
        if (this.nodeMapByID.get(node.id)) {
          this.nodeMapByID.remove(node.id);
        }

        node.remove(editedAt);
        node.parent?.removeChild(node);

        this.purge(node);
      },
    );

    // insert slice into gap
    let index =
      gapFromParent === gapFromLeft
        ? 0
        : gapFromParent.allChildren.indexOf(gapFromLeft) + 1;

    slice.forEach((node) => {
      this.nodeMapByID.put(node.id, node);

      gapFromParent.insertAt(node, index);
      index++;
    });

    // revive nodes between from ~ to
    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      (node, contain) => {
        if (!node.isText && contain != TagContained.All) {
          return;
        }

        if (node.removedAt?.equals(editedAt)) {
          node.removedAt = undefined;
          node.updateAncestorsSize();
        }
      },
    );
  }

  private checkRangeType(
    from: [CRDTTreeNode, CRDTTreeNode],
    to: [CRDTTreeNode, CRDTTreeNode],
    gapFrom: [CRDTTreeNode, CRDTTreeNode],
    gapTo: [CRDTTreeNode, CRDTTreeNode],
  ) {
    const fromIdx = this.toIndex(from[0], from[1]);
    const toIdx = this.toIndex(to[0], to[1]);
    const gapFromIdx = this.toIndex(gapFrom[0], gapTo[1]);
    const gapToIdx = this.toIndex(gapTo[0], gapTo[1]);

    if (fromIdx <= gapFromIdx && toIdx >= gapToIdx) {
      return TreeMoveRange.Contained;
    } else if (fromIdx >= gapToIdx || toIdx <= gapFromIdx) {
      return TreeMoveRange.Separated;
    } else {
      return TreeMoveRange.None;
    }
  }

  // TOOD(JOOHOJANG): define change
  private doMove(operation: InternalMoveOperation) {
    const from = operation.getFrom();
    const to = operation.getTo();
    const gapFrom = operation.getGapFrom();
    const gapTo = operation.getGapTo();
    const editedAt = operation.getEditedAt();
    const slice = operation.getSlice();
    const [fromParent, fromLeft] = this.findNodesAndSplitText(from);
    const [toParent, toLeft] = this.findNodesAndSplitText(to);
    const [gapFromParent, gapFromLeft] = this.findNodesAndSplitText(gapFrom);
    const [gapToParent, gapToLeft] = this.findNodesAndSplitText(gapTo);
    const sliceRefs = this.createSlice(gapFrom, gapTo);

    if (
      this.detectCycle(
        fromParent,
        gapFromParent === gapFromLeft
          ? gapFromParent.allChildren[0]
          : gapFromParent.allChildren[
              gapFromParent.allChildren.indexOf(gapFromLeft) + 1
            ],
      )
    ) {
      return;
    }
    // check the ranges are valid
    const rangeType = this.checkRangeType(
      [fromParent, fromLeft],
      [toParent, toLeft],
      [gapFromParent, gapFromLeft],
      [gapToParent, gapToLeft],
    );

    if (rangeType === TreeMoveRange.None) {
      return;
    }

    // delete nodes between from ~ to
    this.traverseBetweenNodes(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      (contained) => (node) => {
        if (contained !== TagContained.All) {
          return;
        }

        if (!node.isRemoved) {
          node.remove(editedAt);
        }

        this.removedNodeMap.set(node.id.toIDString(), node);
      },
    );

    // if contained range, delete nodes from their parent.
    sliceRefs.forEach((node) => {
      if (this.removedNodeMap.has(node.id.toIDString())) {
        this.removedNodeMap.delete(node.id.toIDString());
      }

      if (this.nodeMapByID.get(node.id)) {
        this.nodeMapByID.remove(node.id);
      }

      if (rangeType === TreeMoveRange.Separated) {
        node.remove(editedAt);
      }

      node.parent?.removeChild(node);
      this.purge(node);
    });

    // insert slice
    let index =
      fromParent === fromLeft
        ? 0
        : fromParent.allChildren.indexOf(fromLeft) + 1;
    slice.forEach((node) => {
      fromParent.insertAt(node, index);
      this.nodeMapByID.put(node.id, node);
      index++;
    });
  }

  /**
   * `move` move the given source range to the given target range.
   */
  public move(
    target: [CRDTTreePos, CRDTTreePos],
    source: [CRDTTreePos, CRDTTreePos],
    ticket: TimeTicket,
  ): void {
    const [from, to] = target;
    const [gapFrom, gapTo] = source;
    const slice = this.createSlice(gapFrom, gapTo).map((node) =>
      node.deepcopy(),
    );
    const operation = new InternalMoveOperation(
      from,
      to,
      gapFrom,
      gapTo,
      slice,
      ticket,
    );
    const operationsToUndo = this.getOperationsToUndo(operation);

    [...operationsToUndo].reverse().forEach((op) => this.undo(op));

    const changes = this.doMove(operation);

    operationsToUndo.forEach((op) => this.do(op));

    return changes;
  }

  /**
   * `purgeRemovedNodesBefore` physically purges nodes that have been removed.
   */
  public purgeRemovedNodesBefore(ticket: TimeTicket) {
    const nodesToBeRemoved = new Set<CRDTTreeNode>();

    let count = 0;

    for (const [, node] of this.removedNodeMap) {
      if (node.removedAt && ticket.compare(node.removedAt!) >= 0) {
        nodesToBeRemoved.add(node);
        count++;
      }
    }

    [...nodesToBeRemoved].forEach((node) => {
      node.parent?.removeChild(node);
      this.nodeMapByID.remove(node.id);
      this.purge(node);
      this.removedNodeMap.delete(node.id.toIDString());
    });

    return count;
  }

  /**
   * `purge` physically purges the given node from RGATreeSplit.
   */
  public purge(node: CRDTTreeNode): void {
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
    node.parent = undefined;
  }

  /**
   * `findPos` finds the position of the given index in the tree.
   */
  public findPos(index: number, preferText = true): CRDTTreePos {
    const treePos = this.indexTree.findTreePos(index, preferText);

    const { offset } = treePos;
    let { node } = treePos;
    let leftSibling;

    if (node.isText) {
      if (node.parent!.children[0] === node && offset === 0) {
        leftSibling = node.parent!;
      } else {
        leftSibling = node;
      }

      node = node.parent!;
    } else {
      if (offset === 0) {
        leftSibling = node;
      } else {
        leftSibling = node.children[offset - 1];
      }
    }

    return CRDTTreePos.of(
      node.id,
      CRDTTreeNodeID.of(
        leftSibling.getCreatedAt(),
        leftSibling.getOffset() + offset,
      ),
    );
  }

  /**
   * `getRemovedNodesLen` returns size of removed nodes.
   */
  public getRemovedNodesLen(): number {
    return this.removedNodeMap.size;
  }

  /**
   * `pathToPosRange` converts the given path of the node to the range of the position.
   */
  public pathToPosRange(path: Array<number>): [CRDTTreePos, CRDTTreePos] {
    const fromIdx = this.pathToIndex(path);

    return [this.findPos(fromIdx), this.findPos(fromIdx + 1)];
  }

  /**
   * `pathToTreePos` finds the tree position path.
   */
  public pathToTreePos(path: Array<number>): TreePos<CRDTTreeNode> {
    return this.indexTree.pathToTreePos(path);
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
    const tree = new CRDTTree(root.deepcopy(), this.getCreatedAt());
    return tree;
  }

  /**
   * `toPath` converts the given CRDTTreeNodeID to the path of the tree.
   */
  public toPath(
    parentNode: CRDTTreeNode,
    leftSiblingNode: CRDTTreeNode,
  ): Array<number> {
    const treePos = this.toTreePos(parentNode, leftSiblingNode);

    if (!treePos) {
      return [];
    }

    return this.indexTree.treePosToPath(treePos);
  }

  /**
   * `toIndex` converts the given CRDTTreeNodeID to the index of the tree.
   */
  public toIndex(
    parentNode: CRDTTreeNode,
    leftSiblingNode: CRDTTreeNode,
  ): number {
    const treePos = this.toTreePos(parentNode, leftSiblingNode);

    if (!treePos) {
      return -1;
    }

    return this.indexTree.indexOf(treePos);
  }

  private toTreeNodes(pos: CRDTTreePos) {
    const parentID = pos.getParentID();
    const leftSiblingID = pos.getLeftSiblingID();
    const parentNode = this.findFloorNode(parentID);
    let leftSiblingNode = this.findFloorNode(leftSiblingID);

    if (!parentNode || !leftSiblingNode) {
      return [];
    }

    if (
      leftSiblingID.getOffset() > 0 &&
      leftSiblingID.getOffset() === leftSiblingNode.id.getOffset() &&
      leftSiblingNode.insPrevID
    ) {
      leftSiblingNode =
        this.findFloorNode(leftSiblingNode.insPrevID) || leftSiblingNode;
    }

    return [parentNode, leftSiblingNode!];
  }

  /**
   * `toTreePos` converts the given CRDTTreePos to local TreePos<CRDTTreeNode>.
   */
  private toTreePos(
    parentNode: CRDTTreeNode,
    leftSiblingNode: CRDTTreeNode,
  ): TreePos<CRDTTreeNode> | undefined {
    if (!parentNode || !leftSiblingNode) {
      return;
    }

    let treePos;

    if (parentNode.isRemoved) {
      let childNode: CRDTTreeNode;
      while (parentNode.isRemoved) {
        childNode = parentNode;
        parentNode = childNode.parent!;
      }

      const childOffset = parentNode.findOffset(childNode!);

      treePos = {
        node: parentNode,
        offset: childOffset,
      };
    } else {
      if (parentNode === leftSiblingNode) {
        treePos = {
          node: parentNode,
          offset: 0,
        };
      } else {
        let offset = parentNode.findOffset(leftSiblingNode);

        if (!leftSiblingNode.isRemoved) {
          if (leftSiblingNode.isText) {
            return {
              node: leftSiblingNode,
              offset: leftSiblingNode.paddedSize,
            };
          } else {
            offset++;
          }
        }

        treePos = {
          node: parentNode,
          offset,
        };
      }
    }

    return treePos;
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
}
