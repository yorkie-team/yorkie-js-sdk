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
import {
  ActorID,
  InitialActorID,
} from '@yorkie-js-sdk/src/document/time/actor_id';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

/**
 * `ChangeID` is for identifying the Change. This is immutable.
 */
export class ChangeID {
  private clientSeq: number;

  // `serverSeq` is optional and only present for changes stored on the server.
  private serverSeq?: Long;

  private lamport: Long;
  private actor?: ActorID;

  constructor(clientSeq: number, lamport: Long, actor?: ActorID) {
    this.clientSeq = clientSeq;
    this.lamport = lamport;
    this.actor = actor;
  }

  /**
   * `of` creates a new instance of ChangeID.
   */
  public static of(
    clientSeq: number,
    lamport: Long,
    actor?: ActorID,
  ): ChangeID {
    return new ChangeID(clientSeq, lamport, actor);
  }

  /**
   * `next` creates a next ID of this ID.
   */
  public next(): ChangeID {
    return new ChangeID(this.clientSeq + 1, this.lamport.add(1), this.actor);
  }

  /**
   * `syncLamport` syncs lamport timestamp with the given ID.
   *
   * {@link https://en.wikipedia.org/wiki/Lamport_timestamps#Algorithm}
   */
  public syncLamport(otherLamport: Long): ChangeID {
    if (otherLamport.greaterThan(this.lamport)) {
      return new ChangeID(this.clientSeq, otherLamport, this.actor);
    }

    return new ChangeID(this.clientSeq, this.lamport.add(1), this.actor);
  }

  /**
   * `createTimeTicket` creates a ticket of the given delimiter.
   */
  public createTimeTicket(delimiter: number): TimeTicket {
    return TimeTicket.of(this.lamport, delimiter, this.actor);
  }

  /**
   * `setActor` sets the given actor.
   */
  public setActor(actorID: ActorID): ChangeID {
    return new ChangeID(this.clientSeq, this.lamport, actorID);
  }

  /**
   * `getClientSeq` returns the client sequence of this ID.
   */
  public getClientSeq(): number {
    return this.clientSeq;
  }

  /**
   * `getLamport` returns the lamport clock of this ID.
   */
  public getLamport(): Long {
    return this.lamport;
  }

  /**
   * `getLamportAsString` returns the lamport clock of this ID as a string.
   */
  public getLamportAsString(): string {
    return this.lamport.toString();
  }

  /**
   * `getActorID` returns the actor of this ID.
   */
  public getActorID(): string | undefined {
    return this.actor;
  }

  /**
   * `toTestString` returns a string containing the meta data of this ID.
   */
  public toTestString(): string {
    if (!this.actor) {
      return `${this.lamport.toString()}:nil:${this.clientSeq}`;
    }
    return `${this.lamport.toString()}:${this.actor.substring(22, 24)}:${
      this.clientSeq
    }`;
  }
}

/**
 * `InitialChangeID` represents the initial state ID. Usually this is used to
 * represent a state where nothing has been edited.
 */
export const InitialChangeID = new ChangeID(
  0,
  Long.fromInt(0, true),
  InitialActorID,
);
