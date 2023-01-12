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
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import Long from 'long';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js-sdk/src/document/crdt/counter';
import { Primitive } from '@yorkie-js-sdk/src/document/crdt/primitive';

describe('Counter', function () {
  it('Can increase numeric data of Counter', function () {
    const double = CRDTCounter.of(
      CounterType.IntegerCnt,
      10,
      InitialTimeTicket,
    );
    const long = CRDTCounter.of(
      CounterType.LongCnt,
      Long.fromString('100'),
      InitialTimeTicket,
    );

    const doubleOperand = Primitive.of(10, InitialTimeTicket);
    const longOperand = Primitive.of(Long.fromString('100'), InitialTimeTicket);

    double.increase(doubleOperand);
    double.increase(longOperand);
    assert.equal(double.getValue(), 120);

    long.increase(doubleOperand);
    long.increase(longOperand);
    assert.equal((long.getValue() as Long).toNumber(), 210);

    // error process test
    function errorTest(counter: CRDTCounter, operand: Primitive): void {
      const errValue = !counter.isNumericType()
        ? counter.getValue()
        : operand.getValue();

      assert.throw(() => {
        counter.increase(operand);
      }, `Unsupported type of value: ${typeof errValue}`);
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
    assert.equal((long.getValue() as Long).toNumber(), 210);

    // subtraction test
    const negative = Primitive.of(-50, InitialTimeTicket);
    const negativeLong = Primitive.of(Long.fromNumber(-100), InitialTimeTicket);
    double.increase(negative);
    double.increase(negativeLong);
    assert.equal(double.getValue(), -30);

    long.increase(negative);
    long.increase(negativeLong);
    assert.equal(long.getValue(), 60);
  });
});
