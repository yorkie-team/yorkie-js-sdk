/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import {
  CRDTTree,
  CRDTTreeNodeID,
  CRDTTreeNode,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';

import {
  IndexTree,
  DefaultRootType,
  DefaultTextType,
  TreePos,
} from '@yorkie-js/sdk/src/util/index_tree';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import {
  isEmpty,
  parseObjectValues,
  stringifyObjectValues,
} from '@yorkie-js/sdk/src/util/object';
import { RHT } from '../crdt/rht';
import { TreeStyleOperation } from '../operation/tree_style_operation';
import type {
  ElementNode,
  TextNode,
  TreeNode,
  TreeChange,
  TreeChangeType,
  TreePosStructRange,
  CRDTTreeNodeIDStruct,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import type * as Devtools from '@yorkie-js/sdk/src/devtools/types';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * NOTE(hackerwins): In normal case, we should define the following types in
 * json package, because they are directly used by the user. However, we define
 * them in crdt package to avoid circular dependency between json and crdt.
 */
export {
  TreeNode,
  ElementNode,
  TextNode,
  TreeChange,
  TreeChangeType,
  TreePosStructRange,
  CRDTTreeNodeIDStruct,
};

/**
 * `toTreeNode` returns tree node from CRDTTreeNode.
 */
function toTreeNode(node: CRDTTreeNode): TreeNode {
  if (node.isText) {
    return {
      type: node.type,
      value: node.value,
    } as TextNode;
  }
  const newNode = {
    type: node.type,
    children: node.children.map((child) => toTreeNode(child)),
  } as ElementNode;

  if (node.attrs) {
    newNode.attributes = parseObjectValues(node.attrs.toObject());
  }

  return newNode;
}

/**
 * `createSplitNode` returns new node which is split from the given node.
 */
function createSplitNode(
  node: CRDTTreeNode,
  offset: number,
): ElementNode | undefined {
  const newNode: ElementNode = {
    type: node.isText ? node.parent!.type : node.type,
    children: node.isText
      ? node.parent!.getChildrenText().length === offset
        ? []
        : [
            {
              type: DefaultTextType,
              value: node.parent!.getChildrenText().slice(offset),
            },
          ]
      : node.children.slice(offset).map((child) => toTreeNode(child)),
  };

  if (node.attrs) {
    newNode.attributes = parseObjectValues(node.attrs.toObject());
  } else if (node.isText && node.parent!.attrs) {
    newNode.attributes = parseObjectValues(node.parent!.attrs.toObject());
  }

  return newNode;
}

/**
 * `separateSplit` separates the split operation into insert and delete operations.
 */
function separateSplit(
  treePos: TreePos<CRDTTreeNode>,
  path: Array<number>,
): Array<{
  fromPath: Array<number>;
  toPath: Array<number>;
  content?: TreeNode;
}> {
  const { node } = treePos;
  const parentPath = [...path].slice(0, -1);
  const last = node.isText
    ? node.parent!.getChildrenText().length
    : node.children.length;
  const toPath = [...parentPath, last];
  const insertPath = [...parentPath];
  const res = [];

  insertPath[insertPath.length - 1] += 1;

  if (!path.every((v, i) => v === toPath[i])) {
    res.push({ fromPath: [...path], toPath });
  }

  const newNode = createSplitNode(node, path[path.length - 1]);

  if (newNode) {
    res.push({ fromPath: insertPath, toPath: insertPath, content: newNode });
  }

  return res;
}

/**
 * `separateMerge` separates the merge operation into insert and delete operations.
 */
function separateMerge(
  treePos: TreePos<CRDTTreeNode>,
  path: Array<number>,
): Array<{
  fromPath: Array<number>;
  toPath: Array<number>;
  content?: Array<TreeNode>;
}> {
  const { node: parentNode, offset } = treePos;
  const node = parentNode.children[offset];
  const leftSiblingNode = parentNode.children[offset - 1];
  const { children } = node;
  const parentPath = [...path].slice(0, -1);
  const res: ReturnType<typeof separateMerge> = [
    { fromPath: [...path], toPath: [...parentPath, offset + 1] },
  ];

  if (!node.children.length) {
    return res;
  }

  const insertPath = [
    ...parentPath,
    offset - 1,
    leftSiblingNode.hasTextChild()
      ? leftSiblingNode.getChildrenText().length
      : leftSiblingNode.children.length,
  ];
  const nodes = children.map((child) => toTreeNode(child));

  res.push({
    fromPath: insertPath,
    toPath: insertPath,
    content: nodes,
  });

  return res;
}

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
      CRDTTreeNodeID.of(ticket, 0),
      type,
      value,
    );

    parent.append(textNode);
  } else {
    const { children = [] } = treeNode as ElementNode;
    const { attributes } = treeNode as ElementNode;
    let attrs;

    if (typeof attributes === 'object' && !isEmpty(attributes)) {
      const stringifiedAttributes = stringifyObjectValues(attributes);
      attrs = new RHT();

      for (const [key, value] of Object.entries(stringifiedAttributes)) {
        attrs.set(key, value, ticket);
      }
    }
    const elementNode = CRDTTreeNode.create(
      CRDTTreeNodeID.of(ticket, 0),
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
    root = CRDTTreeNode.create(CRDTTreeNodeID.of(ticket, 0), type, value);
  } else if (content) {
    const { children = [] } = content as ElementNode;
    const { attributes } = content as ElementNode;
    let attrs;

    if (typeof attributes === 'object' && !isEmpty(attributes)) {
      const stringifiedAttributes = stringifyObjectValues(attributes);
      attrs = new RHT();

      for (const [key, value] of Object.entries(stringifiedAttributes)) {
        attrs.set(key, value, ticket);
      }
    }

    root = CRDTTreeNode.create(
      CRDTTreeNodeID.of(context.issueTimeTicket(), 0),
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
    throw new YorkieError(
      Code.ErrInvalidArgument,
      'text node cannot have empty value',
    );
  }

  return true;
}

/**
 * `validateTreeNodes` ensures that treeNodes consists of only one type.
 */
function validateTreeNodes(treeNodes: Array<TreeNode>): boolean {
  if (!treeNodes.length) {
    return true;
  }

  const firstTreeNodeType = treeNodes[0].type;
  if (firstTreeNodeType === DefaultTextType) {
    for (const treeNode of treeNodes) {
      const { type } = treeNode;
      if (type !== DefaultTextType) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          'element node and text node cannot be passed together',
        );
      }
      validateTextNode(treeNode as TextNode);
    }
  } else {
    for (const treeNode of treeNodes) {
      const { type } = treeNode;
      if (type === DefaultTextType) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          'element node and text node cannot be passed together',
        );
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
        CRDTTreeNodeID.of(context.issueTimeTicket(), 0),
        DefaultRootType,
      );
    }

    // TODO(hackerwins): Need to use the ticket of operation of creating tree.
    const root = CRDTTreeNode.create(
      CRDTTreeNodeID.of(context.issueTimeTicket(), 0),
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
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.getSize();
  }

  /**
   * `getNodeSize` returns the node size of this tree.
   */
  public getNodeSize(): number {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.getNodeSize();
  }

  /**
   * `getIndexTree` returns the index tree of this tree.
   */
  public getIndexTree(): IndexTree<CRDTTreeNode> {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.getIndexTree();
  }

  /**
   * `splitByPath` splits the tree by the given path.
   */
  public splitByPath(path: Array<number>) {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    if (!path.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'path should not be empty',
      );
    }

    const treePos = this.tree.pathToTreePos(path);
    const commands = separateSplit(treePos, path);

    for (const command of commands) {
      const { fromPath, toPath, content } = command;
      const fromPos = this.tree!.pathToPos(fromPath);
      const toPos = this.tree!.pathToPos(toPath);

      this.editInternal(fromPos, toPos, content ? [content] : [], 0);
    }
  }

  /**
   * `mergeByPath` merges the tree by the given path.
   */
  public mergeByPath(path: Array<number>) {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    if (!path.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'path should not be empty',
      );
    }

    const treePos = this.tree.pathToTreePos(path);

    if (treePos.node.isText) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'text node cannot be merged',
      );
    }

    const commands = separateMerge(treePos, path);

    for (const command of commands) {
      const { fromPath, toPath, content } = command;
      const fromPos = this.tree!.pathToPos(fromPath);
      const toPos = this.tree!.pathToPos(toPath);

      this.editInternal(fromPos, toPos, content ?? [], 0);
    }
  }

  /**
   * `styleByPath` sets the attributes to the elements of the given path.
   */
  public styleByPath(path: Array<number>, attributes: { [key: string]: any }) {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    if (!path.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'path should not be empty',
      );
    }
    const [fromPos, toPos] = this.tree.pathToPosRange(path);
    const ticket = this.context.issueTimeTicket();
    const attrs = attributes ? stringifyObjectValues(attributes) : undefined;

    const [pairs, , diff] = this.tree!.style([fromPos, toPos], attrs, ticket);

    this.context!.acc(diff);

    for (const pair of pairs) {
      this.context!.registerGCPair(pair);
    }

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
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    if (fromIdx > toIdx) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'from should be less than or equal to to',
      );
    }

    const fromPos = this.tree.findPos(fromIdx);
    const toPos = this.tree.findPos(toIdx);
    const ticket = this.context.issueTimeTicket();
    const attrs = attributes ? stringifyObjectValues(attributes) : undefined;

    const [pairs, , diff] = this.tree!.style([fromPos, toPos], attrs, ticket);

    this.context!.acc(diff);

    for (const pair of pairs) {
      this.context!.registerGCPair(pair);
    }

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
   * `removeStyle` removes the attributes to the elements of the given range.
   */
  public removeStyle(
    fromIdx: number,
    toIdx: number,
    attributesToRemove: Array<string>,
  ) {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    if (fromIdx > toIdx) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'from should be less than or equal to to',
      );
    }

    const fromPos = this.tree.findPos(fromIdx);
    const toPos = this.tree.findPos(toIdx);
    const ticket = this.context.issueTimeTicket();

    const [pairs, , diff] = this.tree!.removeStyle(
      [fromPos, toPos],
      attributesToRemove,
      ticket,
    );

    this.context!.acc(diff);

    for (const pair of pairs) {
      this.context!.registerGCPair(pair);
    }

    this.context.push(
      TreeStyleOperation.createTreeRemoveStyleOperation(
        this.tree.getCreatedAt(),
        fromPos,
        toPos,
        attributesToRemove,
        ticket,
      ),
    );
  }

  private editInternal(
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<TreeNode>,
    splitLevel = 0,
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
          CRDTTreeNodeID.of(this.context!.issueTimeTicket(), 0),
          DefaultTextType,
          compVal,
        ),
      );
    } else {
      crdtNodes = contents
        .map((content) => content && createCRDTTreeNode(this.context!, content))
        .filter((a) => a) as Array<CRDTTreeNode>;
    }

    const [, pairs, diff] = this.tree!.edit(
      [fromPos, toPos],
      crdtNodes.length
        ? crdtNodes.map((crdtNode) => crdtNode?.deepcopy())
        : undefined,
      splitLevel,
      ticket,
      () => this.context!.issueTimeTicket(),
    );

    this.context!.acc(diff);

    for (const pair of pairs) {
      this.context!.registerGCPair(pair);
    }

    this.context!.push(
      TreeEditOperation.create(
        this.tree!.getCreatedAt(),
        fromPos,
        toPos,
        crdtNodes.length ? crdtNodes : undefined,
        splitLevel,
        ticket,
      ),
    );

    return true;
  }

  /**
   * `editByPath` edits this tree with the given node and path.
   */
  public editByPath(
    fromPath: Array<number>,
    toPath: Array<number>,
    content?: TreeNode,
    splitLevel = 0,
  ): boolean {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }
    if (fromPath.length !== toPath.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'path length should be equal',
      );
    }
    if (!fromPath.length || !toPath.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'path should not be empty',
      );
    }

    const fromPos = this.tree.pathToPos(fromPath);
    const toPos = this.tree.pathToPos(toPath);

    return this.editInternal(
      fromPos,
      toPos,
      content ? [content] : [],
      splitLevel,
    );
  }

  /**
   * `editBulkByPath` edits this tree with the given node and path.
   */
  public editBulkByPath(
    fromPath: Array<number>,
    toPath: Array<number>,
    contents: Array<TreeNode>,
    splitLevel = 0,
  ): boolean {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }
    if (fromPath.length !== toPath.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'path length should be equal',
      );
    }
    if (!fromPath.length || !toPath.length) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'path should not be empty',
      );
    }

    const fromPos = this.tree.pathToPos(fromPath);
    const toPos = this.tree.pathToPos(toPath);

    return this.editInternal(fromPos, toPos, contents, splitLevel);
  }

  /**
   * `edit` edits this tree with the given nodes.
   */
  public edit(
    fromIdx: number,
    toIdx: number,
    content?: TreeNode,
    splitLevel = 0,
  ): boolean {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }
    if (fromIdx > toIdx) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'from should be less than or equal to to',
      );
    }

    const fromPos = this.tree.findPos(fromIdx);
    const toPos = this.tree.findPos(toIdx);

    return this.editInternal(
      fromPos,
      toPos,
      content ? [content] : [],
      splitLevel,
    );
  }

  /**
   * `editBulk` edits this tree with the given nodes.
   */
  public editBulk(
    fromIdx: number,
    toIdx: number,
    contents: Array<TreeNode>,
    splitLevel = 0,
  ): boolean {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }
    if (fromIdx > toIdx) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'from should be less than or equal to to',
      );
    }

    const fromPos = this.tree.findPos(fromIdx);
    const toPos = this.tree.findPos(toIdx);

    return this.editInternal(fromPos, toPos, contents, splitLevel);
  }

  /**
   * `toXML` returns the XML string of this tree.
   */
  public toXML(): string {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.toXML();
  }

  /**
   * `toJSON` returns the JSON string of this tree.
   */
  public toJSON(): string {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.toJSON();
  }

  /**
   * `toJSForTest` returns value with meta data for testing.
   * @internal
   */
  public toJSForTest(): Devtools.JSONElement {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.toJSForTest();
  }

  /**
   * `toJSInfoForTest` returns detailed TreeNode information for use in Devtools.
   *
   * @internal
   */
  public toJSInfoForTest(): Devtools.TreeNodeInfo {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.toJSInfoForTest();
  }

  /**
   * `getRootTreeNode` returns TreeNode of this tree.
   */
  public getRootTreeNode() {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.getRootTreeNode();
  }

  /**
   * `indexToPath` returns the path of the given index.
   */
  public indexToPath(index: number): Array<number> {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.indexToPath(index);
  }

  /**
   * `pathToIndex` returns the index of given path.
   */
  public pathToIndex(path: Array<number>): number {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.pathToIndex(path);
  }

  /**
   * `pathRangeToPosRange` converts the path range into the position range.
   */
  pathRangeToPosRange(
    range: [Array<number>, Array<number>],
  ): TreePosStructRange {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    const indexRange: [number, number] = [
      this.tree.pathToIndex(range[0]),
      this.tree.pathToIndex(range[1]),
    ];
    const posRange = this.tree.indexRangeToPosRange(indexRange);
    return [posRange[0].toStruct(), posRange[1].toStruct()];
  }

  /**
   * `indexRangeToPosRange` converts the index range into the position range.
   */
  indexRangeToPosRange(range: [number, number]): TreePosStructRange {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    return this.tree.indexRangeToPosStructRange(range);
  }

  /**
   * `posRangeToIndexRange` converts the position range into the index range.
   */
  posRangeToIndexRange(range: TreePosStructRange): [number, number] {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    const posRange: [CRDTTreePos, CRDTTreePos] = [
      CRDTTreePos.fromStruct(range[0]),
      CRDTTreePos.fromStruct(range[1]),
    ];

    return this.tree.posRangeToIndexRange(posRange);
  }

  /**
   * `posRangeToPathRange` converts the position range into the path range.
   */
  posRangeToPathRange(
    range: TreePosStructRange,
  ): [Array<number>, Array<number>] {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Tree is not initialized yet',
      );
    }

    const posRange: [CRDTTreePos, CRDTTreePos] = [
      CRDTTreePos.fromStruct(range[0]),
      CRDTTreePos.fromStruct(range[1]),
    ];

    return this.tree.posRangeToPathRange(posRange);
  }
}
