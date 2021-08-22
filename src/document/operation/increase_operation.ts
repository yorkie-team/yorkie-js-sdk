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
import { JSONElement } from '@yorkie-js-sdk/src/document/json/element';
import { JSONRoot } from '@yorkie-js-sdk/src/document/json/root';
import { JSONPrimitive } from '@yorkie-js-sdk/src/document/json/primitive';
import { logger } from '@yorkie-js-sdk/src/util/logger';
import { Counter } from '@yorkie-js-sdk/src/document/json/counter';

/**
 * `IncreaseOperation` represents an operation that increments a numeric value to Counter.
 * Among Primitives, numeric types Integer, Long, and Double are used as values.
 */
export class IncreaseOperation extends Operation {
  private value: JSONElement;

  constructor(
    parentCreatedAt: TimeTicket,
    value: JSONElement,
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
    value: JSONElement,
    executedAt: TimeTicket,
  ): IncreaseOperation {
    return new IncreaseOperation(parentCreatedAt, value, executedAt);
  }

  /**
   * `execute` executes this operation on the given document(`root`).
   */
  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof Counter) {
      const counter = parentObject as Counter;
      const value = this.value.deepcopy() as JSONPrimitive;
      counter.increase(value);
    } else {
      if (!parentObject) {
        logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
      }

      logger.fatal(`fail to execute, only Counter can execute increase`);
    }
  }

  /**
   * `getEffectedCreatedAt` returns the time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `getAnnotatedString` returns a string containing the meta data.
   */
  public getAnnotatedString(): string {
    return `${this.getParentCreatedAt().getAnnotatedString()}.INCREASE`;
  }

  /**
   * `getValue` returns the value of this operation.
   */
  public getValue(): JSONElement {
    return this.value;
  }
}
