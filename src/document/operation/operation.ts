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

import { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';

/**
 * `Operation` represents an operation to be executed on a document.
 */
export abstract class Operation {
  private parentCreatedAt: TimeTicket;
  private executedAt: TimeTicket;

  constructor(parentCreatedAt: TimeTicket, executedAt: TimeTicket) {
    this.parentCreatedAt = parentCreatedAt;
    this.executedAt = executedAt;
  }

  /**
   * `getParentCreatedAt` returns the creation time of the target element to
   * execute the operation.
   */
  public getParentCreatedAt(): TimeTicket {
    return this.parentCreatedAt;
  }

  /**
   * `getExecutedAt` returns execution time of this operation.
   */
  public getExecutedAt(): TimeTicket {
    return this.executedAt;
  }

  /**
   * `setActor` sets the given actor to this operation.
   */
  public setActor(actorID: ActorID): void {
    this.executedAt = this.executedAt.setActor(actorID);
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public abstract getEffectedCreatedAt(): TimeTicket;

  /**
   * `getStructureAsString` returns a string containing the meta data.
   */
  public abstract getStructureAsString(): string;

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public abstract execute(root: CRDTRoot): void;
}
