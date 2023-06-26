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
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTGCElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  IndexTree,
  TreePos,
  IndexTreeNode,
  TreeNodeType,
  traverse,
} from '@yorkie-js-sdk/src/util/index_tree';
import { ActorID } from './../time/actor_id';
import { LLRBTree } from '@yorkie-js-sdk/src/util/llrb_tree';
import { RHT } from './rht';
import { parseObjectValues } from '@yorkie-js-sdk/src/util/object';

/**
 * DummyHeadType is a type of dummy head. It is used to represent the head node
 * of RGA.
 */
const DummyHeadType = 'dummy';

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
  value?: TreeNode | { [key: string]: any };
}

/**
 * `InitialCRDTTreePos` is the initial position of the tree.
 */
export const InitialCRDTTreePos = {
  createdAt: InitialTimeTicket,
  offset: 0,
};

/**
 * `compareCRDTTreePos` compares the given two CRDTTreePos.
 */
function compareCRDTTreePos(posA: CRDTTreePos, posB: CRDTTreePos): number {
  const compare = posA.createdAt.compare(posB.createdAt);
  if (compare !== 0) {
    return compare;
  }

  if (posA.offset > posB.offset) {
    return 1;
  } else if (posA.offset < posB.offset) {
    return -1;
  }
  return 0;
}

/**
 * `CRDTTreePos` represent a position in the tree. It indicates the virtual
 * location in the tree, so whether the node is splitted or not, we can find
 * the adjacent node to pos by calling `map.floorEntry()`.
 */
export interface CRDTTreePos {
  /**
   * `createdAt` is the creation time of the node.
   */
  createdAt: TimeTicket;

  /**
   * `offset` is the distance from the beginning of the node if the node is
   * split.
   */
  offset: number;
}

/**
 * `TreeRange` represents a pair of CRDTTreePos.
 */
export type TreeRange = [CRDTTreePos, CRDTTreePos];

/**
 * `CRDTTreeNode` is a node of CRDTTree. It is includes the logical clock and
 * links to other nodes to resolve conflicts.
 */
export class CRDTTreeNode extends IndexTreeNode<CRDTTreeNode> {
  pos: CRDTTreePos;
  removedAt?: TimeTicket;
  attrs?: RHT;

  /**
   * `next` is the next node of this node in the list.
   */
  next?: CRDTTreeNode;

  /**
   * `prev` is the previous node of this node in the list.
   */
  prev?: CRDTTreeNode;

  /**
   * `insPrev` is the previous node of this node after the node is split.
   */
  insPrev?: CRDTTreeNode;

  _value = '';

  constructor(
    pos: CRDTTreePos,
    type: string,
    opts?: string | Array<CRDTTreeNode>,
    attributes?: RHT,
  ) {
    super(type);
    this.pos = pos;
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
    pos: CRDTTreePos,
    type: string,
    opts?: string | Array<CRDTTreeNode>,
    attributes?: RHT,
  ) {
    return new CRDTTreeNode(pos, type, opts, attributes);
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  deepcopy(): CRDTTreeNode {
    const clone = new CRDTTreeNode(this.pos, this.type);
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
      {
        createdAt: this.pos.createdAt,
        offset,
      },
      this.type,
    );
  }

  /**
   * `getCreatedAt` returns the creation time of this element.
   */
  public getCreatedAt(): TimeTicket {
    return this.pos.createdAt;
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
 * `toStructure` converts the given CRDTNode JSON for debugging.
 */
function toStructure(node: CRDTTreeNode): TreeNodeForTest {
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
    children: node.children.map(toStructure),
    size: node.size,
    isRemoved: node.isRemoved,
  };
}

/**
 * `CRDTTree` is a CRDT implementation of a tree.
 */
export class CRDTTree extends CRDTGCElement {
  private dummyHead: CRDTTreeNode;
  private indexTree: IndexTree<CRDTTreeNode>;
  private nodeMapByPos: LLRBTree<CRDTTreePos, CRDTTreeNode>;
  private removedNodeMap: Map<string, CRDTTreeNode>;

  constructor(root: CRDTTreeNode, createdAt: TimeTicket) {
    super(createdAt);
    this.dummyHead = new CRDTTreeNode(InitialCRDTTreePos, DummyHeadType);
    this.indexTree = new IndexTree<CRDTTreeNode>(root);
    this.nodeMapByPos = new LLRBTree(compareCRDTTreePos);
    this.removedNodeMap = new Map();

    let previous = this.dummyHead;
    this.indexTree.traverse((node) => {
      this.insertAfter(previous, node);
      previous = node;
    });
  }

