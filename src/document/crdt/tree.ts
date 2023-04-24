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
   * `split` splits the node at the given index.
   */
  public split(index: number, depth = 1): TreePos {
    return this.treeByIndex.split(index, depth);
  }

  /**
   * `move` move the given source range to the given target range.
   */
  public move(
    _target: [number, number],
    _source: [number, number],
    ticket: TimeTicket,
  ): void {
    // TODO(hackerwins, easylogic): Implement this with keeping references of the nodes.
    console.log(_target, _source, ticket);
    return;
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
    const { node: fromNode, offset: fromOffset } = this.treeByIndex.splitInline(
      range[0],
    );
    const { node: toNode } = this.treeByIndex.splitInline(range[1]);

    // 02. collect the nodes between the given range and remove them.
    if (fromNode.isAncestorOf(toNode)) {
      // 02-1. The range is placed on the same hierarchy.
      const toBeRemoveds: Array<IndexTreeNode> = [];
      this.nodesBetween(range[0], range[1], (node) => {
        toBeRemoveds.push(node);
      });
      for (const node of toBeRemoveds) {
        node.remove(editedAt);
      }

      let removedBlockNode: IndexTreeNode | undefined;
      if (toNode.parent?.removedAt) {
        removedBlockNode = toNode.parent;
      } else if (!toNode.isInline && toNode.removedAt) {
        removedBlockNode = toNode;
      }

      // If the nearest removed block node of the toNode is found,
      // insert the alive children of the removed block node to the fromNode.
      if (removedBlockNode) {
        const blockNode = fromNode as CRDTBlockNode;
        const offset = blockNode.findBranchOffset(removedBlockNode);
        for (const node of removedBlockNode.children.reverse()) {
          blockNode.insertAt(node, offset);
        }
      }
    } else {
      // 02-2. The range is placed on the different hierarchy.
      const toBeRemoveds: Array<IndexTreeNode> = [];
      this.nodesBetween(range[0], range[1], (node) => {
        // We need to leave ancestors of toNode.
        // This is because all nodes are strucutally remapped to postorder traversal list of RGA,
        // so the ancestors of the right-side should be remained.
        if (node.isAncestorOf(toNode)) {
          return;
        }
        toBeRemoveds.push(node);
      });
      for (const node of toBeRemoveds) {
        node.remove(editedAt);
      }
      if (fromNode.parent?.removedAt) {
        toNode.parent?.prepend(...fromNode.parent.children);
      }
    }

    // 03. insert the given node at the given position.
    if (content) {
      if (fromNode.isInline) {
        if (fromOffset === 0) {
          fromNode.parent!.insertBefore(content, fromNode);
        } else {
          fromNode.parent!.insertAfter(content, fromNode);
        }
      } else {
        const target = fromNode as CRDTBlockNode;
        target.insertAt(content, fromOffset + 1);
      }
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
      yield node;
      node = node.next;
    }
  }
}
