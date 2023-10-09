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
import { RGATreeSplitPos } from '../crdt/rga_tree_split';

/**
 * `EditReverseOperation` is a reverse operation of Edit operation.
 */
export class EditReverseOperation extends Operation {
  // TODO(Hyemmie): need to add more fields to support
  // the reverse operation of rich text edit.
  private deletedIDs: Array<RGATreeSplitPos>;
  private insertedIDs: Array<RGATreeSplitPos>;
  private attributes?: Map<string, string>;

  constructor({
    parentCreatedAt,
    deletedIDs,
    insertedIDs,
    attributes,
    executedAt,
  }: {
    parentCreatedAt: TimeTicket;
    deletedIDs: Array<RGATreeSplitPos>;
    insertedIDs: Array<RGATreeSplitPos>;
    attributes?: Map<string, string>;
    executedAt?: TimeTicket;
  }) {
    super(parentCreatedAt, executedAt);
    this.deletedIDs = deletedIDs;
    this.insertedIDs = insertedIDs;
    this.attributes = attributes;
  }

  /**
   * `create` creates a new instance of EditReverseOperation.
   */
  public static create({
    parentCreatedAt,
    deletedIDs,
    insertedIDs,
    attributes,
    executedAt,
  }: {
    parentCreatedAt: TimeTicket;
    deletedIDs: Array<RGATreeSplitPos>;
    insertedIDs: Array<RGATreeSplitPos>;
    attributes?: Map<string, string>;
    executedAt?: TimeTicket;
  }): EditReverseOperation {
    return new EditReverseOperation({
      parentCreatedAt,
      deletedIDs,
      insertedIDs,
      attributes,
      executedAt,
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
    const reverseOp = this.getReverseOperation();

    const changes = text.reverseEdit(
      this.deletedIDs,
      this.insertedIDs,
      this.getExecutedAt(),
    );

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
      reverseOp,
    };
  }

  /**
   * `getReverseOperation` calculates this operation's reverse operation on the given `CRDTText`.
   */
  public getReverseOperation(): Operation {
    return EditReverseOperation.create({
      parentCreatedAt: this.getParentCreatedAt(),
      deletedIDs: this.insertedIDs,
      insertedIDs: this.deletedIDs,
      attributes: this.attributes,
    });
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `getDeletedIDs` returns the deletedIDs of this operation.
   */
  public getDeletedIDs(): Array<RGATreeSplitPos> {
    return this.deletedIDs;
  }

  /**
   * `getInsertedIDs` returns the insertedIDs of this operation.
   */
  public getInsertedIDs(): Array<RGATreeSplitPos> {
    return this.insertedIDs;
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    const parent = this.getParentCreatedAt().toTestString();
    let deletedIDs = '';
    for (const id of this.getDeletedIDs()) {
      deletedIDs = deletedIDs.concat(`${id.toTestString()}, `);
    }
    let insertedIDs = '';
    for (const id of this.getInsertedIDs()) {
      insertedIDs = insertedIDs.concat(`${id.toTestString()}, `);
    }
    return `${parent}.EDIT-REVERSE(deletedIDs:[${deletedIDs}], insertedIds:[${insertedIDs}])`;
  }

  /**
   * `getAttributes` returns the attributes of this Edit.
   */
  public getAttributes(): Map<string, string> {
    return this.attributes || new Map();
  }
}
