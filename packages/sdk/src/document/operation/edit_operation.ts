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
  InitialRGATreeSplitNodeID,
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
    source: OpSource,
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

    // The identity-preserving path is selected by the mode, not by the spans
    // being present: a reverse whose span sets both came out empty is still
    // an identity op and must run as a no-op here. Falling through to the
    // positional path below would read its positions as an ordinary edit
    // range.
    if (this.restoreMode) {
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

      // The spans about to be re-tombstoned are what the reverse op will have
      // to restore, and a replica that purged them rebuilds the nodes from
      // that payload alone. Re-snapshot them against the live content first:
      // the span set was captured when the reversed edit ran, so an attribute
      // applied to the run since is missing from it and a purged replica would
      // recreate the run without it while a replica that un-tombstones keeps
      // it. Taken before the removal below, and only when the reverse is kept:
      // a remote change discards it.
      const refreshed =
        source !== OpSource.Remote && toRetombstone.length
          ? text.getRGATreeSplit().refreshSpans(toRetombstone)
          : undefined;

      // 1. Remove the content the reversed edit inserted (by identity). The
      // reverse names only the pieces the removal was recorded on: naming it
      // on a piece someone else removed would cancel a removal that piece
      // never had, and a replica that purged the piece could not tell.
      let recorded: Array<RestoreSpan<CRDTTextValue>> | undefined;
      if (toRetombstone.length) {
        const [pairs, changes, diff, spans] = text.retombstone(
          refreshed ?? toRetombstone,
          this.getExecutedAt(),
          versionVector,
        );
        recorded = spans;
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
        if (text.hasCancelledRemovals()) {
          root.registerLedgerHolder(text);
        }
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
        reverseOp: this.identityReverse(
          // The re-removed set is the pieces the removal was recorded on,
          // taken from the spans refreshed against live attributes (a purged
          // replica rebuilds from them).
          isRetombstone && recorded ? recorded : this.restoreSpans,
          isRetombstone ? 'restore' : 'retombstone',
          !isRetombstone && recorded ? recorded : this.retombstoneSpans,
        ),
      };
    }

    if (this.isUndoOp) {
      // An undo edit that inserts nothing changes nothing wherever it sits,
      // but its position can name an offset the text no longer has: stacked
      // entries are reconciled against remote positional edits, not against
      // remote undos and redos, which change the text by identity. Run it as
      // the no-op it is, moved to the head so the copy that goes out to other
      // replicas resolves on every one of them.
      if (!this.content) {
        this.fromPos = headPos();
        this.toPos = headPos();
        return {
          opInfos: [],
          reverseOp:
            source === OpSource.Remote ? undefined : this.emptyReverse(),
        };
      }

      // A reverse's positions were recorded against the chain as it stood
      // when the reverse was built; splits since then have moved them.
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

  /**
   * `identityReverse` builds the reverse of an identity-preserving edit, or
   * -- when both of its span sets came out empty -- an ordinary no-op edit
   * anchored at the text's head.
   *
   * A reverse with no spans has nothing to revive and nothing to re-remove,
   * but it still has to exist: dropping it would leave the undo stack one
   * entry short of the redo stack, so a later redo would replay the wrong
   * entry. It cannot be kept in identity form either -- the converter writes
   * a restore mode only with spans, so it would go out as a positional edit
   * of its stale range -- so it degrades to the same shape an edit that
   * removed and inserted nothing reverses to.
   */
  private identityReverse(
    restoreSpans: Array<RestoreSpan<CRDTTextValue>> | undefined,
    restoreMode: RestoreMode,
    retombstoneSpans: Array<RestoreSpan<CRDTTextValue>> | undefined,
  ): EditOperation {
    if (!restoreSpans?.length && !retombstoneSpans?.length) {
      return this.emptyReverse();
    }
    return EditOperation.create(
      this.getParentCreatedAt(),
      this.fromPos,
      this.toPos,
      '',
      new Map(),
      undefined,
      true,
      restoreSpans,
      restoreMode,
      retombstoneSpans,
    );
  }

  /**
   * `emptyReverse` returns an empty undo edit at the head of this op's text:
   * the reverse of an edit that changes nothing.
   */
  private emptyReverse(): EditOperation {
    return EditOperation.create(
      this.getParentCreatedAt(),
      headPos(),
      headPos(),
      '',
      new Map(),
      undefined,
      true,
    );
  }

  private toReverseOperation(
    removedValues: Array<CRDTTextValue>,
    fromPos: RGATreeSplitPos,
    removedSpans: Array<RestoreSpan<CRDTTextValue>>,
  ): Operation {
    if (removedSpans.length || this.content?.length) {
      // Reverse any edit by identity: revive what it removed (restoreSpans)
      // and re-remove what it inserted (retombstoneSpans), both by original
      // identity, rather than copy-reinserting or position-deleting. A fresh
      // copy-reinserted node sorts ahead of an as-yet-unrevived neighbour and
      // corrupts order across chained undo/redo; a position-based delete of
      // the inserted range reconciles onto the wrong node under a concurrent
      // remote edit (e.g. two clients concurrently insert and delete, then
      // undo). Identity addressing avoids both.
      let insertedSpans: Array<RestoreSpan<CRDTTextValue>> | undefined;
      if (this.content?.length) {
        const value = CRDTTextValue.create(this.content);
        // Carry the attributes the edit applied, stamped with the same ticket
        // `CRDTText.edit` used. The undo only re-tombstones this span, so its
        // value is unread there -- but the redo flips `restoreMode` and the
        // span becomes the content to restore. A replica that purged the node
        // rebuilds it from this value alone, so an empty attribute map here
        // makes it diverge from a replica that still un-tombstones the
        // original.
        for (const [key, attrValue] of this.getAttributes()) {
          value.setAttr(key, attrValue, this.getExecutedAt());
        }
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
        removedSpans.length ? removedSpans : undefined,
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

/**
 * `headPos` returns the position at the start of the head node, the one node
 * of a text GC never purges.
 */
function headPos(): RGATreeSplitPos {
  return RGATreeSplitPos.of(InitialRGATreeSplitNodeID, 0);
}
