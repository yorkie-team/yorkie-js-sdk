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

import Long from 'long';

/**
 * `VersionVector` is a vector clock that is used to detect the relationship
 * between changes whether they are causally related or concurrent. It is
 * similar to vector clocks, but it is synced with lamport timestamp of the
 * change.
 */
export class VersionVector {
  private vector: Map<string, Long>;

  constructor(vector?: Map<string, Long>) {
    this.vector = vector || new Map();
  }

  /**
   * `set` sets the lamport timestamp of the given actor.
   */
  public set(actorID: string, lamport: Long): void {
    this.vector.set(actorID, lamport);
  }

  /**
   * `deepcopy` returns a deep copy of this `VersionVector`.
   */
  public deepcopy(): VersionVector {
    const copied = new Map<string, Long>();
    for (const [key, value] of this.vector) {
      copied.set(key, value);
    }
    return new VersionVector(copied);
  }

  /**
   * `max` returns new version vector which consists of max value of each vector
   */
  public max(other: Map<string, Long>): VersionVector {
    const maxVector = new Map<string, Long>();

    [...(this.vector || [])].forEach(([key, value]) => {
      const otherLamport = Long.isLong(other.get(key))
        ? (other.get(key) as Long)
        : Long.fromInt(0, true);

      value.greaterThan(otherLamport)
        ? maxVector.set(key, value)
        : maxVector.set(key, otherLamport);
    });

    [...(other || [])].forEach(([key, value]) => {
      const currentLamport = Long.isLong(this.vector.get(key))
        ? (this.vector.get(key) as Long)
        : Long.fromInt(0, true);

      value.greaterThan(currentLamport)
        ? maxVector.set(key, value)
        : maxVector.set(key, currentLamport);
    });

    return new VersionVector(maxVector);
  }

  /**
   * `getVector` returns vector
   */
  public getVector() {
    return this.vector;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<[string, Long]> {
    for (const [key, value] of this.vector) {
      yield [key, value];
    }
  }
}

/**
 * `InitialVersionVector` is the initial version vector.
 */
export const InitialVersionVector = new VersionVector(new Map());
