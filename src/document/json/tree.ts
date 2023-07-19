import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  CRDTTree,
  CRDTTreePos,
  CRDTTreeNode,
  TreeRange,
  TreeRangeStruct,
  TreeChange,
} from '@yorkie-js-sdk/src/document/crdt/tree';

import {
  IndexTree,
  DefaultRootType,
  DefaultTextType,
  TreeNodeType,
} from '@yorkie-js-sdk/src/util/index_tree';
import { TreeEditOperation } from '@yorkie-js-sdk/src/document/operation/tree_edit_operation';
import { isEmpty, stringifyObjectValues } from '@yorkie-js-sdk/src/util/object';
import { RHT } from '../crdt/rht';
import { TreeStyleOperation } from '../operation/tree_style_operation';
import { logger } from '@yorkie-js-sdk/src/util/logger';

export type TreeNode = TextNode | ElementNode;
export type TreeChangeWithPath = Omit<TreeChange, 'from' | 'to'> & {
  from: Array<number>;
  to: Array<number>;
};

/**
 * `ElementNode` is a node that has children.
 */
export type ElementNode<A extends Indexable = Indexable> = {
  type: TreeNodeType;
  attributes?: A;
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
  const ticket = context.issueTimeTicket();

  if (type === DefaultTextType) {
    validateTextNode(treeNode as TextNode);
    const { value } = treeNode as TextNode;
    const textNode = CRDTTreeNode.create(
      CRDTTreePos.of(ticket, 0),
      type,
      value,
    );

    parent.append(textNode);
  } else {
    const { children = [] } = treeNode as ElementNode;
    let { attributes } = treeNode as ElementNode;
    let attrs;

    if (typeof attributes === 'object' && !isEmpty(attributes)) {
      attributes = stringifyObjectValues(attributes);
      attrs = new RHT();

      for (const [key, value] of Object.entries(attributes)) {
        attrs.set(key, value, ticket);
      }
    }
    const elementNode = CRDTTreeNode.create(
      CRDTTreePos.of(ticket, 0),
      type,
      undefined,
      attrs,
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
  const ticket = context.issueTimeTicket();

  let root;
  if (content.type === DefaultTextType) {
    const { value } = content as TextNode;
    root = CRDTTreeNode.create(CRDTTreePos.of(ticket, 0), type, value);
  } else if (content) {
    const { children = [] } = content as ElementNode;
    let { attributes } = content as ElementNode;
    let attrs;

    if (typeof attributes === 'object' && !isEmpty(attributes)) {
      attributes = stringifyObjectValues(attributes);
      attrs = new RHT();

      for (const [key, value] of Object.entries(attributes)) {
        attrs.set(key, value, ticket);
      }
    }

    root = CRDTTreeNode.create(
      CRDTTreePos.of(context.issueTimeTicket(), 0),
      type,
      undefined,
      attrs,
    );

    for (const child of children) {
      buildDescendants(child, root, context);
    }
  }

  return root;
}

/**
 * `validateTextNode` ensures that a text node has a non-empty string value.
 */
function validateTextNode(textNode: TextNode): boolean {
  if (!textNode.value.length) {
    throw new Error('text node cannot have empty value');
  } else {
    return true;
  }
}

/**
 * `validateTreeNodes` ensures that treeNodes consists of only one type.
 */
function validateTreeNodes(treeNodes: Array<TreeNode>): boolean {
  if (treeNodes.length) {
    const firstTreeNodeType = treeNodes[0].type;
    if (firstTreeNodeType === DefaultTextType) {
      for (const treeNode of treeNodes) {
        const { type } = treeNode;
        if (type !== DefaultTextType) {
          throw new Error(
            'element node and text node cannot be passed together',
          );
        }
        validateTextNode(treeNode as TextNode);
      }
    } else {
      for (const treeNode of treeNodes) {
        const { type } = treeNode;
        if (type === DefaultTextType) {
          throw new Error(
            'element node and text node cannot be passed together',
          );
        }
      }
    }
  }
  return true;
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
   * `buildRoot` builds the root of this tree with the given initial root
   * which set by the user.
   */
  public buildRoot(context: ChangeContext): CRDTTreeNode {
    if (!this.initialRoot) {
      return CRDTTreeNode.create(
        CRDTTreePos.of(context.issueTimeTicket(), 0),
        DefaultRootType,
      );
    }

    // TODO(hackerwins): Need to use the ticket of operation of creating tree.
    const root = CRDTTreeNode.create(
      CRDTTreePos.of(context.issueTimeTicket(), 0),
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
   * `styleByPath` sets the attributes to the elements of the given path.
   */
  public styleByPath(path: Array<number>, attributes: { [key: string]: any }) {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    if (!path.length) {
      throw new Error('path should not be empty');
    }

    const [fromPos, toPos] = this.tree.pathToPosRange(path);
    const ticket = this.context.issueTimeTicket();
    const attrs = attributes ? stringifyObjectValues(attributes) : undefined;

    this.tree!.style([fromPos, toPos], attrs, ticket);

    this.context.push(
      TreeStyleOperation.create(
        this.tree.getCreatedAt(),
        fromPos,
        toPos,
        attrs ? new Map(Object.entries(attrs)) : new Map(),
        ticket,
      ),
    );
  }

  /**
   * `style` sets the attributes to the elements of the given range.
   */
  public style(
    fromIdx: number,
    toIdx: number,
    attributes: { [key: string]: any },
  ) {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    if (fromIdx > toIdx) {
      throw new Error('from should be less than or equal to to');
    }

    const fromPos = this.tree.findPos(fromIdx);
    const toPos = this.tree.findPos(toIdx);
    const ticket = this.context.issueTimeTicket();
    const attrs = attributes ? stringifyObjectValues(attributes) : undefined;

    this.tree!.style([fromPos, toPos], attrs, ticket);

    this.context.push(
      TreeStyleOperation.create(
        this.tree.getCreatedAt(),
        fromPos,
        toPos,
        attrs ? new Map(Object.entries(attrs)) : new Map(),
        ticket,
      ),
    );
  }

  private editInternal(
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<TreeNode>,
  ): boolean {
    if (contents.length !== 0 && contents[0]) {
      validateTreeNodes(contents);
      if (contents[0].type !== DefaultTextType) {
        for (const content of contents) {
          const { children = [] } = content as ElementNode;
          validateTreeNodes(children);
        }
      }
    }

    const ticket = this.context!.getLastTimeTicket();
    let crdtNodes = new Array<CRDTTreeNode>();

    if (contents[0]?.type === DefaultTextType) {
      let compVal = '';
      for (const content of contents) {
        const { value } = content as TextNode;
        compVal += value;
      }
      crdtNodes.push(
        CRDTTreeNode.create(
          CRDTTreePos.of(this.context!.issueTimeTicket(), 0),
          DefaultTextType,
          compVal,
        ),
      );
    } else {
      crdtNodes = contents
        .map((content) => content && createCRDTTreeNode(this.context!, content))
        .filter((a) => a) as Array<CRDTTreeNode>;
    }

    this.tree!.edit(
      [fromPos, toPos],
      crdtNodes.length
        ? crdtNodes.map((crdtNode) => crdtNode?.deepcopy())
        : undefined,
      ticket,
    );

    this.context!.push(
      TreeEditOperation.create(
        this.tree!.getCreatedAt(),
        fromPos,
        toPos,
        crdtNodes.length ? crdtNodes : undefined,
        ticket,
      ),
    );

    if (
      !fromPos.getCreatedAt().equals(toPos.getCreatedAt()) ||
      fromPos.getOffset() !== toPos.getOffset()
    ) {
      this.context!.registerElementHasRemovedNodes(this.tree!);
    }

    return true;
  }

  /**
   * `editByPath` edits this tree with the given node and path.
   */
  public editByPath(
    fromPath: Array<number>,
    toPath: Array<number>,
    ...contents: Array<TreeNode>
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

    const fromPos = this.tree.pathToPos(fromPath);
    const toPos = this.tree.pathToPos(toPath);

    return this.editInternal(fromPos, toPos, contents);
  }

  /**
   * `edit` edits this tree with the given nodes.
   */
  public edit(
    fromIdx: number,
    toIdx: number,
    ...contents: Array<TreeNode>
  ): boolean {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }
    if (fromIdx > toIdx) {
      throw new Error('from should be less than or equal to to');
    }

    const fromPos = this.tree.findPos(fromIdx);
    const toPos = this.tree.findPos(toIdx);

    return this.editInternal(fromPos, toPos, contents);
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
   * `pathToIndex` returns the index of given path.
   */
  public pathToIndex(path: Array<number>): number {
    if (!this.context || !this.tree) {
      throw new Error('it is not initialized yet');
    }

    return this.tree.pathToIndex(path);
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
   * `createRangeByPath` returns pair of CRDTTreePos of the given path.
   */
  createRangeByPath(fromPath: Array<number>, toPath: Array<number>): TreeRange {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }
    const fromIdx = this.tree.pathToIndex(fromPath);
    const toIdx = this.tree.pathToIndex(toPath);

    return this.tree.createRange(fromIdx, toIdx);
  }

  /**
   * `toPosRange` converts the integer index range into the Tree position range structure.
   */
  toPosRange(range: [number, number]): TreeRangeStruct {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.tree.toPosRange(range);
  }

  /**
   * `toIndexRange` converts the Tree position range into the integer index range.
   */
  toIndexRange(range: TreeRangeStruct): [number, number] {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.tree.toIndexRange(range);
  }

  /**
   * `rangeToPath` returns the path of the given range.
   */
  rangeToPath(range: TreeRange): [Array<number>, Array<number>] {
    if (!this.context || !this.tree) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.tree.rangeToPath(range);
  }
}