  /**
   * `create` creates a new instance of `CRDTTree`.
   */
  public static create(root: CRDTTreeNode, ticket: TimeTicket): CRDTTree {
    return new CRDTTree(root, ticket);
  }

  /**
   * `nodesBetweenByTree` returns the nodes between the given range.
   */
  public nodesBetweenByTree(
    from: number,
    to: number,
    callback: (node: CRDTTreeNode) => void,
  ): void {
    this.indexTree.nodesBetween(from, to, callback);
  }

  /**
   * `nodesBetween` returns the nodes between the given range.
   * This method includes the given left node but excludes the given right node.
   */
  public nodesBetween(
    left: CRDTTreeNode,
    right: CRDTTreeNode,
    callback: (node: CRDTTreeNode) => void,
  ): void {
    let current = left;
    while (current !== right) {
      if (!current) {
        throw new Error('left and right are not in the same list');
      }

      callback(current);
      current = current.next!;
    }
  }

  /**
   * `findPostorderRight` finds the right node of the given index in postorder.
   */
  public findPostorderRight(index: number): CRDTTreeNode | undefined {
    const pos = this.indexTree.findTreePos(index, true);
    return this.indexTree.findPostorderRight(pos);
  }

  /**
   * `findTreePos` finds `TreePos` of the given `CRDTTreePos`
   */
  public findTreePos(
    pos: CRDTTreePos,
    editedAt: TimeTicket,
  ): [TreePos<CRDTTreeNode>, CRDTTreeNode] {
    const treePos = this.toTreePos(pos);
    if (!treePos) {
      throw new Error(`cannot find node at ${pos}`);
    }

    // Find the appropriate position. This logic is similar to the logical to
    // handle the same position insertion of RGA.
    let current = treePos;
    while (
      current.node.next?.pos.createdAt.after(editedAt) &&
      current.node.parent === current.node.next.parent
    ) {
      current = {
        node: current.node.next,
        offset: current.node.next.size,
      };
    }

    const right = this.indexTree.findPostorderRight(treePos)!;
    return [current, right];
  }

  /**
   * `findTreePosWithSplitText` finds `TreePos` of the given `CRDTTreePos` and
   * splits the text node if necessary.
   *
   * `CRDTTreePos` is a position in the CRDT perspective. This is
   * different from `TreePos` which is a position of the tree in the local
   * perspective.
   */
  public findTreePosWithSplitText(
    pos: CRDTTreePos,
    editedAt: TimeTicket,
  ): [TreePos<CRDTTreeNode>, CRDTTreeNode] {
    const treePos = this.toTreePos(pos);
    if (!treePos) {
      throw new Error(`cannot find node at ${pos}`);
    }

    // Find the appropriate position. This logic is similar to the logical to
    // handle the same position insertion of RGA.
    let current = treePos;
    while (
      current.node.next?.pos.createdAt.after(editedAt) &&
      current.node.parent === current.node.next.parent
    ) {
      current = {
        node: current.node.next,
        offset: current.node.next.size,
      };
    }

    if (current.node.isText) {
      const split = current.node.split(current.offset);
      if (split) {
        this.insertAfter(current.node, split);
        split.insPrev = current.node;
      }
    }

    const right = this.indexTree.findPostorderRight(treePos)!;
    return [current, right];
  }

  /**
   * `insertAfter` inserts the given node after the given previous node.
   */
  public insertAfter(prevNode: CRDTTreeNode, newNode: CRDTTreeNode): void {
    const next = prevNode.next;
    prevNode.next = newNode;
    newNode.prev = prevNode;
    if (next) {
      newNode.next = next;
      next.prev = newNode;
    }

    this.nodeMapByPos.put(newNode.pos, newNode);
  }

