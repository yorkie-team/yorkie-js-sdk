/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { TimeTicket } from './ticket';

/**
 * `VersionVector` is a vector clock that is used to detect the relationship
 * between changes whether they are causally related or concurrent. It is
 * similar to vector clocks, but it is synced with lamport timestamp of the
 * change.
 */
export class VersionVector {
  private vector: Map<string, bigint>;

  constructor(vector?: Map<string, bigint>) {
    this.vector = vector || new Map();
  }

  /**
   * `set` sets the lamport timestamp of the given actor.
   */
  public set(actorID: string, lamport: bigint): void {
    this.vector.set(actorID, lamport);
  }

  /**
   * `get` gets the lamport timestamp of the given actor.
   */
  public get(actorID: string): bigint | undefined {
    return this.vector.get(actorID);
  }

  /**
   * `maxLamport` returns max lamport value from vector
   */
  public maxLamport() {
    let max = BigInt(0);

    for (const [, lamport] of this) {
      if (lamport > max) {
        max = lamport;
      }
    }

    return max;
  }

  /**
   * `max` returns new version vector which consists of max value of each vector
   */
  public max(other: VersionVector): VersionVector {
    const maxVector = new Map<string, bigint>();

    for (const [actorID, lamport] of other) {
      const currentLamport = this.vector.get(actorID);
      const maxLamport = currentLamport
        ? currentLamport > lamport
          ? currentLamport
          : lamport
        : lamport;

      maxVector.set(actorID, maxLamport);
    }

    for (const [actorID, lamport] of this) {
      const otherLamport = other.get(actorID);
      const maxLamport = otherLamport
        ? otherLamport > lamport
          ? otherLamport
          : lamport
        : lamport;

      maxVector.set(actorID, maxLamport);
    }

    return new VersionVector(maxVector);
  }

  /**
   * `afterOrEqual` returns vector[other.actorID] is greaterOrEqual than given ticket's lamport
   */
  public afterOrEqual(other: TimeTicket) {
    const lamport = this.vector.get(other.getActorID());

    if (lamport === undefined) {
      return false;
    }

    return lamport >= other.getLamport();
  }

  /**
   * `deepcopy` returns a deep copy of this `VersionVector`.
   */
  public deepcopy(): VersionVector {
    const copied = new Map<string, bigint>();
    for (const [key, value] of this.vector) {
      copied.set(key, value);
    }
    return new VersionVector(copied);
  }

  /**
   * `filter` returns new version vector consist of filter's actorID.
   */
  public filter(versionVector: VersionVector) {
    const filtered = new Map<string, bigint>();

    for (const [actorID] of versionVector) {
      const lamport = this.vector.get(actorID);

      if (lamport !== undefined) {
        filtered.set(actorID, lamport);
      }
    }

    return new VersionVector(filtered);
  }

  /**
   * `size` returns size of version vector
   */
  public size(): number {
    return this.vector.size;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<[string, bigint]> {
    for (const [key, value] of this.vector) {
      yield [key, value];
    }
  }
}

/**
 * `InitialVersionVector` is the initial version vector.
 */
export const InitialVersionVector = new VersionVector(new Map());
