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

import Long from 'long';
import {ActorID, InitialActorID} from '../time/actor_id';
import {TimeTicket} from '../time/ticket';

/**
 * ChangeID is for identifying the Change. This is immutable.
 **/
export class ChangeID {
  private clientSeq: number;
  private lamport: Long;
  private actor: ActorID;

  constructor(clientSeq: number, lamport: Long, actor?: ActorID) {
    this.clientSeq = clientSeq;
    this.lamport = lamport;
    this.actor = typeof actor !== 'undefined' ? actor : null;
  }

  public static of(
    clientSeq: number,
    lamport: Long,
    actor?: ActorID
  ): ChangeID {
    return new ChangeID(clientSeq, lamport, actor);
  }

  public next(): ChangeID {
    return new ChangeID(this.clientSeq + 1, this.lamport.add(1), this.actor);
  }

  public syncLamport(otherLamport: Long): ChangeID {
    if (otherLamport.greaterThan(this.lamport)) {
      return new ChangeID(this.clientSeq, otherLamport, this.actor);
    }

    return new ChangeID(this.clientSeq, this.lamport.add(1), this.actor);
  }

  public createTimeTicket(delimiter: number): TimeTicket {
    return TimeTicket.of(this.lamport, delimiter, this.actor);
  }

  public setActor(actorID: ActorID): ChangeID {
    return new ChangeID(this.clientSeq, this.lamport, actorID);
  }

  public getClientSeq(): number {
    return this.clientSeq;
  }

  public getLamport(): Long {
    return this.lamport;
  }

  public getLamportAsString(): string {
    return this.lamport.toString();
  }

  public getActorID(): string {
    return this.actor;
  }

  public getAnnotatedString(): string {
    if (this.actor == null) {
      return `${this.lamport.toString()}:nil:${this.clientSeq}`;
    }
    return `${this.lamport.toString()}:${this.actor.substring(22, 24)}:${
      this.clientSeq
    }`;
  }
}

export const InitialChangeID = new ChangeID(
  0,
  Long.fromInt(0, true),
  InitialActorID
);
