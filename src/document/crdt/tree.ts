import {
  TimeTicket,
  InitialTimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  IndexTree,
  CRDTBlockNode,
  CRDTInlineNode,
  TreePos,
  IndexTreeNode,
  TreeNode,
  TreeNodeForTest,
  traverse,
} from '@yorkie-js-sdk/src/document/crdt/index_tree';

/**
 * DummyHeadType is a type of dummy head. It is used to represent the head node
 * of RGA.
 */
const DummyHeadType = 'dummy';

/**
 * toJSON converts the given CRDTNode to JSON.
 */
function toJSON(node: IndexTreeNode): TreeNode {
  if (node.isInline) {
    const currentNode = node as CRDTInlineNode;
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
export function toXML(node: IndexTreeNode): string {
  if (node.isInline) {
    const currentNode = node as CRDTInlineNode;
    return currentNode.value;
  }

  return `<${node.type}>${node.children
    .map((child) => toXML(child))
    .join('')}</${node.type}>`;
}

/**
 * `toStructure` converts the given CRDTNode JSON for debugging.
 */
function toStructure(node: IndexTreeNode): TreeNodeForTest {
  if (node.isInline) {
    const currentNode = node as CRDTInlineNode;
    return {
      type: currentNode.type,
      value: currentNode.value,
      size: currentNode.size,
      isRemoved: !!currentNode.removedAt,
    };
  }

  return {
    type: node.type,
    children: node.children.map(toStructure),
    size: node.size,
    isRemoved: !!node.removedAt,
  };
}

/**
 * `CRDTTree` is a CRDT implementation of a tree.
 */
export class CRDTTree extends CRDTElement {
  private dummyHead: IndexTreeNode;
  private treeByIndex: IndexTree;

  constructor(root: CRDTBlockNode, createdAt: TimeTicket) {
    super(createdAt);
    this.dummyHead = new CRDTBlockNode(InitialTimeTicket, DummyHeadType);
    this.treeByIndex = new IndexTree(root);

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
  public static create(root: CRDTBlockNode, ticket: TimeTicket): CRDTTree {
    return new CRDTTree(root, ticket);
  }

  /**
   * `nodesBetween` returns the nodes between the given range.
   */
  public nodesBetween(
    from: number,
    to: number,
    callback: (node: IndexTreeNode) => void,
  ): void {
    this.treeByIndex.nodesBetween(from, to, callback);
  }

  /**
   * `nodesBetweenByList` returns the nodes between the given range.
   * This method includes the given left node and the given right node.
   */
  public nodesBetweenByList(
    left: IndexTreeNode,
    right: IndexTreeNode,
    callback: (node: IndexTreeNode) => void,
  ): void {
    let current = left;
    while (current !== right) {
      if (!current) {
        throw new Error('left and right are not in the same list');
      }

      callback(current);
      current = current.next!;
    }
    callback(current);
  }

  /**
   * `findPostorderRight` finds the right node of the given index in postorder.
   */
  public findPostorderRight(index: number): IndexTreeNode | undefined {
    const pos = this.treeByIndex.findTreePos(index, true);
    return this.treeByIndex.findPostorderRight(pos);
  }

  /**
   * `split` splits the node at the given index.
   */
  public split(index: number, depth = 1): TreePos {
    // TODO(hackerwins): Implement this with keeping references in the list.
    // return this.treeByIndex.split(index, depth);
    throw new Error(`not implemented, ${index} ${depth}`);
  }

  /**
   * `splitInline` splits the inline node at the given index.
   */
  public splitInline(index: number): [TreePos, IndexTreeNode] {
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
  public insertAfter(prev: IndexTreeNode, node: IndexTreeNode): void {
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
    content: IndexTreeNode | undefined,
    editedAt: TimeTicket,
  ): void {
    // 01. split inline nodes at the given range if needed.
    const [fromPos, fromRight] = this.splitInline(range[0]);
    const [toPos, toRight] = this.splitInline(range[1]);

    const toBeRemoveds: Array<IndexTreeNode> = [];
    // 02. collect the nodes from list, between the given range.
    if (fromRight !== toRight) {
      this.nodesBetweenByList(fromRight!, toRight!.prev!, (node) => {
        toBeRemoveds.push(node);
      });

      // 03. remove the nodes and update the index tree.
      const isRangeOnSameBranch = toPos.node.isAncestorOf(fromPos.node);
      for (const node of toBeRemoveds) {
        node.remove(editedAt);
      }

      if (isRangeOnSameBranch) {
        let removedBlockNode: IndexTreeNode | undefined;
        if (fromPos.node.parent?.removedAt) {
          removedBlockNode = fromPos.node.parent;
        } else if (!fromPos.node.isInline && fromPos.node.removedAt) {
          removedBlockNode = fromPos.node;
        }

        // If the nearest removed block node of the fromNode is found,
        // insert the alive children of the removed block node to the toNode.
        if (removedBlockNode) {
          const blockNode = toPos.node as CRDTBlockNode;
          const offset = blockNode.findBranchOffset(removedBlockNode);
          for (const node of removedBlockNode.children.reverse()) {
            blockNode.insertAt(node, offset);
          }
        }
      } else {
        if (fromPos.node.parent?.removedAt) {
          toPos.node.parent?.prepend(...fromPos.node.parent.children);
        }
      }
    }

    // 04. insert the given node at the given position.
    if (content) {
      // 04-1. insert the content nodes to the list.
      let previous = fromRight!.prev!;
      traverse(content, (node) => {
        this.insertAfter(previous, node);
        previous = node;
      });

      // 04-2. insert the content nodes to the tree.
      if (fromPos.node.isInline) {
        if (fromPos.offset === 0) {
          fromPos.node.parent!.insertBefore(content, fromPos.node);
        } else {
          fromPos.node.parent!.insertAfter(content, fromPos.node);
        }
      } else {
        const target = fromPos.node as CRDTBlockNode;
        target.insertAt(content, fromPos.offset + 1);
      }
    }

    // Remove the nodes from the index tree.
    for (const node of toBeRemoveds) {
      node.parent?.removeChild(node);
    }
  }

  /**
   * findTreePos finds the position of the given index in the tree.
   */
  public findTreePos(index: number, preperInline = true): TreePos {
    return this.treeByIndex.findTreePos(index, preperInline);
  }

  /**
   * `getRoot` returns the root node of the tree.
   */
  public getRoot(): CRDTBlockNode {
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
  public *[Symbol.iterator](): IterableIterator<IndexTreeNode> {
    let node = this.dummyHead.next;
    while (node) {
      if (!node.removedAt) {
        yield node;
      }

      node = node.next;
    }
  }
}
