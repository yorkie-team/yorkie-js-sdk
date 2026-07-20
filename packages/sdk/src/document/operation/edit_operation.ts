/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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
  RGATreeSplitPos,
  RestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { CRDTText, CRDTTextValue } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  Operation,
  OpInfo,
  ExecutionResult,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { Indexable } from '../document';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { addDataSizes, DataSize } from '@yorkie-js/sdk/src/util/resource';

/**
 * `RestoreMode` selects the identity-preserving path for undo/redo of
 * pure deletions: 'restore' revives spans, 'retombstone' re-deletes them.
 */
export type RestoreMode = 'restore' | 'retombstone';

/**
 * `EditOperation` is an operation representing editing Text. Most of the same as
 * Edit, but with additional style properties, attributes.
 */
export class EditOperation extends Operation {
  private fromPos: RGATreeSplitPos;
  private toPos: RGATreeSplitPos;
  private content: string;
  private attributes: Map<string, string>;
  private isUndoOp: boolean | undefined;

  private restoreSpans?: Array<RestoreSpan<CRDTTextValue>>;
  private restoreMode?: RestoreMode;
  // `retombstoneSpans` is the companion span set for an identity-preserving
  // reverse op. `restoreSpans` describes content the reversed edit removed;
  // `retombstoneSpans` describes content the reversed edit inserted (non-empty
  // only for the reverse of a replace). `restoreMode` picks the direction:
  // 'restore' revives restoreSpans and re-removes retombstoneSpans; a
  // 'retombstone' op (the redo) does the opposite. Reversing an edit that both
  // inserts and deletes as two identity operations — rather than
  // copy-reinserting the deleted text as a fresh node — keeps a later revived
  // neighbour in its original relative order.
  private retombstoneSpans?: Array<RestoreSpan<CRDTTextValue>>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    content: string,
    attributes: Map<string, string>,
    executedAt?: TimeTicket,
    isUndoOp?: boolean,
    restoreSpans?: Array<RestoreSpan<CRDTTextValue>>,
    restoreMode?: RestoreMode,
    retombstoneSpans?: Array<RestoreSpan<CRDTTextValue>>,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.content = content;
    this.attributes = attributes;
    this.isUndoOp = isUndoOp;
    this.restoreSpans = restoreSpans;
    this.restoreMode = restoreMode;
    this.retombstoneSpans = retombstoneSpans;
  }

  /**
   * `create` creates a new instance of EditOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    content: string,
    attributes: Map<string, string>,
    executedAt?: TimeTicket,
    isUndoOp?: boolean,
    restoreSpans?: Array<RestoreSpan<CRDTTextValue>>,
    restoreMode?: RestoreMode,
    retombstoneSpans?: Array<RestoreSpan<CRDTTextValue>>,
  ): EditOperation {
    return new EditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      content,
      attributes,
      executedAt,
      isUndoOp,
      restoreSpans,
      restoreMode,
      retombstoneSpans,
    );
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute<A extends Indexable>(
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
    if (!(parentObject instanceof CRDTText)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to execute, only Text can execute edit`,
      );
    }

    const text = parentObject as CRDTText<A>;

    if (this.restoreSpans || this.retombstoneSpans) {
      // Identity-preserving reverse op. `restoreMode` picks the direction:
      // an undo ('restore') revives `restoreSpans` and re-removes
      // `retombstoneSpans`; the redo ('retombstone') does the opposite. Both
      // sets are revived/removed by their original identity, never re-inserted
      // as fresh nodes, so relative order is preserved across chained undo.
      const isRetombstone = this.restoreMode === 'retombstone';
      const toRestore =
        (isRetombstone ? this.retombstoneSpans : this.restoreSpans) ?? [];
      const toRetombstone =
        (isRetombstone ? this.restoreSpans : this.retombstoneSpans) ?? [];

      const opInfos: Array<OpInfo> = [];
      const totalDiff: DataSize = { data: 0, meta: 0 };
      const toOpInfo = (c: { from: number; to: number; value?: unknown }) =>
        ({
          type: 'edit',
          from: c.from,
          to: c.to,
          value: c.value,
          path: root.createPath(this.getParentCreatedAt()),
        }) as OpInfo;

      // 1. Remove the content the reversed edit inserted (by identity).
      if (toRetombstone.length) {
        const [pairs, changes, diff] = text.retombstone(
          toRetombstone,
          this.getExecutedAt(),
        );
        addDataSizes(totalDiff, diff);
        for (const pair of pairs) {
          root.registerGCPair(pair);
        }
        for (const c of changes) {
          opInfos.push(toOpInfo(c));
        }
      }

      // 2. Revive the content the reversed edit removed (by identity).
      if (toRestore.length) {
        const [untombstoned, , changes, liveDiff, pendingGCPairs] =
          text.restore(toRestore, this.getExecutedAt(), this.fromPos);
        // Register first: a `pendingGCPairs` entry whose child ended up in
        // `untombstoned` was never registered under its own id (it was born
        // by splitting a larger tombstone), so the unregister loop below can
        // only walk its size from gc back to live if it's registered here
        // first.
        for (const pair of pendingGCPairs) {
          root.registerGCPair(pair);
        }
        for (const node of untombstoned) {
          root.unregisterGCPair({
            parent: text.getRGATreeSplit(),
            child: node,
          });
        }
        addDataSizes(totalDiff, liveDiff);
        for (const c of changes) {
          opInfos.push(toOpInfo(c));
        }
      }

      root.acc(totalDiff);
      return {
        opInfos,
        // Reverse keeps the same span sets and flips the direction.
        reverseOp: EditOperation.create(
          this.getParentCreatedAt(),
          this.fromPos,
          this.toPos,
          '',
          new Map(),
          undefined,
          true,
          this.restoreSpans,
          isRetombstone ? 'restore' : 'retombstone',
          this.retombstoneSpans,
        ),
      };
    }

    if (this.isUndoOp) {
      this.fromPos = text.refinePos(this.fromPos);
      this.toPos = text.refinePos(this.toPos);
    }

    const [changes, pairs, diff, , removedValues, removedSpans] = text.edit(
      [this.fromPos, this.toPos],
      this.content,
      this.getExecutedAt(),
      Object.fromEntries(this.attributes),
      versionVector,
    );

    const reverseOp = this.toReverseOperation(
      removedValues,
      text.normalizePos(this.fromPos),
      removedSpans,
    );
    root.acc(diff);

    for (const pair of pairs) {
      root.registerGCPair(pair);
    }

    return {
      opInfos: changes.map(({ from, to, value }) => {
        return {
          type: 'edit',
          from,
          to,
          value,
          path: root.createPath(this.getParentCreatedAt()),
        } as OpInfo;
      }),
      reverseOp,
    };
  }

  private toReverseOperation(
    removedValues: Array<CRDTTextValue>,
    fromPos: RGATreeSplitPos,
    removedSpans: Array<RestoreSpan<CRDTTextValue>>,
  ): Operation {
    if (removedSpans.length) {
      // The edit removed content (pure deletion or replace). Reverse it by
      // identity: revive the removed spans, and — for a replace — re-remove
      // the content this edit inserted (`retombstoneSpans`) by identity too,
      // rather than copy-reinserting the removed text as a fresh node. A
      // fresh node would sort ahead of an as-yet-unrevived neighbour and
      // corrupt order across chained undo/redo (e.g. delete-then-replace).
      let insertedSpans: Array<RestoreSpan<CRDTTextValue>> | undefined;
      if (this.content?.length) {
        const value = CRDTTextValue.create(this.content);
        insertedSpans = [
          {
            createdAt: this.getExecutedAt(),
            start: 0,
            end: value.length,
            value,
          },
        ];
      }
      return EditOperation.create(
        this.getParentCreatedAt(),
        fromPos,
        fromPos,
        '',
        new Map(),
        undefined,
        true,
        removedSpans,
        'restore',
        insertedSpans,
      );
    }

    const content = removedValues?.length
      ? removedValues.map((v) => v.getContent()).join('')
      : '';

    let attrs: Array<[string, string]> | undefined;
    if (removedValues.length === 1) {
      const attrsObj = removedValues[0].getAttributes();
      if (attrsObj) {
        attrs = Array.from(Object.entries(attrsObj as any));
      }
    }

    return EditOperation.create(
      this.getParentCreatedAt(),
      fromPos,
      RGATreeSplitPos.of(
        fromPos.getID(),
        fromPos.getRelativeOffset() + (this.content?.length ?? 0),
      ),
      content,
      attrs ? new Map(attrs) : new Map(),
      undefined,
      true,
    );
  }

  /**
   * `normalizePos` normalizes the position of the edit operation.
   */
  public normalizePos<A extends Indexable>(root: CRDTRoot): [number, number] {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());

    if (!parentObject) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to find ${this.getParentCreatedAt()}`,
      );
    }

    if (!(parentObject instanceof CRDTText)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `only Text can normalize edit`,
      );
    }

    const text = parentObject as CRDTText<A>;
    const rangeFrom = text.normalizePos(this.fromPos).getRelativeOffset();
    const rangeTo = text.normalizePos(this.toPos).getRelativeOffset();

    return [rangeFrom, rangeTo];
  }

  /**
   * `reconcileOperation` reconciles the position when remote edits occur.
   *
   * @param remoteFrom - Start position of the remote edit
   * @param remoteTo - End position of the remote edit
   * @param contentLen - Length of content inserted by the remote edit
   *
   * @example
   * // Text: "0123456789"
   * // Undo range: [4, 6) (trying to restore "45")
   * // Remote edit: delete [2, 4) and insert "XY"
   * // Result: Undo range adjusted to [2, 4) to restore at correct position
   */
  public reconcileOperation(
    remoteFrom: number,
    remoteTo: number,
    contentLen: number,
  ): void {
    if (!this.isUndoOp) {
      return;
    }
    // NOTE: restoreSpans ops address content by identity (createdAt +
    // offset), so `fromPos`/`toPos` are never used to locate the restored
    // range itself. But `fromPos` is also passed as the fallback anchor for
    // when every related piece has been GC'd (see findRestoreAnchor), so it
    // still needs to track concurrent remote edits like any other undo
    // position — only the identity payload (`restoreSpans`) must stay
    // untouched, which the reconciliation below never reads.
    if (remoteFrom > remoteTo) {
      return;
    }

    const remoteRangeLen = remoteTo - remoteFrom;
    const localFrom = this.fromPos.getRelativeOffset();
    const localTo = this.toPos.getRelativeOffset();

    // Helper function to apply new position offsets
    const apply = (na: number, nb: number) => {
      this.fromPos = RGATreeSplitPos.of(this.fromPos.getID(), Math.max(0, na));
      this.toPos = RGATreeSplitPos.of(this.toPos.getID(), Math.max(0, nb));
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
    const fromPos = this.fromPos.toTestString();
    const toPos = this.toPos.toTestString();
    const content = this.content;
    return `${parent}.EDIT(${fromPos},${toPos},${content})`;
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): RGATreeSplitPos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): RGATreeSplitPos {
    return this.toPos;
  }

  /**
   * `getContent` returns the content of Edit.
   */
  public getContent(): string {
    return this.content;
  }

  /**
   * `getAttributes` returns the attributes of this Edit.
   */
  public getAttributes(): Map<string, string> {
    return this.attributes || new Map();
  }

  /**
   * `getRestoreSpans` returns the identity-preserving restore payload, if
   * this is a restore/retombstone operation.
   */
  public getRestoreSpans(): Array<RestoreSpan<CRDTTextValue>> | undefined {
    return this.restoreSpans;
  }

  /**
   * `getRestoreMode` returns the identity-preserving mode of this Edit.
   */
  public getRestoreMode(): RestoreMode | undefined {
    return this.restoreMode;
  }

  /**
   * `getRetombstoneSpans` returns the companion span set (content the reversed
   * edit inserted) for an identity-preserving reverse op, if any.
   */
  public getRetombstoneSpans(): Array<RestoreSpan<CRDTTextValue>> | undefined {
    return this.retombstoneSpans;
  }
}
