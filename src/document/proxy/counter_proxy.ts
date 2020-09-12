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

import { ChangeContext } from '../change/context';
import { JSONPrimitive } from '../json/primitive';
import { TimeTicket } from "../time/ticket";
import { IncreaseOperation } from "../operation/increase_operation";
import Long from 'long';
import {Counter} from "../json/counter";

/**
 * CounterProxy is a proxy representing Counter types.
 */
export class CounterProxy {
  private context: ChangeContext;
  private handlers: any;
  private counter: Counter;

  constructor(context: ChangeContext, counter: Counter) {
    this.context = context;
    this.counter = counter;
    this.handlers = {
      get: (
        target: JSONPrimitive,
        method: string | symbol,
        receiver: object,
      ): any => {
        if (method === 'getID') {
          return (): TimeTicket => {
            return target.getCreatedAt();
          }
        } else if (method === 'increase') {
          return (v: number | Long): CounterProxy => {
            return this.increase(v);
          }
        }

        return Reflect.get(target, method, receiver);
      },
    };
  }

  public static create(context: ChangeContext, target: Counter): Counter {
    const numberProxy = new CounterProxy(context, target);
    return new Proxy(target, numberProxy.getHandlers());
  }

  /**
   * Increase adds an increase operation.
   * Only numeric types are allowed as operand values.
   */
  public increase(v: number | Long): CounterProxy {
    const ticket = this.context.issueTimeTicket();
    const value = JSONPrimitive.of(v, ticket);
    if (!value.isNumericType()) {
      throw new TypeError(`Unsupported type of value: ${typeof value.getValue()}`);
    }

    this.context.push(
      IncreaseOperation.create(
        this.counter.getCreatedAt(),
        value,
        ticket
      )
    );

    return this;
  }

  public getHandlers(): any {
    return this.handlers;
  }
}
