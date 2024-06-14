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
 * `OpSource` represents the source of the operation. It is used to handle
 * corner cases in the operations created by undo/redo allow the removed
 * elements when executing them.
 */
export enum OpSource {
  Local = 'local',
  Remote = 'remote',
  UndoRedo = 'undoredo',
}

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
  path: string;
  from: number;
  to: number;
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
  path: string;
  from: number;
  to: number;
  value: {
    attributes: Indexable;
  };
};

/**
 * `TreeEditOpInfo` represents the information of the tree edit operation.
 */
export type TreeEditOpInfo = {
  type: 'tree-edit';
  path: string;
  from: number;
  to: number;
  value?: Array<TreeNode>;
  splitLevel?: number;
  fromPath: Array<number>;
  toPath: Array<number>;
};

/**
 * `TreeStyleOpInfo` represents the information of the tree style operation.
 */
export type TreeStyleOpInfo = {
  type: 'tree-style';
  path: string;
  from: number;
  to: number;
  fromPath: Array<number>;
  toPath: Array<number>;
  value: {
    attributes?: Indexable;
    attributesToRemove?: Array<string>;
  };
};

/**
 * `ExecutionResult` represents the result of operation execution.
 */
export type ExecutionResult = {
  opInfos: Array<OperationInfo>;
  // TODO(chacha912): After implementing all of the reverseOperation,
  // we change the type to non-optional.
  reverseOp?: Operation;
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
  public getExecutedAt(): TimeTicket {
    // NOTE(chacha912): When an operation is in the undo/redo stack,
    // it doesn't have an executedAt yet. The executedAt is set when
    // the operation is executed through undo or redo.
    if (!this.executedAt) {
      throw new Error(`executedAt has not been set yet`);
    }
    return this.executedAt;
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
  public abstract execute(
    root: CRDTRoot,
    source: OpSource,
  ): ExecutionResult | undefined;
}
