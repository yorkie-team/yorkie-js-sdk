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

import {ActorID} from '../time/actor_id';
import {TimeTicket} from '../time/ticket';
import {JSONRoot} from '../json/root';

export abstract class Operation {
  private parentCreatedAt: TimeTicket;
  private executedAt: TimeTicket;

  constructor(parentCreatedAt: TimeTicket, executedAt: TimeTicket) {
    this.parentCreatedAt = parentCreatedAt;
    this.executedAt = executedAt;
  }

  public getParentCreatedAt(): TimeTicket {
    return this.parentCreatedAt;
  }

  public getExecutedAt(): TimeTicket {
    return this.executedAt;
  }

  public setActor(actorID: ActorID): void {
    this.executedAt = this.executedAt.setActor(actorID);
  }

  public abstract getAnnotatedString(): string;
  public abstract execute(root: JSONRoot): void;
}
