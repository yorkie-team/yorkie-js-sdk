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
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { JSONPrimitive } from '@yorkie-js-sdk/src/document/json/primitive';
import { IncreaseOperation } from '@yorkie-js-sdk/src/document/operation/increase_operation';
import Long from 'long';
import { CounterInternal } from '@yorkie-js-sdk/src/document/json/counter';

/**
 * `Counter` is the counter.
 */
export class Counter {
  private value: number | Long;
  private context?: ChangeContext;
  private counter?: CounterInternal;

  constructor(value: number | Long) {
    this.value = value;
  }

  /**
   * `initialize` initialize this text with context and internal text.
   * @internal
   */
  public initialize(context: ChangeContext, counter: CounterInternal): void {
    this.context = context;
    this.counter = counter;
  }

  /**
   * `getValue` returns the value of this counter;
   * @internal
   */
  public getValue(): number | Long {
    return this.value;
  }

  /**
   * `increase` increases numeric data.
   */
  public increase(v: number | Long): Counter {
    if (!this.context || !this.counter) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    const ticket = this.context.issueTimeTicket();
    const value = JSONPrimitive.of(v, ticket);
    if (!value.isNumericType()) {
      throw new TypeError(
        `Unsupported type of value: ${typeof value.getValue()}`,
      );
    }

    this.context.push(
      IncreaseOperation.create(this.counter.getCreatedAt(), value, ticket),
    );

    return this;
  }
}
