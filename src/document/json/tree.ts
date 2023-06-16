import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  CRDTTree,
  CRDTTreeNode,
  TreeRange,
  TreeChange,
} from '@yorkie-js-sdk/src/document/crdt/tree';

import {
  IndexTree,
  DefaultRootType,
  DefaultTextType,
  TreeNodeType,
} from '@yorkie-js-sdk/src/util/index_tree';
import { TreeEditOperation } from '@yorkie-js-sdk/src/document/operation/tree_edit_operation';
import { logger } from '@yorkie-js-sdk/src/util/logger';

export type TreeNode = TextNode | ElementNode;
export type TreeChangeWithPath = Omit<TreeChange, 'from' | 'to'> & {
  from: Array<number>;
  to: Array<number>;
};

/**
 * `ElementNode` is a node that has children.
 */
export type ElementNode = {
  type: TreeNodeType;
  children: Array<TreeNode>;
};

/**
 * `TextNode` is a node that has a value.
 */
export type TextNode = {
  type: typeof DefaultTextType;
  value: string;
};

/**
 * `buildDescendants` builds descendants of the given tree node.
 */
function buildDescendants(
  treeNode: TreeNode,
  parent: CRDTTreeNode,
  context: ChangeContext,
) {
  const { type } = treeNode;

  if (type === 'text') {
    const { value } = treeNode as TextNode;
    const textNode = CRDTTreeNode.create(
      { createdAt: context.issueTimeTicket(), offset: 0 },
      type,
      value,
    );

    parent.append(textNode);
  } else {
    const { children } = treeNode as ElementNode;
    const elementNode = CRDTTreeNode.create(
      { createdAt: context.issueTimeTicket(), offset: 0 },
      type,
    );

    parent.append(elementNode);

    for (const child of children) {
      buildDescendants(child, elementNode, context);
    }
  }
}

/**
 * createCRDTTreeNode returns CRDTTreeNode by given TreeNode.
 */
function createCRDTTreeNode(context: ChangeContext, content: TreeNode) {
  const { type } = content;

  let root;
  if (content.type === 'text') {
    const { value } = content as TextNode;
    root = CRDTTreeNode.create(
      { createdAt: context.issueTimeTicket(), offset: 0 },
      type,
      value,
    );
  } else if (content) {
    const { children = [] } = content as ElementNode;
    root = CRDTTreeNode.create(
      { createdAt: context.issueTimeTicket(), offset: 0 },
      type,
    );

    for (const child of children) {
      buildDescendants(child, root, context);
    }
  }

  return root;
}

/**
 * `Tree` is a CRDT-based tree structure that is used to represent the document
 * tree of text-based editor such as ProseMirror.
 */
export class Tree {
  private initialRoot?: ElementNode;
  private context?: ChangeContext;
  private tree?: CRDTTree;

  constructor(initialRoot?: ElementNode) {
    this.initialRoot = initialRoot;
  }

  /**
   * `initialize` initialize this tree with context and internal tree.
   * @internal
   */
  public initialize(context: ChangeContext, tree: CRDTTree): void {
    this.context = context;
    this.tree = tree;
  }

  /**
   * `getID` returns the ID of this tree.
   */
  public getID(): TimeTicket {
    return this.tree!.getID();
  }

  /**
   * `getInitialRoot` returns the root node of this tree.
   */
  public buildRoot(context: ChangeContext): CRDTTreeNode {
    if (!this.initialRoot) {
      return CRDTTreeNode.create(
        { createdAt: context.issueTimeTicket(), offset: 0 },
        DefaultRootType,
      );
    }

    // TODO(hackerwins): Need to use the ticket of operation of creating tree.
    const root = CRDTTreeNode.create(
      { createdAt: context.issueTimeTicket(), offset: 0 },
      this.initialRoot.type,
    );

    for (const child of this.initialRoot.children) {
      buildDescendants(child, root, context);
    }

    return root;
  }

  /**
   * `getSize` returns the size of this tree.
   */
  public getSize(): number {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    return this.tree.getSize();
  }

  /**
   * `getIndexTree` returns the index tree of this tree.
   */
  public getIndexTree(): IndexTree<CRDTTreeNode> {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    return this.tree.getIndexTree();
  }

  /**
   * `editByPath` edits this tree with the given node and path.
   */
  public editByPath(
    fromPath: Array<number>,
    toPath: Array<number>,
    content?: TreeNode,
  ): boolean {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }
    if (fromPath.length !== toPath.length) {
      throw new Error('path length should be equal');
    }
    if (!fromPath.length || !toPath.length) {
      throw new Error('path should not be empty');
    }

    const crdtNode = content && createCRDTTreeNode(this.context, content);
    const fromPos = this.tree.pathToPos(fromPath);
    const toPos = this.tree.pathToPos(toPath);
    const ticket = this.context.getLastTimeTicket();
    this.tree.edit([fromPos, toPos], crdtNode?.deepcopy(), ticket);

    this.context.push(
      TreeEditOperation.create(
        this.tree.getCreatedAt(),
        fromPos,
        toPos,
        crdtNode,
        ticket,
      ),
    );

    return true;
  }

  /**
   * `edit` edits this tree with the given node.
   */
  public edit(fromIdx: number, toIdx: number, content?: TreeNode): boolean {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }
    if (fromIdx > toIdx) {
      throw new Error('from should be less than or equal to to');
    }

    const crdtNode = content && createCRDTTreeNode(this.context, content);
    const fromPos = this.tree.findPos(fromIdx);
    const toPos = this.tree.findPos(toIdx);
    const ticket = this.context.getLastTimeTicket();
    this.tree.edit([fromPos, toPos], crdtNode?.deepcopy(), ticket);

    this.context.push(
      TreeEditOperation.create(
        this.tree.getCreatedAt(),
        fromPos,
        toPos,
        crdtNode,
        ticket,
      ),
    );

    return true;
  }

  /**
   * `split` splits this tree at the given index.
   */
  public split(index: number, depth: number): boolean {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    this.tree.split(index, depth);
    return true;
  }

  /**
   * `toXML` returns the XML string of this tree.
   */
  public toXML(): string {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    return this.tree.toXML();
  }

  /**
   * `toJSON` returns the JSON string of this tree.
   */
  public toJSON(): string {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    return this.tree.toJSON();
  }

  /**
   * `indexToPath` returns the path of the given index.
   */
  public indexToPath(index: number): Array<number> {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    return this.tree.indexToPath(index);
  }

  /**
   * eslint-disable-next-line jsdoc/require-jsdoc
   * @internal
   */
  public *[Symbol.iterator](): IterableIterator<TreeNode> {
    if (!this.tree) {
      return;
    }

    // TODO(hackerwins): Fill children of element node later.
    for (const node of this.tree) {
      if (node.isText) {
        const textNode = node as TextNode;
        yield {
          type: textNode.type,
          value: textNode.value,
        };
      } else {
        const elementNode = node as ElementNode;
        yield {
          type: elementNode.type,
          children: [],
        };
      }
    }
  }

  /**
   * `createRange` returns pair of CRDTTreePos of the given integer offsets.
   */
  createRange(fromIdx: number, toIdx: number): TreeRange {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.tree.createRange(fromIdx, toIdx);
  }

  /**
   * `rangeToIndex` returns the integer offsets of the given range.
   */
  rangeToIndex(range: TreeRange): Array<number> {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.tree.rangeToIndex(range);
  }

  /**
   * `rangeToPath` returns the path of the given range.
   */
  rangeToPath(range: TreeRange): Array<Array<number>> {
    return this.rangeToPath(range);
  }
}
