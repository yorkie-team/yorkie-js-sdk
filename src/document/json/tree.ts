import { logger } from '@yorkie-js-sdk/src/util/logger';
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
} from '@yorkie-js-sdk/src/document/crdt/index_tree';

export type TreeNode = InlineNode | BlockNode;

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

    /**
     * traverse traverses the given node and its children recursively.
     */
    function traverse(n: TreeNode, parent: CRDTTreeNode): void {
      if (n.type === 'text') {
        const inlineNode = n as InlineNode;
        const treeNode = CRDTTreeNode.create(
          context.issueTimeTicket(),
          inlineNode.type,
          inlineNode.value,
        );
        parent.append(treeNode);
        return;
      }

      const blockNode = n as BlockNode;
      const node = CRDTTreeNode.create(
        context.issueTimeTicket(),
        blockNode.type,
      );
      parent.append(node);

      for (const child of blockNode.children) {
        traverse(child, node);
      }
    }

    for (const child of this.initialRoot.children) {
      traverse(child, root);
    }

    return root;
  }

  /**
   * `getSize` returns the size of this tree.
   */
  public getSize(): number {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      return 0;
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
   * `edit` edits this tree with the given node.
   */
  public edit(fromIdx: number, toIdx: number, node?: TreeNode): boolean {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      return false;
    }

    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
      return false;
    }

    const ticket = this.context.issueTimeTicket();

    let crdtNode: CRDTTreeNode | undefined;
    if (node?.type === 'text') {
      const inlineNode = node as InlineNode;
      crdtNode = CRDTTreeNode.create(ticket, inlineNode.type, inlineNode.value);
    } else if (node) {
      crdtNode = CRDTTreeNode.create(ticket, node.type);
    }

    // TODO(hackerwins): replace Tree.editByIndex with Tree.edit
    this.tree.editByIndex([fromIdx, toIdx], crdtNode, ticket);

    // TODO: add edit operation
    return true;
  }

  /**
   * `split` splits this tree at the given index.
   */
  public split(index: number, depth: number): boolean {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      return false;
    }

    this.tree.split(index, depth);
    return true;
  }

  /**
   * `toXML` returns the XML string of this tree.
   */
  public toXML(): string {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      return '';
    }

    return this.tree.toXML();
  }

  /**
   * `onChanges` registers a handler of onChanges event.
   */
  onChanges(handler: (changes: Array<TreeChange>) => void): void {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      return;
    }

    this.tree.onChanges(handler);
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
