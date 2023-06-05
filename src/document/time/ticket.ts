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
import { Comparator } from '@yorkie-js-sdk/src/util/comparator';
import {
  ActorID,
  InitialActorID,
  MaxActorID,
} from '@yorkie-js-sdk/src/document/time/actor_id';

export const TicketComparator: Comparator<TimeTicket> = (
  p1: TimeTicket,
  p2: TimeTicket,
) => {
  return p1.compare(p2);
};

/**
 * `TimeTicket` is a timestamp of the logical clock. Ticket is immutable.
 * It is created by `ChangeID`.
 *
 * @public
 */
export class TimeTicket {
  private lamport: Long;
  private delimiter: number;
  private actorID?: ActorID;

  /** @hideconstructor */
  constructor(lamport: Long, delimiter: number, actorID?: string) {
    this.lamport = lamport;
    this.delimiter = delimiter;
    this.actorID = actorID;
  }

  /**
   * `of` creates an instance of Ticket.
   */
  public static of(
    lamport: Long,
    delimiter: number,
    actorID?: string,
  ): TimeTicket {
    return new TimeTicket(lamport, delimiter, actorID);
  }

  /**
   * `toIDString` returns the lamport string for this Ticket.
   */
  public toIDString(): string {
    if (!this.actorID) {
      return `${this.lamport.toString()}:nil:${this.delimiter}`;
    }
    return `${this.lamport.toString()}:${this.actorID}:${this.delimiter}`;
  }

  /**
   * `getStructureAsString` returns a string containing the meta data of the ticket
   * for debugging purpose.
   */
  public getStructureAsString(): string {
    if (!this.actorID) {
      return `${this.lamport.toString()}:nil:${this.delimiter}`;
    }
    return `${this.lamport.toString()}:${this.actorID.slice(-2)}:${
      this.delimiter
    }`;
  }

  /**
   * `setActor` creates a new instance of Ticket with the given actorID.
   */
  public setActor(actorID: ActorID): TimeTicket {
    return new TimeTicket(this.lamport, this.delimiter, actorID);
  }

  /**
   * `getLamportAsString` returns the lamport string.
   */
  public getLamportAsString(): string {
    return this.lamport.toString();
  }

  /**
   * `getDelimiter` returns delimiter.
   */
  public getDelimiter(): number {
    return this.delimiter;
  }

  /**
   * `getActorID` returns actorID.
   */
  public getActorID(): string | undefined {
    return this.actorID;
  }

  /**
   * `after` returns whether the given ticket was created later.
   */
  public after(other: TimeTicket): boolean {
    return this.compare(other) > 0;
  }

  /**
   * `equals` returns whether the given ticket was created.
   */
  public equals(other: TimeTicket): boolean {
    return this.compare(other) === 0;
  }

  /**
   * `compare` returns an integer comparing two Ticket.
   *  The result will be 0 if id==other, -1 if `id < other`, and +1 if `id > other`.
   *  If the receiver or argument is nil, it would panic at runtime.
   */
  public compare(other: TimeTicket): number {
    if (this.lamport.greaterThan(other.lamport)) {
      return 1;
    } else if (other.lamport.greaterThan(this.lamport)) {
      return -1;
    }

    const compare = this.actorID!.localeCompare(other.actorID!);
    if (compare !== 0) {
      return compare;
    }

    if (this.delimiter > other.delimiter) {
      return 1;
    } else if (other.delimiter > this.delimiter) {
      return -1;
    }

    return 0;
  }
}

export const InitialDelimiter = 0;
export const MaxDelemiter = 4294967295; // UInt32 MAX_VALUE
export const MaxLamport = Long.MAX_VALUE;

export const InitialTimeTicket = new TimeTicket(
  Long.fromNumber(0),
  InitialDelimiter,
  InitialActorID,
);
export const MaxTimeTicket = new TimeTicket(
  MaxLamport,
  MaxDelemiter,
  MaxActorID,
);
