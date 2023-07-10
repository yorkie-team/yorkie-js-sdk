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

import { logger } from '@yorkie-js-sdk/src/util/logger';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { RGATreeSplitNodePos } from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { CRDTText } from '@yorkie-js-sdk/src/document/crdt/text';
import {
  Operation,
  OperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { Indexable } from '../document';

/**
 *  `SelectOperation` represents an operation that selects an area in the text.
 */
export class SelectOperation extends Operation {
  private fromPos: RGATreeSplitNodePos;
  private toPos: RGATreeSplitNodePos;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
  }

  /**
   * `create` creates a new instance of SelectOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    executedAt: TimeTicket,
  ): SelectOperation {
    return new SelectOperation(parentCreatedAt, fromPos, toPos, executedAt);
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute<A extends Indexable>(root: CRDTRoot): Array<OperationInfo> {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(parentObject instanceof CRDTText)) {
      logger.fatal(`fail to execute, only Text can execute select`);
    }
    const text = parentObject as CRDTText<A>;
    const change = text.select(
      [this.fromPos, this.toPos],
      this.getExecutedAt(),
    );

    return change
      ? [
          {
            from: change.from,
            to: change.to,
            type: 'select',
            path: root.createPath(this.getParentCreatedAt()),
          },
        ]
      : [];
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
    return `${parent}.SELT(${fromPos},${toPos})`;
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): RGATreeSplitNodePos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): RGATreeSplitNodePos {
    return this.toPos;
  }
}
