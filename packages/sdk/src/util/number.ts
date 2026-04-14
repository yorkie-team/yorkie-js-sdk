/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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

/**
 * `removeDecimal` returns a number with the decimal part removed.
 */
export const removeDecimal = (number: number) =>
  number < 0 ? Math.ceil(number) : Math.floor(number);

/**
 * `bigintToBytesLE` converts a signed 64-bit bigint to 8 bytes (little-endian).
 */
export function bigintToBytesLE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  // Interpret as unsigned 64-bit to handle negative values correctly.
  let v = BigInt.asUintN(64, value);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/**
 * `bigintFromBytesLE` reads a signed 64-bit bigint from 8 bytes (little-endian).
 */
export function bigintFromBytesLE(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return BigInt.asIntN(64, v);
}

/**
 * `bigintFromBytesLEUnsigned` reads an unsigned 64-bit bigint from 8 bytes (little-endian).
 */
export function bigintFromBytesLEUnsigned(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return v;
}

/**
 * `bigintToInt32` truncates a bigint to a signed 32-bit integer.
 */
export function bigintToInt32(value: bigint): number {
  return Number(BigInt.asIntN(32, value));
}
