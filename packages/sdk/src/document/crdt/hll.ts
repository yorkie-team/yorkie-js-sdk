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

// xxhash64 constants
const prime64x1 = 0x9e3779b185ebca87n;
const prime64x2 = 0xc2b2ae3d27d4eb4fn;
const prime64x3 = 0x165667b19e3779f9n;
const prime64x4 = 0x85ebca77c2b2ae63n;
const prime64x5 = 0x27d4eb2f165667c5n;
const mask64 = 0xffffffffffffffffn;

/**
 * `HLL` is a HyperLogLog implementation used for approximate cardinality
 * estimation in Counter dedup mode. It uses xxhash64 hashing (matching the
 * Go server) and precision 14 (16384 registers, ~16KB, ~2% error).
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
    const hash = xxhash64(value);
    const idx = Number(hash >> BigInt(64 - hllPrecision));
    const remaining =
      ((hash << BigInt(hllPrecision)) & mask64) |
      (1n << BigInt(hllPrecision - 1));
    const rho = countLeadingZeros64(remaining) + 1;
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
   * This operation is commutative, associative, and idempotent.
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
   * Throws if the data length does not match the register count.
   */
  public restore(data: Uint8Array): void {
    if (data.length !== hllRegisterCount) {
      throw new Error(
        `invalid HLL register payload: got ${data.length} bytes, want ${hllRegisterCount}`,
      );
    }
    this.registers.set(data);
  }
}

/**
 * `xxhash64` computes a 64-bit xxHash of the given string with seed 0.
 * This implementation produces identical output to Go's cespare/xxhash/v2.
 */
function xxhash64(input: string): bigint {
  const buf = new TextEncoder().encode(input);
  const len = buf.length;
  let h64: bigint;
  let offset = 0;
  const seed = 0n;

  if (len >= 32) {
    let v1 = (seed + prime64x1 + prime64x2) & mask64;
    let v2 = (seed + prime64x2) & mask64;
    let v3 = seed;
    let v4 = (seed - prime64x1) & mask64;

    while (offset <= len - 32) {
      v1 = xxRound(v1, readU64LE(buf, offset));
      offset += 8;
      v2 = xxRound(v2, readU64LE(buf, offset));
      offset += 8;
      v3 = xxRound(v3, readU64LE(buf, offset));
      offset += 8;
      v4 = xxRound(v4, readU64LE(buf, offset));
      offset += 8;
    }

    h64 =
      (rotl64(v1, 1n) + rotl64(v2, 7n) + rotl64(v3, 12n) + rotl64(v4, 18n)) &
      mask64;
    h64 = xxMergeRound(h64, v1);
    h64 = xxMergeRound(h64, v2);
    h64 = xxMergeRound(h64, v3);
    h64 = xxMergeRound(h64, v4);
  } else {
    h64 = (seed + prime64x5) & mask64;
  }

  h64 = (h64 + BigInt(len)) & mask64;

  while (offset + 8 <= len) {
    const k1 = xxRound(0n, readU64LE(buf, offset));
    h64 = (rotl64(h64 ^ k1, 27n) * prime64x1 + prime64x4) & mask64;
    offset += 8;
  }

  if (offset + 4 <= len) {
    h64 = h64 ^ ((readU32LE(buf, offset) * prime64x1) & mask64);
    h64 = (rotl64(h64, 23n) * prime64x2 + prime64x3) & mask64;
    offset += 4;
  }

  while (offset < len) {
    h64 = h64 ^ ((BigInt(buf[offset]) * prime64x5) & mask64);
    h64 = (rotl64(h64, 11n) * prime64x1) & mask64;
    offset++;
  }

  h64 = ((h64 ^ (h64 >> 33n)) * prime64x2) & mask64;
  h64 = ((h64 ^ (h64 >> 29n)) * prime64x3) & mask64;
  h64 = (h64 ^ (h64 >> 32n)) & mask64;

  return h64;
}

/** `rotl64` rotates a 64-bit value left by r bits. */
function rotl64(x: bigint, r: bigint): bigint {
  return ((x << r) | (x >> (64n - r))) & mask64;
}

/** `xxRound` performs a single xxhash64 accumulator round. */
function xxRound(acc: bigint, input: bigint): bigint {
  acc = (acc + input * prime64x2) & mask64;
  acc = rotl64(acc, 31n);
  return (acc * prime64x1) & mask64;
}

/** `xxMergeRound` merges an accumulator lane into the final hash. */
function xxMergeRound(acc: bigint, val: bigint): bigint {
  val = xxRound(0n, val);
  acc = (acc ^ val) & mask64;
  return (acc * prime64x1 + prime64x4) & mask64;
}

/** `readU64LE` reads a little-endian 64-bit integer from a byte array. */
function readU64LE(buf: Uint8Array, offset: number): bigint {
  let val = 0n;
  for (let i = 7; i >= 0; i--) {
    val = (val << 8n) | BigInt(buf[offset + i]);
  }
  return val;
}

/** `readU32LE` reads a little-endian 32-bit integer from a byte array. */
function readU32LE(buf: Uint8Array, offset: number): bigint {
  return (
    BigInt(buf[offset]) |
    (BigInt(buf[offset + 1]) << 8n) |
    (BigInt(buf[offset + 2]) << 16n) |
    (BigInt(buf[offset + 3]) << 24n)
  );
}

/** `countLeadingZeros64` counts the number of leading zero bits in a 64-bit integer. */
function countLeadingZeros64(x: bigint): number {
  if (x === 0n) return 64;
  let n = 0;
  while ((x & (1n << 63n)) === 0n) {
    n++;
    x <<= 1n;
  }
  return n;
}
