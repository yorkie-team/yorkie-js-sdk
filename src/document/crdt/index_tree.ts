import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

/**
 * About `index`, `size` and `TreePos` in crdt.IndexTree.
 *
 * `index` of crdt.Tree represents a absolute position of a node in the tree.
 * `size` is used to calculate the relative index of nodes in the tree.
 *
 * For example, empty paragraph's size is 0 and index 0 is the position of the:
 *    0
 * <p> </p>,                                p.size = 0
 *
 * If a paragraph has <i>, its size becomes 2 and there are 3 indexes:
 *     0   1    2
 *  <p> <i> </i> </p>                       p.size = 2, i.size = 0
 *
 * If the paragraph has <i> and <b>, its size becomes 4:
 *     0   1    2   3   4
 *  <p> <i> </i> <b> </b> </p>              p.size = 4, i.size = 0, b.size = 0
 *     0   1    2   3    4    5   6
 *  <p> <i> </i> <b> </b> <s> </s> </p>     p.size = 6, i.size = 0, b.size = 0, s.size = 0
 *
 * If a paragraph has text, its size becomes length of the characters:
 *     0 1 2 3
 *  <p> A B C </p>                          p.size = 3,   text.size = 3
 *
 * So the size of a node is the sum of the size and type of its children:
 *  `size = children(block type).length * 2 + children.reduce((child, acc) => child.size + acc, 0)`
 *
 * `TreePos` is the relative position of a node in the tree. `TreePos` can be converted
 * to `index` and vice versa.
 *
 * For example, if a paragraph has <i>, there are 3 indexes:
 *     0   1    2
 *  <p> <i> </i> </p>                       p.size = 2, i.size = 0
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
 * `DefaultRootType` is the default type of the root node.
 * It is used when the type of the root node is not specified.
 */
export const DefaultRootType = 'root';

/**
 * `NoteType` is the type of a node in the tree.
 */
export type TreeNodeType = string | 'text';

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
 * `IndexTreeNode` is the node of IndexTree.
 */
export abstract class IndexTreeNode {
  id: TimeTicket;
  type: TreeNodeType;
  parent?: CRDTBlockNode;
  size: number;
  removedAt?: TimeTicket;

  constructor(id: TimeTicket, type: TreeNodeType) {
    this.id = id;
    this.type = type;
    this.size = 0;
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
   * `updateAncestorsSize` updates the size of the ancestors.
   */
  updateAncestorsSize(): void {
    let parent: IndexTreeNode | undefined = this.parent;
    const sign = this.removedAt ? -1 : 1;

    while (parent) {
      parent.size += this.paddedSize * sign;
      parent = parent.parent;
    }
  }

  /**
   * `isInline` returns true if the node is a inline node.
   */
  get isInline(): boolean {
    return this.type === 'text';
  }

  /**
   * `paddedSize` returns the size of the node including padding size.
   */
  get paddedSize(): number {
    return this.size + (this.isInline ? 0 : BlockNodePaddingSize);
  }

  /**
   * `children` returns the children of the node.
   */
  abstract get children(): Array<IndexTreeNode>;

  /**
   * `split` splits the node at the given offset.
   */
  abstract split(offset: number): IndexTreeNode;

  /**
   * `isAncenstorOf` returns true if the node is an ancestor of the given node.
   */
  isAncestorOf(node: IndexTreeNode): boolean {
    return ancestorOf(this, node);
  }

  /**
   * `isDescendantOf` returns true if the node is a descendant of the given node.
   */
  isDescendantOf(node: IndexTreeNode): boolean {
    return ancestorOf(node, this);
  }
}

/**
 * `CRDTInlineNode` is the node of a CRDT tree that has text.
 */
export class CRDTInlineNode extends IndexTreeNode {
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
   * `splitNode` splits the given node at the given offset.
   */
  split(offset: number): IndexTreeNode {
    if (offset === 0 || offset === this.size) {
      return this;
    }

    const leftValue = this.value.slice(0, offset);
    const rightValue = this.value.slice(offset);

    this.value = leftValue;

    // TODO(hackerwins, easylogic): Create NodeID type for block-wise editing.
    // create new right node
    const rightNode = new CRDTInlineNode(this.id, rightValue);
    this.parent!._insertAfter(rightNode, this);

    return rightNode;
  }
}

/**
 * `CRDTBlockNode` is the node of a CRDT tree that has children.
 */
export class CRDTBlockNode extends IndexTreeNode {
  _children: Array<IndexTreeNode>;

  constructor(
    id: TimeTicket,
    type: TreeNodeType,
    children: Array<IndexTreeNode> = [],
  ) {
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
    return this._children.filter((child) => !child.removedAt);
  }

