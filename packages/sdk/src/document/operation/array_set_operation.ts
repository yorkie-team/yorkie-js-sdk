/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTArray } from '@yorkie-js/sdk/src/document/crdt/array';
import {
  Operation,
  ExecutionResult,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `ArraySetOperation` is an operation representing setting an element in Array.
 */
export class ArraySetOperation extends Operation {
  private createdAt: TimeTicket;
  private value: CRDTElement;

  constructor(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    value: CRDTElement,
    executedAt?: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.createdAt = createdAt;
    this.value = value;
  }

  /**
   * `create` creates a new instance of ArraySetOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    value: CRDTElement,
    executedAt?: TimeTicket,
  ): ArraySetOperation {
    return new ArraySetOperation(parentCreatedAt, createdAt, value, executedAt);
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(root: CRDTRoot): ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to find ${this.getParentCreatedAt()}`,
      );
    }
    if (!(parentObject instanceof CRDTArray)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to execute, only array can execute set`,
      );
    }

    const value = this.value.deepcopy();

    parentObject.insertAfter(this.createdAt, value, this.getExecutedAt());
    parentObject.delete(this.createdAt, this.getExecutedAt());

    // TODO(junseo): GC logic is not implemented here
    // because there is no way to distinguish between old and new element with same `createdAt`.
    root.registerElement(value);

    // TODO(emplam27): The reverse operation is not implemented yet.
    const reverseOp = undefined;

    return {
      opInfos: [
        {
          type: 'array-set',
          path: root.createPath(this.getParentCreatedAt()),
        },
      ],
      reverseOp,
    };
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    return `${this.getParentCreatedAt().toTestString()}.ARRAY_SET.${this.createdAt.toTestString()}=${this.value.toSortedJSON()}`;
  }

  /**
   * `getCreatedAt` returns the creation time of the target element.
   */
  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  /**
   * `getValue` returns the value of this operation.
   */
  public getValue(): CRDTElement {
    return this.value;
  }
}
