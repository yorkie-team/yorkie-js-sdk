import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  CRDTTree,
  CRDTTreeNode,
  TreeChange,
} from '@yorkie-js-sdk/src/document/crdt/tree';

import {
  IndexTree,
  DefaultRootType,
  DefaultInlineType,
  TreeNodeType,
} from '@yorkie-js-sdk/src/util/index_tree';
import { TreeEditOperation } from '@yorkie-js-sdk/src/document/operation/tree_edit_operation';

export type TreeNode = InlineNode | BlockNode;
export type TreeChangeWithPath = Omit<TreeChange, 'from' | 'to'> & {
  from: Array<number>;
  to: Array<number>;
};

/**
 * `BlockNode` is a node that has children.
 */
export type BlockNode = {
  type: TreeNodeType;
  children: Array<TreeNode>;
};

/**
 * `InlineNode` is a node that has no children.
 */
export type InlineNode = {
  type: typeof DefaultInlineType;
  value: string;
};

/**
 * traverse traverses the given node and its children recursively.
 */
function traverse(
  treeNode: TreeNode,
  parent: CRDTTreeNode,
  context: ChangeContext,
) {
  const { type } = treeNode;

  if (type === 'text') {
    const { value } = treeNode as InlineNode;
    const inlineNode = CRDTTreeNode.create(
      context.issueTimeTicket(),
      type,
      value,
    );

    parent.append(inlineNode);
  } else {
    const { children } = treeNode as BlockNode;
    const blockNode = CRDTTreeNode.create(context.issueTimeTicket(), type);

    parent.append(blockNode);

    for (const child of children) {
      traverse(child, blockNode, context);
    }
  }
}

/**
 * createCRDTTreeNode returns CRDTTreeNode by given TreeNode.
 */
function createCRDTTreeNode(context: ChangeContext, content: TreeNode) {
  const { type } = content;

  let root;
  if (type === 'text') {
    const { value } = content as InlineNode;
    root = CRDTTreeNode.create(context.issueTimeTicket(), type, value);
  } else if (content) {
    const { children = [] } = content as BlockNode;
    root = CRDTTreeNode.create(context.issueTimeTicket(), type);

    for (const child of children) {
      traverse(child, root, context);
    }
  }

  return root;
}

/**
 * `Tree` is a CRDT-based tree structure that is used to represent the document
 * tree of text-based editor such as ProseMirror.
 */
export class Tree {
  private initialRoot?: BlockNode;
  private context?: ChangeContext;
  private tree?: CRDTTree;

  constructor(initialRoot?: BlockNode) {
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
      return CRDTTreeNode.create(context.issueTimeTicket(), DefaultRootType);
    }

    const root = CRDTTreeNode.create(
      context.issueTimeTicket(),
      this.initialRoot.type,
    );

    for (const child of this.initialRoot.children) {
      traverse(child, root, context);
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
   * `onChanges` registers a handler of onChanges event.
   */
  onChanges(handler: (changes: Array<TreeChange>) => void): void {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }
    let localChanges: Array<TreeChange> = [];

    this.tree.onChangeCollect((changes: Array<TreeChange>) => {
      localChanges.push(...changes);
    });
    this.tree.onChanges(() => {
      handler(localChanges as Array<TreeChange>);

      localChanges = [];
    });
  }

  /**
   * `onChangesByPath` registers a handler of onChanges event.
   */
  onChangesByPath(handler: (changes: Array<TreeChangeWithPath>) => void): void {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }
    let localChanges: Array<TreeChangeWithPath> = [];
    const collect = (changes: Array<TreeChange>) => {
      const changeWithPath = changes.map(({ from, to, ...rest }) => {
        return {
          from: this.tree!.indexToPath(from),
          to: this.tree!.indexToPath(to),
          ...rest,
        };
      });

      (localChanges as Array<TreeChangeWithPath>).push(...changeWithPath);
    };

    this.tree.onChangeCollect(collect);
    this.tree.onChanges(() => {
      handler(localChanges as Array<TreeChangeWithPath>);

      localChanges = [];
    });
  }

  /**
   * eslint-disable-next-line jsdoc/require-jsdoc
   * @internal
   */
  public *[Symbol.iterator](): IterableIterator<TreeNode> {
    if (!this.tree) {
      return;
    }

    // TODO(hackerwins): Fill children of BlockNode later.
    for (const node of this.tree) {
      if (node.isInline) {
        const inlineNode = node as InlineNode;
        yield {
          type: inlineNode.type,
          value: inlineNode.value,
        };
      } else {
        const blockNode = node as BlockNode;
        yield {
          type: blockNode.type,
          children: [],
        };
      }
    }
  }
}