  /**
   * `append` appends the given nodes to the children.
   */
  append(...newNode: Array<IndexTreeNode>): void {
    this._children.push(...newNode);
    for (const node of newNode) {
      node.parent = this;
      node.updateAncestorsSize();
    }
  }

  /**
   * `prepend` prepends the given nodes to the children.
   */
  prepend(...newNode: Array<IndexTreeNode>): void {
    this._children.unshift(...newNode);
    for (const node of newNode) {
      node.parent = this;
      node.updateAncestorsSize();
    }
  }

  /**
   * `insertBefore` inserts the given node before the given child.
   */
  insertBefore(newNode: IndexTreeNode, referenceNode: IndexTreeNode): void {
    const offset = this._children.indexOf(referenceNode);
    if (offset === -1) {
      throw new Error('child not found');
    }

    this._insertAt(newNode, offset);
    newNode.updateAncestorsSize();
  }

  /**
   * `insertAfter` inserts the given node after the given child.
   */
  insertAfter(newNode: IndexTreeNode, referenceNode: IndexTreeNode): void {
    const offset = this._children.indexOf(referenceNode);
    if (offset === -1) {
      throw new Error('child not found');
    }

    this._insertAt(newNode, offset + 1);
    newNode.updateAncestorsSize();
  }

  /**
   * `insertAt` inserts the given node at the given offset.
   */
  insertAt(newNode: IndexTreeNode, offset: number): void {
    this._insertAt(newNode, offset);
    newNode.updateAncestorsSize();
  }

  /**
   * `splitNode` splits the given node at the given offset.
   */
  split(offset: number): IndexTreeNode {
    const clone = new CRDTBlockNode(this.id, this.type);
    this.parent!._insertAfter(clone, this);
    clone.updateAncestorsSize();

    const leftChildren = this.children.slice(0, offset);
    const rightChildren = this.children.slice(offset);
    this._children = leftChildren;
    clone._children = rightChildren;
    this.size = this._children.reduce(
      (acc, child) => acc + child.paddedSize,
      0,
    );
    clone.size = clone._children.reduce(
      (acc, child) => acc + child.paddedSize,
      0,
    );
    for (const child of clone._children) {
      child.parent = clone;
    }

    return clone;
  }

  /**
   * `_insertAfter` inserts the given node after the given child.
   * This method does not update the size of the ancestors.
   */
  _insertAfter(newNode: IndexTreeNode, referenceNode: IndexTreeNode): void {
    const offset = this._children.indexOf(referenceNode);
    if (offset === -1) {
      throw new Error('child not found');
    }

    this._insertAt(newNode, offset + 1);
  }

  /**
   * `_insertAt` inserts the given node at the given index.
   * This method does not update the size of the ancestors.
   */
  _insertAt(newNode: IndexTreeNode, offset: number): void {
    this._children.splice(offset, 0, newNode);
    newNode.parent = this;
  }

  /**
   * findOffset returns the offset of the given node in the children.
   */
  findOffset(node: IndexTreeNode): number {
    return this._children.indexOf(node);
  }

