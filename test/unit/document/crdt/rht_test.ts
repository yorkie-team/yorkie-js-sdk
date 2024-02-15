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
    public insertKey: Array<string>,
    public insertVal: Array<string>,
    public deleteKey: Array<string>,
    public deleteVal: Array<string>,
    public expectXML: string,
    public expectSize: number,
  ) {}
}

function run(rht: RHT, info: TestInfo, ctx: ChangeContext) {
  for (let i = 0; i < info.insertKey.length; i++) {
    rht.set(info.insertKey[i], info.insertVal[i], ctx.issueTimeTicket());
  }
  for (let i = 0; i < info.deleteKey.length; i++) {
    const elem = rht.remove(info.deleteKey[i], ctx.issueTimeTicket());
    assert.equal(elem, info.deleteVal[i]);
  }
  assert.equal(rht.toXML(), info.expectXML);
  assert.equal(rht.size(), info.expectSize);
}

describe('RHT', function () {
  describe('xml-test', function () {
    const tests: Array<TestInfo> = [
      {
        desc: `1. empty hash table`,
        insertKey: [],
        insertVal: [],
        deleteKey: [],
        deleteVal: [],
        expectXML: ``,
        expectSize: 0,
      },
      {
        desc: `2. only one element`,
        insertKey: ['hello'],
        insertVal: ['world'],
        deleteKey: [],
        deleteVal: [],
        expectXML: `hello="world"`,
        expectSize: 1,
      },
      {
        desc: `3. non-empty hash table`,
        insertKey: ['hi'],
        insertVal: ['test'],
        deleteKey: [],
        deleteVal: [],
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
    const key1 = 'key1',
      val1 = 'value1',
      key2 = 'key2',
      val2 = 'value2';
    const tests: Array<TestInfo> = [
      {
        desc: `1. set elements`,
        insertKey: [key1, key2],
        insertVal: [val1, val2],
        deleteKey: [],
        deleteVal: [],
        expectXML: `key1="value1" key2="value2"`,
        expectSize: 2,
      },
      {
        desc: `2. change elements`,
        insertKey: [key1, key2],
        insertVal: [val2, val1],
        deleteKey: [],
        deleteVal: [],
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
    const key1 = 'key1',
      val1 = 'value1',
      val11 = 'value11',
      key2 = 'key2',
      val2 = 'value2',
      val22 = 'value22';
    const tests: Array<TestInfo> = [
      {
        desc: `1. set elements`,
        insertKey: [key1, key2],
        insertVal: [val1, val2],
        deleteKey: [],
        deleteVal: [],
        expectXML: `key1="value1" key2="value2"`,
        expectSize: 2,
      },
      {
        desc: `2. remove element`,
        insertKey: [],
        insertVal: [],
        deleteKey: [key1],
        deleteVal: [val1],
        expectXML: `key2="value2"`,
        expectSize: 1,
      },
      {
        desc: `3. set after remove`,
        insertKey: [key1],
        insertVal: [val11],
        deleteKey: [],
        deleteVal: [],
        expectXML: `key1="value11" key2="value2"`,
        expectSize: 2,
      },
      {
        desc: `4. remove element`,
        insertKey: [key2],
        insertVal: [val22],
        deleteKey: [key1],
        deleteVal: [val11],
        expectXML: `key2="value22"`,
        expectSize: 1,
      },
      {
        desc: `5. remove element again`,
        insertKey: [],
        insertVal: [],
        deleteKey: [key1],
        deleteVal: [''],
        expectXML: `key2="value22"`,
        expectSize: 1,
      },
      {
        desc: `6. remove element(cleared)`,
        insertKey: [],
        insertVal: [],
        deleteKey: [key2],
        deleteVal: [val22],
        expectXML: ``,
        expectSize: 0,
      },
      {
        desc: `7. remove not exist key`,
        insertKey: [],
        insertVal: [],
        deleteKey: [`not-exist-key`],
        deleteVal: [``],
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
