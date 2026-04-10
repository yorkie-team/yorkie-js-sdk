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
  MaxLamport,
  TimeTicket,
  TimeTicketSize,
  TimeTicketStruct,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';

import type {
  DefaultTextType,
  TreeNodeType,
  TreeToken,
} from '@yorkie-js/sdk/src/util/index_tree';
import {
  IndexTree,
  IndexTreeNode,
  TokenType,
  traverseAll,
  TreePos,
} from '@yorkie-js/sdk/src/util/index_tree';
import { RHT, RHTNode } from './rht';
import { ActorID } from './../time/actor_id';
import { LLRBTree } from '@yorkie-js/sdk/src/util/llrb_tree';
import { Comparator } from '@yorkie-js/sdk/src/util/comparator';
import { parseObjectValues } from '@yorkie-js/sdk/src/util/object';
import { Indexable } from '@yorkie-js/sdk/src/document/document';
import type * as Devtools from '@yorkie-js/sdk/src/devtools/types';
import { escapeString } from '@yorkie-js/sdk/src/document/json/strings';
import { GCChild, GCPair, GCParent } from '@yorkie-js/sdk/src/document/crdt/gc';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { DataSize, addDataSizes } from '../../util/resource';

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
  visibleSize: number;
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

  /**
   * `mergedFrom` records the source parent's ID when this node was moved
   * by a concurrent merge. Persisted in the snapshot encoding as the
   * witness of the merge relationship.
   */
  mergedFrom?: CRDTTreeNodeID;

  /**
   * `mergedAt` records the immutable ticket of the merge operation.
   * Persisted alongside `mergedFrom` because the source parent's
   * `removedAt` may be overwritten by later LWW tombstones and thus
   * cannot serve as the merge-time causal boundary for splitElement's
   * Fix 8 version-vector check.
   */
  mergedAt?: TimeTicket;

  /**
   * `mergedInto` is a runtime cache set on the source parent pointing
   * at the merge target. Set locally during merge execution and rebuilt
   * from `mergedFrom` on snapshot load. Used for the fast
   * "is this tombstoned parent a merge source?" check in
   * `FindTreeNodesWithSplitText`; the alternative (scanning
   * `nodeMapByID` on every position resolution) would be too expensive.
   */
  mergedInto?: CRDTTreeNodeID;

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
    if (attributes) {
      this.attrs = attributes;
    }

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
    clone.visibleSize = this.visibleSize;
    clone.totalSize = this.totalSize;
    clone.attrs = this.attrs?.deepcopy();
    clone._children = this._children.map((child) => {
      const childClone = child.deepcopy();
      childClone.parent = clone;
      return childClone;
    });
    clone.insPrevID = this.insPrevID;
    clone.insNextID = this.insNextID;
    clone.mergedFrom = this.mergedFrom;
    clone.mergedAt = this.mergedAt;
    clone.mergedInto = this.mergedInto;
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
    this.visibleSize = v.length;
    this.totalSize = v.length;
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
  remove(removedAt: TimeTicket): boolean {
    if (!this.removedAt) {
      this.removedAt = removedAt;
      // NOTE(hackerwins): Decrease only visibleSize because
      // this node marked as tombstone, not purged.
      this.updateAncestorsSize(-this.paddedSize());
      return true;
    }

    // NOTE(sigmaith): Overwrite if newer tombstone.
    // This enables LWW for concurrent deletions.
    if (removedAt.after(this.removedAt)) {
      this.removedAt = removedAt;
    }
    return false;
  }

  /**
   * `cloneText` clones this text node with the given offset.
   */
  cloneText(offset: number): CRDTTreeNode {
    const clone = new CRDTTreeNode(
      CRDTTreeNodeID.of(this.id.getCreatedAt(), offset),
      this.type,
      undefined,
      undefined,
      this.removedAt,
    );
    clone.mergedFrom = this.mergedFrom;
    clone.mergedAt = this.mergedAt;
    return clone;
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
    versionVector?: VersionVector,
  ): [CRDTTreeNode | undefined, DataSize] {
    const [split, diff] = this.isText
      ? this.splitText(offset, this.id.getOffset())
      : this.splitElement(offset, issueTimeTicket!, versionVector);

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
    return [split, diff];
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
  public canDelete(
    editedAt: TimeTicket,
    creationKnown: boolean,
    tombstoneKnown: boolean,
  ): boolean {
    // NOTE(sigmaith): Skip if the node's creation was not visible to this operation.
    if (!creationKnown) {
      return false;
    }

    if (!this.removedAt) {
      return true;
    }

    // NOTE(sigmaith): Overwrite only if prior tombstone was not known
    // (concurrent or unseen) and newer. This enables LWW for concurrent deletions.
    if (!tombstoneKnown && editedAt?.after(this.removedAt)) {
      return true;
    }
    return false;
  }

  /**
   * `canStyle` checks if node is able to style.
   */
  public canStyle(
    editedAt: TimeTicket,
    clientLamportAtChange: bigint,
  ): boolean {
    if (this.isText) {
      return false;
    }
    const nodeExisted =
      this.getCreatedAt().getLamport() <= clientLamportAtChange;

    return nodeExisted && (!this.removedAt || editedAt.after(this.removedAt));
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

    const pairs: Array<[RHTNode | undefined, RHTNode | undefined]> = [];
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
   * `getDataSize` returns the data size of the node.
   */
  public getDataSize(): DataSize {
    const dataSize = { data: 0, meta: 0 };

    if (this.isText) {
      dataSize.data += this.visibleSize * 2;
    }

    if (this.id) {
      dataSize.meta += TimeTicketSize;
    }

    if (this.removedAt) {
      dataSize.meta += TimeTicketSize;
    }

    if (this.attrs) {
      for (const node of this.attrs) {
        if (node.getRemovedAt()) {
          continue;
        }

        const size = node.getDataSize();
        dataSize.meta += size.meta;
        dataSize.data += size.data;
      }
    }

    return dataSize;
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
 * `ticketKnown` returns true if the given ticket is causally known to the
 * editor, i.e. the editor's version vector covers the ticket's lamport
 * clock for the same actor. For local operations (undefined version vector),
 * all tickets are considered known.
 */
function ticketKnown(
  vv: VersionVector | undefined,
  ticket: TimeTicket,
): boolean {
  if (vv === undefined) {
    return true;
  }
  const l = vv.get(ticket.getActorID());
  return l !== undefined && l >= ticket.getLamport();
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
      visibleSize: currentNode.visibleSize,
      isRemoved: currentNode.isRemoved,
    } as TreeNodeForTest;
  }

  return {
    type: node.type,
    children: node.children.map(toTestTreeNode),
    visibleSize: node.visibleSize,
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

    // Rebuild runtime merge state from the persisted `mergedFrom`
    // field. Only `mergedFrom` and `mergedAt` are written to the
    // snapshot encoding; `mergedInto` is a cache reconstructed here
    // so replicas loaded from a snapshot can still handle concurrent
    // ops that target merged-away parents (Fix 3 redirect, Fix 5
    // propagation, Fix 8 split skip).
    this.rebuildMergeState();
  }

  /**
   * `rebuildMergeState` reconstructs the `mergedInto` cache on source
   * parents from the persisted `mergedFrom` field on moved children.
   * For snapshots written before `mergedAt` was added to the proto,
   * it also falls back to the source's `removedAt` — an approximation
   * that may be wrong if the source was later overwritten by a
   * concurrent delete, but this is the best we can do without the
   * persisted merge ticket.
   */
  private rebuildMergeState(): void {
    this.indexTree.traverseAll((node) => {
      if (!node.mergedFrom || !node.parent) {
        return;
      }
      const src = this.findFloorNode(node.mergedFrom);
      if (!src) {
        return;
      }

      // Back-compat: older snapshots lack mergedAt on moved children.
      if (!node.mergedAt && src.removedAt) {
        node.mergedAt = src.removedAt;
      }

      if (!src.mergedInto) {
        src.mergedInto = node.parent.id;
      }
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
   * `advancePastUnknownSplitSiblings` follows the insNextID chain of the
   * given node, advancing past element-type split siblings that the editing
   * client did not know about (not in versionVector).
   */
  private advancePastUnknownSplitSiblings(
    node: CRDTTreeNode,
    versionVector?: VersionVector,
  ): CRDTTreeNode {
    if (!versionVector || !node) {
      return node;
    }

    let current = node;
    while (current.insNextID) {
      const next = this.findFloorNode(current.insNextID);
      if (!next || next.isText) {
        break;
      }

      // Stop if the sibling has been moved to a different parent
      // (e.g., by a higher-level concurrent split).
      if (next.parent !== current.parent) {
        break;
      }

      const actorID = next.id.getCreatedAt().getActorID();
      const knownLamport = versionVector.get(actorID);
      if (
        knownLamport !== undefined &&
        knownLamport >= next.id.getCreatedAt().getLamport()
      ) {
        break;
      }

      current = next;
    }

    return current;
  }

  /**
   * `hasUnknownSplitSibling` checks whether the given element node has a
   * split sibling (via insNextID) whose creation the editor did not know
   * about. Used to prevent styling via End tokens when a concurrent split
   * extended the range into the split sibling.
   */
  private hasUnknownSplitSibling(
    node: CRDTTreeNode,
    versionVector: VersionVector,
  ): boolean {
    if (!node.insNextID) {
      return false;
    }

    const next = this.findFloorNode(node.insNextID);
    if (!next || next.isText) {
      return false;
    }

    const actorID = next.id.getCreatedAt().getActorID();
    const knownLamport = versionVector.get(actorID);

    return (
      knownLamport === undefined ||
      knownLamport < next.id.getCreatedAt().getLamport()
    );
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
  ): [TreeNodePair, DataSize] {
    let diff = { data: 0, meta: 0 };

    // 01. Find the parent and left sibling node of the given position.
    const [parent, leftSibling] = pos.toTreeNodePair(this);
    let leftNode = leftSibling;

    // 02. Determine whether the position is left-most and the exact parent
    // in the current tree.
    const isLeftMost = parent === leftNode;
    const realParent =
      leftNode.parent && !isLeftMost ? leftNode.parent : parent;

    // 02-1. If the parent has been tombstoned by a merge, redirect to the
    // merge destination using the forwarding pointer. The insertion
    // boundary is the first child in the target whose `mergedFrom`
    // points back at the tombstoned parent (i.e. the first child moved
    // by the merge, in target child order).
    if (realParent.isRemoved && isLeftMost && realParent.mergedInto) {
      const mergeTarget = this.findFloorNode(realParent.mergedInto);
      if (mergeTarget && !mergeTarget.isRemoved) {
        const allCh = mergeTarget.allChildren;
        for (let i = 0; i < allCh.length; i++) {
          const targetChild = allCh[i];
          if (
            !targetChild.mergedFrom ||
            !targetChild.mergedFrom.equals(realParent.id)
          ) {
            continue;
          }
          if (i === 0) {
            return [[mergeTarget, mergeTarget], diff];
          }
          return [[mergeTarget, allCh[i - 1]], diff];
        }
        // Fallback: insert at leftmost of merge target.
        return [[mergeTarget, mergeTarget], diff];
      }
    }

    // 03. Split text node if the left node is a text node.
    if (leftNode.isText) {
      const [, splitedDiff] = leftNode.split(
        this,
        pos.getLeftSiblingID().getOffset() - leftNode.id.getOffset(),
      );
      diff = splitedDiff;
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

    return [[realParent, leftNode], diff];
  }

  /**
   * `style` applies the given attributes of the given range.
   */
  public style(
    range: [CRDTTreePos, CRDTTreePos],
    attributes: { [key: string]: string } | undefined,
    editedAt: TimeTicket,
    versionVector?: VersionVector,
  ): [Array<GCPair>, Array<TreeChange>, DataSize] {
    const diff = { data: 0, meta: 0 };

    const [[fromParent, fromLeftRaw], diffFrom] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [[toParent, toLeftRaw], diffTo] = this.findNodesAndSplitText(
      range[1],
      editedAt,
    );

    addDataSizes(diff, diffTo, diffFrom);

    const fromLeft =
      fromLeftRaw !== fromParent
        ? this.advancePastUnknownSplitSiblings(fromLeftRaw, versionVector)
        : fromLeftRaw;
    const toLeft =
      toLeftRaw !== toParent
        ? this.advancePastUnknownSplitSiblings(toLeftRaw, versionVector)
        : toLeftRaw;

    const changes: Array<TreeChange> = [];
    const attrs: { [key: string]: any } = attributes
      ? parseObjectValues(attributes)
      : {};
    const pairs: Array<GCPair> = [];
    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      ([node, tokenType]) => {
        const actorID = node.getCreatedAt().getActorID();
        let clientLamportAtChange = MaxLamport; // Local edit
        if (versionVector != undefined) {
          clientLamportAtChange = versionVector!.get(actorID)
            ? versionVector!.get(actorID)!
            : 0n;
        }

        if (node.canStyle(editedAt, clientLamportAtChange) && attributes) {
          // Skip styling via End token when the node has an unknown
          // split sibling. The End token is in the range only because
          // a concurrent split extended the range into the sibling.
          if (
            tokenType === TokenType.End &&
            versionVector !== undefined &&
            this.hasUnknownSplitSibling(node, versionVector)
          ) {
            return;
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

          for (const [key] of Object.entries(attrs)) {
            const curr = node.attrs?.getNodeMapByKey().get(key);
            if (curr !== undefined && tokenType !== TokenType.End) {
              addDataSizes(diff, curr.getDataSize());
            }
          }
        }
      },
    );

    return [pairs, changes, diff];
  }

  /**
   * `removeStyle` removes the given attributes of the given range.
   */
  public removeStyle(
    range: [CRDTTreePos, CRDTTreePos],
    attributesToRemove: Array<string>,
    editedAt: TimeTicket,
    versionVector?: VersionVector,
  ): [Array<GCPair>, Array<TreeChange>, DataSize] {
    const diff = { data: 0, meta: 0 };

    const [[fromParent, fromLeft], diffFrom] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [[toParent, toLeft], diffTo] = this.findNodesAndSplitText(
      range[1],
      editedAt,
    );

    addDataSizes(diff, diffTo, diffFrom);

    const changes: Array<TreeChange> = [];
    const pairs: Array<GCPair> = [];
    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      ([node, tokenType]) => {
        const actorID = node.getCreatedAt().getActorID();
        let clientLamportAtChange = MaxLamport; // Local edit
        if (versionVector != undefined) {
          clientLamportAtChange = versionVector!.get(actorID)
            ? versionVector!.get(actorID)!
            : 0n;
        }

        if (
          node.canStyle(editedAt, clientLamportAtChange) &&
          attributesToRemove
        ) {
          // Skip styling via End token when the node has an unknown
          // split sibling. The End token is in the range only because
          // a concurrent split extended the range into the sibling.
          if (
            tokenType === TokenType.End &&
            versionVector !== undefined &&
            this.hasUnknownSplitSibling(node, versionVector)
          ) {
            return;
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

    return [pairs, changes, diff];
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
    versionVector?: VersionVector,
  ): [Array<TreeChange>, Array<GCPair>, DataSize, Array<CRDTTreeNode>, number] {
    const diff = { data: 0, meta: 0 };

    // 01. find nodes from the given range and split nodes.
    const [[fromParent, fromLeftRaw], diffFrom] = this.findNodesAndSplitText(
      range[0],
      editedAt,
    );
    const [[toParent, toLeftRaw], diffTo] = this.findNodesAndSplitText(
      range[1],
      editedAt,
    );

    addDataSizes(diff, diffTo, diffFrom);

    // 01-1. Advance past split siblings unknown to the editing client.
    // When a concurrent SplitElement created siblings linked via insNextID,
    // the editor's position was computed against the unsplit tree. Advance
    // past siblings the editor could not have seen so that the range
    // starts/ends after all concurrent split products.
    // Skip when leftNode == parent (leftmost child position).
    const fromLeft =
      fromLeftRaw !== fromParent
        ? this.advancePastUnknownSplitSiblings(fromLeftRaw, versionVector)
        : fromLeftRaw;
    const toLeft =
      toLeftRaw !== toParent
        ? this.advancePastUnknownSplitSiblings(toLeftRaw, versionVector)
        : toLeftRaw;

    const fromIdx = this.toIndex(fromParent, fromLeft);
    const fromPath = this.toPath(fromParent, fromLeft);

    const nodesToBeRemoved: Array<CRDTTreeNode> = [];
    const tokensToBeRemoved: Array<TreeToken<CRDTTreeNode>> = [];
    const toBeMovedToFromParents: Array<CRDTTreeNode> = [];
    const toBeMergedNodes: Array<CRDTTreeNode> = [];
    const preTombstoned = new Set<string>();

    this.traverseInPosRange(
      fromParent,
      fromLeft,
      toParent,
      toLeft,
      ([node, tokenType], ended) => {
        // NOTE(hackerwins): If the node overlaps as a start tag with the
        // range then we need to move the remaining children to fromParent.
        if (tokenType === TokenType.Start && !ended) {
          // Fix 9: Skip merge for elements created by concurrent
          // operations. The editor didn't know about this element,
          // so crossing into it is an artifact of a concurrent split,
          // not an intentional merge.
          if (ticketKnown(versionVector, node.id.getCreatedAt())) {
            toBeMergedNodes.push(node);
            for (const child of node.children) {
              toBeMovedToFromParents.push(child);
            }
          }
        }

        // NOTE(sigmaith): Determine if the node's creation event was visible.
        const creationKnown = ticketKnown(
          versionVector,
          node.id.getCreatedAt(),
        );

        // NOTE(sigmaith): Determine if existing tombstone was already causally known.
        const tombstoneKnown =
          !!node.removedAt && ticketKnown(versionVector, node.removedAt);

        // NOTE(sejongk): If the node is removable or its parent is going to
        // be removed, then this node should be removed.
        // Do not cascade-delete children of merge-boundary nodes
        // (toBeMergedNodes), because those children are moved rather than
        // deleted.
        if (
          node.canDelete(editedAt, creationKnown, tombstoneKnown) ||
          (nodesToBeRemoved.includes(node.parent!) &&
            !toBeMergedNodes.includes(node.parent!))
        ) {
          // NOTE(hackerwins): If the node overlaps as an end token with the
          // range then we need to keep the node.
          if (tokenType === TokenType.Text || tokenType === TokenType.Start) {
            // Track nodes already tombstoned before this edit so the
            // reverse operation does not accidentally resurrect them.
            if (node.isRemoved) {
              preTombstoned.add(node.id.toIDString());
            }
            nodesToBeRemoved.push(node);

            // Cascade delete to split siblings created by concurrent
            // SplitElement. Only for element nodes.
            if (
              !node.isText &&
              node.insNextID &&
              !toBeMergedNodes.includes(node)
            ) {
              let next = this.findFloorNode(node.insNextID);
              while (next) {
                if (!ticketKnown(versionVector, next.id.getCreatedAt())) {
                  nodesToBeRemoved.push(next);
                  // Cascade through the full subtree, not just immediate children.
                  traverseAll(next, (n) => {
                    if (n !== next) {
                      nodesToBeRemoved.push(n);
                    }
                  });
                }
                if (!next.insNextID) break;
                next = this.findFloorNode(next.insNextID);
              }
            }
          }
          tokensToBeRemoved.push([node, tokenType]);
        }
      },
      true,
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
      if (node.remove(editedAt)) {
        pairs.push({ parent: this, child: node });
      }
    }

    // 03. Merge: move the nodes that are marked as moved. Only
    // `mergedFrom` and `mergedAt` are written on the moved child —
    // both are persisted in the snapshot encoding. `mergedAt` must be
    // captured explicitly here (not read from source.removedAt at use
    // time) because the source's `removedAt` is mutated by LWW when a
    // later concurrent tombstone targets the same node.
    for (const node of toBeMovedToFromParents) {
      if (!node.removedAt) {
        if (node.parent) {
          node.mergedFrom = node.parent.id;
          node.mergedAt = editedAt;
        }
        // Detach from old parent to prevent ghost references.
        // Use try-catch because the child may already have been detached
        // by a concurrent operation (e.g., cascade delete of split sibling).
        if (node.parent) {
          try {
            node.parent.detachChild(node);
          } catch {
            // Child already detached from parent, skip.
          }
        }
        fromParent.append(node);
      }
    }
    // Set forwarding pointer on merge-source nodes. This is a runtime
    // cache rebuilt from `mergedFrom` on snapshot load.
    for (const src of toBeMergedNodes) {
      src.mergedInto = fromParent.id;
    }

    // 03-1. Propagate deletes to children moved by prior merges.
    // When a merge-source node is fully deleted (not a merge boundary),
    // its former children in the merge target should also be deleted.
    // Skip when `mergedInto` points to `fromParent` (concurrent merge).
    // The list of moved children is recomputed on the fly from the
    // merge target's children filtered by `mergedFrom`.
    for (const node of nodesToBeRemoved) {
      if (
        !node.mergedInto ||
        toBeMergedNodes.includes(node) ||
        node.mergedInto.equals(fromParent.id)
      ) {
        continue;
      }
      const mergeTarget = this.findFloorNode(node.mergedInto);
      if (!mergeTarget) {
        continue;
      }
      for (const targetChild of mergeTarget.allChildren) {
        if (
          !targetChild.mergedFrom ||
          !targetChild.mergedFrom.equals(node.id)
        ) {
          continue;
        }
        if (targetChild.removedAt) {
          continue;
        }
        if (targetChild.remove(editedAt)) {
          pairs.push({ parent: this, child: targetChild });
        }
        // Also tombstone descendants if the moved child is an element.
        traverseAll(targetChild, (n) => {
          if (n !== targetChild && !n.removedAt) {
            if (n.remove(editedAt)) {
              pairs.push({ parent: this, child: n });
            }
          }
        });
      }
    }

    // 04. Split: split the element nodes for the given split level.
    if (splitLevel > 0) {
      let splitCount = 0;
      let parent = fromParent;
      let left = fromLeft;
      while (splitCount < splitLevel) {
        parent.split(
          this,
          parent.findOffset(left) + 1,
          issueTimeTicket,
          versionVector,
        );
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
          } else {
            addDataSizes(diff, node.getDataSize());
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

    return [changes, pairs, diff, nodesToBeRemoved, fromIdx];
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
  ): [Array<TreeChange>, Array<GCPair>, DataSize, Array<CRDTTreeNode>, number] {
    const fromPos = this.findPos(range[0]);
    const toPos = this.findPos(range[1]);
    return this.edit(
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
   * `pathToTreePos` converts the given path of the node to the TreePos.
   */
  public pathToTreePos(
    path: Array<number>,
  ): ReturnType<typeof this.indexTree.pathToTreePos> {
    return this.indexTree.pathToTreePos(path);
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
   * `getDataSize` returns the data usage of this element.
   */
  public getDataSize(): DataSize {
    const dataSize = { data: 0, meta: 0 };

    this.indexTree.traverse((node) => {
      if (node.getRemovedAt()) {
        return;
      }

      const size = node.getDataSize();
      dataSize.data += size.data;
      dataSize.meta += size.meta;
    });

    return {
      data: dataSize.data,
      meta: dataSize.meta + this.getMetaUsage(),
    };
  }

  /**
   * `toJSON` returns the JSON encoding of this tree.
   */
  public toJSON(): string {
    return JSON.stringify(this.getRootTreeNode());
  }

  /**
   * `toJSForTest` returns value with meta data for testing.
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
        size: node.visibleSize,
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
    const tree = new CRDTTree(root.deepcopy(), this.getCreatedAt());
    tree.setRemovedAt(this.getRemovedAt());
    tree.setMovedAt(this.getMovedAt());
    return tree;
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
   * If includeRemoved is true, it includes removed nodes in the calculation.
   */
  public toIndex(
    parentNode: CRDTTreeNode,
    leftNode: CRDTTreeNode,
    includeRemoved: boolean = false,
  ): number {
    const treePos = this.toTreePos(parentNode, leftNode, includeRemoved);
    if (!treePos) {
      return -1;
    }

    return this.indexTree.indexOf(treePos, includeRemoved);
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
    const [[fromParent, fromLeft]] = this.findNodesAndSplitText(range[0]);
    const [[toParent, toLeft]] = this.findNodesAndSplitText(range[1]);
    return [this.toPath(fromParent, fromLeft), this.toPath(toParent, toLeft)];
  }

  /**
   * `posRangeToIndexRange` converts the given position range to the path range.
   */
  public posRangeToIndexRange(range: TreePosRange): [number, number] {
    const [[fromParent, fromLeft]] = this.findNodesAndSplitText(range[0]);
    const [[toParent, toLeft]] = this.findNodesAndSplitText(range[1]);
    return [this.toIndex(fromParent, fromLeft), this.toIndex(toParent, toLeft)];
  }

  /**
   * `traverseInPosRange` traverses the tree in the given position range.
   * If includeRemoved is true, it includes removed nodes in the calculation.
   */
  private traverseInPosRange(
    fromParent: CRDTTreeNode,
    fromLeft: CRDTTreeNode,
    toParent: CRDTTreeNode,
    toLeft: CRDTTreeNode,
    callback: (token: TreeToken<CRDTTreeNode>, ended: boolean) => void,
    includeRemoved: boolean = false,
  ): void {
    const fromIdx = this.toIndex(fromParent, fromLeft, includeRemoved);
    const toIdx = this.toIndex(toParent, toLeft, includeRemoved);
    // When a concurrent merge redirects the to-position into an earlier
    // part of the tree, the range becomes empty (prior merge handled it).
    if (fromIdx > toIdx) {
      return;
    }
    this.indexTree.tokensBetween(fromIdx, toIdx, callback, includeRemoved);
  }

  /**
   * `toTreePos` converts the given nodes to the position of the IndexTree.
   * If includeRemoved is true, it includes removed nodes in the calculation.
   */
  private toTreePos(
    parentNode: CRDTTreeNode,
    leftNode: CRDTTreeNode,
    includeRemoved: boolean = false,
  ): TreePos<CRDTTreeNode> | undefined {
    if (!parentNode || !leftNode) {
      return;
    }

    if (!includeRemoved && parentNode.isRemoved) {
      // If parentNode is removed, treePos is the position of its least alive ancestor.
      let childNode: CRDTTreeNode;
      while (parentNode.isRemoved) {
        childNode = parentNode;
        parentNode = childNode.parent!;
      }

      const offset = parentNode.findOffset(childNode!, includeRemoved);
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

    // Find the closest existing leftSibling node.
    let offset = parentNode.findOffset(leftNode, includeRemoved);
    if (includeRemoved || !leftNode.isRemoved) {
      if (leftNode.isText) {
        return {
          node: leftNode,
          offset: leftNode.paddedSize(includeRemoved),
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