  /**
   * `findBranchOffset` returns offset of the given descendant node in this node.
   * If the given node is not a descendant of this node, it returns -1.
   */
  findBranchOffset(node: IndexTreeNode): number {
    let current: IndexTreeNode | undefined = node;
    while (current) {
      const offset = this._children.indexOf(current);
      if (offset !== -1) {
        return offset;
      }

      current = current.parent;
    }

    return -1;
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
  node: IndexTreeNode;
  offset: number;
};

/**
 * `accumulateNodeSize` accumulates the size of the given node.
 * The size of a node is the sum of the size and type of its descendants.
 */
function accumulateNodeSize(node: IndexTreeNode, depth = 0) {
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
 * `ancestorOf` returns true if the given node is an ancestor of the other node.
 */
function ancestorOf(ancestor: IndexTreeNode, node: IndexTreeNode): boolean {
  if (ancestor === node) {
    return false;
  }

  while (node.parent) {
    if (node.parent === ancestor) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/**
 * `nodesBetween` iterates the nodes between the given range.
 * If the given range is collapsed, the callback is not called.
 * It traverses the tree with postorder traversal.
 */
function nodesBetween(
  root: IndexTreeNode,
  from: number,
  to: number,
  callback: (node: IndexTreeNode) => void,
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

  if (from === to) {
    return;
  }

  let pos = 0;
  for (const child of root.children) {
    // NOTE(hackerwins): If the child is a block node, the size of the child
    if (from - child.paddedSize < pos && pos < to) {
      // NOTE(hackerwins): If the child is a block node, the range of the child
      // is from - 1 to to - 1. Because the range of the block node is from
      // the open tag to the close tag.
      const fromChild = child.isInline ? from - pos : from - pos - 1;
      const toChild = child.isInline ? to - pos : to - pos - 1;
      nodesBetween(
        child,
        Math.max(0, fromChild),
        Math.min(toChild, child.size),
        callback,
      );

      // NOTE(hackerwins): If the range spans outside the child,
      // the callback is called with the child.
      if (fromChild < 0 || toChild > child.size || child.isInline) {
        callback(child);
      }
    }
    pos += child.paddedSize;
  }
}

/**
 * `findTreePos` finds the position of the given index in the given node.
 */
function findTreePos(
  node: IndexTreeNode,
  index: number,
  preperInline = true,
): TreePos {
  if (index > node.size) {
    throw new Error(`index is out of range: ${index} > ${node.size}`);
  }

  if (node.isInline) {
    return { node, offset: index };
  }

  // offset is the index of the child node.
  // pos is the window of the index in the given node.
  let offset = 0;
  let pos = 0;
  for (const child of node.children) {
    // The pos is in bothsides of the inline node, we should traverse
    // inside of the inline node if preperInline is true.
    if (preperInline && child.isInline && child.size >= index - pos) {
      return findTreePos(child, index - pos, preperInline);
    }

    // The position is in leftside of the block node.
    if (index === pos) {
      return { node, offset };
    }

    // The position is in rightside of the block node and preperInline is false.
    if (!preperInline && child.paddedSize === index - pos) {
      return { node, offset: offset + 1 };
    }

    // The position is in middle the block node.
    if (child.paddedSize > index - pos) {
      // If we traverse inside of the block node, we should skip the open.
      const skipOpenSize = 1;
      return findTreePos(child, index - pos - skipOpenSize, preperInline);
    }

    pos += child.paddedSize;
    offset += 1;
  }

  // The position is in rightmost of the given node.
  return { node, offset };
}
/**
 * `getStructure` converts the given CRDTNode JSON for debugging.
 */
function getStructure(node: IndexTreeNode): TreeNodeForTest {
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
    children: node.children.map(getStructure),
    size: node.size,
    isRemoved: !!node.removedAt,
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
 * `getAncestors` returns the ancestors of the given node.
 */
export function getAncestors(node: IndexTreeNode): Array<IndexTreeNode> {
  const ancestors: Array<IndexTreeNode> = [];
  let parent = node.parent;
  while (parent) {
    ancestors.unshift(parent);
    parent = parent.parent;
  }
  return ancestors;
}

/**
 * `findCommonAncestor` finds the lowest common ancestor of the given nodes.
 */
export function findCommonAncestor(
  nodeA: IndexTreeNode,
  nodeB: IndexTreeNode,
): IndexTreeNode | undefined {
  if (nodeA === nodeB) {
    return nodeA;
  }

  const ancestorsOfA = getAncestors(nodeA);
  const ancestorsOfB = getAncestors(nodeB);

  let commonAncestor: IndexTreeNode | undefined;
  for (let i = 0; i < ancestorsOfA.length; i++) {
    const ancestorOfA = ancestorsOfA[i];
    const ancestorOfB = ancestorsOfB[i];

    if (ancestorOfA !== ancestorOfB) {
      break;
    }

    commonAncestor = ancestorOfA;
  }

  return commonAncestor;
}

/**
 * `IndexTree` is a tree structure for indexing the CRDTTree.
 */
export class IndexTree {
  private root: CRDTBlockNode;

  constructor(root: CRDTBlockNode) {
    this.root = root;
  }

  /**
   * `nodeBetween` returns the nodes between the given range.
   */
  nodesBetween(
    from: number,
    to: number,
    callback: (node: IndexTreeNode) => void,
  ): void {
    nodesBetween(this.root, from, to, callback);
  }

  /**
   * `splitInline` splits the inline node at the given index.
   */
  public splitInline(index: number): TreePos {
    const { node, offset } = findTreePos(this.root, index, true);
    if (node.isInline) {
      node.split(offset);
    }
    return { node, offset };
  }

  /**
   * `split` splits the node at the given index.
   */
  public split(index: number, depth = 1): TreePos {
    const treePos = findTreePos(this.root, index, true);

    let node: IndexTreeNode | undefined = treePos.node;
    let offset: number = treePos.offset;
    for (let i = 0; i < depth && node && node !== this.root; i++) {
      node.split(offset);

      const nextOffset = node.parent!.findOffset(node);
      offset = offset === 0 ? nextOffset : nextOffset + 1;
      node = node.parent;
    }

    return treePos;
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
   * `getSize` returns the size of the tree.
   */
  public get size(): number {
    return this.root.size;
  }

  /**
   * toXML returns the XML encoding of this tree.
   */
  public toXML(): string {
    return toXML(this.root);
  }

  /**
   * `getStructure` returns the JSON of this tree for debugging.
   */
  public getStructure(): TreeNodeForTest {
    return getStructure(this.root);
  }
}
