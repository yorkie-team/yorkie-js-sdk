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
import { InitialVersionVector, VersionVector } from '../time/version_vector';

/**
 * `ChangeID` is for identifying the Change. This is immutable.
 */
export class ChangeID {
  // `clientSeq` is the sequence number of the client that created this change.
  private clientSeq: number;
  // `serverSeq` is optional and only present for changes stored on the server.
  private serverSeq?: Long;
  // `lamport` and `actor` are the lamport clock and the actor of this change.
  // This is used to determine the order of changes in logical time.
  private lamport: Long;
  private actor: ActorID;
  // `versionVector` is the vector clock of this change. This is used to
  // determine the relationship is causal or not between changes.
  private versionVector: VersionVector;

  constructor(
    clientSeq: number,
    lamport: Long,
    actor: ActorID,
    vector: VersionVector,
    serverSeq?: Long,
  ) {
    this.clientSeq = clientSeq;
    this.serverSeq = serverSeq;
    this.lamport = lamport;
    this.versionVector = vector;
    this.actor = actor;
  }

  /**
   * `of` creates a new instance of ChangeID.
   */
  public static of(
    clientSeq: number,
    lamport: Long,
    actor: ActorID,
    vector: VersionVector,
    serverSeq?: Long,
  ): ChangeID {
    return new ChangeID(clientSeq, lamport, actor, vector, serverSeq);
  }

  /**
   * `next` creates a next ID of this ID.
   */
  public next(): ChangeID {
    const vector = this.versionVector.deepcopy();
    vector.set(this.actor, this.lamport.add(1));

    return new ChangeID(
      this.clientSeq + 1,
      this.lamport.add(1),
      this.actor,
      vector,
    );
  }

  /**
   * `syncClocks` syncs logical clocks with the given ID.
   */
  public syncClocks(other: ChangeID): ChangeID {
    const lamport = other.lamport.greaterThan(this.lamport)
      ? other.lamport.add(1)
      : this.lamport.add(1);
    const maxVersionVector = this.versionVector.max(other.versionVector);

    const newID = new ChangeID(
      this.clientSeq,
      lamport,
      this.actor,
      maxVersionVector,
    );
    newID.versionVector.set(this.actor, lamport);
    return newID;
  }

  /**
   * `setClocks` sets the given clocks to this ID. This is used when the snapshot
   * is given from the server.
   */
  public setClocks(otherLamport: Long, vector: VersionVector): ChangeID {
    const lamport = otherLamport.greaterThan(this.lamport)
      ? otherLamport
      : this.lamport.add(1);
    const maxVersionVector = this.versionVector.max(vector);
    maxVersionVector.set(this.actor, lamport);

    return ChangeID.of(this.clientSeq, lamport, this.actor, maxVersionVector);
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
    return new ChangeID(
      this.clientSeq,
      this.lamport,
      actorID,
      this.versionVector,
      this.serverSeq,
    );
  }

  /**
   * `setVersionVector` sets the given actor.
   */
  public setVersionVector(versionVector: VersionVector): ChangeID {
    return new ChangeID(
      this.clientSeq,
      this.lamport,
      this.actor,
      versionVector,
      this.serverSeq,
    );
  }

  /**
   * `getClientSeq` returns the client sequence of this ID.
   */
  public getClientSeq(): number {
    return this.clientSeq;
  }

  /**
   * `getServerSeq` returns the server sequence of this ID.
   */
  public getServerSeq(): string {
    if (this.serverSeq) {
      return this.serverSeq.toString();
    }
    return '';
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
  public getActorID(): string {
    return this.actor;
  }

  /**
   * `getVersionVector` returns the version vector of this ID.
   */
  public getVersionVector(): VersionVector {
    return this.versionVector;
  }

  /**
   * `toTestString` returns a string containing the meta data of this ID.
   */
  public toTestString(): string {
    return `${this.lamport.toString()}:${this.actor.slice(-2)}:${
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
  InitialVersionVector,
);
