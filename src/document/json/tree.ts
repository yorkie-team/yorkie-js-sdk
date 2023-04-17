import { logger } from '@yorkie-js-sdk/src/util/logger';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  DefaultRootType,
  CRDTTree,
  CRDTNode,
  CRDTInlineNode,
  CRDTBlockNode,
  TreeNodeType,
} from '@yorkie-js-sdk/src/document/crdt/tree';

export type TreeNode = InlineNode | BlockNode;

/**
 * `BlockNode` is a node that has children.
 */
export type BlockNode = {
  type: TreeNodeType;
  content: Array<TreeNode>;
};

/**
 * `InlineNode` is a node that has no children.
 */
export type InlineNode = {
  type: 'text';
  text: string;
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
  public getInitialRoot(ticket: TimeTicket): CRDTBlockNode {
    if (!this.initialRoot) {
      return new CRDTBlockNode(ticket, DefaultRootType);
    }

    const root = new CRDTBlockNode(ticket, this.initialRoot.type);

    /**
     * traverse traverses the given node and its children recursively.
     */
    function traverse(n: TreeNode, parent: CRDTBlockNode): void {
      if (n.type === 'text') {
        const inlineNode = n as InlineNode;
        parent.append(new CRDTInlineNode(ticket, inlineNode.text));
        return;
      }

      const blockNode = n as BlockNode;
      const node = new CRDTBlockNode(ticket, blockNode.type);
      parent.append(node);

      for (const child of blockNode.content) {
        traverse(child, node);
      }
    }

    for (const child of this.initialRoot.content) {
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

    let crdtNode: CRDTNode | undefined;
    if (node?.type === 'text') {
      const inlineNode = node as InlineNode;
      crdtNode = new CRDTInlineNode(ticket, inlineNode.text);
    } else if (node) {
      crdtNode = new CRDTBlockNode(ticket, node.type);
    }

    this.tree.edit([fromIdx, toIdx], crdtNode, ticket);

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
}
