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

import { Operation } from './operation';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from '../json/element';
import { JSONRoot } from '../json/root';
import { JSONPrimitive } from '../json/primitive';
import { logger } from '../../util/logger';
import { Counter } from '../json/counter';

/**
 * Increase can be used to increment data of numerical type.
 * It can be used in Counter type.
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

  public static create(
    parentCreatedAt: TimeTicket,
    value: JSONElement,
    executedAt: TimeTicket,
  ): IncreaseOperation {
    return new IncreaseOperation(parentCreatedAt, value, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof Counter) {
      const counter = parentObject as Counter;
      const value = this.value.deepcopy() as JSONPrimitive;
      counter.increase(value);
    } else {
      logger.fatal(`fail to execute, only Counter can execute increase`);
    }
  }

  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  public getAnnotatedString(): string {
    return `${this.getParentCreatedAt().getAnnotatedString()}.INCREASE`;
  }

  public getValue(): JSONElement {
    return this.value;
  }
}
