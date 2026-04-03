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
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreePos,
  toXML,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import {
  Operation,
  OpInfo,
  ExecutionResult,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { traverseAll } from '@yorkie-js/sdk/src/util/index_tree';

/**
 * `clearRemovedAt` clears the removedAt tombstone markers from a node
 * and all its descendants, so they can be re-inserted as live nodes.
 *
 * If `preTombstoned` is provided, nodes whose IDs are in this set
 * are physically removed from the clone tree — they were already
 * tombstoned before the current edit and should not be resurrected.
 */
function clearRemovedAt(node: CRDTTreeNode, preTombstoned?: Set<string>): void {
  // First pass: remove pre-tombstoned children from the clone tree
  if (preTombstoned && preTombstoned.size > 0) {
    filterPreTombstoned(node, preTombstoned);
  }

  // Second pass: clear removedAt and recompute sizes on remaining nodes
  traverseAll(node, (n) => {
    n.removedAt = undefined;
  });
  recomputeSizes(node);
}

/**
 * `filterPreTombstoned` recursively removes children that were
 * independently tombstoned before the current edit.
 */
function filterPreTombstoned(
  node: CRDTTreeNode,
  preTombstoned: Set<string>,
): void {
  if (node.isText) return;

  // Recurse into children first (bottom-up)
  for (const child of node._children) {
    filterPreTombstoned(child, preTombstoned);
  }

  // Filter out pre-tombstoned children
  node._children = node._children.filter(
    (child) => !preTombstoned.has(child.id.toIDString()),
  );
}

/**
 * `recomputeSizes` recomputes visibleSize and totalSize for the node
 * and all its descendants based on the current children.
 */
function recomputeSizes(node: CRDTTreeNode): void {
  if (node.isText) {
    const len = node.value.length;
    node.visibleSize = len;
    node.totalSize = len;
    return;
  }

  for (const child of node._children) {
    recomputeSizes(child);
  }

  const childSize = node._children.reduce((sum, c) => sum + c.paddedSize(), 0);
  node.visibleSize = childSize;
  node.totalSize = childSize;
}

/**
 * `TreeEditOperation` is an operation representing Tree editing.
 */
export class TreeEditOperation extends Operation {
  private fromPos: CRDTTreePos;
  private toPos: CRDTTreePos;
  private contents: Array<CRDTTreeNode> | undefined;
  private splitLevel: number;
  private isUndoOp?: boolean;
  private fromIdx?: number;
  private toIdx?: number;
  private lastFromIdx?: number;
  private lastToIdx?: number;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    executedAt: TimeTicket,
    isUndoOp?: boolean,
    fromIdx?: number,
    toIdx?: number,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.contents = contents;
    this.splitLevel = splitLevel;
    this.isUndoOp = isUndoOp;
    this.fromIdx = fromIdx;
    this.toIdx = toIdx;
  }

  /**
   * `create` creates a new instance of EditOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    executedAt: TimeTicket,
    isUndoOp?: boolean,
    fromIdx?: number,
    toIdx?: number,
  ): TreeEditOperation {
    return new TreeEditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      contents,
      splitLevel,
      executedAt,
      isUndoOp,
      fromIdx,
      toIdx,
    );
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(
    root: CRDTRoot,
    _: OpSource,
    versionVector?: VersionVector,
  ): ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to find ${this.getParentCreatedAt()}`,
      );
    }
    if (!(parentObject instanceof CRDTTree)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to execute, only Tree can execute edit`,
      );
    }
    const editedAt = this.getExecutedAt();
    const tree = parentObject as CRDTTree;

    // For undo ops: convert stored integer indices to CRDTTreePos
    if (
      this.isUndoOp &&
      this.fromIdx !== undefined &&
      this.toIdx !== undefined
    ) {
      this.fromPos = tree.findPos(this.fromIdx);
      if (this.fromIdx === this.toIdx) {
        this.toPos = this.fromPos;
      } else {
        this.toPos = tree.findPos(this.toIdx);
      }
    }

    const [changes, pairs, diff, removedNodes, preEditFromIdx, preTombstoned] =
      tree.edit(
        [this.fromPos, this.toPos],
        this.contents?.map((content) => content.deepcopy()),
        this.splitLevel,
        editedAt,
        /**
         * TODO(sejongk): When splitting element nodes, a new nodeID is assigned with a different timeTicket.
         * In the same change context, the timeTickets share the same lamport and actorID but have different delimiters,
         * incremented by one for each.
         * Therefore, it is possible to simulate later timeTickets using `editedAt` and the length of `contents`.
         * This logic might be unclear; consider refactoring for multi-level concurrent editing in the Tree implementation.
         */
        (() => {
          let delimiter = editedAt.getDelimiter();
          if (this.contents !== undefined) {
            delimiter += this.contents.length;
          }
          const issueTimeTicket = () =>
            TimeTicket.of(
              editedAt.getLamport(),
              ++delimiter,
              editedAt.getActorID(),
            );
          return issueTimeTicket;
        })(),
        versionVector,
      );

    // Store pre-edit from index (computed inside edit() after text-node splits
    // but before deletions). Derive toIdx from removed nodes' visible sizes.
    this.lastFromIdx = preEditFromIdx;
    // For toIdx: fromIdx + total visible tokens of removed nodes
    const removedSize = removedNodes.reduce(
      (sum, node) => sum + node.paddedSize(),
      0,
    );
    this.lastToIdx = preEditFromIdx + removedSize;

    // Create reverse op (skip for splitLevel > 0 in Phase 1)
    const reverseOp =
      this.splitLevel === 0
        ? this.toReverseOperation(
            tree,
            removedNodes,
            preEditFromIdx,
            preTombstoned,
          )
        : undefined;

    root.acc(diff);

    for (const pair of pairs) {
      root.registerGCPair(pair);
    }

    return {
      opInfos: changes.map(
        ({ from, to, value, splitLevel, fromPath, toPath }) => {
          return {
            type: 'tree-edit',
            path: root.createPath(this.getParentCreatedAt()),
            from,
            to,
            value,
            splitLevel,
            fromPath,
            toPath,
          } as OpInfo;
        },
      ),
      reverseOp,
    };
  }

  /**
   * `toReverseOperation` creates the reverse operation for undo.
   *
   * The reverse op stores both CRDTTreePos (for initial use) and integer
   * indices (for reconciliation adjustment when remote edits arrive).
   * At undo execution time, the integer indices take precedence and are
   * converted to CRDTTreePos via tree.findPos().
   *
   * @param tree - The CRDTTree after the edit has been applied
   * @param removedNodes - Nodes that were removed by this edit
   * @param preEditFromIdx - The from index captured BEFORE the edit
   */
  private toReverseOperation(
    tree: CRDTTree,
    removedNodes: Array<CRDTTreeNode>,
    preEditFromIdx: number,
    preTombstoned: Set<string>,
  ): Operation | undefined {
    // Compute inserted content size (total tree index tokens)
    const insertedContentSize = this.contents
      ? this.contents.reduce((sum, node) => sum + node.paddedSize(), 0)
      : 0;

    // Guard: if the positions exceed the post-edit tree size,
    // the edit was a no-op (e.g., concurrent parent deletion where inserted
    // content was tombstoned). Skip reverse op.
    const maxNeededIdx = preEditFromIdx + insertedContentSize;
    if (maxNeededIdx > tree.getSize()) {
      return undefined;
    }

    // Filter to top-level removed nodes (whose parent is NOT also removed)
    const topLevelRemoved = removedNodes.filter(
      (node) => !node.parent || !removedNodes.includes(node.parent),
    );

    // Deep copy for re-insertion on undo. Pass preTombstoned so that
    // nodes independently removed by earlier operations (e.g., a char-level
    // undo tombstones text inside a block) are not resurrected.
    const reverseContents =
      topLevelRemoved.length > 0
        ? topLevelRemoved.map((n) => {
            const clone = n.deepcopy();
            clearRemovedAt(clone, preTombstoned);
            return clone;
          })
        : undefined;

    // Compute CRDTTreePos for the reverse range using findPos on the
    // post-edit tree with the pre-edit from index.
    const reverseFromPos = tree.findPos(preEditFromIdx);

    let reverseToPos: CRDTTreePos;
    if (insertedContentSize > 0) {
      reverseToPos = tree.findPos(preEditFromIdx + insertedContentSize);
    } else {
      reverseToPos = reverseFromPos;
    }

    // Integer indices for the reverse op (used by reconciliation)
    const reverseFromIdx = preEditFromIdx;
    const reverseToIdx = preEditFromIdx + insertedContentSize;

    return TreeEditOperation.create(
      this.getParentCreatedAt(),
      reverseFromPos,
      reverseToPos,
      reverseContents,
      0, // splitLevel always 0
      undefined!, // executedAt set during undo
      true, // isUndoOp
      reverseFromIdx,
      reverseToIdx,
    );
  }

  /**
   * `normalizePos` returns the visible-index range of this operation.
   * For undo ops, returns the stored (possibly reconciled) indices.
   * For forward ops, returns the pre-edit indices captured during execute().
   */
  public normalizePos(): [number, number] {
    if (
      this.isUndoOp &&
      this.fromIdx !== undefined &&
      this.toIdx !== undefined
    ) {
      return [this.fromIdx, this.toIdx];
    }

    if (this.lastFromIdx !== undefined && this.lastToIdx !== undefined) {
      return [this.lastFromIdx, this.lastToIdx];
    }

    // Fallback: no indices available
    return [0, 0];
  }

  /**
   * `reconcileOperation` adjusts this undo operation's integer indices
   * when a remote edit modifies the same tree. Uses the same 6-case
   * overlap logic as EditOperation.reconcileOperation for Text.
   */
  public reconcileOperation(
    remoteFrom: number,
    remoteTo: number,
    contentLen: number,
  ): void {
    if (!this.isUndoOp) {
      return;
    }
    if (this.fromIdx === undefined || this.toIdx === undefined) {
      return;
    }
    if (remoteFrom > remoteTo) {
      return;
    }

    const remoteRangeLen = remoteTo - remoteFrom;
    const localFrom = this.fromIdx;
    const localTo = this.toIdx;

    const apply = (na: number, nb: number) => {
      this.fromIdx = Math.max(0, na);
      this.toIdx = Math.max(0, nb);
    };

    // Case 1: Remote edit is to the left of undo range
    // [--remote--]  [--undo--]
    if (remoteTo <= localFrom) {
      apply(
        localFrom - remoteRangeLen + contentLen,
        localTo - remoteRangeLen + contentLen,
      );
      return;
    }

    // Case 2: Remote edit is to the right of undo range
    // [--undo--]  [--remote--]
    if (localTo <= remoteFrom) {
      return;
    }

    // Case 3: Undo range is contained within remote range
    // [-------remote-------]
    //      [--undo--]
    if (
      remoteFrom <= localFrom &&
      localTo <= remoteTo &&
      remoteFrom !== remoteTo
    ) {
      apply(remoteFrom, remoteFrom);
      return;
    }

    // Case 4: Remote range is contained within undo range
    //      [--remote--]
    // [---------undo---------]
    if (
      localFrom <= remoteFrom &&
      remoteTo <= localTo &&
      localFrom !== localTo
    ) {
      apply(localFrom, localTo - remoteRangeLen + contentLen);
      return;
    }

    // Case 5: Remote range overlaps the start of undo range
    // [---remote---]
    //      [---undo---]
    if (remoteFrom < localFrom && localFrom < remoteTo && remoteTo < localTo) {
      apply(remoteFrom, remoteFrom + (localTo - remoteTo));
      return;
    }

    // Case 6: Remote range overlaps the end of undo range
    //      [---remote---]
    // [---undo---]
    if (localFrom < remoteFrom && remoteFrom < localTo && localTo < remoteTo) {
      apply(localFrom, remoteFrom);
      return;
    }
  }

  /**
   * `getContentSize` returns the total visible size of this operation's
   * content (for reconciliation).
   */
  public getContentSize(): number {
    if (!this.contents) return 0;
    return this.contents.reduce((sum, node) => sum + node.paddedSize(), 0);
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    const parent = this.getParentCreatedAt().toTestString();
    const fromPos = `${this.fromPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}/${this.fromPos.getLeftSiblingID().getOffset()}`;
    const toPos = `${this.toPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}/${this.toPos.getLeftSiblingID().getOffset()}`;
    const contents = this.contents || [];
    return `${parent}.EDIT(${fromPos},${toPos},${contents
      .map((v) => toXML(v))
      .join('')})`;
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): CRDTTreePos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): CRDTTreePos {
    return this.toPos;
  }

  /**
   * `getContent` returns the content of Edit.
   */
  public getContents(): Array<CRDTTreeNode> | undefined {
    return this.contents;
  }

  /**
   * `getSplitLevel` returns the split level of Edit.
   */
  public getSplitLevel(): number {
    return this.splitLevel;
  }
}
