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
  addSizeOfLeftSiblings,
} from '@yorkie-js-sdk/src/util/index_tree';
import { RHT } from './rht';
import { ActorID } from './../time/actor_id';
import { LLRBTree } from '@yorkie-js-sdk/src/util/llrb_tree';
import { Comparator } from '@yorkie-js-sdk/src/util/comparator';
import { parseObjectValues } from '@yorkie-js-sdk/src/util/object';

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
   * `insPrev` is the previous node of this node after the node is split.
   */
  insPrev?: CRDTTreeNode;

  /**
   * `insNext` is the previous node of this node after the node is split.
   */
  insNext?: CRDTTreeNode;

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
 * toJSON converts the given CRDTNode to JSON.
 */
function toJSON(node: CRDTTreeNode): TreeNode {
  if (node.isText) {
    const currentNode = node;
    return {
      type: currentNode.type,
      value: currentNode.value,
    };
  }

  return {
    type: node.type,
    children: node.children.map(toJSON),
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

  constructor(root: CRDTTreeNode, createdAt: TimeTicket) {
    super(createdAt);
    this.indexTree = new IndexTree<CRDTTreeNode>(root);
    this.nodeMapByID = new LLRBTree(CRDTTreeNodeID.createComparator());
    this.removedNodeMap = new Map();

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
   * `findNodesAndSplitText` finds `TreePos` of the given `CRDTTreeNodeID` and
   * splits the text node if necessary.
   *
   * `CRDTTreeNodeID` is a position in the CRDT perspective. This is
   * different from `TreePos` which is a position of the tree in the local
   * perspective.
   */
  public findNodesAndSplitText(
    pos: CRDTTreePos,
    editedAt: TimeTicket,
  ): [CRDTTreeNode, CRDTTreeNode] {
    const treeNodes = this.toTreeNodes(pos);

    if (!treeNodes) {
      throw new Error(`cannot find node at ${pos}`);
    }
    const [parentNode] = treeNodes;
    let [, leftSiblingNode] = treeNodes;

    // Find the appropriate position. This logic is similar to the logical to
    // handle the same position insertion of RGA.

    if (leftSiblingNode.isText) {
      const absOffset = leftSiblingNode.id.getOffset();
      const split = leftSiblingNode.split(
        pos.getLeftSiblingID().getOffset() - absOffset,
        absOffset,
      );

      if (split) {
        split.insPrev = leftSiblingNode;
        this.nodeMapByID.put(split.id, split);

        if (leftSiblingNode.insNext) {
          leftSiblingNode.insNext.insPrev = split;
          split.insNext = leftSiblingNode.insNext;
        }
        leftSiblingNode.insNext = split;
      }
    }

    const index =
      parentNode === leftSiblingNode
        ? 0
        : parentNode.allChildren.indexOf(leftSiblingNode) + 1;

    for (let i = index; i < parentNode.allChildren.length; i++) {
      const next = parentNode.allChildren[i];

      if (next.id.getCreatedAt().after(editedAt)) {
        leftSiblingNode = next;
      } else {
        break;
      }
    }

    return [parentNode, leftSiblingNode];
  }

  /**
   * `style` applies the given attributes of the given range.
   */
  public style(
    range: [CRDTTreePos, CRDTTreePos],
    attributes: { [key: string]: string } | undefined,
    editedAt: TimeTicket,
  ) {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1], editedAt);
    const changes: Array<TreeChange> = [];

    changes.push({
      type: TreeChangeType.Style,
      from: this.toIndex(fromParent, fromLeft),
      to: this.toIndex(toParent, toLeft),
      fromPath: this.toPath(fromParent, fromLeft),
      toPath: this.toPath(fromParent, fromLeft),
      actor: editedAt.getActorID()!,
      value: attributes ? parseObjectValues(attributes) : undefined,
    });

    if (fromLeft !== toLeft) {
      let fromChildIndex;
      let parent;

      if (fromLeft.parent === toLeft.parent) {
        parent = fromLeft.parent!;
        fromChildIndex = parent.allChildren.indexOf(fromLeft) + 1;
      } else {
        parent = fromLeft;
        fromChildIndex = 0;
      }

      const toChildIndex = parent.allChildren.indexOf(toLeft);

      for (let i = fromChildIndex; i <= toChildIndex; i++) {
        const node = parent.allChildren[i];

        if (!node.isRemoved && attributes) {
          if (!node.attrs) {
            node.attrs = new RHT();
          }

          for (const [key, value] of Object.entries(attributes)) {
            node.attrs.set(key, value, editedAt);
          }
        }
      }
    }

    return changes;
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
    // 01. split text nodes at the given range if needed.
    const [fromParent, fromLeft] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1], editedAt);

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
        ? contents.map((content) => toJSON(content))
        : undefined,
    });

    const toBeRemoveds: Array<CRDTTreeNode> = [];
    const latestCreatedAtMap = new Map<string, TimeTicket>();

    if (fromLeft !== toLeft) {
      let fromChildIndex;
      let parent;

      if (fromLeft.parent === toLeft.parent) {
        parent = fromLeft.parent!;
        fromChildIndex = parent.allChildren.indexOf(fromLeft) + 1;
      } else {
        parent = fromLeft;
        fromChildIndex = 0;
      }

      const toChildIndex = parent.allChildren.indexOf(toLeft);

      for (let i = fromChildIndex; i <= toChildIndex; i++) {
        const node = parent.allChildren[i];
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

          traverseAll(node, (node) => {
            if (node.canDelete(editedAt, MaxTimeTicket)) {
              const latestCreatedAt = latestCreatedAtMapByActor?.get(actorID);
              const createdAt = node.getCreatedAt();

              if (!latestCreatedAt || createdAt.after(latestCreatedAt)) {
                latestCreatedAtMap.set(actorID, createdAt);
              }
            }

            if (!node.isRemoved) {
              toBeRemoveds.push(node);
            }
          });
        }
      }

      for (const node of toBeRemoveds) {
        node.remove(editedAt);

        if (node.isRemoved) {
          this.removedNodeMap.set(node.id.toIDString(), node);
        }
      }
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
   * `split` splits the node at the given index.
   */
  public split(index: number, depth = 1): TreePos<CRDTTreeNode> {
    // TODO(hackerwins, easylogic): Implement this with keeping references in the list.
    // return this.treeByIndex.split(index, depth);
    throw new Error(`not implemented, ${index} ${depth}`);
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
    throw new Error(`not implemented: ${target}, ${source}, ${ticket}`);
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
    const insPrev = node.insPrev;
    const insNext = node.insNext;

    if (insPrev) {
      insPrev.insNext = insNext;
    }

    if (insNext) {
      insNext.insPrev = insPrev;
    }

    node.insPrev = undefined;
    node.insNext = undefined;
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
      if (node.parent!.allChildren[0] === node && offset === 0) {
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
    return JSON.stringify(toJSON(this.indexTree.getRoot()));
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
    const parentEntry = this.nodeMapByID.floorEntry(parentID);
    const leftSiblingEntry = this.nodeMapByID.floorEntry(leftSiblingID);

    if (
      !parentEntry ||
      !leftSiblingEntry ||
      !parentEntry.key.getCreatedAt().equals(parentID.getCreatedAt()) ||
      !leftSiblingEntry.key.getCreatedAt().equals(leftSiblingID.getCreatedAt())
    ) {
      return [];
    }

    let leftSiblingNode = leftSiblingEntry.value;

    if (
      leftSiblingID.getOffset() > 0 &&
      leftSiblingID.getOffset() === leftSiblingNode.id.getOffset() &&
      leftSiblingNode.insPrev
    ) {
      leftSiblingNode = leftSiblingNode.insPrev;
    }

    return [parentEntry.value, leftSiblingNode];
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

    if (parentNode === leftSiblingNode) {
      treePos = {
        node: leftSiblingNode,
        offset: 0,
      };
    } else {
      let offset = parentNode.findOffset(leftSiblingNode) + 1;

      if (leftSiblingNode.isText) {
        offset = addSizeOfLeftSiblings(parentNode, offset);
      }

      treePos = {
        node: parentNode,
        offset,
      };
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
    timeTicket: TimeTicket,
  ): [Array<number>, Array<number>] {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(
      range[0],
      timeTicket,
    );
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1], timeTicket);

    return [this.toPath(fromParent, fromLeft), this.toPath(toParent, toLeft)];
  }

  /**
   * `posRangeToIndexRange` converts the given position range to the path range.
   */
  public posRangeToIndexRange(
    range: TreePosRange,
    timeTicket: TimeTicket,
  ): [number, number] {
    const [fromParent, fromLeft] = this.findNodesAndSplitText(
      range[0],
      timeTicket,
    );
    const [toParent, toLeft] = this.findNodesAndSplitText(range[1], timeTicket);

    return [this.toIndex(fromParent, fromLeft), this.toIndex(toParent, toLeft)];
  }
}
