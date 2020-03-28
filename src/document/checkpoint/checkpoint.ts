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
 * Checkpoint is used to determine the changes sent and received by the client.
 **/
export class Checkpoint {
  private serverSeq: Long;
  private clientSeq: number;

  constructor(serverSeq: Long, clientSeq: number) {
    this.serverSeq = serverSeq;
    this.clientSeq = clientSeq;
  }

  public static of(serverSeq: Long, clientSeq: number): Checkpoint {
    return new Checkpoint(serverSeq, clientSeq);
  }

  public increaseClientSeq(inc: number): Checkpoint {
    if (inc === 0) {
      return this;
    }

    return new Checkpoint(this.serverSeq, this.clientSeq + inc);
  }

  public forward(other: Checkpoint): Checkpoint {
    if (this.clientSeq == other.clientSeq &&
      this.serverSeq.equals(other.serverSeq)) {
      return this;
    }

    const serverSeq = this.serverSeq.greaterThan(other.serverSeq)
      ? this.serverSeq : other.serverSeq;
    const clientSeq = Math.max(this.clientSeq, other.clientSeq);
    return Checkpoint.of(serverSeq, clientSeq)
  }

  public getServerSeqAsString(): string {
    return this.serverSeq.toString();
  }

  public getClientSeq(): number {
    return this.clientSeq;
  }

  public getServerSeq(): Long {
    return this.serverSeq;
  }

  public equals(other: Checkpoint): boolean {
    return this.clientSeq === other.clientSeq &&
      this.serverSeq.equals(other.serverSeq);
  }

  public getAnnotatedString(): string {
    return `serverSeq=${this.serverSeq}, clientSeq=${this.clientSeq}`;
  }
}

export const InitialCheckpoint = new Checkpoint(Long.fromInt(0, true), 0);
