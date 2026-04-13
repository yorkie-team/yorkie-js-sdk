/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

const hllPrecision = 14;
const hllRegisterCount = 1 << hllPrecision;

/**
 * `HLL` is a HyperLogLog implementation used for approximate cardinality
 * estimation in Counter dedup mode. It uses FNV-1a 64-bit hashing and
 * precision 14 (16384 registers).
 *
 * NOTE: This implementation uses FNV-1a (not xxhash like the Go server) because
 * the HLL registers are NOT synced between Go and JS — each side maintains its
 * own HLL independently. The hash only needs to be consistent within the same
 * runtime.
 */
export class HLL {
  private registers: Uint8Array;

  constructor() {
    this.registers = new Uint8Array(hllRegisterCount);
  }

  /**
   * `add` adds a value to the HLL and returns true if the register was updated.
   */
  public add(value: string): boolean {
    const hash = this.hash(value);
    const idx = Number(hash >> BigInt(64 - hllPrecision));
    const remaining =
      (hash << BigInt(hllPrecision)) | (1n << BigInt(hllPrecision - 1));
    const rho = this.countLeadingZeros(remaining) + 1;
    if (rho > this.registers[idx]) {
      this.registers[idx] = rho;
      return true;
    }
    return false;
  }

  /**
   * `count` returns the approximate cardinality estimate.
   */
  public count(): number {
    const m = hllRegisterCount;
    const alpha = 0.7213 / (1.0 + 1.079 / m);
    let sum = 0;
    let zeros = 0;
    for (let i = 0; i < m; i++) {
      sum += Math.pow(2, -this.registers[i]);
      if (this.registers[i] === 0) zeros++;
    }
    let estimate = (alpha * m * m) / sum;
    if (estimate <= 2.5 * m && zeros > 0) {
      estimate = m * Math.log(m / zeros);
    }
    return Math.round(estimate);
  }

  /**
   * `merge` merges another HLL into this one by taking the max of each register.
   */
  public merge(other: HLL): void {
    for (let i = 0; i < hllRegisterCount; i++) {
      if (other.registers[i] > this.registers[i]) {
        this.registers[i] = other.registers[i];
      }
    }
  }

  /**
   * `toBytes` serializes the HLL registers to a byte array.
   */
  public toBytes(): Uint8Array {
    return new Uint8Array(this.registers);
  }

  /**
   * `restore` restores the HLL registers from a byte array.
   */
  public restore(data: Uint8Array): void {
    this.registers.set(data);
  }

  /**
   * `hash` computes a FNV-1a 64-bit hash of the given string.
   */
  private hash(value: string): bigint {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < value.length; i++) {
      h ^= BigInt(value.charCodeAt(i));
      h = BigInt.asUintN(64, h * prime);
    }
    return h;
  }

  /**
   * `countLeadingZeros` counts the number of leading zero bits in a 64-bit integer.
   */
  private countLeadingZeros(x: bigint): number {
    if (x === 0n) return 64;
    let n = 0;
    while ((x & (1n << 63n)) === 0n) {
      n++;
      x <<= 1n;
    }
    return n;
  }
}
