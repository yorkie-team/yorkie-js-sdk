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
import { JSONElement } from '@yorkie-js-sdk/src/document/json/element';
import { JSONRoot } from '@yorkie-js-sdk/src/document/json/root';
import { JSONArray } from '@yorkie-js-sdk/src/document/json/array';
import { Operation } from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `AddOperation` is an operation representing adding an element to an Array.
 */
export class AddOperation extends Operation {
  private prevCreatedAt: TimeTicket;
  private value: JSONElement;

  constructor(
    parentCreatedAt: TimeTicket,
    prevCreatedAt: TimeTicket,
    value: JSONElement,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.prevCreatedAt = prevCreatedAt;
    this.value = value;
  }

  /**
   * `create` creates a new instance of AddOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    prevCreatedAt: TimeTicket,
    value: JSONElement,
    executedAt: TimeTicket,
  ): AddOperation {
    return new AddOperation(parentCreatedAt, prevCreatedAt, value, executedAt);
  }

  /**
   * `execute` executes this operation on the given document(`root`).
   */
  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof JSONArray) {
      const array = parentObject as JSONArray;
      const value = this.value.deepcopy();
      array.insertAfter(this.prevCreatedAt, value);
      root.registerElement(value, array);
    } else {
      if (!parentObject) {
        logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
      }

      logger.fatal(`fail to execute, only array can execute add`);
    }
  }

  /**
   * `getEffectedCreatedAt` returns the time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.value.getCreatedAt();
  }

  /**
   * `getAnnotatedString` returns a string containing the meta data.
   */
  public getAnnotatedString(): string {
    return `${this.getParentCreatedAt().getAnnotatedString()}.ADD`;
  }

  /**
   * `getPrevCreatedAt` returns the creation time of previous element.
   */
  public getPrevCreatedAt(): TimeTicket {
    return this.prevCreatedAt;
  }

  /**
   * `getValue` returns the value of this operation.
   */
  public getValue(): JSONElement {
    return this.value;
  }
}
