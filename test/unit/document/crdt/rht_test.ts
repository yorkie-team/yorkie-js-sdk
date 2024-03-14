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
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { InitialChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import {
  InitialTimeTicket,
  NextTimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { Indexable } from '@yorkie-js-sdk/test/helper/helper';
import {stringifyObjectValues} from "@yorkie-js-sdk/src/util/object";

function createDummyContext() {
  return ChangeContext.create(
    InitialChangeID,
    new CRDTRoot(new CRDTObject(InitialTimeTicket, ElementRHT.create())),
    {},
  );
}

class TestInfo {
  constructor(
    public desc: string,
    public insert: Indexable,
    public erase: Indexable,
    public expectXML: string,
    public expectSize: number,
  ) {}
}

function run(rht: RHT, info: TestInfo, ctx: ChangeContext) {
  const insertAttrs = stringifyObjectValues(info.insert);
  const deleteAttrs = stringifyObjectValues(info.erase);

  for (const [key, value] of Object.entries(insertAttrs)) {
    rht.set(key, value, ctx.issueTimeTicket());
  }
  for (const [key, value] of Object.entries(deleteAttrs)) {
    const elem = rht.remove(key, ctx.issueTimeTicket());
    if (value === `""`) assert.equal(elem, '');
    else assert.equal(elem, value);
  }
  if (info.expectXML) {
    assert.equal(rht.toXML(), ' ' + info.expectXML);
  } else {
    assert.equal(rht.toXML(), info.expectXML);
  }
  assert.equal(rht.size(), info.expectSize);
}

describe('RHT', function () {
  describe('xml-test', function () {
    const tests: Array<TestInfo> = [
      {
        desc: `1. empty hash table`,
        insert: {},
        erase: {},
        expectXML: ``,
        expectSize: 0,
      },
      {
        desc: `2. only one element`,
        insert: { hello: 'world' },
        erase: {},
        expectXML: `hello="world"`,
        expectSize: 1,
      },
      {
        desc: `3. non-empty hash table`,
        insert: { hi: 'test' },
        erase: {},
        expectXML: `hello="world" hi="test"`,
        expectSize: 2,
      },
    ];
    const ctx = createDummyContext();
    const rht = new RHT();

    for (const test of tests) {
      it(test.desc, () => run(rht, test, ctx));
    }
  });

  describe('set-test', function () {
    const val1 = 'value1',
      val2 = 'value2';
    const tests: Array<TestInfo> = [
      {
        desc: `1. set elements`,
        insert: { key1: val1, key2: val2 },
        erase: {},
        expectXML: `key1="value1" key2="value2"`,
        expectSize: 2,
      },
      {
        desc: `2. change elements`,
        insert: { key1: val2, key2: val1 },
        erase: {},
        expectXML: `key1="value2" key2="value1"`,
        expectSize: 2,
      },
    ];
    const ctx = createDummyContext();
    const rht = new RHT();

    for (const test of tests) {
      it(test.desc, () => run(rht, test, ctx));
    }
  });

  describe('remove-test', function () {
    const val1 = 'value1',
      val11 = 'value11',
      val2 = 'value2',
      val22 = 'value22';
    const tests: Array<TestInfo> = [
      {
        desc: `1. set elements`,
        insert: { key1: val1, key2: val2 },
        erase: {},
        expectXML: `key1="value1" key2="value2"`,
        expectSize: 2,
      },
      {
        desc: `2. remove element`,
        insert: {},
        erase: { key1: val1 },
        expectXML: `key2="value2"`,
        expectSize: 1,
      },
      {
        desc: `3. set after remove`,
        insert: { key1: val11 },
        erase: {},
        expectXML: `key1="value11" key2="value2"`,
        expectSize: 2,
      },
      {
        desc: `4. remove element`,
        insert: { key2: val22 },
        erase: { key1: val11 },
        expectXML: `key2="value22"`,
        expectSize: 1,
      },
      {
        desc: `5. remove element again`,
        insert: {},
        erase: { key1: '' },
        expectXML: `key2="value22"`,
        expectSize: 1,
      },
      {
        desc: `6. remove element(cleared)`,
        insert: {},
        erase: { key2: val22 },
        expectXML: ``,
        expectSize: 0,
      },
      {
        desc: `7. remove not exist key`,
        insert: {},
        erase: { not_exist_key: '' },
        expectXML: ``,
        expectSize: 0,
      },
    ];
    const ctx = createDummyContext();
    const rht = new RHT();

    for (const test of tests) {
      it(test.desc, () => run(rht, test, ctx));
    }
  });

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

  it('should handle remove', function () {
    const testKey = 'test-key';
    const testValue = 'test-value';

    const rht = RHT.create();

    assert.equal(rht.toJSON(), '{}');
    rht.set(testKey, testValue, InitialTimeTicket);

    const actualValue = rht.get(testKey);
    assert.equal(actualValue, testValue);
    assert.equal(rht.size(), 1);

    rht.remove(testKey, NextTimeTicket);
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
