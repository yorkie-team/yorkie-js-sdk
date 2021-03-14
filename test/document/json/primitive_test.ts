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

import { assert } from 'chai';
import { InitialTimeTicket } from '../../../src/document/time/ticket';
import {
  JSONPrimitive,
  PrimitiveType,
} from '../../../src/document/json/primitive';

describe('Primitive', function () {
  it('null test', function () {
    const primNum = JSONPrimitive.of(0, InitialTimeTicket);
    assert.equal(PrimitiveType.Double, primNum.getType());

    const primNull = JSONPrimitive.of(null, InitialTimeTicket);
    assert.equal(PrimitiveType.Null, primNull.getType());
  });
});
