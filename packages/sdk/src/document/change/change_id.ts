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

import {
  ActorID,
  InitialActorID,
} from '@yorkie-js/sdk/src/document/time/actor_id';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { InitialVersionVector, VersionVector } from '../time/version_vector';

/**
 * `ChangeID` is for identifying the Change. This is immutable.
 */
export class ChangeID {
  // `clientSeq` is the sequence number of the client that created this change.
  private clientSeq: number;

  // `serverSeq` is optional and only present for changes stored on the server.
  private serverSeq?: bigint;

  // `actor` is the creator of this change.
  private actor: ActorID;

  // `lamport` is the lamport clock of this change. This is used to determine
  // the order of changes in logical time.
  private lamport: bigint;

  // `versionVector` is the vector clock of this change. This is used to
  // determine the relationship is causal or not between changes.
  private versionVector: VersionVector;

  constructor(
    clientSeq: number,
    lamport: bigint,
    actor: ActorID,
    vector: VersionVector,
    serverSeq?: bigint,
  ) {
    this.clientSeq = clientSeq;
    this.serverSeq = serverSeq;
    this.lamport = lamport;
    this.versionVector = vector;
    this.actor = actor;
  }

  /**
   * `hasClocks` returns true if this ID has logical clocks.
   */
  public hasClocks(): boolean {
    return this.versionVector.size() > 0;
  }

  /**
   * `of` creates a new instance of ChangeID.
   */
  public static of(
    clientSeq: number,
    lamport: bigint,
    actor: ActorID,
    vector: VersionVector,
    serverSeq?: bigint,
  ): ChangeID {
    return new ChangeID(clientSeq, lamport, actor, vector, serverSeq);
  }

  /**
   * `next` creates a next ID of this ID.
   */
  public next(withoutLogicalClock = false): ChangeID {
    if (withoutLogicalClock) {
      return new ChangeID(
        this.clientSeq + 1,
        this.lamport,
        this.actor,
        this.versionVector,
        this.serverSeq,
      );
    }

    const vector = this.versionVector.deepcopy();
    vector.set(this.actor, this.lamport + 1n);

    return new ChangeID(
      this.clientSeq + 1,
      this.lamport + 1n,
      this.actor,
      vector,
    );
  }

  /**
   * `syncClocks` syncs logical clocks with the given ID. If the given ID
   * doesn't have logical clocks, this ID is returned.
   */
  public syncClocks(other: ChangeID): ChangeID {
    if (!other.hasClocks()) {
      return this;
    }

    const lamport =
      other.lamport > this.lamport ? other.lamport + 1n : this.lamport + 1n;

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
  public setClocks(otherLamport: bigint, vector: VersionVector): ChangeID {
    const lamport =
      otherLamport > this.lamport ? otherLamport + 1n : this.lamport + 1n;

    // NOTE(chacha912): Documents created by server may have an InitialActorID
    // in their version vector. Although server is not an actual client, it
    // generates document snapshots from changes by participating with an
    // InitialActorID during document instance creation and accumulating stored
    // changes in DB.
    // Semantically, including a non-client actor in version vector is
    // problematic. To address this, we remove the InitialActorID from snapshots.
    vector.unset(InitialActorID);

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
   * `setVersionVector` sets the given version vector.
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
  public getLamport(): bigint {
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

  /**
   * `deepcopy` creates a new instance of ChangeID.
   */
  public deepcopy(excludeVersionVector: boolean): ChangeID {
    if (excludeVersionVector) {
      return new ChangeID(
        this.clientSeq,
        this.lamport,
        this.actor,
        InitialVersionVector,
        this.serverSeq,
      );
    }

    return new ChangeID(
      this.clientSeq,
      this.lamport,
      this.actor,
      this.versionVector.deepcopy(),
      this.serverSeq,
    );
  }
}

/**
 * `InitialChangeID` represents the initial state ID. Usually this is used to
 * represent a state where nothing has been edited.
 */
export const InitialChangeID = new ChangeID(
  0,
  0n,
  InitialActorID,
  InitialVersionVector,
);
