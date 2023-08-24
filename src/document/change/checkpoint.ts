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

/**
 * `Checkpoint` is used to determine the changes sent and received by the
 * client. This is immutable.
 *
 * @internal
 **/
export class Checkpoint {
  private serverSeq: Long;
  private clientSeq: number;

  constructor(serverSeq: Long, clientSeq: number) {
    this.serverSeq = serverSeq;
    this.clientSeq = clientSeq;
  }

  /**
   * `of` creates a new instance of Checkpoint.
   */
  public static of(serverSeq: Long, clientSeq: number): Checkpoint {
    return new Checkpoint(serverSeq, clientSeq);
  }

  /**
   * `increaseClientSeq` creates a new instance with increased client sequence.
   */
  public increaseClientSeq(inc: number): Checkpoint {
    if (inc === 0) {
      return this;
    }

    return new Checkpoint(this.serverSeq, this.clientSeq + inc);
  }

  /**
   * `forward` creates a new instance with the given checkpoint if it is
   * greater than the values of internal properties.
   */
  public forward(other: Checkpoint): Checkpoint {
    if (this.equals(other)) {
      return this;
    }

    const serverSeq = this.serverSeq.greaterThan(other.serverSeq)
      ? this.serverSeq
      : other.serverSeq;
    const clientSeq = Math.max(this.clientSeq, other.clientSeq);
    return Checkpoint.of(serverSeq, clientSeq);
  }

  /**
   * `getServerSeqAsString` returns the server seq of this checkpoint as a
   * string.
   */
  public getServerSeqAsString(): string {
    return this.serverSeq.toString();
  }

  /**
   * `getClientSeq` returns the client seq of this checkpoint.
   */
  public getClientSeq(): number {
    return this.clientSeq;
  }

  /**
   * `getServerSeq` returns the server seq of this checkpoint.
   */
  public getServerSeq(): Long {
    return this.serverSeq;
  }

  /**
   * `equals` returns whether the given checkpoint is equal to this checkpoint
   * or not.
   */
  public equals(other: Checkpoint): boolean {
    return (
      this.clientSeq === other.clientSeq &&
      this.serverSeq.equals(other.serverSeq)
    );
  }

  /**
   * `toTestString` returns a string containing the meta data of this
   * checkpoint.
   */
  public toTestString(): string {
    return `serverSeq=${this.serverSeq}, clientSeq=${this.clientSeq}`;
  }
}

/**
 * `InitialCheckpoint` is the initial value of the checkpoint.
 */
export const InitialCheckpoint = new Checkpoint(Long.fromInt(0, true), 0);
