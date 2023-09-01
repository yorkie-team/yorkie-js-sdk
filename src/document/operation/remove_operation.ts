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
  ExecutionResult,
  Operation,
  OperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { CRDTContainer } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import { SetOperation } from './set_operation';
import { CRDTObject } from '../crdt/object';

/**
 * `RemoveOperation` is an operation that removes an element from `CRDTContainer`.
 */
export class RemoveOperation extends Operation {
  private createdAt: TimeTicket;

  constructor(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt?: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.createdAt = createdAt;
  }

  /**
   * `create` creates a new instance of RemoveOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt?: TimeTicket,
  ): RemoveOperation {
    return new RemoveOperation(parentCreatedAt, createdAt, executedAt);
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  // TODO(Hyemmie): consider CRDTArray
  public execute(root: CRDTRoot): Array<OperationInfo> | ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(parentObject instanceof CRDTContainer)) {
      logger.fatal(`only object and array can execute remove: ${parentObject}`);
    }
    const obj = parentObject as CRDTContainer;
    const key = obj.subPathOf(this.createdAt);
    const reverseOp = this.getReverseOperation(root);
    const reverseOps = [];
    if (reverseOp !== undefined) {
      reverseOps.push(reverseOp);
    }

    const elem = obj.delete(this.createdAt, this.getExecutedAt());
    root.registerRemovedElement(elem);

    return {
      opInfos:
        parentObject instanceof CRDTArray
          ? [
              {
                type: 'remove',
                path: root.createPath(this.getParentCreatedAt()),
                index: Number(key),
              },
            ]
          : [
              {
                type: 'remove',
                path: root.createPath(this.getParentCreatedAt()),
                key,
              },
            ],
      reverseOps,
    };
  }

  /**
   * `getReverseOperation` calculates this operation's reverse operation.
   */
  public getReverseOperation(root: CRDTRoot): Operation | undefined {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    let reverseOp;
    //TODO(Hyemmie): consider CRDTArray
    if (parentObject instanceof CRDTObject) {
      const obj = parentObject as CRDTObject;
      const key = obj.subPathOf(this.createdAt);
      if (key !== undefined) {
        const value = obj.get(key);
        if (value !== undefined) {
          reverseOp = SetOperation.create(
            key,
            value.deepcopy(),
            this.getParentCreatedAt(),
          );
        }
      }
    }

    return reverseOp;
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
    return `${this.getParentCreatedAt().toTestString()}.REMOVE`;
  }

  /**
   * `getCreatedAt` returns the creation time of the target element.
   */
  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }
}
