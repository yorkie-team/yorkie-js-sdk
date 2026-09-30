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

import { describe, it, assert } from 'vitest';
import { InitialTimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js/sdk/src/document/crdt/counter';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';

describe('Counter', function () {
  it('Can increase numeric data of Counter', function () {
    const double = CRDTCounter.create(CounterType.Int, 10, InitialTimeTicket);
    const long = CRDTCounter.create(CounterType.Long, 100n, InitialTimeTicket);

    const doubleOperand = Primitive.of(10, InitialTimeTicket);
    const longOperand = Primitive.of(100n, InitialTimeTicket);

    double.increase(doubleOperand);
    double.increase(longOperand);
    assert.equal(double.getValue(), 120);

    long.increase(doubleOperand);
    long.increase(longOperand);
    assert.equal(Number(long.getValue() as bigint), 210);

    // error process test
    function errorTest(counter: CRDTCounter, operand: Primitive): void {
      const errValue = !counter.isNumericType()
        ? counter.getValue()
        : operand.getValue();

      assert.throw(
        () => {
          counter.increase(operand);
        },
        `Unsupported type of value: ${typeof errValue}`,
      );
    }

    const str = Primitive.of('hello', InitialTimeTicket);
    const bool = Primitive.of(true, InitialTimeTicket);
    const uint8arr = Primitive.of(new Uint8Array(), InitialTimeTicket);
    const date = Primitive.of(new Date(), InitialTimeTicket);

    errorTest(double, str);
    errorTest(double, bool);
    errorTest(double, uint8arr);
    errorTest(double, date);

    assert.equal(double.getValue(), 120);
    assert.equal(Number(long.getValue() as bigint), 210);

    // subtraction test
    const negative = Primitive.of(-50, InitialTimeTicket);
    const negativeLong = Primitive.of(BigInt(-100), InitialTimeTicket);
    double.increase(negative);
    double.increase(negativeLong);
    assert.equal(double.getValue(), -30);

    long.increase(negative);
    long.increase(negativeLong);
    assert.equal(long.getValue(), 60);
  });
});

it('Can wrap around Int counter when increased by an out-of-int32 Long', function () {
  // Adding a Long beyond int32 range must wrap, like the Go SDK.
  const counter = CRDTCounter.create(CounterType.Int, 0, InitialTimeTicket);
  const outOfInt32 = Primitive.of(BigInt(2147483648), InitialTimeTicket); // 2^31
  counter.increase(outOfInt32);
  assert.equal(counter.getValue(), -2147483648);

  // Nonzero base: old behavior returns -2147483649, fixed returns 2147483647.
  const counter2 = CRDTCounter.create(CounterType.Int, -1, InitialTimeTicket);
  counter2.increase(Primitive.of(BigInt(2147483648), InitialTimeTicket));
  assert.equal(counter2.getValue(), 2147483647);
});

it('Can read a long counter payload shorter than eight bytes', function () {
  // The payload length is whatever a remote peer sent. A truncated one used to
  // read past the end of the array and throw a raw TypeError out of the
  // decoder; the bytes it does not carry now read as zero.
  assert.equal(
    CRDTCounter.valueFromBytes(CounterType.Long, new Uint8Array([5])),
    5n,
  );
  assert.equal(
    CRDTCounter.valueFromBytes(CounterType.Long, new Uint8Array()),
    0n,
  );
});

it('Refuses a malformed HLL register payload without throwing', function () {
  // A non-empty `hllRegisters` is whatever a peer put on the wire, and
  // restoreHLL derives the counter's value from it, which this client then
  // re-serializes to its own peers. So a wrong-length or out-of-range payload
  // is refused rather than clamped -- `count()` over registers a payload only
  // partly covered is not an estimate, it is an unrelated number. Refusing it
  // by throwing is no good either: snapshot decode has no handler, so one bad
  // counter would stop this client from opening the document at all.
  const counter = CRDTCounter.create(
    CounterType.IntDedup,
    0,
    InitialTimeTicket,
  );
  counter.increaseDedup(Primitive.of(1, InitialTimeTicket), 'actor-a');
  const wellFormed = counter.hllBytes()!;
  assert.equal(counter.getValue(), 1);

  // Too long, too short, and the right length but carrying a register value
  // no `add` could ever have written.
  const malformed = [
    new Uint8Array(20000).fill(3),
    new Uint8Array([1]),
    new Uint8Array(wellFormed.length).fill(0xff),
  ];
  for (const data of malformed) {
    assert.isFalse(counter.restoreHLL(data));
    assert.deepEqual(counter.hllBytes(), wellFormed);
    assert.equal(counter.getValue(), 1);
  }

  // A well-formed payload is still applied.
  const restored = CRDTCounter.create(
    CounterType.IntDedup,
    0,
    InitialTimeTicket,
  );
  assert.isTrue(restored.restoreHLL(wellFormed));
  assert.equal(restored.getValue(), 1);
});
