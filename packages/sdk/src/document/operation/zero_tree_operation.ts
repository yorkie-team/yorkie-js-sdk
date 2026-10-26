/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

/**
 * PROTOTYPE — operations of `CRDTZeroTree`.
 *
 * - `ZeroTreeEditOperation`: delete a token range and/or insert a token run.
 *   Its reverse addresses tokens by identity (restore / retombstone), so an
 *   undo needs no position reconciliation against concurrent edits.
 * - `ZeroTreeStyleOperation`: LWW attribute writes on one marker, addressed
 *   by the marker's identity.
 *
 * Both report `ZeroTreeOpInfo`: the Zero editor operations that turn the
 * editor model before the operation into the model after it, computed on the
 * replica that executes it. A binding applies them as they are.
 */

import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  RGATreeSplitNodeID,
  RGATreeSplitPos,
  RestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import {
  CRDTZeroTree,
  ZeroTokens,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree';
import {
  compileChange,
  compileStyleChange,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import {
  ExecutionResult,
  Operation,
  OpInfo,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { addDataSizes, DataSize } from '@yorkie-js/sdk/src/util/resource';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import type { ZeroAttrValue } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

export type ZeroRestoreMode = 'restore' | 'retombstone';

/**
 * `findTree` returns the Zero Tree created at the given time.
 */
function findTree(root: CRDTRoot, createdAt: TimeTicket): CRDTZeroTree {
  const elem = root.findByCreatedAt(createdAt);
  if (!(elem instanceof CRDTZeroTree)) {
    throw new YorkieError(
      Code.ErrInvalidArgument,
      `fail to find ZeroTree ${createdAt.toTestString()}`,
    );
  }
  return elem;
}

/**
 * `toOpInfos` returns the Zero operations an edit made, as operation infos.
 */
function toOpInfos(
  root: CRDTRoot,
  createdAt: TimeTicket,
  operations: Array<[string, Array<number>, unknown?]>,
): Array<OpInfo> {
  if (!operations.length) {
    return [];
  }
  return [
    {
      type: 'zero-tree',
      path: root.createPath(createdAt),
      operations,
    },
  ];
}

/**
 * `ZeroTreeEditOperation` deletes `[fromPos, toPos)` and inserts `value`.
 */
export class ZeroTreeEditOperation extends Operation {
  private fromPos: RGATreeSplitPos;
  private toPos: RGATreeSplitPos;
  private value?: ZeroTokens;
  private restoreSpans?: Array<RestoreSpan<ZeroTokens>>;
  private restoreMode?: ZeroRestoreMode;
  private retombstoneSpans?: Array<RestoreSpan<ZeroTokens>>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    value: ZeroTokens | undefined,
    executedAt?: TimeTicket,
    restoreSpans?: Array<RestoreSpan<ZeroTokens>>,
    restoreMode?: ZeroRestoreMode,
    retombstoneSpans?: Array<RestoreSpan<ZeroTokens>>,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.value = value;
    this.restoreSpans = restoreSpans;
    this.restoreMode = restoreMode;
    this.retombstoneSpans = retombstoneSpans;
  }

  /**
   * `execute` executes this operation on the given root.
   */
  public execute(
    root: CRDTRoot,
    _: OpSource,
    versionVector?: VersionVector,
  ): ExecutionResult {
    const tree = findTree(root, this.getParentCreatedAt());
    tree.beginChange();

    let reverseOp: Operation | undefined;
    if (this.restoreSpans || this.retombstoneSpans) {
      const isRetombstone = this.restoreMode === 'retombstone';
      const toRestore =
        (isRetombstone ? this.retombstoneSpans : this.restoreSpans) ?? [];
      const toRetombstone =
        (isRetombstone ? this.restoreSpans : this.retombstoneSpans) ?? [];
      const total: DataSize = { data: 0, meta: 0 };

      if (toRetombstone.length) {
        const [pairs, , diff] = tree.retombstone(
          toRetombstone,
          this.getExecutedAt(),
          versionVector,
        );
        addDataSizes(total, diff);
        for (const pair of pairs) {
          root.registerGCPair(pair);
        }
      }
      if (toRestore.length) {
        const [untombstoned, , , liveDiff, pending] = tree.restore(
          toRestore,
          this.getExecutedAt(),
          this.fromPos,
        );
        for (const pair of pending) {
          root.registerGCPair(pair);
        }
        for (const node of untombstoned) {
          root.unregisterGCPair({ parent: tree.getRGA(), child: node });
        }
        addDataSizes(total, liveDiff);
      }
      root.acc(total);
      // The spans this execution removed again are restored by the next
      // reverse, which has to cancel THIS removal.
      const removedNow = (spans?: Array<RestoreSpan<ZeroTokens>>) =>
        spans?.map((span) => ({ ...span, removedBy: this.getExecutedAt() }));
      reverseOp = new ZeroTreeEditOperation(
        this.getParentCreatedAt(),
        this.fromPos,
        this.toPos,
        undefined,
        undefined,
        isRetombstone ? removedNow(this.restoreSpans) : this.restoreSpans,
        isRetombstone ? 'restore' : 'retombstone',
        isRetombstone
          ? this.retombstoneSpans
          : removedNow(this.retombstoneSpans),
      );
    } else {
      const [pairs, diff, removedSpans] = tree.edit(
        [this.fromPos, this.toPos],
        this.value ? this.value.substring(0) : undefined,
        this.getExecutedAt(),
        versionVector,
      );
      root.acc(diff);
      for (const pair of pairs) {
        root.registerGCPair(pair);
      }
      const inserted = this.value?.length
        ? [
            {
              createdAt: this.getExecutedAt(),
              start: 0,
              end: this.value.length,
              value: this.value.substring(0),
            },
          ]
        : undefined;
      if (removedSpans.length || inserted) {
        const anchor = tree.normalizePos(this.fromPos);
        reverseOp = new ZeroTreeEditOperation(
          this.getParentCreatedAt(),
          anchor,
          anchor,
          undefined,
          undefined,
          removedSpans.length ? removedSpans : undefined,
          'restore',
          inserted,
        );
      }
    }

    return {
      opInfos: toOpInfos(
        root,
        this.getParentCreatedAt(),
        compileChange(tree.takeChange(), tree.getSchema()),
      ),
      reverseOp,
    };
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the target tree.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `toTestString` returns a string for tests.
   */
  public toTestString(): string {
    return `${this.getParentCreatedAt().toTestString()}.ZEDIT(${this.fromPos.toTestString()},${this.toPos.toTestString()},${this.value?.toString() ?? ''})`;
  }

  /**
   * `getFromPos` returns the start of the edited range.
   */
  public getFromPos(): RGATreeSplitPos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end of the edited range.
   */
  public getToPos(): RGATreeSplitPos {
    return this.toPos;
  }

  /**
   * `getValue` returns the inserted tokens.
   */
  public getValue(): ZeroTokens | undefined {
    return this.value;
  }

  /**
   * `getRestoreSpans` returns the spans an undo revives.
   */
  public getRestoreSpans(): Array<RestoreSpan<ZeroTokens>> | undefined {
    return this.restoreSpans;
  }

  /**
   * `getRestoreMode` returns the identity-preserving mode of this edit.
   */
  public getRestoreMode(): ZeroRestoreMode | undefined {
    return this.restoreMode;
  }

  /**
   * `getRetombstoneSpans` returns the spans an undo removes again.
   */
  public getRetombstoneSpans(): Array<RestoreSpan<ZeroTokens>> | undefined {
    return this.retombstoneSpans;
  }
}

/**
 * `ZeroTreeStyleOperation` writes attributes on one marker.
 */
export class ZeroTreeStyleOperation extends Operation {
  private markerID: RGATreeSplitNodeID;
  private writes: Array<[string, ZeroAttrValue]>;

  constructor(
    parentCreatedAt: TimeTicket,
    markerID: RGATreeSplitNodeID,
    writes: Array<[string, ZeroAttrValue]>,
    executedAt?: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.markerID = markerID;
    this.writes = writes;
  }

  /**
   * `execute` executes this operation on the given root.
   */
  public execute(root: CRDTRoot): ExecutionResult {
    const tree = findTree(root, this.getParentCreatedAt());
    tree.beginChange();
    const [prev, pairs] = tree.setAttrs(
      this.markerID,
      this.writes,
      this.getExecutedAt(),
    );
    for (const pair of pairs) {
      root.registerGCPair(pair);
    }
    return {
      opInfos: toOpInfos(
        root,
        this.getParentCreatedAt(),
        compileStyleChange(
          tree.takeChange(),
          this.markerID.toIDString(),
          tree.getSchema(),
        ),
      ),
      reverseOp: prev.length
        ? new ZeroTreeStyleOperation(
            this.getParentCreatedAt(),
            this.markerID,
            prev,
          )
        : undefined,
    };
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the target tree.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `toTestString` returns a string for tests.
   */
  public toTestString(): string {
    return `${this.getParentCreatedAt().toTestString()}.ZSTYLE(${this.markerID.toTestString()},${JSON.stringify(this.writes)})`;
  }

  /**
   * `getMarkerID` returns the id of the marker this operation writes.
   */
  public getMarkerID(): RGATreeSplitNodeID {
    return this.markerID;
  }

  /**
   * `getWrites` returns the attribute writes; a null value removes the key.
   */
  public getWrites(): Array<[string, ZeroAttrValue]> {
    return this.writes;
  }
}
