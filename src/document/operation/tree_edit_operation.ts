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
  toXML,
} from '@yorkie-js-sdk/src/document/crdt/tree';
import {
  Operation,
  OperationInfo,
  ExecutionResult,
} from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `TreeEditOperation` is an operation representing Tree editing.
 */
export class TreeEditOperation extends Operation {
  private fromPos: CRDTTreePos;
  private toPos: CRDTTreePos;
  private contents: Array<CRDTTreeNode> | undefined;
  private splitLevel: number;
  private maxCreatedAtMapByActor: Map<string, TimeTicket>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.contents = contents;
    this.splitLevel = splitLevel;
    this.maxCreatedAtMapByActor = maxCreatedAtMapByActor;
  }

  /**
   * `create` creates a new instance of EditOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    executedAt: TimeTicket,
  ): TreeEditOperation {
    return new TreeEditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      contents,
      splitLevel,
      maxCreatedAtMapByActor,
      executedAt,
    );
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(root: CRDTRoot): ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(parentObject instanceof CRDTTree)) {
      logger.fatal(`fail to execute, only Tree can execute edit`);
    }
    const editedAt = this.getExecutedAt();
    const tree = parentObject as CRDTTree;
    const [changes, pairs] = tree.edit(
      [this.fromPos, this.toPos],
      this.contents?.map((content) => content.deepcopy()),
      this.splitLevel,
      editedAt,
      /**
       * TODO(sejongk): When splitting element nodes, a new nodeID is assigned with a different timeTicket.
       * In the same change context, the timeTickets share the same lamport and actorID but have different delimiters,
       * incremented by one for each.
       * Therefore, it is possible to simulate later timeTickets using `editedAt` and the length of `contents`.
       * This logic might be unclear; consider refactoring for multi-level concurrent editing in the Tree implementation.
       */
      (() => {
        let delimiter = editedAt.getDelimiter();
        if (this.contents !== undefined) {
          delimiter += this.contents.length;
        }
        const issueTimeTicket = () =>
          TimeTicket.of(
            editedAt.getLamport(),
            ++delimiter,
            editedAt.getActorID(),
          );
        return issueTimeTicket;
      })(),
      this.maxCreatedAtMapByActor,
    );

    for (const pair of pairs) {
      root.registerGCPair(pair);
    }

    return {
      opInfos: changes.map(
        ({ from, to, value, splitLevel, fromPath, toPath }) => {
          return {
            type: 'tree-edit',
            path: root.createPath(this.getParentCreatedAt()),
            from,
            to,
            value,
            splitLevel,
            fromPath,
            toPath,
          } as OperationInfo;
        },
      ),
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
    const fromPos = `${this.fromPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}/${this.fromPos.getLeftSiblingID().getOffset()}`;
    const toPos = `${this.toPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}/${this.toPos.getLeftSiblingID().getOffset()}`;
    const contents = this.contents || [];
    return `${parent}.EDIT(${fromPos},${toPos},${contents
      .map((v) => toXML(v))
      .join('')})`;
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
  public getContents(): Array<CRDTTreeNode> | undefined {
    return this.contents;
  }

  /**
   * `getSplitLevel` returns the split level of Edit.
   */
  public getSplitLevel(): number {
    return this.splitLevel;
  }

  /**
   * `getMaxCreatedAtMapByActor` returns the map that stores the latest creation time
   * by actor for the nodes included in the editing range.
   */
  public getMaxCreatedAtMapByActor(): Map<string, TimeTicket> {
    return this.maxCreatedAtMapByActor;
  }
}
