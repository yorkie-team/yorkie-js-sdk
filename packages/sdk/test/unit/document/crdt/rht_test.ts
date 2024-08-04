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
import { RHT } from '@yorkie-js-sdk/src/document/crdt/rht';
import { InitialTimeTicket as ITT } from '@yorkie-js-sdk/src/document/time/ticket';
import { timeT } from '@yorkie-js-sdk/test/helper/helper';
import { Indexable } from '@yorkie-js-sdk/test/helper/helper';

describe('RHT interface', function () {
  it('should set and get a value', function () {
    const testKey = 'test-key';
    const testValue = 'test-value';
    const notExistsKey = 'not-exists-key';

    const rht = RHT.create();

    // Check if a rht object is constructed well.
    assert.equal(rht.toJSON(), '{}');

    rht.set(testKey, testValue, ITT);

    const actualValue = rht.get(testKey);
    assert.equal(actualValue, testValue);

    const notExistsValue = rht.get(notExistsKey);
    assert.equal(notExistsValue, undefined);
  });

  it('should handle remove', function () {
    const testKey = 'test-key';
    const testValue = 'test-value';

    const rht = RHT.create();

    assert.equal(rht.toJSON(), '{}');
    rht.set(testKey, testValue, ITT);

    const actualValue = rht.get(testKey);
    assert.equal(actualValue, testValue);
    assert.equal(rht.size(), 1);

    rht.remove(testKey, timeT());
    assert.equal(rht.has(testKey), false);
    assert.equal(rht.size(), 0);
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

    rht.set(testKey, testValue, ITT);

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
      rht.set(key, value, ITT);
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
      rht.set(key, value, ITT);
    }

    const jsonObj = rht.toObject();
    assert.equal(jsonObj.testKey1, testData.testKey1);
    assert.equal(jsonObj.testKey2, testData.testKey2);
    assert.equal(jsonObj.testKey3, testData.testKey3);
  });

  it('should deepcopy correctly', function () {
    const rht = RHT.create();
    rht.set('key1', 'value1', timeT());
    rht.remove('key2', timeT());

    const rht2 = rht.deepcopy();
    assert.equal(rht.toJSON(), rht2.toJSON());
    assert.equal(rht.size(), rht2.size());
  });
});

