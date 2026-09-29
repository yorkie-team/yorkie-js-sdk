/*
 * Copyright 2021 The Yorkie Authors. All rights reserved.
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

import { describe, it, assert } from 'vitest';
import { InitialTimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import {
  Primitive,
  PrimitiveType,
} from '@yorkie-js/sdk/src/document/crdt/primitive';

describe('Primitive', function () {
  const primitiveTypes = [
    {
      type: PrimitiveType.Null,
      value: null,
    },
    {
      type: PrimitiveType.Boolean,
      value: false,
    },
    {
      type: PrimitiveType.Integer,
      value: 2147483647,
    },
    {
      type: PrimitiveType.Double,
      value: 1.79,
    },
    {
      type: PrimitiveType.String,
      value: '4',
    },
    {
      type: PrimitiveType.Long,
      value: 9223372036854775807n,
    },
    {
      type: PrimitiveType.Bytes,
      value: new Uint8Array([65, 66]),
    },
    {
      type: PrimitiveType.Date,
      value: new Date('December 17, 1995 03:24:00'),
    },
  ];
  it('primitive test', function () {
    for (const { type, value } of primitiveTypes) {
      const primVal = Primitive.of(value, InitialTimeTicket);
      assert.equal(type, primVal.getType());
    }
  });

  it('valueFromBytes test', function () {
    for (const { type, value } of primitiveTypes) {
      const primVal = Primitive.of(value, InitialTimeTicket);
      const valFromBytes = Primitive.valueFromBytes(type, primVal.toBytes());
      assert.deepEqual(valFromBytes, value);
    }
  });

  it('toJSON for Bytes and Date', function () {
    const bytes = Primitive.of(new Uint8Array([65, 66]), InitialTimeTicket);
    assert.equal(bytes.toJSON(), '"QUI="');

    const date = Primitive.of(
      new Date('1995-12-17T03:24:00.000Z'),
      InitialTimeTicket,
    );
    assert.equal(date.toJSON(), '"1995-12-17T03:24:00.000Z"');
  });

  it('should create a Long primitive when a number exceeds int32 range', function () {
    const INT32MAX = Math.pow(2, 31) - 1;
    const largeNumber = INT32MAX + 1;
    const primitiveLarge = Primitive.of(largeNumber, InitialTimeTicket);
    assert.equal(primitiveLarge.getType(), PrimitiveType.Long);
    assert.equal(primitiveLarge.getValue(), BigInt(largeNumber));
  });

  it('should create a Long primitive when a number is less than int32 range', function () {
    const INT32MIN = -Math.pow(2, 31);
    const smallNumber = INT32MIN - 1;
    const primitiveSmall = Primitive.of(smallNumber, InitialTimeTicket);
    assert.equal(primitiveSmall.getType(), PrimitiveType.Long);
    assert.equal(primitiveSmall.getValue(), BigInt(smallNumber));
  });

  it('should round-trip a promoted Long through toBytes/valueFromBytes', function () {
    const INT32MAX = Math.pow(2, 31) - 1;
    const largeNumber = INT32MAX + 1;
    const primitive = Primitive.of(largeNumber, InitialTimeTicket);
    const restored = Primitive.valueFromBytes(
      PrimitiveType.Long,
      primitive.toBytes(),
    );
    assert.equal(restored, BigInt(largeNumber));
  });

  it('should reject a number integer beyond the int64 range instead of wrapping', function () {
    // 1e19 (10000000000000000000) exceeds 2^63-1 and would previously wrap
    // silently in bigintToBytesLE, so the writer and remote peers disagree.
    assert.throws(() => Primitive.of(1e19, InitialTimeTicket));
  });

  it('should reject a bigint beyond the int64 range instead of wrapping', function () {
    assert.throws(() => Primitive.of(2n ** 64n, InitialTimeTicket));
  });

  it('should accept the int64 boundary and reject one past it', function () {
    const maxInt64 = 2n ** 63n - 1n;
    const minInt64 = -(2n ** 63n);

    // Exactly at the boundary: valid, stored losslessly.
    const max = Primitive.of(maxInt64, InitialTimeTicket);
    assert.equal(max.getType(), PrimitiveType.Long);
    assert.equal(max.getValue(), maxInt64);
    assert.equal(
      Primitive.valueFromBytes(PrimitiveType.Long, max.toBytes()),
      maxInt64,
    );

    const min = Primitive.of(minInt64, InitialTimeTicket);
    assert.equal(min.getValue(), minInt64);

    // One past the boundary: throws.
    assert.throws(() => Primitive.of(maxInt64 + 1n, InitialTimeTicket));
    assert.throws(() => Primitive.of(minInt64 - 1n, InitialTimeTicket));
  });

  it('reads a double payload shorter than eight bytes instead of throwing', function () {
    // NOTE(chacha912): A remote payload can arrive truncated, and the decoder
    // answered on one before this change: it read eight bytes from the start
    // of the underlying buffer, so the bytes the payload did not carry came
    // from whatever sat there. They now read as zero. The payload below is the
    // low half of the smallest double, which no other padding would produce.
    const value = Primitive.valueFromBytes(
      PrimitiveType.Double,
      new Uint8Array([1, 0, 0, 0]),
    );

    assert.equal(value, Number.MIN_VALUE);
  });

  it('reads the first eight bytes of a longer double payload', function () {
    const bytes = new Uint8Array(12).fill(0xff);
    new DataView(bytes.buffer).setFloat64(0, 3.14, true);

    const value = Primitive.valueFromBytes(PrimitiveType.Double, bytes);

    assert.equal(value, 3.14);
  });

  it('hands out a copy of a bytes value, not a view into the buffer', function () {
    const shared = new Uint8Array([1, 2, 3, 4]);

    const value = Primitive.valueFromBytes(
      PrimitiveType.Bytes,
      shared,
    ) as Uint8Array;
    shared[0] = 9;

    assert.notEqual(value, shared);
    assert.deepEqual(Array.from(value), [1, 2, 3, 4]);
  });

  it('reads long and date payloads shorter than eight bytes instead of throwing', function () {
    // A remote peer decides how long these payloads are, and a truncated one
    // used to read `bytes[i]` past the end and throw a raw TypeError out of
    // snapshot decode. The missing bytes now read as zero.
    assert.equal(
      Primitive.valueFromBytes(PrimitiveType.Long, new Uint8Array([2, 1])),
      258n,
    );
    assert.equal(
      Primitive.valueFromBytes(PrimitiveType.Long, new Uint8Array()),
      0n,
    );
    assert.deepEqual(
      Primitive.valueFromBytes(PrimitiveType.Date, new Uint8Array([1])),
      new Date(1),
    );
  });

  it('reads a double out of a shared buffer without writing to it', function () {
    // NOTE(chacha912): A snapshot arrives as one buffer and the decoder hands
    // its values out as views into it, so reading a value must not write.
    const shared = new Uint8Array(24);
    shared.fill(0xab);
    const view = new DataView(shared.buffer, 8, 8);
    view.setFloat64(0, 3.14, true);
    const untouched = shared.slice(0, 8);

    const value = Primitive.valueFromBytes(
      PrimitiveType.Double,
      new Uint8Array(shared.buffer, 8, 8),
    );

    assert.equal(value, 3.14);
    assert.deepEqual(Array.from(shared.slice(0, 8)), Array.from(untouched));
    assert.deepEqual(
      Array.from(shared.slice(16)),
      Array.from(new Uint8Array(8).fill(0xab)),
    );
  });
});
