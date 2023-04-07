import {
  TimeTicket,
  InitialTimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';

/**
 * About `index`, `size` and `TreePos` in crdt.Tree.
 *
 * `index` of crdt.Tree represents a absolute position of a node in the tree.
 * `size` is used to calculate the relative index of nodes in the tree.
 *
 * For example, empty paragraph's size is 0 and index 0 is the position of the:
 *    0
 * <p> </p>
 *
 * If a paragraph has <i>, its size becomes 2 and there are 3 indexes:
 *     0   1    2
 *  <p> <i> </i> </p>
 *
 * If the paragraph has <i> and <b>, its size becomes 4:
 *     0   1    2   3   4
 *  <p> <i> </i> <b> </b> </p>
 *     0   1    2   3    4    5   6
 *  <p> <i> </i> <b> </b> <s> </s> </p>
 *
 * If a paragraph has text, its size becomes length of the characters:
 *     0 1 2 3
 *  <p> A B C </p>
 *
 * So the size of a node is the sum of the size and type of its children:
 *  `size = children(block type).length * 2 + children.reduce((child, acc) => child.size + acc, 0)`
 *
 * `TreePos` is the relative position of a node in the tree. `TreePos` can be converted
 * to `index` and vice versa.
 *
 * For example, if a paragraph has <i>, there are 3 indexes:
 *     0   1    2
 *  <p> <i> </i> </p>
 *
 * In this case, index of TreePos(p, 0) is 0, index of TreePos(p, 1) is 2.
 * Index 1 can be converted to TreePos(i, 0).
 *
 * index in yorkie.Tree inspired by ProseMirror's index.
 */

/**
 * `BlockNodeSize` is the size of a block node as a child of another block node.
 * Because a block node could be considered as a pair of open and close tags.
 */
const BlockNodeSize = 2;

/**
 * `NoteType` is the type of a node in the tree.
 */
type NodeType = 'root' | 'text' | string;

/**
 * `CRDTNode` is the node of a CRDT tree.
 */
export type CRDTNode = CRDTBlockNode | CRDTInlineNode;

/**
 * `CRDTInlineNode` is the node of a CRDT tree that has text.
 */
export type CRDTInlineNode = {
  id: TimeTicket;
  type: 'text';
  value: string;
  parent?: CRDTBlockNode;
  size: number;
};

/**
 * `CRDTBlockNode` is the node of a CRDT tree that has children.
 */
export type CRDTBlockNode = {
  id: TimeTicket;
  type: NodeType;
  children: Array<CRDTNode>;
  parent?: CRDTBlockNode;
  size: number;
};

/**
 * `TreePos` is the position of a node in the tree.
 *
 * `offset` is the position of node's token. For example, if the node is a
 * block node, the offset is the index of the child node. If the node is a
 * inline node, the offset is the index of the character.
 */
export type TreePos = {
  node: CRDTNode;
  offset: number;
};

/**
 * `accumulateNodeSize` accumulates the size of the given node.
 * The size of a node is the sum of the size and type of its children.
 */
function accumulateNodeSize(node: CRDTNode, depth = 0) {
  if (node.type === 'text') {
    return node.size;
  }

  const blockNode = node as CRDTBlockNode;
  let size = 0;

  if (depth > 0) size += BlockNodeSize;

  for (const child of blockNode.children) {
    size += accumulateNodeSize(child, depth + 1);
  }

  return size;
}

/**
 * `findTreePos` finds the position of the given index in the given node.
 */
function findTreePos(
  node: CRDTNode,
  index: number,
  preperInline = true,
): TreePos {
  if (index > node.size) {
    throw new Error(`index is out of range: ${index} > ${node.size}`);
  }

  if (node.type === 'text') {
    return { node, offset: index };
  }

  // TODO(hackerwins,easylogic): Find a way to remove this type casting.
  node = node as CRDTBlockNode;

  // offset is the index of the child node.
  // pos is the window of the index in the given node.
  let offset = 0;
  let pos = 0;
  for (const child of node.children) {
    let childSize = child.size;
    // The pos is in bothsides of the inline node, we should traverse
    // inside of the inline node if preperInline is true.
    if (preperInline && child.type === 'text' && childSize >= index - pos) {
      return findTreePos(child, index - pos);
    }

    // The position is in leftside of the block node.
    if (index === pos) {
      return { node, offset };
    }

    // The position is in rightside of the block node and preperInline is false.
    if (!preperInline && childSize === index - pos) {
      return { node, offset: offset + 1 };
    }

    childSize += BlockNodeSize;

    // The position is in middle the block node.
    if (childSize > index - pos) {
      // If we traverse inside of the block node, we should skip the open.
      const skipOpenSize = 1;
      return findTreePos(child, index - pos - skipOpenSize, preperInline);
    }

    pos += childSize;
    offset += 1;
  }

  // The position is in rightmost of the given node.
  return { node, offset };
}

/**
 * toJSON converts the given CRDTNode to JSON.
 */
// TODO(hackerwins,easylogic): Change any to specific type.
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
 * toXML converts the given CRDTNode to XML string.
 */
function toXML(node: CRDTNode): string {
  // TODO(hackerwins): Find a way to remove this type casting.
  if (node.type === 'text') {
    node = node as CRDTInlineNode;
    return node.value;
  }

  node = node as CRDTBlockNode;
  return `<${node.type}>${node.children
    .map((child) => toXML(child))
    .join('')}</${node.type}>`;
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
   * `sizeOf` returns the size of the given node.
   */
  public static sizeOf(node: CRDTNode): number {
    return accumulateNodeSize(node);
  }

  /**
   * `edit` edits the given range with the given value.
   * If the given value is undefined, the given range will be deleted.
   */
  public edit(
    range: [number, number],
    value: CRDTNode | undefined,
    ticket: TimeTicket,
  ): void {
    // 01. Find the position of the given range.
    const { node: fromNode, offset: fromOffset } = findTreePos(
      this.root,
      range[0],
      false,
    );
    const { node: toNode, offset: toOffset } = findTreePos(
      this.root,
      range[1],
      false,
    );

    // 02. delete the given range.
    // TODO(hackerwins,easylogic): Implement this.
    console.debug(fromNode, fromOffset, toNode, toOffset, ticket);

    // 03. Insert the given node at the given position.
    if (value) {
      const target = toNode as CRDTBlockNode;
      target.children.splice(fromOffset + 1, 0, value);
      value.parent = target;

      // 03. Update size of the nodes between the given node and the root.
      let current = value;
      while (current.parent) {
        if (value.type === 'text') {
          current.parent.size += value.size;
        } else {
          current.parent.size += value.size + BlockNodeSize;
        }

        current = current.parent;
      }
    }
  }

  /**
   * findTreePos finds the position of the given index in the tree.
   */
  public findTreePos(index: number, preperInline = true): TreePos {
    return findTreePos(this.root, index, preperInline);
  }

  /**
   * `getRoot` returns the root node of the tree.
   */
  public getRoot(): CRDTBlockNode {
    return this.root;
  }

  /**
   * toXML returns the XML encoding of this tree.
   */
  public toXML(): string {
    return toXML(this.root);
  }

  /**
   * `toJSON` returns the JSON encoding of this tree.
   */
  public toJSON(): string {
    return JSON.stringify(toJSON(this.root));
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
    const tree = new CRDTTree(this.getCreatedAt());
    tree.remove(this.getRemovedAt());
    return tree;
  }
}
