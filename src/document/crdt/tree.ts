import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
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
 * `BlockNodePaddingSize` is the size of a block node as a child of another block node.
 * Because a block node could be considered as a pair of open and close tags.
 */
const BlockNodePaddingSize = 2;

/**
 * `NoteType` is the type of a node in the tree.
 */
type NodeType = 'root' | 'text' | string;

/**
 * `CRDTNode` is the node of a CRDT tree.
 */
export abstract class CRDTNode {
  id: TimeTicket;
  type: NodeType;
  parent?: CRDTBlockNode;
  size: number;
  removedAt?: TimeTicket;

  constructor(id: TimeTicket, type: NodeType) {
    this.id = id;
    this.type = type;
    this.size = 0;
  }

  /**
   * `remove` marks the node as removed.
   */
  remove(removedAt: TimeTicket): void {
    if (!this.removedAt || this.removedAt.compare(removedAt) > 0) {
      this.removedAt = removedAt;
    }
  }

  /**
   * `isInline` returns true if the node is a inline node.
   */
  get isInline(): boolean {
    return this.type === 'text';
  }

  /**
   * `children` returns the children of the node.
   */
  abstract get children(): Array<CRDTNode>;

  /**
   * `toJSON` returns the JSON representation of the node.
   */
  abstract toJSON(): any;
}

/**
 * `CRDTInlineNode` is the node of a CRDT tree that has text.
 */
export class CRDTInlineNode extends CRDTNode {
  _value: string;

  constructor(id: TimeTicket, value: string) {
    super(id, 'text');

    this._value = value;
    this.size = value.length;
  }

  /**
   * `value` returns the value of the node.
   */
  get value() {
    return this._value;
  }

  /**
   * `value` sets the value of the node.
   */
  set value(v: string) {
    this._value = v;
    this.size = v.length;
  }

  /**
   * `children` returns the children of the node.
   */
  get children() {
    return [];
  }

  /**
   * `toJSON` returns the JSON representation of the node.
   */
  toJSON() {
    return {
      type: this.type,
      value: this.value,
      size: this.size,
    };
  }
}

/**
 * `CRDTBlockNode` is the node of a CRDT tree that has children.
 */
export class CRDTBlockNode extends CRDTNode {
  _children: Array<CRDTNode>;

  constructor(id: TimeTicket, type: NodeType, children: Array<CRDTNode> = []) {
    super(id, type);
    this._children = children;
    this.size = 0;
    if (children.length > 0) {
      this.size = accumulateNodeSize(this);
    }
  }

  /**
   * `children` returns the children of the node.
   */
  get children() {
    return this._children;
  }

  /**
   * `toJSON` returns the JSON representation of the node.
   */
  toJSON() {
    return {
      type: this.type,
      children: this.children.map((child) => child.toJSON()),
      size: this.size,
    };
  }
}

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
  if (node.isInline) {
    return node.size;
  }

  const blockNode = node as CRDTBlockNode;
  let size = 0;

  if (depth > 0) size += BlockNodePaddingSize;

  for (const child of blockNode.children) {
    size += accumulateNodeSize(child, depth + 1);
  }

  return size;
}

/**
 * `nodesBetween` iterates the nodes between the given range.
 */
function nodesBetween(
  root: CRDTNode,
  from: number,
  to: number,
  callback: (node: CRDTNode) => void,
) {
  if (from > to) {
    throw new Error(`from is greater than to: ${from} > ${to}`);
  }

  if (from > root.size) {
    throw new Error(`from is out of range: ${from} > ${root.size}`);
  }

  if (to > root.size) {
    throw new Error(`to is out of range: ${to} > ${root.size}`);
  }

  let pos = 0;
  for (const child of root.children) {
    // NOTE(hackerwins): If the child is a block node, the size of the child
    const paddedChildSize = child.isInline
      ? child.size
      : child.size + BlockNodePaddingSize;
    if (from - paddedChildSize < pos && pos < to) {
      callback(child);

      // NOTE(hackerwins): If the child is a block node, the range of the child
      // is from - 1 to to - 1. Because the range of the block node is from
      // the open tag to the close tag.
      const fromChild = from - pos;
      const toChild = to - pos;
      nodesBetween(
        child,
        Math.max(0, child.isInline ? fromChild : fromChild - 1),
        Math.min(child.isInline ? toChild : toChild - 1, child.size),
        callback,
      );
    }
    pos += paddedChildSize;
  }
}

