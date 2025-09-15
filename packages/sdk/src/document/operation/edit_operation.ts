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
import { RGATreeSplitPos } from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { CRDTText, CRDTTextValue } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  Operation,
  OperationInfo,
  ExecutionResult,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { Indexable } from '../document';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

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

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    content: string,
    attributes: Map<string, string>,
    executedAt?: TimeTicket,
    isUndoOp?: boolean,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.content = content;
    this.attributes = attributes;
    this.isUndoOp = isUndoOp;
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
  ): EditOperation {
    return new EditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      content,
      attributes,
      executedAt,
      isUndoOp,
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

    if (this.isUndoOp) {
      console.log(
        `##### from=${this.fromPos.getRelativeOffset()}, to=${this.toPos.getRelativeOffset()}}`,
      );
      this.fromPos = text.refinePos(this.fromPos);
      this.toPos = text.refinePos(this.toPos);
    }
    const [changes, pairs, diff, , removed] = text.edit(
      [this.fromPos, this.toPos],
      this.content,
      this.getExecutedAt(),
      Object.fromEntries(this.attributes),
      versionVector,
    );

    const reverseOp = this.toReverseOperation(
      removed,
      text.normalizePos(this.fromPos),
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
        } as OperationInfo;
      }),
      reverseOp,
    };
  }
  /**
   * `toReverseOperation` creates the reverse EditOperation for undo.
   *
   * - Restores the content and attributes from `removedValues`.
   *   - If multiple values were removed, their contents are concatenated.
   *   - If exactly one value was removed, its attributes are also restored.
   * - Computes the target range for the reverse operation:
   *   - `fromPos`: the original start position of this edit.
   *   - `toPos`  : fromPos advanced by the length of inserted content
   *     → This ensures that the reverse operation deletes the text
   *       that was inserted by the original operation. (by refinePos)
   * - Returns a new `EditOperation` that, when executed, restores
   *   the removed content and attributes in place of the inserted one.
   */

  private toReverseOperation(
    removedValues: Array<CRDTTextValue>,
    normalizedPos: RGATreeSplitPos,
  ): Operation | undefined {
    // 1) Content
    const restoredContent =
      removedValues && removedValues.length !== 0
        ? removedValues.map((v) => v.getContent()).join('')
        : '';

    // 2) Attribute
    let restoredAttrs: Array<[string, string]> | undefined;
    if (removedValues.length === 1) {
      const attrsObj = removedValues[0].getAttributes();
      if (attrsObj) {
        restoredAttrs = Array.from(Object.entries(attrsObj as any));
      }
    }

    console.log(
      `%%%%% from=${normalizedPos.getRelativeOffset()}, to=${normalizedPos.getRelativeOffset() + (this.content?.length ?? 0)}}`,
    );

    // 3) Create Reverse Operation
    return EditOperation.create(
      this.getParentCreatedAt(),
      normalizedPos,
      RGATreeSplitPos.of(
        normalizedPos.getID(),
        normalizedPos.getRelativeOffset() + (this.content?.length ?? 0),
      ),
      restoredContent,
      restoredAttrs ? new Map(restoredAttrs) : new Map(),
      undefined,
      true,
    );
  }

  /**
   * Normalize the current edit operation's [fromPos,toPos] into absolute offsets.
   *
   * - Looks up the parent object in the given `CRDTRoot` by `parentCreatedAt`.
   * - Verifies that the parent is a `CRDTText`; otherwise throws an error.
   * - Calls `text.normalizePos` for both `fromPos` and `toPos` to convert each
   *   local `(id, relOffset)` into a global offset measured from the head `(0:0)`.
   * - Returns the normalized range as a tuple `[rangeFrom, rangeTo]`.
   *
   * @typeParam A - The element type of the CRDTText (extends Indexable).
   * @param root - The CRDTRoot containing the CRDTText this operation belongs to.
   * @returns A two-element array `[rangeFrom, rangeTo]` representing the absolute
   *          offsets of this operation's start and end positions.
   * @throws {YorkieError} If the parent object cannot be found or is not a CRDTText.
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
        `fail to execute, only Text can normalize edit`,
      );
    }
    const text = parentObject as CRDTText<A>;

    const rangeFrom = text.normalizePos(this.fromPos).getRelativeOffset();
    const rangeTo = text.normalizePos(this.toPos).getRelativeOffset();
    return [rangeFrom, rangeTo];
  }

  /**
   * Reconcile this UNDO edit's local range [a,b) (relative offsets on current IDs)
   * against an external local range [rangeFrom, rangeTo) (relative offsets), and
   * mutate this.fromPos/toPos accordingly.
   *
   * Rules (executed in this order):
   * 6) [rangeFrom,rangeTo) @ [a,b)               -> a=b=rangeFrom
   * 1) [rangeFrom,rangeTo) strictly before [a,b) -> a-=len, b-=len
   * 5) [rangeFrom,rangeTo) strictly after  [a,b) -> no change
   * 2) rangeFrom < a < rangeTo < b               -> a=rangeFrom, b=rangeFrom+(b-rangeTo)
   * 3) [rangeFrom,rangeTo) c [a,b)               -> b-=len
   * 4) a < rangeFrom < b and b < rangeTo         -> b=rangeFrom
   *
   * Notes:
   * - Runs only if this.isUndoOp === true; otherwise no-op.
   * - Assumes integer inputs with rangeFrom < rangeTo.
   * - Keeps node IDs; adjusts relative offsets only. Offsets are clamped to ≥ 0.
   */
  public reconcileOperation(
    rangeFrom: number,
    rangeTo: number,
    contentLen: number,
  ): void {
    if (!this.isUndoOp) {
      console.log('[skip] not an undo op');
      return;
    }
    if (!Number.isInteger(rangeFrom) || !Number.isInteger(rangeTo)) {
      console.log('[skip] invalid args', { rangeFrom, rangeTo });
      return;
    }
    if (rangeFrom > rangeTo) {
      console.log('[skip] invalid range order', { rangeFrom, rangeTo });
      return;
    }

    const rangeLen = rangeTo - rangeFrom;
    const a = this.fromPos.getRelativeOffset();
    const b = this.toPos.getRelativeOffset();

    const apply = (na: number, nb: number, label: string) => {
      console.log(`[apply-${label}] before`, { a, b }, 'range', {
        rangeFrom,
        rangeTo,
        contentLen,
      });
      this.fromPos = RGATreeSplitPos.of(this.fromPos.getID(), Math.max(0, na));
      this.toPos = RGATreeSplitPos.of(this.toPos.getID(), Math.max(0, nb));
      console.log(`[apply-${label}] after`, {
        from: this.fromPos.getRelativeOffset(),
        to: this.toPos.getRelativeOffset(),
      });
    };

    // Fully overlap: contains
    if (rangeFrom <= a && b <= rangeTo && rangeFrom !== rangeTo) {
      apply(rangeFrom, rangeFrom, 'contains-left');
      return;
    }
    if (a <= rangeFrom && rangeTo <= b && a !== b) {
      apply(a, b - rangeLen + contentLen, 'contains-right');
      return;
    }

    // Does not overlap
    if (rangeTo <= a) {
      apply(a - rangeLen + contentLen, b - rangeLen + contentLen, 'before');
      return;
    }
    if (b <= rangeFrom) {
      console.log('[no-change] range after op', { a, b });
      return;
    }

    // overlap at the start
    if (rangeFrom < a && a < rangeTo && rangeTo < b) {
      apply(rangeFrom, rangeFrom + (b - rangeTo), 'overlap-start');
      return;
    }

    // overlap at the end
    if (a < rangeFrom && rangeFrom < b && b < rangeTo) {
      apply(a, rangeFrom, 'overlap-end');
      return;
    }

    console.log('[no-match] no case applied', { a, b, rangeFrom, rangeTo });
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
}
