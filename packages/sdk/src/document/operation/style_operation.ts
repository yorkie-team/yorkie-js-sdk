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
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  Operation,
  OpInfo,
  ExecutionResult,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { Indexable } from '../document';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 *  `StyleOperation` is an operation applies the style of the given range to Text.
 */
export class StyleOperation extends Operation {
  private fromPos: RGATreeSplitPos;
  private toPos: RGATreeSplitPos;
  private attributes: Map<string, string>;
  private attributesToRemove: Array<string>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    attributes: Map<string, string>,
    attributesToRemove: Array<string>,
    executedAt?: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.attributes = attributes;
    this.attributesToRemove = attributesToRemove;
  }

  /**
   * `create` creates a new instance of StyleOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    attributes: Map<string, string>,
    executedAt?: TimeTicket,
  ): StyleOperation {
    return new StyleOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      attributes,
      [],
      executedAt,
    );
  }

  /**
   * `createRemoveStyleOperation` creates a new instance of StyleOperation for style removal.
   */
  public static createRemoveStyleOperation(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    attributesToRemove: Array<string>,
    executedAt?: TimeTicket,
  ): StyleOperation {
    return new StyleOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      new Map(),
      attributesToRemove,
      executedAt,
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

    if (this.attributesToRemove.length > 0) {
      const [pairs, diff, changes, prevAttributes] = text.removeStyle(
        [this.fromPos, this.toPos],
        this.attributesToRemove,
        this.getExecutedAt(),
        versionVector,
      );

      root.acc(diff);
      for (const pair of pairs) {
        root.registerGCPair(pair);
      }

      // Build reverse: set attributes back to their previous values
      let reverseOp: Operation | undefined;
      if (prevAttributes.size > 0) {
        reverseOp = StyleOperation.create(
          this.getParentCreatedAt(),
          this.fromPos,
          this.toPos,
          prevAttributes,
        );
      }

      return {
        opInfos: changes.map(({ from, to, value }) => {
          return {
            type: 'style',
            from,
            to,
            value,
            path: root.createPath(this.getParentCreatedAt()),
          } as OpInfo;
        }),
        reverseOp,
      };
    }

    const [pairs, diff, changes, prevAttributes, attrsToRemove] = text.setStyle(
      [this.fromPos, this.toPos],
      this.attributes ? Object.fromEntries(this.attributes) : {},
      this.getExecutedAt(),
      versionVector,
    );

    root.acc(diff);

    for (const pair of pairs) {
      root.registerGCPair(pair);
    }

    // Build reverse operation
    let reverseOp: Operation | undefined;
    if (prevAttributes.size > 0 || attrsToRemove.length > 0) {
      if (prevAttributes.size > 0 && attrsToRemove.length > 0) {
        // Mixed case: some attrs existed (need setStyle), some didn't (need removeStyle)
        // We use a setStyle reverse for the keys that had values, and let removeStyle
        // handle the keys that didn't exist. For simplicity, we create a setStyle reverse
        // with the previous values and an attributesToRemove for the new keys.
        reverseOp = new StyleOperation(
          this.getParentCreatedAt(),
          this.fromPos,
          this.toPos,
          prevAttributes,
          attrsToRemove,
        );
      } else if (attrsToRemove.length > 0) {
        // All keys were new - reverse is to remove them
        reverseOp = StyleOperation.createRemoveStyleOperation(
          this.getParentCreatedAt(),
          this.fromPos,
          this.toPos,
          attrsToRemove,
        );
      } else {
        // All keys had previous values - reverse is to set them back
        reverseOp = StyleOperation.create(
          this.getParentCreatedAt(),
          this.fromPos,
          this.toPos,
          prevAttributes,
        );
      }
    }

    return {
      opInfos: changes.map(({ from, to, value }) => {
        return {
          type: 'style',
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
    const attributes = this.attributes;
    return `${parent}.STYL(${fromPos},${toPos},${JSON.stringify(attributes)})`;
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
   * `getAttributes` returns the attributes of this operation.
   */
  public getAttributes(): Map<string, string> {
    return this.attributes;
  }

  /**
   * `getAttributesToRemove` returns the attributes to remove.
   */
  public getAttributesToRemove(): Array<string> {
    return this.attributesToRemove;
  }
}
