import {
  TimeTicket,
  InitialTimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';

/**
 * `Index` and `Size` of crdt.Tree.
 *
 * `index` of crdt.Tree is used to find a position in the tree and `size` is used
 * to calculate the relative index of nodes in the tree.
 *
 * For example, empty paragraph's size is 0 and index 0 is the position of the:
 *    0
 * <p> </p>
 *
 * If a paragraph has <i>, its size becomes 2 and there are 3 positions:
 *     0   1    2
 *  <p> <i> </i> </p>
 *
 * If the paragraph has <i> and <b>, its size becomes 4:
 *     0   1    2   3   4
 *  <p> <i> </i> <b> </b> </p>
 *
 * If a paragraph has text, its size becomes length of the characters:
 *     0 1 2 3
 *  <p> A B C </p>
 */

/**
 * `BlockNodeSize` is the size of a block node as a child of another block node.
 * Because a block node could be considered as a pair of open and close tags.
 */
const BlockNodeSize = 2;

type NodeType = 'root' | string;

export type CRDTNode = CRDTBlockNode | CRDTInlineNode;

type CRDTInlineNode = {
  id: TimeTicket;
  type: 'text';
  value: string;
  size: number;
};

type CRDTBlockNode = {
  id: TimeTicket;
  type: NodeType;
  children: Array<CRDTNode>;
  size: number;
};

type TreePos = {
  node: CRDTNode;
  offset: number;
};

/**
 * findTreePos finds the position of the given index in the given node.
 */
function findTreePos(node: CRDTNode, index: number): TreePos {
  if (index > node.size) {
    throw new Error(`index is out of range: ${index} > ${node.size}`);
  }

  if (node.type === 'text') {
    return { node, offset: index };
  }

  // TODO(hackerwins): Find a way to remove this type casting.
  node = node as CRDTBlockNode;

  let pos = 0;
  for (const child of node.children) {
    // Block node has open and close pair of tags. So, when we use the block
    // node as a child, the size should be added to the its size.
    let childSize = child.size + BlockNodeSize;
    if (child.type === 'text') {
      childSize = child.size;
    }

    if (childSize > index - pos) {
      // If we traverse inside of the block node, we should skip the open tag.
      const offset = child.type === 'text' ? 0 : 1;
      return findTreePos(child, index - pos - offset);
    }
    pos += childSize;
  }

  return { node, offset: index - pos };
}

/**
 * toJSON converts the given CRDTNode to JSON.
 */
// TODO(hackerwins): Change any to specific type.
function toJSON(node: CRDTNode): any {
  // TODO(hackerwins): Find a way to remove this type casting.
  if (node.type === 'text') {
    node = node as CRDTInlineNode;
    return {
      type: node.type,
      value: node.value,
    };
  }

  node = node as CRDTBlockNode;
  return {
    type: node.type,
    children: node.children.map((child) => toJSON(child)),
  };
}

/**
 * `CRDTTree` is a CRDT implementation of a tree.
 */
export class CRDTTree extends CRDTElement {
  private root: CRDTBlockNode;

  constructor(createdAt: TimeTicket) {
    super(createdAt);
    this.root = {
      id: InitialTimeTicket,
      type: 'root',
      children: [],
      size: 0,
    };
  }

  /**
   * `create` creates a new instance of `CRDTTree`.
   */
  public static create(ticket: TimeTicket): CRDTTree {
    return new CRDTTree(ticket);
  }

  /**
   * `edit` inserts the given node at the given range.
   */
  public edit(
    range: [number, number],
    value: CRDTNode,
    ticket: TimeTicket,
  ): void {
    const { node, offset } = findTreePos(this.root, range[0]);
    const target = node as CRDTBlockNode;
    target.children.push(value);

    if (node.type == 'text') {
      target.size += value.size;
    } else {
      target.size += 2 + value.size;
    }

    console.log(ticket, offset);
  }

  /**
   * `toJSON` returns the JSON encoding of this text.
   */
  public toJSON(): string {
    return JSON.stringify(toJSON(this.root));
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this text.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTTree {
    const text = new CRDTTree(this.getCreatedAt());
    text.remove(this.getRemovedAt());
    return text;
  }
}
