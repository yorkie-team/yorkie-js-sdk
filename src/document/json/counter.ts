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
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { Primitive } from '@yorkie-js-sdk/src/document/crdt/primitive';
import { IncreaseOperation } from '@yorkie-js-sdk/src/document/operation/increase_operation';
import Long from 'long';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js-sdk/src/document/crdt/counter';

/**
 * `Counter` is a custom data type that is used to counter.
 */
export class Counter {
  private valueType: CounterType;
  private value: number | Long;
  private context?: ChangeContext;
  private counter?: CRDTCounter;

  constructor(valueType: CounterType, value: number | Long) {
    this.valueType = valueType;
    this.value = value;
  }

  /**
   * `initialize` initialize this text with context and internal text.
   * @internal
   */
  public initialize(context: ChangeContext, counter: CRDTCounter): void {
    this.valueType = counter.getValueType();
    this.context = context;
    this.counter = counter;
    this.value = counter.getValue();
  }

  /**
   * `getID` returns the ID of this text.
   */
  public getID(): TimeTicket {
    return this.counter!.getID();
  }

  /**
   * `getValue` returns the value of this counter;
   * @internal
   */
  public getValue(): number | Long {
    return this.value;
  }

  /**
   * `getValueType` returns the value type of this counter.
   */
  public getValueType(): CounterType {
    return this.valueType;
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
    const value = Primitive.of(v, ticket);
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
