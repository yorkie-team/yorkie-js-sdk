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
  OpInfo,
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
    const [changes, pairs, diff, , removedValues] = text.edit(
      [this.fromPos, this.toPos],
      this.content,
      this.getExecutedAt(),
      Object.fromEntries(this.attributes),
      versionVector,
    );

    const reverseOp = this.toReverseOperation(
      removedValues,
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
        } as OpInfo;
      }),
      reverseOp,
    };
  }

  private toReverseOperation(
    removedValues: Array<CRDTTextValue>,
    normalizedFromPos: RGATreeSplitPos,
  ): Operation {
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

    return EditOperation.create(
      this.getParentCreatedAt(),
      normalizedFromPos,
      RGATreeSplitPos.of(
        normalizedFromPos.getID(),
        normalizedFromPos.getRelativeOffset() + (this.content.length ?? 0),
      ),
      restoredContent,
      restoredAttrs ? new Map(restoredAttrs) : new Map(),
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
   * `reconcileOperation` reconciles the edit operation with the new position.
   */
  public reconcileOperation(
    rangeFrom: number,
    rangeTo: number,
    contentLength: number,
  ): void {
    if (!this.isUndoOp) {
      return;
    }
    if (!Number.isInteger(rangeFrom) || !Number.isInteger(rangeTo)) {
      return;
    }
    if (rangeFrom > rangeTo) {
      return;
    }

    const rangeLen = rangeTo - rangeFrom;
    const a = this.fromPos.getRelativeOffset();
    const b = this.toPos.getRelativeOffset();

    const apply = (na: number, nb: number) => {
      this.fromPos = RGATreeSplitPos.of(this.fromPos.getID(), Math.max(0, na));
      this.toPos = RGATreeSplitPos.of(this.toPos.getID(), Math.max(0, nb));
    };

    // Does not overlap
    if (rangeTo <= a) {
      apply(a - rangeLen + contentLength, b - rangeLen + contentLength);
      return;
    }
    if (b <= rangeFrom) {
      return;
    }

    // Fully overlap: contains
    if (rangeFrom <= a && b <= rangeTo && rangeFrom !== rangeTo) {
      apply(rangeFrom, rangeFrom);
      return;
    }
    if (a <= rangeFrom && rangeTo <= b && a !== b) {
      apply(a, b - rangeLen + contentLength);
      return;
    }

    // overlap at the start
    if (rangeFrom < a && a < rangeTo && rangeTo < b) {
      apply(rangeFrom, rangeFrom + (b - rangeTo));
      return;
    }

    // overlap at the end
    if (a < rangeFrom && rangeFrom < b && b < rangeTo) {
      apply(a, rangeFrom);
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
}
