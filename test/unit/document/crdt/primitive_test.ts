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

import Long from 'long';
import { assert } from 'chai';
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import {
  Primitive,
  PrimitiveType,
} from '@yorkie-js-sdk/src/document/crdt/primitive';

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
      value: Long.MAX_VALUE,
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
});