  /**
   * `style` applies the given attributes of the given range.
   */
  public style(
    range: [CRDTTreePos, CRDTTreePos],
    attributes: { [key: string]: string } | undefined,
    editedAt: TimeTicket,
  ) {
    const [, toRight] = this.findTreePos(range[1], editedAt);
    const [, fromRight] = this.findTreePos(range[0], editedAt);
    const changes: Array<TreeChange> = [];

    changes.push({
      type: TreeChangeType.Style,
      from: this.toIndex(range[0]),
      to: this.toIndex(range[1]),
      fromPath: this.indexTree.indexToPath(this.posToStartIndex(range[0])),
      toPath: this.indexTree.indexToPath(this.posToStartIndex(range[0])),
      actor: editedAt.getActorID()!,
      value: attributes ? parseObjectValues(attributes) : undefined,
    });

    this.nodesBetween(fromRight, toRight, (node) => {
      if (!node.isRemoved && attributes) {
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

  /**
   * `edit` edits the tree with the given range and content.
   * If the content is undefined, the range will be removed.
   */
  public edit(
    range: [CRDTTreePos, CRDTTreePos],
    content: CRDTTreeNode | undefined,
    editedAt: TimeTicket,
  ): Array<TreeChange> {
    // 01. split text nodes at the given range if needed.
    const [toPos, toRight] = this.findTreePosWithSplitText(range[1], editedAt);
    const [fromPos, fromRight] = this.findTreePosWithSplitText(
      range[0],
      editedAt,
    );

    // TODO(hackerwins): If concurrent deletion happens, we need to seperate the
    // range(from, to) into multiple ranges.
    const changes: Array<TreeChange> = [];
    changes.push({
      type: TreeChangeType.Content,
      from: this.toIndex(range[0]),
      to: this.toIndex(range[1]),
      fromPath: this.indexTree.treePosToPath(fromPos),
      toPath: this.indexTree.treePosToPath(toPos),
      actor: editedAt.getActorID()!,
      value: content ? toJSON(content) : undefined,
    });

    const toBeRemoveds: Array<CRDTTreeNode> = [];
    // 02. remove the nodes and update linked list and index tree.
    if (fromRight !== toRight) {
      this.nodesBetween(fromRight!, toRight!, (node) => {
        if (!node.isRemoved) {
          toBeRemoveds.push(node);
        }
      });

      const isRangeOnSameBranch = toPos.node.isAncestorOf(fromPos.node);
      for (const node of toBeRemoveds) {
        node.remove(editedAt);

        if (node.isRemoved) {
          this.removedNodeMap.set(
            `${node.getCreatedAt().getStructureAsString()}:${node.pos.offset}`,
            node,
          );
        }
      }

      // move the alive children of the removed element node
      if (isRangeOnSameBranch) {
        let removedElementNode: CRDTTreeNode | undefined;
        if (fromPos.node.parent?.isRemoved) {
          removedElementNode = fromPos.node.parent;
        } else if (!fromPos.node.isText && fromPos.node.isRemoved) {
          removedElementNode = fromPos.node;
        }

        // If the nearest removed element node of the fromNode is found,
        // insert the alive children of the removed element node to the toNode.
        if (removedElementNode) {
          const elementNode = toPos.node;
          const offset = elementNode.findBranchOffset(removedElementNode);
          for (const node of removedElementNode.children.reverse()) {
            elementNode.insertAt(node, offset);
          }
        }
      } else {
        if (fromPos.node.parent?.isRemoved) {
          toPos.node.parent?.prepend(...fromPos.node.parent.children);
        }
      }
    }

    // 03. insert the given node at the given position.
    if (content) {
      // 03-1. insert the content nodes to the list.
      let previous = fromRight!.prev!;
      traverse(content, (node) => {
        this.insertAfter(previous, node);
        previous = node;
      });

      // 03-2. insert the content nodes to the tree.
      if (fromPos.node.isText) {
        if (fromPos.offset === 0) {
          fromPos.node.parent!.insertBefore(content, fromPos.node);
        } else {
          fromPos.node.parent!.insertAfter(content, fromPos.node);
        }
      } else {
        const target = fromPos.node;
        target.insertAt(content, fromPos.offset);
      }
    }

    return changes;
  }

  /**
   * `editByIndex` edits the given range with the given value.
   * This method uses indexes instead of a pair of TreePos for testing.
   */
  public editByIndex(
    range: [number, number],
    content: CRDTTreeNode | undefined,
    editedAt: TimeTicket,
  ): void {
    const fromPos = this.findPos(range[0]);
    const toPos = this.findPos(range[1]);
    this.edit([fromPos, toPos], content, editedAt);
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
    const nodesToRemoved = new Set<CRDTTreeNode>();
    let count = 0;

    for (const [, node] of this.removedNodeMap) {
      if (node.removedAt && ticket.compare(node.removedAt!) >= 0) {
        nodesToRemoved.add(node);
        count++;
      }
    }

    this.indexTree.traverse((treeNode) => {
      if (nodesToRemoved.has(treeNode)) {
        const parent = treeNode.parent;

        if (!parent) {
          nodesToRemoved.delete(treeNode);
          count--;
          return;
        }

        parent.removeChild(treeNode);
      }
    });

    [...nodesToRemoved].forEach((node) => {
      this.nodeMapByPos.remove(node.pos);
      this.purge(node);
      this.removedNodeMap.delete(
        `${node.getCreatedAt().getStructureAsString()}:${node.pos.offset}`,
      );
    });

    return count;
  }

  /**
   * `purge` physically purges the given node from RGATreeSplit.
   */
  public purge(node: CRDTTreeNode): void {
    const prev = node.prev;
    const next = node.next;

    if (prev) {
      prev.next = next;
    }
    if (next) {
      next.prev = prev;
    }

    node.prev = undefined;
    node.next = undefined;
    node.insPrev = undefined;
  }

  /**
   * `findPos` finds the position of the given index in the tree.
   */
  public findPos(index: number, preferText = true): CRDTTreePos {
    const treePos = this.indexTree.findTreePos(index, preferText);

    return {
      createdAt: treePos.node.pos.createdAt,
      offset: treePos.node.pos.offset + treePos.offset,
    };
  }

  /**
   * `getRemovedNodesLen` returns size of removed nodes.
   */
  public getRemovedNodesLen(): number {
    return this.removedNodeMap.size;
  }

  /**
   * `posToStartIndex` returns start index of pos
   *       0   1   2 3 4 5 6    7  8
   *  <doc><p><tn>t e x t </tn></p></doc>
   *  if tree is just like above, and the pos is pointing index of 7
   * this returns 0 (start index of tag)
   */
  public posToStartIndex(pos: CRDTTreePos): number {
    const treePos = this.toTreePos(pos);
    const index = this.toIndex(pos);
    let size = treePos?.node.size;

    if (treePos!.node.type === 'text') {
      size = treePos!.node.parent?.size;
    }

    return index - size! - 1;
  }

  /**
   * `pathToPosRange` finds the range of pos from given path.
   */
  public pathToPosRange(path: Array<number>): [CRDTTreePos, CRDTTreePos] {
    const index = this.pathToIndex(path);
    const { node: parentNode, offset } = this.pathToTreePos(path);

    if (parentNode.hasTextChild()) {
      throw new Error('invalid Path');
    }
    const node = parentNode.children[offset];
    const fromIdx = index + node.size + 1;

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
    const treePos = this.indexTree.pathToTreePos(path);

    return {
      createdAt: treePos.node.pos.createdAt,
      offset: treePos.node.pos.offset + treePos.offset,
    };
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
   * `toStructure` returns the JSON of this tree for debugging.
   */
  public toStructure(): TreeNodeForTest {
    return toStructure(this.indexTree.getRoot());
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
   * `Symbol.iterator` returns the iterator of the tree.
   */
  public *[Symbol.iterator](): IterableIterator<CRDTTreeNode> {
    let node = this.dummyHead.next;
    while (node) {
      if (!node.isRemoved) {
        yield node;
      }

      node = node.next;
    }
  }

  /**
   * `toIndex` converts the given CRDTTreePos to the index of the tree.
   */
  public toIndex(pos: CRDTTreePos): number {
    const treePos = this.toTreePos(pos);
    if (!treePos) {
      return -1;
    }

    return this.indexTree.indexOf(treePos);
  }

  /**
   * `toTreePos` converts the given CRDTTreePos to TreePos<CRDTTreeNode>.
   */
  private toTreePos(pos: CRDTTreePos): TreePos<CRDTTreeNode> | undefined {
    const entry = this.nodeMapByPos.floorEntry(pos);
    if (!entry || !entry.key.createdAt.equals(pos.createdAt)) {
      return;
    }

    // Choose the left node if the position is on the boundary of the split nodes.
    let node = entry.value;
    if (pos.offset > 0 && pos.offset === node.pos.offset && node.insPrev) {
      node = node.insPrev;
    }

    return {
      node,
      offset: pos.offset - node.pos.offset,
    };
  }

  /**
   * `indexToPath` converts the given tree index to path.
   */
  public indexToPath(index: number): Array<number> {
    return this.indexTree.indexToPath(index);
  }

  /**
   * `indexToPath` converts the given path to index.
   */
  public pathToIndex(path: Array<number>): number {
    return this.indexTree.pathToIndex(path);
  }

  /**
   * `createRange` returns pair of RGATreeSplitNodePos of the given integer offsets.
   */
  public createRange(fromIdx: number, toIdx: number): TreeRange {
    const fromPos = this.findPos(fromIdx);
    if (fromIdx === toIdx) {
      return [fromPos, fromPos];
    }

    return [fromPos, this.findPos(toIdx)];
  }

  /**
   * `rangeToIndex` returns pair of integer offsets of the given Tree.
   */
  public rangeToIndex(range: TreeRange): [number, number] {
    return [this.toIndex(range[0]), this.toIndex(range[1])];
  }

  /**
   * `rangeToPath` returns pair of integer offsets of the given Tree.
   */
  public rangeToPath(range: TreeRange): [Array<number>, Array<number>] {
    const fromPath = this.indexTree.indexToPath(this.toIndex(range[0]));
    const toPath = this.indexTree.indexToPath(this.toIndex(range[1]));

    return [fromPath, toPath];
  }
}
