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

import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONRoot } from '../json/root';
import { Operation } from './operation';
import { JSONContainer } from '../json/element';

export class RemoveOperation extends Operation {
  private createdAt: TimeTicket;

  constructor(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.createdAt = createdAt;
  }

  public static create(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): RemoveOperation {
    return new RemoveOperation(parentCreatedAt, createdAt, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof JSONContainer) {
      const obj = parentObject;
      const elem = obj.delete(this.createdAt, this.getExecutedAt());
      root.registerRemovedElement(elem);
    } else {
      logger.fatal(`only object and array can execute remove: ${parentObject}`);
    }
  }

  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  public getAnnotatedString(): string {
    return `${this.getParentCreatedAt().getAnnotatedString()}.REMOVE`;
  }

  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }
}
