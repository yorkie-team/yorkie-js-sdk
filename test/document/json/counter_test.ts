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

import { assert } from 'chai';
import { InitialTimeTicket } from '../../../src/document/time/ticket';
import Long from 'long';
import { Counter } from '../../../src/document/json/counter';
import { JSONPrimitive } from '../../../src/document/json/primitive';

describe('Counter', function () {
  it('Can increase numeric data of Counter', function () {
    const double = Counter.of(10, InitialTimeTicket);
    const long = Counter.of(Long.fromString('100'), InitialTimeTicket);

    const doubleOperand = JSONPrimitive.of(10, InitialTimeTicket);
    const longOperand = JSONPrimitive.of(
      Long.fromString('100'),
      InitialTimeTicket,
    );

    double.increase(doubleOperand);
    double.increase(longOperand);
    assert.equal(double.getValue(), 120);

    long.increase(doubleOperand);
    long.increase(longOperand);
    assert.equal((long.getValue() as Long).toNumber(), 210);

    // error process test
    function errorTest(counter: Counter, operand: JSONPrimitive): void {
      const errValue = !counter.isNumericType()
        ? counter.getValue()
        : operand.getValue();

      assert.throw(() => {
        counter.increase(operand);
      }, `Unsupported type of value: ${typeof errValue}`);
    }

    const str = JSONPrimitive.of('hello', InitialTimeTicket);
    const bool = JSONPrimitive.of(true, InitialTimeTicket);
    const uint8arr = JSONPrimitive.of(new Uint8Array(), InitialTimeTicket);
    const date = JSONPrimitive.of(new Date(), InitialTimeTicket);

    errorTest(double, str);
    errorTest(double, bool);
    errorTest(double, uint8arr);
    errorTest(double, date);

    assert.equal(double.getValue(), 120);
    assert.equal((long.getValue() as Long).toNumber(), 210);

    // subtraction test
    const negative = JSONPrimitive.of(-50, InitialTimeTicket);
    const negativeLong = JSONPrimitive.of(
      Long.fromNumber(-100),
      InitialTimeTicket,
    );
    double.increase(negative);
    double.increase(negativeLong);
    assert.equal(double.getValue(), -30);

    long.increase(negative);
    long.increase(negativeLong);
    assert.equal(long.getValue(), 60);
  });
});
