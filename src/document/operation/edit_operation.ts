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
import {
  RGATreeSplitNodeID,
  RGATreeSplitPos,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { CRDTText } from '@yorkie-js-sdk/src/document/crdt/text';
import {
  Operation,
  OperationInfo,
  ExecutionResult,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { Indexable } from '../document';
import { EditReverseOperation } from './edit_reverse_operation';

/**
 * `EditOperation` is an operation representing editing Text. Most of the same as
 * Edit, but with additional style properties, attributes.
 */
export class EditOperation extends Operation {
  private fromPos: RGATreeSplitPos;
  private toPos: RGATreeSplitPos;
  private content: string;
  private attributes: Map<string, string>;
  private maxCreatedAtMapByActor?: Map<string, TimeTicket>;

  constructor({
    parentCreatedAt,
    fromPos,
    toPos,
    content,
    attributes,
    executedAt,
    maxCreatedAtMapByActor,
  }: {
    parentCreatedAt: TimeTicket;
    fromPos: RGATreeSplitPos;
    toPos: RGATreeSplitPos;
    content: string;
    attributes: Map<string, string>;
    executedAt?: TimeTicket;
    maxCreatedAtMapByActor?: Map<string, TimeTicket>;
  }) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.content = content;
    this.attributes = attributes;
    this.maxCreatedAtMapByActor = maxCreatedAtMapByActor;
  }

  /**
   * `create` creates a new instance of EditOperation.
   */
  public static create({
    parentCreatedAt,
    fromPos,
    toPos,
    content,
    attributes,
    executedAt,
    maxCreatedAtMapByActor,
  }: {
    parentCreatedAt: TimeTicket;
    fromPos: RGATreeSplitPos;
    toPos: RGATreeSplitPos;
    content: string;
    attributes: Map<string, string>;
    executedAt?: TimeTicket;
    maxCreatedAtMapByActor?: Map<string, TimeTicket>;
  }): EditOperation {
    return new EditOperation({
      parentCreatedAt,
      fromPos,
      toPos,
      content,
      attributes,
      executedAt,
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
    // TODO(chacha912): check where we can set maxCreatedAtMapByActor of edit operation(undo)
    // based on the result from text.edit.
    const [, changes, , reverseInfo] = text.edit(
      [this.fromPos, this.toPos],
      this.content,
      this.getExecutedAt(),
      Object.fromEntries(this.attributes),
      this.maxCreatedAtMapByActor,
    );
    const reverseOp = this.getReverseOperation(text, reverseInfo);

    if (!this.fromPos.equals(this.toPos)) {
      root.registerElementHasRemovedNodes(text);
    }

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
  public getReverseOperation<A extends Indexable>(
    text: CRDTText<A>,
    reverseInfo: {
      deletedIDs: Array<{ nodeID: RGATreeSplitNodeID; length: number }>;
      insertedIDs: Array<{ nodeID: RGATreeSplitNodeID; length: number }>;
    },
  ): Operation {
    // TODO(chacha912): let's assume this in plain text.
    // we also need to consider rich text content.
    return EditReverseOperation.create({
      parentCreatedAt: text.getCreatedAt(),
      deletedIDs: reverseInfo.deletedIDs,
      insertedIDs: reverseInfo.insertedIDs,
      attributes: new Map(),
    });
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
   * `getMaxCreatedAtMapByActor` returns the map that stores the latest creation time
   * by actor for the nodes included in the editing range.
   */
  public getMaxCreatedAtMapByActor(): Map<string, TimeTicket> | undefined {
    return this.maxCreatedAtMapByActor;
  }
}
