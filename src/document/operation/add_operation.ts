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

import {logger} from '../../util/logger';
import {TimeTicket} from '../time/ticket';
import {JSONElement} from '../json/element';
import {JSONRoot} from '../json/root';
import {JSONArray} from '../json/array';
import {Operation} from './operation';

export class AddOperation extends Operation {
  private prevCreatedAt: TimeTicket;
  private value: JSONElement;

  constructor(
    parentCreatedAt: TimeTicket,
    prevCreatedAt: TimeTicket,
    value: JSONElement,
    executedAt: TimeTicket
  ) {
    super(parentCreatedAt, executedAt);
    this.prevCreatedAt = prevCreatedAt;
    this.value = value;
  }

  public static create(
    parentCreatedAt: TimeTicket,
    prevCreatedAt: TimeTicket,
    value: JSONElement,
    executedAt: TimeTicket
  ): AddOperation {
    return new AddOperation(parentCreatedAt, prevCreatedAt, value, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof JSONArray) {
      const array = parentObject as JSONArray;
      const value = this.value.deepcopy();
      array.insertAfter(this.prevCreatedAt, value);
      root.registerElement(value);
    } else {
      logger.fatal(`fail to execute, only array can execute add`);
    }
  }

  public getAnnotatedString(): string {
    return `${this.getParentCreatedAt().getAnnotatedString()}.ADD`;
  }

  public getPrevCreatedAt(): TimeTicket {
    return this.prevCreatedAt;
  }

  public getValue(): JSONElement {
    return this.value;
  }
}
