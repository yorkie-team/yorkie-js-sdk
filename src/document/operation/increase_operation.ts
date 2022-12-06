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

import { Operation } from '@yorkie-js-sdk/src/document/operation/operation';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { Primitive } from '@yorkie-js-sdk/src/document/crdt/primitive';
import { logger } from '@yorkie-js-sdk/src/util/logger';
import { CRDTCounter } from '@yorkie-js-sdk/src/document/crdt/counter';

/**
 * `IncreaseOperation` represents an operation that increments a numeric value to Counter.
 * Among Primitives, numeric types Integer, Long are used as values.
 */
export class IncreaseOperation extends Operation {
  private value: CRDTElement;

  constructor(
    parentCreatedAt: TimeTicket,
    value: CRDTElement,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.value = value;
  }

  /**
   * `create` creates a new instance of IncreaseOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    value: CRDTElement,
    executedAt: TimeTicket,
  ): IncreaseOperation {
    return new IncreaseOperation(parentCreatedAt, value, executedAt);
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(root: CRDTRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof CRDTCounter) {
      const counter = parentObject as CRDTCounter;
      const value = this.value.deepcopy() as Primitive;
      counter.increase(value);
    } else {
      if (!parentObject) {
        logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
      }

      logger.fatal(`fail to execute, only Counter can execute increase`);
    }
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
    return `${this.getParentCreatedAt().getStructureAsString()}.INCREASE`;
  }

  /**
   * `getValue` returns the value of this operation.
   */
  public getValue(): CRDTElement {
    return this.value;
  }
}
