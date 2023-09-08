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
import { CRDTText } from '@yorkie-js-sdk/src/document/crdt/text';
import {
  ExecutionResult,
  Operation,
  OperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { Indexable } from '../document';

/**
 * `EditReverseOperation` is a reverse operation of Edit operation.
 */
export class EditReverseOperation extends Operation {
  // TODO(Hyemmie): need to add more fields to support
  // the reverse operation of rich text edit.
  private fromIdx: number;
  private toIdx: number;
  private content: string;
  private maxCreatedAtMapByActor?: Map<string, TimeTicket>;

  constructor({
    parentCreatedAt,
    fromIdx,
    toIdx,
    content,
    executedAt,
    maxCreatedAtMapByActor,
  }: {
    parentCreatedAt: TimeTicket;
    fromIdx: number;
    toIdx: number;
    content: string;
    executedAt?: TimeTicket;
    maxCreatedAtMapByActor?: Map<string, TimeTicket>;
  }) {
    super(parentCreatedAt, executedAt);
    this.fromIdx = fromIdx;
    this.toIdx = toIdx;
    this.content = content;
    this.maxCreatedAtMapByActor = maxCreatedAtMapByActor;
  }

  /**
   * `create` creates a new instance of EditReverseOperation.
   */
  public static create({
    parentCreatedAt,
    fromIdx,
    toIdx,
    content,
    maxCreatedAtMapByActor,
  }: {
    parentCreatedAt: TimeTicket;
    fromIdx: number;
    toIdx: number;
    content: string;
    executedAt?: TimeTicket;
    maxCreatedAtMapByActor?: Map<string, TimeTicket>;
  }): EditReverseOperation {
    return new EditReverseOperation({
      parentCreatedAt,
      fromIdx,
      toIdx,
      content,
      maxCreatedAtMapByActor,
    });
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute<A extends Indexable>(root: CRDTRoot): ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(parentObject instanceof CRDTText)) {
      logger.fatal(`fail to execute, only Text can execute edit`);
    }

    const text = parentObject as CRDTText<A>;
    const reverseOps = this.getReverseOperation(text);
    const range = text.indexRangeToPosRange(this.fromIdx, this.toIdx);
    const [, changes] = text.edit(range, this.content, this.getExecutedAt());

    return {
      opInfos: changes.map(({ from, to, value }) => {
        return {
          type: 'edit',
          from,
          to,
          value,
          path: root.createPath(this.getParentCreatedAt()),
        };
      }) as Array<OperationInfo>,
      reverseOps,
    };
  }

  /**
   * `getReverseOperation` calculates this operation's reverse operation on the given `CRDTText`.
   */
  public getReverseOperation<A extends Indexable>(
    text: CRDTText<A>,
  ): Array<Operation> {
    const content = text.toString().slice(this.fromIdx, this.toIdx);
    const toIdx = this.content
      ? this.fromIdx + this.content.length
      : this.fromIdx;
    const reverseOp = [
      EditReverseOperation.create({
        parentCreatedAt: this.getParentCreatedAt(),
        fromIdx: this.fromIdx,
        toIdx,
        content,
      }),
    ];
    return reverseOp;
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `getFromIdx` returns the fromIdx of this operation.
   */
  public getFromIdx(): number {
    return this.fromIdx;
  }

  /**
   * `getInsertedIDs` returns the toIdx of this operation.
   */
  public getToIdx(): number {
    return this.toIdx;
  }

  /**
   * `getContent` returns the content of this operation.
   */
  public getContent(): string {
    return this.content;
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    const parent = this.getParentCreatedAt().toTestString();
    return `${parent}.EDIT-REVERSE(${this.getFromIdx()},${this.getToIdx()},${this.getContent()})`;
  }

  /**
   * `getMaxCreatedAtMapByActor` returns the map that stores the latest creation time
   * by actor for the nodes included in the editing range.
   */
  public getMaxCreatedAtMapByActor(): Map<string, TimeTicket> | undefined {
    return this.maxCreatedAtMapByActor;
  }
}
