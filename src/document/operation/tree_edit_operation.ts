/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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
  CRDTTree,
  CRDTTreeNode,
  CRDTTreePos,
} from '@yorkie-js-sdk/src/document/crdt/tree';
import {
  Operation,
  InternalOpInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `TreeEditOperation` is an operation representing Tree editing.
 */
export class TreeEditOperation extends Operation {
  private fromPos: CRDTTreePos;
  private toPos: CRDTTreePos;
  private content: CRDTTreeNode | undefined;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    content: CRDTTreeNode | undefined,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.content = content;
  }

  /**
   * `create` creates a new instance of EditOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    content: CRDTTreeNode | undefined,
    executedAt: TimeTicket,
  ): TreeEditOperation {
    return new TreeEditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      content,
      executedAt,
    );
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(root: CRDTRoot): Array<InternalOpInfo> {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(parentObject instanceof CRDTTree)) {
      logger.fatal(`fail to execute, only Tree can execute edit`);
    }
    const tree = parentObject as CRDTTree;
    const changes = tree.edit(
      [this.fromPos, this.toPos],
      this.content?.deepcopy(),
      this.getExecutedAt(),
    );

    return changes.map(({ from, to, value, fromPath, toPath }) => {
      return {
        type: 'tree-edit',
        from,
        to,
        value,
        fromPath,
        toPath,
        element: this.getParentCreatedAt(),
      };
    }) as Array<InternalOpInfo>;
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `getStructureAsString` returns a string containing the meta data.
   */
  public getStructureAsString(): string {
    const parent = this.getParentCreatedAt().getStructureAsString();
    const fromPos = `${this.fromPos.createdAt.getStructureAsString()}:${
      this.fromPos.offset
    }`;
    const toPos = `${this.toPos.createdAt.getStructureAsString()}:${
      this.toPos.offset
    }`;
    const content = this.content;
    return `${parent}.EDIT(${fromPos},${toPos},${content})`;
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): CRDTTreePos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): CRDTTreePos {
    return this.toPos;
  }

  /**
   * `getContent` returns the content of Edit.
   */
  public getContent(): CRDTTreeNode | undefined {
    return this.content;
  }
}
