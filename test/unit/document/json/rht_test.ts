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
import { RHT } from '@yorkie-js-sdk/src/document/crdt/rht';
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { Indexable } from '@yorkie-js-sdk/test/helper/helper';

describe('RHT', function () {
  it('should set and get a value', function () {
    const testKey = 'test-key';
    const testValue = 'test-value';
    const notExistsKey = 'not-exists-key';

    const rht = RHT.create();

    // Check if a rht object is constructed well.
    assert.equal(rht.toJSON(), '{}');

    rht.set(testKey, testValue, InitialTimeTicket);

    const actualValue = rht.get(testKey);
    assert.equal(actualValue, testValue);

    const notExistsValue = rht.get(notExistsKey);
    assert.equal(notExistsValue, undefined);
  });

  it('should return undefined when a key does not exist', function () {
    const notExistsKey = 'not-exists-key';

    const rht = RHT.create();

    // Check if a rht object is constructed well.
    assert.equal(rht.toJSON(), '{}');

    const notExistsValue = rht.get(notExistsKey);
    assert.equal(notExistsValue, undefined);
  });

  it('should check if a key exists', function () {
    const testKey = 'test-key';
    const testValue = 'test-value';

    const rht = RHT.create();

    // Check if a rht object is constructed well.
    assert.equal(rht.toJSON(), '{}');

    rht.set(testKey, testValue, InitialTimeTicket);

    const actualValue = rht.has(testKey);
    assert.isTrue(actualValue);
  });

  it('should handle toJSON', function () {
    const testData: Indexable = {
      testKey1: 'testValue1',
      testKey2: 'testValue2',
      testKey3: 'testValue3',
    };

    const rht = RHT.create();
    for (const [key, value] of Object.entries(testData)) {
      rht.set(key, value, InitialTimeTicket);
    }

    const jsonStr = rht.toJSON();
    const jsonObj = JSON.parse(jsonStr);
    assert.equal(jsonObj.testKey1, testData.testKey1);
    assert.equal(jsonObj.testKey2, testData.testKey2);
    assert.equal(jsonObj.testKey3, testData.testKey3);
  });

  it('should handle toObject', function () {
    const testData: Indexable = {
      testKey1: 'testValue1',
      testKey2: 'testValue2',
      testKey3: 'testValue3',
    };

    const rht = RHT.create();
    for (const [key, value] of Object.entries(testData)) {
      rht.set(key, value, InitialTimeTicket);
    }

    const jsonObj = rht.toObject();
    assert.equal(jsonObj.testKey1, testData.testKey1);
    assert.equal(jsonObj.testKey2, testData.testKey2);
    assert.equal(jsonObj.testKey3, testData.testKey3);
  });
});