/**
 * `splitNode` splits the given node at the given offset.
 */
function splitNode(node: CRDTNode, offset: number): void {
  if (!node.isInline) {
    return;
  }

  const currentNode = node as CRDTInlineNode;
  if (offset === 0 || offset === currentNode.size) {
    return;
  }

  const left = currentNode.value.slice(0, offset);
  const right = currentNode.value.slice(offset);

  currentNode.value = left;

  // TODO(hackerwins, easylogic): Create NodeID type for block-wise editing.
  // create new right node
  const rightNode = new CRDTInlineNode(currentNode.id, right);

  const parent = currentNode.parent;
  if (!parent) {
    throw Error('parent node is not found');
  }

  // insert right node
  const index = parent.children.indexOf(currentNode);
  parent.children.splice(index + 1, 0, rightNode);
  return;
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

  if (node.isInline) {
    return { node, offset: index };
  }

  // TODO(hackerwins, easylogic): Find a way to remove this type casting.
  const currentNode = node;

  // offset is the index of the child node.
  // pos is the window of the index in the given node.
  let offset = 0;
  let pos = 0;
  for (const child of currentNode.children) {
    let childSize = child.size;
    // The pos is in bothsides of the inline node, we should traverse
    // inside of the inline node if preperInline is true.
    if (preperInline && child.isInline && childSize >= index - pos) {
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

    childSize += BlockNodePaddingSize;

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
// TODO(hackerwins, easylogic): Change any to specific type.
function toJSON(node: CRDTNode): any {
  // TODO(hackerwins, easylogic): Find a way to remove this type casting.
  if (node.isInline) {
    const currentNode = node as CRDTInlineNode;
    return {
      type: currentNode.type,
      value: currentNode.value,
    };
  }

  const currentBlockNode = node as CRDTBlockNode;
  return {
    type: node.type,
    children: currentBlockNode.children.map((child) => toJSON(child)),
  };
}

/**
 * toXML converts the given CRDTNode to XML string.
 */
function toXML(node: CRDTNode): string {
  // TODO(hackerwins, easylogic): Find a way to remove this type casting.
  if (node.isInline) {
    const currentNode = node as CRDTInlineNode;
    return currentNode.value;
  }

  const currentBlockNode = node as CRDTBlockNode;
  return `<${node.type}>${currentBlockNode.children
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
    this.root = new CRDTBlockNode(createdAt, 'root');
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
   * `nodesBetween` returns the nodes between the given range.
   */
  public nodesBetween(
    from: number,
    to: number,
    callback: (node: CRDTNode) => void,
  ): void {
    nodesBetween(this.root, from, to, callback);
  }

  /**
   * `splitNode` splits the node at the given index.
   */
  public splitNode(index: number) {
    // TODO(hackerwins, easylogic): Split the nodes from the given node to
    // the specified ancestor node.
    const { node: fromNode, offset: fromOffset } = findTreePos(
      this.root,
      index,
      true,
    );
    return splitNode(fromNode, fromOffset);
  }

  /**
   * `edit` edits the given range with the given value.
   * If the given value is undefined, the given range will be deleted.
   */
  public edit(
    range: [number, number],
    content: CRDTNode | undefined,
    ticket: TimeTicket,
  ): void {
    // 01. split nodes at the given positions if needed.
    this.splitNode(range[0]);
    this.splitNode(range[1]);

    // 02. collect the nodes between the given range and mark them as tombstones.
    // TODO(hackerwins, easylogic): Filter out ancestors of the left-side node.
    this.nodesBetween(range[0], range[1], (node) => {
      node.remove(ticket);
    });

    // 03. Insert the given node at the given position.
    if (content) {
      const { node: fromNode, offset: fromOffset } = findTreePos(
        this.root,
        range[0],
        false,
      );

      const target = fromNode as CRDTBlockNode;
      target.children.splice(fromOffset + 1, 0, content);
      content.parent = target;

      // 03. Update size of the nodes between the given node and the root.
      let current = content;
      while (current.parent) {
        if (content.isInline) {
          current.parent.size += content.size;
        } else {
          current.parent.size += content.size + BlockNodePaddingSize;
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
