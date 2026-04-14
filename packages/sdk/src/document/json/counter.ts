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
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js/sdk/src/document/crdt/counter';
import type * as Devtools from '@yorkie-js/sdk/src/devtools/types';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `BaseCounter` is an internal base that holds the shared state and
 * initialization logic for Counter and DedupCounter. Not exported.
 */
class BaseCounter {
  protected valueType: CounterType;
  protected value: number | bigint;
  protected context?: ChangeContext;
  protected counter?: CRDTCounter;

  constructor(valueType: CounterType, value: number | bigint) {
    this.valueType = valueType;
    this.value = value;
  }

  /**
   * `initialize` links this proxy to a ChangeContext and CRDTCounter.
   */
  public initialize(context: ChangeContext, counter: CRDTCounter): void {
    this.valueType = counter.getValueType();
    this.context = context;
    this.counter = counter;
    this.value = counter.getValue();
  }

  /**
   * `getID` returns the ID of this counter.
   */
  public getID(): TimeTicket {
    return this.counter!.getID();
  }

  /**
   * `getValueType` returns the value type of this counter.
   */
  public getValueType(): CounterType {
    return this.valueType;
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

  /**
   * `ensureInitialized` throws if this counter has not been initialized.
   */
  protected ensureInitialized(): void {
    if (!this.context || !this.counter) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'Counter is not initialized yet',
      );
    }
  }
}

/**
 * `Counter` is a numeric counter that supports `increase()`.
 * For counting unique actors, use `DedupCounter` instead.
 *
 * ```typescript
 * // Type is inferred from value:
 * root.count = new Counter(0);           // Int
 * root.count = new Counter(0n);           // Long
 * ```
 */
export class Counter extends BaseCounter {
  constructor(value: number | bigint) {
    const type = typeof value === 'bigint' ? CounterType.Long : CounterType.Int;
    super(type, value);
  }

  /**
   * `getValue` returns the value of this counter.
   */
  public getValue(): number | bigint {
    return this.value;
  }

  /**
   * `increase` increases numeric data.
   */
  public increase(v: number | bigint): Counter {
    this.ensureInitialized();

    const ticket = this.context!.issueTimeTicket();
    const value = Primitive.of(v, ticket);
    if (!value.isNumericType()) {
      throw new TypeError(
        `Unsupported type of value: ${typeof value.getValue()}`,
      );
    }

    this.counter!.increase(value);
    this.context!.push(
      IncreaseOperation.create(this.counter!.getCreatedAt(), value, ticket),
    );

    return this;
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
export class DedupCounter extends BaseCounter {
  constructor() {
    super(CounterType.IntDedup, 0);
  }

  /**
   * `getValue` returns the value of this counter. Always a number since
   * DedupCounter only supports IntDedup.
   */
  public getValue(): number {
    return this.value as number;
  }

  /**
   * `add` records a unique actor in the dedup counter. If the actor has
   * already been counted, the call is ignored.
   */
  public add(actor: string): DedupCounter {
    this.ensureInitialized();
    if (!actor) {
      throw new YorkieError(Code.ErrInvalidArgument, 'actor is required');
    }

    const ticket = this.context!.issueTimeTicket();
    const value = Primitive.of(1, ticket);
    this.counter!.increaseDedup(value, actor);
    this.context!.push(
      IncreaseOperation.create(
        this.counter!.getCreatedAt(),
        value,
        ticket,
        actor,
      ),
    );

    return this;
  }
}

/**
 * `isCounter` returns true if the value is a Counter or DedupCounter.
 * Used internally to detect counter instances during document updates.
 */
export function isCounter(value: unknown): value is Counter | DedupCounter {
  return value instanceof Counter || value instanceof DedupCounter;
}
