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

import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { IncreaseOperation } from '@yorkie-js/sdk/src/document/operation/increase_operation';
import Long from 'long';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js/sdk/src/document/crdt/counter';
import type * as Devtools from '@yorkie-js/sdk/src/devtools/types';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

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
   * `increase` increases numeric data. Only valid for normal (non-dedup) counters.
   */
  public increase(v: number | Long): Counter {
    if (!this.context || !this.counter) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Counter is not initialized yet',
      );
    }
    if (this.counter.isDedup()) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'dedup counter does not support increase(), use add(actor)',
      );
    }

    const ticket = this.context.issueTimeTicket();
    const value = Primitive.of(v, ticket);
    if (!value.isNumericType()) {
      throw new TypeError(
        `Unsupported type of value: ${typeof value.getValue()}`,
      );
    }

    this.counter.increase(value);
    this.context.push(
      IncreaseOperation.create(this.counter.getCreatedAt(), value, ticket),
    );

    return this;
  }

  /**
   * `add` records a unique actor in the dedup counter. If the actor has
   * already been counted, the call is ignored. Only valid for dedup counters.
   */
  public add(actor: string): Counter {
    if (!this.context || !this.counter) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Counter is not initialized yet',
      );
    }
    if (!this.counter.isDedup()) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'add() is only supported on dedup counters',
      );
    }
    if (!actor) {
      throw new YorkieError(Code.ErrInvalidArgument, 'actor is required');
    }

    const ticket = this.context.issueTimeTicket();
    const value = Primitive.of(1, ticket);
    this.counter.increaseDedup(value, actor);
    this.context.push(
      IncreaseOperation.create(
        this.counter.getCreatedAt(),
        value,
        ticket,
        actor,
      ),
    );

    return this;
  }

  /**
   * `isDedup` returns whether this counter is a dedup counter.
   */
  public isDedup(): boolean {
    return this.counter?.isDedup() ?? false;
  }

  /**
   * `toJSForTest` returns value with meta data for testing.
   */
  public toJSForTest(): Devtools.JSONElement {
    if (!this.context || !this.counter) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Counter is not initialized yet',
      );
    }

    return this.counter.toJSForTest();
  }
}

/**
 * `DedupCounter` is a Counter that uses HyperLogLog to count unique actors.
 * Use `add(actor)` to record a unique visitor. Provides approximate counts
 * with ~2% error rate.
 *
 * ```typescript
 * doc.update((root) => {
 *   root.uv = new yorkie.DedupCounter();
 *   root.uv.add(userId);
 * });
 * ```
 */
export class DedupCounter extends Counter {
  constructor() {
    super(CounterType.IntDedup, 0);
  }
}
