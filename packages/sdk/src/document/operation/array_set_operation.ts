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

    const previousValue = parentObject.getByID(this.createdAt)!.deepcopy();
    const reverseOp = this.toReverseOperation(this.value, previousValue);

    const value = this.value.deepcopy();
    parentObject.insertAfter(this.createdAt, value, this.getExecutedAt());
    const removed = parentObject.delete(this.createdAt, this.getExecutedAt());

    // NOTE(hackerwins): The parent has to be passed. `garbageCollect` reaches
    // an element through the pair registered here and calls `purge` on its
    // parent, so a value registered without one cannot be collected -- it
    // throws there instead, inside `applyChangePack`, and that client stops
    // syncing for good. No undo is involved: setting an array element, then
    // removing it, then collecting is enough.
    root.registerElement(value, parentObject);

    // NOTE(hackerwins): The element this assignment displaced has to be
    // registered for collection. Discarding it left it charged to
    // `docSize.live` with nothing able to reach it, so an ordinary
    // `arr[i] = x` in a loop grew the document without bound and collection
    // reported nothing to do.
    //
    // The old TODO here said the two could not be told apart because they
    // share a createdAt. They do not: `this.createdAt` names the element being
    // displaced and `value` carries its own identity. That stopped being true
    // when `set` became insert-then-remove rather than an in-place swap.
    if (removed) {
      root.registerRemovedElement(removed);
    }

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
   * `toReverseOperation` returns the reverse operation of this operation.
   */
  private toReverseOperation(
    newValue: CRDTElement,
    prevValue: CRDTElement,
  ): Operation {
    const reverseOp: ArraySetOperation = ArraySetOperation.create(
      this.getParentCreatedAt(),
      newValue.getCreatedAt(),
      prevValue,
    );

    return reverseOp;
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

  /**
   * `setCreatedAt` sets the creation time of the target element.
   */
  public setCreatedAt(createdAt: TimeTicket) {
    this.createdAt = createdAt;
  }
}
