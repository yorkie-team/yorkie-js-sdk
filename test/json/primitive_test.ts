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
import { JSONPrimitive, PrimitiveType } from '../../src/document/json/primitive';
import { InitialTimeTicket } from '../../src/document/time/ticket';
import Long from 'long';

describe('Primitive', function () {
  it('Can create numeric type', function () {
    const integer = JSONPrimitive.of(10, InitialTimeTicket);
    const double = JSONPrimitive.of(3.14, InitialTimeTicket);
    const long = JSONPrimitive.of(Long.fromString('100'), InitialTimeTicket);

    assert.equal(integer.getType(), PrimitiveType.Integer);
    assert.equal(double.getType(), PrimitiveType.Double);
    assert.equal(long.getType(), PrimitiveType.Long);
  });
});
