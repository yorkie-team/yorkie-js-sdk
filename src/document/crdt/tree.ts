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
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  IndexTree,
  TreePos,
  IndexTreeNode,
  TreeNodeType,
  traverse,
} from '@yorkie-js-sdk/src/document/crdt/index_tree';
import { LLRBTree } from '@yorkie-js-sdk/src/util/llrb_tree';

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
}

/**
 * `TreeChange` represents the change in the tree.
 */
export interface TreeChange {
  type: TreeChangeType;
  from: number;
  to: number;
  value?: TreeNode;
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
interface CRDTTreePos {
  /**
   * `createdAt` is the creation time of the node.
   */
  createdAt: TimeTicket;

  /**
   * `offset` is the distance from the beginning of the node.
   */
  offset: number;
}

/**
 * `CRDTTreeNode` is a node of CRDTTree. It is includes the logical clock and
 * links to other nodes to resolve conflicts.
 */
export class CRDTTreeNode extends IndexTreeNode<CRDTTreeNode> {
  pos: CRDTTreePos;
  removedAt?: TimeTicket;

  next?: CRDTTreeNode;
  prev?: CRDTTreeNode;

  _value = '';

  constructor(
    pos: CRDTTreePos,
    type: string,
    opts?: string | Array<CRDTTreeNode>,
  ) {
    super(type);
    this.pos = pos;

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
    createdAt: TimeTicket,
    type: string,
    opts?: string | Array<CRDTTreeNode>,
  ) {
    return new CRDTTreeNode(
      {
        createdAt,
        offset: 0,
      },
      type,
      opts,
    );
  }

  /**
   * `value` returns the value of the node.
   */
  get value() {
    if (!this.isInline) {
      throw new Error(`cannot get value of non-inline node: ${this.type}`);
    }

    return this._value;
  }

  /**
   * `value` sets the value of the node.
   */
  set value(v: string) {
    if (!this.isInline) {
      throw new Error(`cannot set value of non-inline node: ${this.type}`);
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
}

/**
 * toJSON converts the given CRDTNode to JSON.
 */
function toJSON(node: CRDTTreeNode): TreeNode {
  if (node.isInline) {
    const currentNode = node;
    return {
      type: currentNode.type,
      value: currentNode.value,
    };
  }

  return {
    type: node.type,
    children: node.children.map(toJSON),
  };
}

/**
 * toXML converts the given CRDTNode to XML string.
 */
export function toXML(node: CRDTTreeNode): string {
  if (node.isInline) {
    const currentNode = node;
    return currentNode.value;
  }

  return `<${node.type}>${node.children
    .map((child) => toXML(child))
    .join('')}</${node.type}>`;
}

/**
 * `toStructure` converts the given CRDTNode JSON for debugging.
 */
function toStructure(node: CRDTTreeNode): TreeNodeForTest {
  if (node.isInline) {
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
export class CRDTTree extends CRDTElement {
  private onChangesHandler?: (changes: Array<TreeChange>) => void;
  private dummyHead: CRDTTreeNode;
  private indexTree: IndexTree<CRDTTreeNode>;
  private nodeMapByPos: LLRBTree<CRDTTreePos, CRDTTreeNode>;

  constructor(root: CRDTTreeNode, createdAt: TimeTicket) {
    super(createdAt);
    this.dummyHead = new CRDTTreeNode(InitialCRDTTreePos, DummyHeadType);
    this.indexTree = new IndexTree<CRDTTreeNode>(root);
    this.nodeMapByPos = new LLRBTree(compareCRDTTreePos);

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
   * `onChanges` registers a handler of onChanges event.
   */
  public onChanges(handler: (changes: Array<TreeChange>) => void): void {
    this.onChangesHandler = handler;
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
   * `splitInline` splits the inline node at the given index.
   */
  public splitInline(pos: TreePos<CRDTTreeNode>): CRDTTreeNode {
    if (pos.node.isInline) {
      const split = pos.node.split(pos.offset);
      if (split) {
        this.insertAfter(pos.node, split);
      }
    }

    return this.indexTree.findPostorderRight(pos)!;
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
   * `edit` edits the tree with the given range and content.
   * If the content is undefined, the range will be removed.
   */
  public edit(
    range: [TreePos<CRDTTreeNode>, TreePos<CRDTTreeNode>],
    content: CRDTTreeNode | undefined,
    editedAt: TimeTicket,
  ): void {
    const [fromPos, toPos] = range;

    // 01. split inline nodes at the given range if needed.
    const toRight = this.splitInline(range[1]);
    const fromRight = this.splitInline(range[0]);

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
      }

      // move the alive children of the removed block node
      if (isRangeOnSameBranch) {
        let removedBlockNode: CRDTTreeNode | undefined;
        if (fromPos.node.parent?.isRemoved) {
          removedBlockNode = fromPos.node.parent;
        } else if (!fromPos.node.isInline && fromPos.node.isRemoved) {
          removedBlockNode = fromPos.node;
        }

        // If the nearest removed block node of the fromNode is found,
        // insert the alive children of the removed block node to the toNode.
        if (removedBlockNode) {
          const blockNode = toPos.node;
          const offset = blockNode.findBranchOffset(removedBlockNode);
          for (const node of removedBlockNode.children.reverse()) {
            blockNode.insertAt(node, offset);
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
      if (fromPos.node.isInline) {
        if (fromPos.offset === 0) {
          fromPos.node.parent!.insertBefore(content, fromPos.node);
        } else {
          fromPos.node.parent!.insertAfter(content, fromPos.node);
        }
      } else {
        const target = fromPos.node;
        target.insertAt(content, fromPos.offset + 1);
      }
    }
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
    const fromPos = this.indexTree.findTreePos(range[0], true);
    const toPos = this.indexTree.findTreePos(range[1], true);
    this.edit([fromPos, toPos], content, editedAt);

    const changes: Array<TreeChange> = [];
    // TODO(hackerwins, easylogic): After the implementation of CRDT, we need to convert
    // the following range from the logical timestamp.
    changes.push({
      type: TreeChangeType.Content,
      from: range[0],
      to: range[1],
      value: content ? toJSON(content) : undefined,
    });

    if (this.onChangesHandler) {
      this.onChangesHandler(changes);
    }
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
   * `findTreePos` finds the position of the given index in the tree.
   */
  public findTreePos(index: number, preperInline = true): CRDTTreePos {
    const indexTreePos = this.indexTree.findTreePos(index, preperInline);

    return {
      createdAt: indexTreePos.node.pos.createdAt,
      offset: indexTreePos.node.pos.offset + indexTreePos.offset,
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
    // TODO(hackerwins, easylogic): Implement this with copying the root node deeply.
    const tree = new CRDTTree(root.clone(root.pos.offset), this.getCreatedAt());
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
}