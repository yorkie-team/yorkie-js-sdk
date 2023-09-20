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

import { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { TreeNode } from '@yorkie-js-sdk/src/document/crdt/tree';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { Indexable } from '@yorkie-js-sdk/src/document/document';

/**
 * `OperationInfo` represents the information of an operation.
 * It is used to inform to the user what kind of operation was executed.
 */
export type OperationInfo =
  | TextOperationInfo
  | CounterOperationInfo
  | ArrayOperationInfo
  | ObjectOperationInfo
  | TreeOperationInfo;

/**
 * `TextOperationInfo` represents the OperationInfo for the yorkie.Text.
 */
export type TextOperationInfo = EditOpInfo | StyleOpInfo;

/**
 * `CounterOperationInfo` represents the OperationInfo for the yorkie.Counter.
 */
export type CounterOperationInfo = IncreaseOpInfo;

/**
 * `ArrayOperationInfo` represents the OperationInfo for the JSONArray.
 */
export type ArrayOperationInfo = AddOpInfo | RemoveOpInfo | MoveOpInfo;

/**
 * `ObjectOperationInfo` represents the OperationInfo for the JSONObject.
 */
export type ObjectOperationInfo = SetOpInfo | RemoveOpInfo;

/**
 * `TreeOperationInfo` represents the OperationInfo for the yorkie.Tree.
 */
export type TreeOperationInfo = TreeEditOpInfo | TreeStyleOpInfo;

/**
 * `AddOpInfo` represents the information of the add operation.
 */
export type AddOpInfo = {
  type: 'add';
  path: string;
  index: number;
};

/**
 * `MoveOpInfo` represents the information of the move operation.
 */
export type MoveOpInfo = {
  type: 'move';
  path: string;
  previousIndex: number;
  index: number;
};

/**
 * `SetOpInfo` represents the information of the set operation.
 */
export type SetOpInfo = {
  type: 'set';
  path: string;
  key: string;
};

/**
 * `RemoveOpInfo` represents the information of the remove operation.
 */
export type RemoveOpInfo = {
  type: 'remove';
  path: string;
  key?: string;
  index?: number;
};

/**
 * `IncreaseOpInfo` represents the information of the increase operation.
 */
export type IncreaseOpInfo = {
  type: 'increase';
  path: string;
  value: number;
};

/**
 * `EditOpInfo` represents the information of the edit operation.
 */
export type EditOpInfo = {
  type: 'edit';
  from: number;
  to: number;
  path: string;
  value: {
    attributes: Indexable;
    content: string;
  };
};

/**
 * `StyleOpInfo` represents the information of the style operation.
 */
export type StyleOpInfo = {
  type: 'style';
  from: number;
  to: number;
  path: string;
  value: {
    attributes: Indexable;
  };
};

/**
 * `TreeEditOpInfo` represents the information of the tree edit operation.
 */
export type TreeEditOpInfo = {
  type: 'tree-edit';
  from: number;
  to: number;
  fromPath: Array<number>;
  toPath: Array<number>;
  value: TreeNode;
  path: string;
};

/**
 * `TreeStyleOpInfo` represents the information of the tree style operation.
 */
export type TreeStyleOpInfo = {
  type: 'tree-style';
  from: number;
  to: number;
  fromPath: Array<number>;
  value: { [key: string]: any };
  path: string;
};

/**
 * `ExecutionResult` represents the result of operation execution.
 */
export type ExecutionResult = {
  opInfos: Array<OperationInfo>;
  reverseOps: Array<Operation>;
};

/**
 * `Operation` represents an operation to be executed on a document.
 */
export abstract class Operation {
  private parentCreatedAt: TimeTicket;
  // NOTE(Hyemmie): `executedAt` variable is undefined if this operation is not executed yet.
  private executedAt?: TimeTicket;

  constructor(parentCreatedAt: TimeTicket, executedAt?: TimeTicket) {
    this.parentCreatedAt = parentCreatedAt;
    this.executedAt = executedAt;
  }

  /**
   * `getParentCreatedAt` returns the creation time of the target element to
   * execute the operation.
   */
  public getParentCreatedAt(): TimeTicket {
    return this.parentCreatedAt;
  }

  /**
   * `getExecutedAt` returns execution time of this operation.
   */
  // TODO(Hyemmie): Corner cases need to be considered: undo/redo operations'
  // `executedAt` could be undefined until they are executed.
  public getExecutedAt(): TimeTicket {
    return this.executedAt!;
  }

  /**
   * `setActor` sets the given actor to this operation.
   */
  public setActor(actorID: ActorID): void {
    if (this.executedAt) {
      this.executedAt = this.executedAt.setActor(actorID);
    }
  }

  /**
   * `setExecutedAt` sets the executedAt.
   */
  public setExecutedAt(executedAt: TimeTicket): void {
    this.executedAt = executedAt;
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public abstract getEffectedCreatedAt(): TimeTicket;

  /**
   * `toTestString` returns a string containing the meta data for debugging purpose.
   */
  public abstract toTestString(): string;

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  // TODO(Hyemmie): need to standardize the return type as "ExecutionResult"
  // after implement every operation's reverse operation
  public abstract execute(
    root: CRDTRoot,
  ): ExecutionResult | Array<OperationInfo>;
}
