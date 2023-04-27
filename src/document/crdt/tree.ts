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
  BlockNodePaddingSize,
  traverse,
} from '@yorkie-js-sdk/src/document/crdt/index_tree';

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
 * `accumulateNodeSize` accumulates the size of the given node.
 * The size of a node is the sum of the size and type of its descendants.
 */
function accumulateNodeSize(node: CRDTTreeNode, depth = 0) {
  if (node.isInline) {
    return node.size;
  }

  let size = 0;
  for (const child of node.children) {
    size += accumulateNodeSize(child, depth + 1);
  }
  if (depth > 0) {
    size += BlockNodePaddingSize;
  }

  return size;
}

/**
 * `CRDTInlineNode` is the node of a CRDT tree that has text.
 */
export class CRDTTreeNode extends IndexTreeNode<CRDTTreeNode> {
  id: TimeTicket;
  removedAt?: TimeTicket;

  next?: CRDTTreeNode;
  prev?: CRDTTreeNode;

  _value = '';

  constructor(
    id: TimeTicket,
    type: string,
    opts?: string | Array<CRDTTreeNode>,
  ) {
    super(type);
    this.id = id;

    if (typeof opts === 'string') {
      this.value = opts;
    } else if (Array.isArray(opts)) {
      this._children = opts;
      if (this._children.length > 0) {
        this.size = accumulateNodeSize(this);
      }
    }
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
   * `clone` clones this node.
   */
  clone(): CRDTTreeNode {
    // TODO(hackerwins, easylogic): Create NodeID type for block-wise editing.
    // create new right node
    return new CRDTTreeNode(this.id, this.type);
  }
}

/**
 * `CRDTTree` is a CRDT implementation of a tree.
 */
export class CRDTTree extends CRDTElement {
  private dummyHead: CRDTTreeNode;
  private treeByIndex: IndexTree<CRDTTreeNode>;

  constructor(root: CRDTTreeNode, createdAt: TimeTicket) {
    super(createdAt);
    this.dummyHead = new CRDTTreeNode(InitialTimeTicket, DummyHeadType);
    this.treeByIndex = new IndexTree<CRDTTreeNode>(root);

    let current = this.dummyHead;
    this.treeByIndex.traverse((node) => {
      current.next = node;
      node.prev = current;
      current = node;
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
    this.treeByIndex.nodesBetween(from, to, callback);
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
    const pos = this.treeByIndex.findTreePos(index, true);
    return this.treeByIndex.findPostorderRight(pos);
  }

  /**
   * `split` splits the node at the given index.
   */
  public split(index: number, depth = 1): TreePos<CRDTTreeNode> {
    // TODO(hackerwins): Implement this with keeping references in the list.
    // return this.treeByIndex.split(index, depth);
    throw new Error(`not implemented, ${index} ${depth}`);
  }

  /**
   * `splitInline` splits the inline node at the given index.
   */
  public splitInline(index: number): [TreePos<CRDTTreeNode>, CRDTTreeNode] {
    const pos = this.treeByIndex.findTreePos(index, true);
    if (pos.node.isInline) {
      const split = pos.node.split(pos.offset);
      if (split) {
        this.insertAfter(pos.node, split);
      }
    }

    const right = this.treeByIndex.findPostorderRight(pos);
    return [pos, right!];
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
   * `insertAfter` inserts the given node after the given previous node.
   */
  public insertAfter(prev: CRDTTreeNode, node: CRDTTreeNode): void {
    const next = prev.next;

    prev.next = node;
    node.prev = prev;

    if (next) {
      node.next = next;
      next.prev = node;
    }
  }

  /**
   * `edit` edits the given range with the given value.
   * If the given value is undefined, the given range will be deleted.
   */
  public edit(
    range: [number, number],
    content: CRDTTreeNode | undefined,
    editedAt: TimeTicket,
  ): void {
    // 01. split inline nodes at the given range if needed.
    const [fromPos, fromRight] = this.splitInline(range[0]);
    const [toPos, toRight] = this.splitInline(range[1]);

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

    // 04. Remove the nodes from the index tree.
    for (const node of toBeRemoveds) {
      node.parent?.removeChild(node);
    }
  }

  /**
   * findTreePos finds the position of the given index in the tree.
   */
  public findTreePos(
    index: number,
    preperInline = true,
  ): TreePos<CRDTTreeNode> {
    return this.treeByIndex.findTreePos(index, preperInline);
  }

  /**
   * `getRoot` returns the root node of the tree.
   */
  public getRoot(): CRDTTreeNode {
    return this.treeByIndex.getRoot();
  }

  /**
   * `getSize` returns the size of the tree.
   */
  public getSize(): number {
    return this.treeByIndex.size;
  }

  /**
   * toXML returns the XML encoding of this tree.
   */
  public toXML(): string {
    return toXML(this.treeByIndex.getRoot());
  }

  /**
   * `toJSON` returns the JSON encoding of this tree.
   */
  public toJSON(): string {
    return JSON.stringify(toJSON(this.treeByIndex.getRoot()));
  }

  /**
   * `toStructure` returns the JSON of this tree for debugging.
   */
  public toStructure(): TreeNodeForTest {
    return toStructure(this.treeByIndex.getRoot());
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
    const tree = new CRDTTree(this.getRoot(), this.getCreatedAt());
    // TODO(hackerwins, easylogic): Implement this with copying the root node deeply.
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