describe('RHT', () => {
  enum OpCode {
    NoOp,
    Set,
    Remove,
  }
  interface Operation {
    code: OpCode;
    key: string;
    val: string;
  }
  interface Step {
    op: Operation;
    expectJSON: string;
    expectSize?: number;
  }
  interface TestCase {
    desc: string;
    steps: Array<Step>;
  }

  describe('marshal', () => {
    const tests: Array<TestCase> = [
      {
        desc: '1. empty hash table',
        steps: [
          {
            op: { code: OpCode.NoOp, key: '', val: '' },
            expectJSON: '{}',
          },
        ],
      },
      {
        desc: '2. only one element',
        steps: [
          {
            op: { code: OpCode.Set, key: 'hello\\\\\\t', val: 'world"\f\b' },
            expectJSON: '{"hello\\\\\\\\\\\\t":"world\\"\\f\\b"}',
          },
        ],
      },
      {
        desc: '3. non-empty hash table',
        steps: [
          {
            op: { code: OpCode.Set, key: 'hi', val: 'test\\r' },
            expectJSON:
              '{"hello\\\\\\\\\\\\t":"world\\"\\f\\b","hi":"test\\\\r"}',
          },
        ],
      },
    ];
    const rht = RHT.create();
    it.each(tests)('$desc', ({ steps }) => {
      for (const {
        op: { code, key, val },
        expectJSON: expectJSON,
      } of steps) {
        if (code === OpCode.Set) {
          rht.set(key, val, timeT());
        }
        assert.equal(rht.toJSON(), expectJSON);
      }
    });
  });

  describe('set', () => {
    const tests: Array<TestCase> = [
      {
        desc: '1. set elements',
        steps: [
          {
            op: { code: OpCode.Set, key: 'key1', val: 'value1' },
            expectJSON: '{"key1":"value1"}',
            expectSize: 1,
          },
          {
            op: { code: OpCode.Set, key: 'key2', val: 'value2' },
            expectJSON: '{"key1":"value1","key2":"value2"}',
            expectSize: 2,
          },
        ],
      },
      {
        desc: '2. change elements',
        steps: [
          {
            op: { code: OpCode.Set, key: 'key1', val: 'value2' },
            expectJSON: '{"key1":"value2","key2":"value2"}',
            expectSize: 2,
          },
          {
            op: { code: OpCode.Set, key: 'key2', val: 'value1' },
            expectJSON: '{"key1":"value2","key2":"value1"}',
            expectSize: 2,
          },
        ],
      },
    ];

    const rht = RHT.create();
    it.each(tests)('$desc', ({ steps }) => {
      for (const {
        op: { code, key, val },
        expectJSON,
        expectSize,
      } of steps) {
        if (code === OpCode.Set) {
          rht.set(key, val, timeT());
        }
        assert.equal(rht.toJSON(), expectJSON);
        assert.equal(rht.size(), expectSize);
      }
    });
  });

  describe('remove', () => {
    const tests: Array<TestCase> = [
      {
        desc: '1. set elements',
        steps: [
          {
            op: { code: OpCode.Set, key: 'key1', val: 'value1' },
            expectJSON: '{"key1":"value1"}',
            expectSize: 1,
          },
          {
            op: { code: OpCode.Set, key: 'key2', val: 'value2' },
            expectJSON: '{"key1":"value1","key2":"value2"}',
            expectSize: 2,
          },
        ],
      },
      {
        desc: '2. remove element',
        steps: [
          {
            op: { code: OpCode.Remove, key: 'key1', val: 'value1' },
            expectJSON: '{"key2":"value2"}',
            expectSize: 1,
          },
        ],
      },
      {
        desc: '3. set after remove',
        steps: [
          {
            op: { code: OpCode.Set, key: 'key1', val: 'value11' },
            expectJSON: '{"key1":"value11","key2":"value2"}',
            expectSize: 2,
          },
        ],
      },
      {
        desc: '4. remove element',
        steps: [
          {
            op: { code: OpCode.Set, key: 'key2', val: 'value22' },
            expectJSON: '{"key1":"value11","key2":"value22"}',
            expectSize: 2,
          },
          {
            op: { code: OpCode.Remove, key: 'key1', val: 'value11' },
            expectJSON: '{"key2":"value22"}',
            expectSize: 1,
          },
        ],
      },
      {
        desc: '5. remove element again',
        steps: [
          {
            op: { code: OpCode.Remove, key: 'key1', val: 'value11' },
            expectJSON: '{"key2":"value22"}',
            expectSize: 1,
          },
        ],
      },
      {
        desc: '6. remove element(cleared)',
        steps: [
          {
            op: { code: OpCode.Remove, key: 'key2', val: 'value22' },
            expectJSON: '{}',
            expectSize: 0,
          },
        ],
      },
      {
        desc: '7. remove not exist key',
        steps: [
          {
            op: { code: OpCode.Remove, key: 'not-exist-key', val: '' },
            expectJSON: '{}',
            expectSize: 0,
          },
        ],
      },
    ];

    const rht = RHT.create();
    it.each(tests)('$desc', ({ steps }) => {
      for (const {
        op: { code, key, val },
        expectJSON,
        expectSize,
      } of steps) {
        if (code === OpCode.Set) {
          rht.set(key, val, timeT());
        } else if (code === OpCode.Remove) {
          rht.remove(key, timeT());
        }
        assert.equal(rht.toJSON(), expectJSON);
        assert.equal(rht.size(), expectSize);
        assert.equal(Object.keys(rht.toObject()).length, expectSize);
      }
    });
  });
});
