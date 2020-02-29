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
import { Comparator } from '../../util/comparator';
import { ActorID, InitialActorID, MaxActorID } from './actor_id';

export const TicketComparator: Comparator<TimeTicket> = (p1: TimeTicket, p2: TimeTicket) => {
  return p1.compare(p2);
};

// Immutable
export class TimeTicket {
  private lamport: Long;
  private delimiter: number;
  private actorID: ActorID;

  constructor(lamport: Long, delimiter: number, actorID: string) {
    this.lamport = lamport;
    this.delimiter = delimiter;
    this.actorID = actorID;
  }

  public static of(lamport: Long, delimiter: number, actorID: string): TimeTicket {
    return new TimeTicket(lamport, delimiter, actorID);
  }

  public toIDString(): string {
    if (this.actorID == null) {
      return `${this.lamport.toString()}:nil:${this.delimiter}`;
    }
    return `${this.lamport.toString()}:${this.actorID}:${this.delimiter}`;
  }

  public getAnnotatedString(): string {
    if (this.actorID == null) {
      return `${this.lamport.toString()}:nil:${this.delimiter}`;
    }
    return `${this.lamport.toString()}:${this.actorID.substring(22, 24)}:${this.delimiter}`;
  }

  public setActor(actorID: ActorID): TimeTicket {
    return new TimeTicket(this.lamport, this.delimiter, actorID);
  }

  public getLamportAsString(): string {
    return this.lamport.toString();
  }

  public getDelimiter(): number {
    return this.delimiter;
  }

  public getActorID(): string {
    return this.actorID;
  }

  public after(other: TimeTicket): boolean {
    return this.compare(other) > 0;
  }

  public compare(other: TimeTicket): number {
    if (this.lamport.greaterThan(other.lamport)) {
      return 1;
    } else if (other.lamport.greaterThan(this.lamport)) {
      return -1;
    }

    const compare = this.actorID.localeCompare(other.actorID);
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
export const MaxDelemiter = 4294967295;
export const MaxLamport = Long.fromString('18446744073709551615', true);

export const InitialTimeTicket = new TimeTicket(Long.fromNumber(0, true), InitialDelimiter, InitialActorID);
export const MaxTimeTicket = new TimeTicket(MaxLamport, MaxDelemiter, MaxActorID);
