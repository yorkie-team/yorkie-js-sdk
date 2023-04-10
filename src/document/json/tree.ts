import { logger } from '@yorkie-js-sdk/src/util/logger';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  CRDTTree,
  CRDTNode,
  CRDTInlineNode,
  CRDTBlockNode,
} from '@yorkie-js-sdk/src/document/crdt/tree';

export type Node = InlineNode | BlockNode;

/**
 * `BlockNode` is a node that has children.
 */
export type BlockNode = {
  type: string;
  children: Array<Node>;
};

/**
 * `InlineNode` is a node that has no children.
 */
export type InlineNode = {
  type: 'text';
  value: string;
};

/**
 * `Tree` is a CRDT-based tree structure that is used to represent the document
 * tree of text-based editor such as ProseMirror.
 */
export class Tree {
  private context?: ChangeContext;
  private tree?: CRDTTree;

  constructor(context?: ChangeContext, tree?: CRDTTree) {
    this.context = context;
    this.tree = tree;
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
   * `edit` edits this tree with the given node.
   */
  public edit(fromIdx: number, toIdx: number, node: Node): boolean {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      return false;
    }

    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
      return false;
    }

    const ticket = this.context.issueTimeTicket();

    const currentNode = node as InlineNode;
    let crdtNode: CRDTNode;

    if (node.type === 'text') {
      crdtNode = new CRDTInlineNode(ticket, currentNode.value);
    } else {
      crdtNode = new CRDTBlockNode(ticket, node.type);
    }

    this.tree.edit([fromIdx, toIdx], crdtNode, ticket);

    // TODO: add edit operation
    return true;
  }
}
