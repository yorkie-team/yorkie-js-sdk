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
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import {
  Client,
  ClientEvent,
  ClientEventType,
  DocumentSyncResultType,
} from '../src/core/client';
import { Document, DocEvent, DocEventType } from '../src/document/document';
import { JSONElement } from '../src/document/json/element';
import yorkie from '../src/yorkie';

const __karma__ = (global as any).__karma__;
const testRPCAddr = __karma__.config.testRPCAddr || 'http://localhost:8080';
const testCollection = 'test-col';

async function withTwoClientsAndDocuments(
  callback: (
    c1: Client,
    d1: Document,
    c2: Client,
    d2: Document,
  ) => Promise<void>,
  title: string,
): Promise<void> {
  const client1 = yorkie.createClient(testRPCAddr);
  const client2 = yorkie.createClient(testRPCAddr);
  await client1.activate();
  await client2.activate();

  const docKey = `${title}-${new Date().getTime()}`;
  const doc1 = yorkie.createDocument(testCollection, docKey);
  const doc2 = yorkie.createDocument(testCollection, docKey);

  await client1.attach(doc1, true);
  await client2.attach(doc2, true);

  await callback(client1, doc1, client2, doc2);

  await client1.detach(doc1);
  await client2.detach(doc2);

  await client1.deactivate();
  await client2.deactivate();
}

function waitFor(eventName: string, listener: EventEmitter): Promise<void> {
  return new Promise((resolve) => listener.on(eventName, resolve));
}

function createSpy(emitter: EventEmitter) {
  return (event: ClientEvent | DocEvent) => emitter.emit(event.name);
}

// NOTE: In particular, we uses general functions, not arrow functions
// to access test title in test codes.
describe('Yorkie', function () {
  it('Can be activated, deactivated', async function () {
    const docKey = `${this.test.title}-${new Date().getTime()}`;
    const clientWithKey = yorkie.createClient(testRPCAddr, {
      key: docKey,
      syncLoopDuration: 50,
      reconnectStreamDelay: 1000,
    });
    assert.isFalse(clientWithKey.isActive());
    await clientWithKey.activate();
    assert.isTrue(clientWithKey.isActive());
    assert.equal(docKey, clientWithKey.getKey());
    await clientWithKey.deactivate();
    assert.isFalse(clientWithKey.isActive());

    const clientWithoutKey = yorkie.createClient(testRPCAddr);
    assert.isFalse(clientWithoutKey.isActive());
    await clientWithoutKey.activate();
    assert.isTrue(clientWithoutKey.isActive());
    assert.isString(clientWithoutKey.getKey());
    assert.lengthOf(clientWithoutKey.getKey(), 36);
    await clientWithoutKey.deactivate();
    assert.isFalse(clientWithoutKey.isActive());
  });

  it('Can attach/detach documents', async function () {
    const docKey = `${this.test.title}-${new Date().getTime()}`;
    const doc1 = yorkie.createDocument(testCollection, docKey);
    const doc2 = yorkie.createDocument(testCollection, docKey);

    const client1 = yorkie.createClient(testRPCAddr);
    const client2 = yorkie.createClient(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, true);
    doc1.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k2'] = ['1', '2'];
    }, 'set v1, v2');
    await client1.sync();
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc1.toSortedJSON());

    await client2.attach(doc2, true);
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc2.toSortedJSON());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.attach(doc1, true);
    await client2.attach(doc2, true);

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle sync', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      const spy = sinon.spy();
      const unsub = d2.subscribe(spy);

      assert.equal(0, spy.callCount);

      d1.update((root) => {
        root['k1'] = 'v1';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(1, spy.callCount);

      d1.update((root) => {
        root['k2'] = 'v2';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(2, spy.callCount);

      unsub();

      d1.update((root) => {
        root['k3'] = 'v3';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(2, spy.callCount);
    }, this.test.title);
  });

  it('Can watch documents', async function () {
    const c1 = yorkie.createClient(testRPCAddr);
    const c2 = yorkie.createClient(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = `${this.test.title}-${new Date().getTime()}`;
    const d1 = yorkie.createDocument(testCollection, docKey);
    const d2 = yorkie.createDocument(testCollection, docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    const listener1 = new EventEmitter();
    const listener2 = new EventEmitter();
    const spy1 = createSpy(listener1);
    const spy2 = createSpy(listener2);
    const unsub1 = d1.subscribe(spy1);
    const unsub2 = d2.subscribe(spy2);

    d2.update((root) => {
      root['k1'] = 'v1';
    });

    await waitFor(DocEventType.LocalChange, listener2);
    await waitFor(DocEventType.RemoteChange, listener1);
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    unsub1();
    unsub2();

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle primitive types', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = true;
        root['k2'] = 2147483647;
        root['k3'] = yorkie.Long.fromString('9223372036854775807');
        root['k4'] = 1.79;
        root['k5'] = '4';
        root['k6'] = new Uint8Array([65, 66]);
        root['k7'] = new Date();
      });

      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can handle concurrent set/delete operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = 'v1';
      });
      d2.update((root) => {
        root['k1'] = 'v2';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k2'] = {};
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k2'] = 'v2';
      });
      d2.update((root) => {
        root['k2']['k2.1'] = { 'k2.1.1': 'v3' };
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k3'] = 'v4';
      });
      d2.update((root) => {
        root['k4'] = 'v5';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        delete root['k3'];
      });
      d2.update((root) => {
        root['k3'] = 'v6';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can handle concurrent add operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = ['1'];
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].push('2');
      });
      d2.update((root) => {
        root['k1'].push('3');
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can handle concurrent insertAfter operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      let prev: JSONElement;
      d1.update((root) => {
        root['k1'] = [1, 2, 3, 4];
        prev = root['k1'].getElementByIndex(1);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].deleteByID(prev.getID());
        assert.equal('{"k1":[1,3,4]}', root.toJSON());
      });
      d2.update((root) => {
        root['k1'].insertAfter(prev.getID(), 2);
        assert.equal('{"k1":[1,2,2,3,4]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal('{"k1":[1,2,3,4]}', d1.toJSON());

      d1.update((root) => {
        const prev = root['k1'].getElementByIndex(1);
        root['k1'].insertAfter(prev.getID(), '2.1');
        assert.equal('{"k1":[1,2,"2.1",3,4]}', root.toJSON());
      });
      d2.update((root) => {
        const prev = root['k1'].getElementByIndex(1);
        root['k1'].insertAfter(prev.getID(), '2.2');
        assert.equal('{"k1":[1,2,"2.2",3,4]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can handle concurrent moveBefore operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[2,0,1]}', root.toJSON());
      });

      d1.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[1,2,0]}', root.toJSON());
      });

      d2.update((root) => {
        const next = root['k1'].getElementByIndex(1);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[0,2,1]}', root.toJSON());
      });

      d2.update((root) => {
        const next = root['k1'].getElementByIndex(1);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
    }, this.test.title);
  });

  it('should handle edit operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createText('k1');
        root['k1'].edit(0, 0, 'ABCD');
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":"ABCD"}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.createText('k1');
        root['k1'].edit(0, 0, '1234');
      }, 'edit 0,0 1234 by c1');
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":"1234"}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('should handle concurrent edit operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createText('k1');
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":""}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(0, 0, 'ABCD');
      }, 'edit 0,0 ABCD by c1');
      assert.equal(d1.toSortedJSON(), `{"k1":"ABCD"}`);
      d2.update((root) => {
        root['k1'].edit(0, 0, '1234');
      }, 'edit 0,0 1234 by c2');
      assert.equal(d2.toSortedJSON(), `{"k1":"1234"}`);
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(2, 3, 'XX');
      }, 'edit 2,3 XX by c1');
      d2.update((root) => {
        root['k1'].edit(2, 3, 'YY');
      }, 'edit 2,3 YY by c1');
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(4, 5, 'ZZ');
      }, 'edit 4,5 ZZ by c1');
      d2.update((root) => {
        root['k1'].edit(2, 3, 'TT');
      }, 'edit 2,3 TT by c1');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('should handle snapshot', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      // 01. Updates 700 changes over snapshot threshold.
      for (let idx = 0; idx < 700; idx++) {
        d1.update((root) => {
          root[`${idx}`] = idx;
        });
      }
      await c1.sync();

      // 02. Makes local changes then pull a snapshot from the agent.
      d2.update((root) => {
        root['key'] = 'value';
      });
      await c2.sync();
      assert.equal(d2.getRootObject()['key'], 'value');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can handle garbage collection for container type', async function () {
    const docKey = `${this.test.title}-${new Date().getTime()}`;
    const doc1 = yorkie.createDocument(testCollection, docKey);
    const doc2 = yorkie.createDocument(testCollection, docKey);

    const client1 = yorkie.createClient(testRPCAddr);
    const client2 = yorkie.createClient(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    await client2.attach(doc2);

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'sets 1, 2, 3');

    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      delete root['2'];
    }, 'removes 2');
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(4, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(4, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection for text type', async function () {
    const docKey = `${this.test.title}-${new Date().getTime()}`;
    const doc1 = yorkie.createDocument(testCollection, docKey);
    const doc2 = yorkie.createDocument(testCollection, docKey);

    const client1 = yorkie.createClient(testRPCAddr);
    const client2 = yorkie.createClient(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    await client2.attach(doc2);

    doc1.update((root) => {
      const text = root.createText('text');
      text.edit(0, 0, 'Hello World');
      const richText = root.createRichText('richText');
      richText.edit(0, 0, 'Hello World');
    }, 'sets test and richText');

    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      root['text'].edit(0, 1, 'a');
      root['text'].edit(1, 2, 'b');
      root['richText'].edit(0, 1, 'a', { b: '1' });
    }, 'edit text type elements');
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(3, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(3, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection with detached document test', async function () {
    const docKey = `${this.test.title}-${new Date().getTime()}`;
    const doc1 = yorkie.createDocument(testCollection, docKey);
    const doc2 = yorkie.createDocument(testCollection, docKey);

    const client1 = yorkie.createClient(testRPCAddr);
    const client2 = yorkie.createClient(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    await client2.attach(doc2);

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
      const text = root.createText('4');
      text.edit(0, 0, 'hi');
      const richText = root.createRichText('5');
      richText.edit(0, 0, 'hi');
    }, 'sets 1, 2, 3, 4, 5');

    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc1.update((root) => {
      delete root['2'];
      root['4'].edit(0, 1, 'h');
      root['5'].edit(0, 1, 'h', { b: '1' });
    }, 'removes 2 and edit text type elements');
    assert.equal(6, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (1, 1) -> (2, 1): syncedseqs:(1, 0)
    await client1.sync();
    assert.equal(6, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    await client2.detach(doc2);

    // (2, 1) -> (2, 2): syncedseqs:(1, x)
    await client2.sync();
    assert.equal(6, doc1.getGarbageLen());
    assert.equal(6, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, x): meet GC condition
    await client1.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(6, doc2.getGarbageLen());

    await client1.detach(doc1);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle increase operation', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createCounter('age', 0);
      });
      d1.update((root) => {
        root['age'].increase(1).increase(2);
        root.createCounter('length', 10);
      });

      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can handle concurrent increase operation', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createCounter('age', 0);
        root.createCounter('width', 0);
        root.createCounter('height', 0);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['age'].increase(1).increase(2);
        root['width'].increase(10);
      });
      d2.update((root) => {
        root['age'].increase(3.14).increase(2);
        root.createCounter('width', 2.5);
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can recover from temporary disconnect (manual sync)', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      // Normal Condition
      d2.update((root) => {
        root['k1'] = 'undefined';
      });

      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      // Simulate network error
      const xhr = sinon.useFakeXMLHttpRequest();
      xhr.onCreate = (req) => {
        req.respond(
          400,
          {
            'Content-Type': 'application/grpc-web-text+proto',
          },
          null,
        );
      };

      d2.update((root) => {
        root['k1'] = 'v1';
      });

      await c2.sync().catch((err) => {
        assert.equal(err.message, 'INVALID_STATE_ERR - 0');
      });
      await c1.sync().catch((err) => {
        assert.equal(err.message, 'INVALID_STATE_ERR - 0');
      });
      assert.equal(d1.toSortedJSON(), '{"k1":"undefined"}');
      assert.equal(d2.toSortedJSON(), '{"k1":"v1"}');

      // Back to normal condition
      xhr.restore();

      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test.title);
  });

  it('Can recover from temporary disconnect (realtime sync)', async function () {
    const c1 = yorkie.createClient(testRPCAddr);
    const c2 = yorkie.createClient(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = `${this.test.title}-${new Date().getTime()}`;
    const d1 = yorkie.createDocument(testCollection, docKey);
    const d2 = yorkie.createDocument(testCollection, docKey);

    await c1.attach(d1);
    await c2.attach(d2);

    const listener1 = new EventEmitter();
    const listener2 = new EventEmitter();
    const customSpy = (emitter: EventEmitter) => {
      return (event: ClientEvent | DocEvent) => {
        if (event.name == ClientEventType.DocumentSyncResult) {
          emitter.emit(event.value);
        } else {
          emitter.emit(event.name);
        }
      };
    };
    const spy1 = customSpy(listener1);
    const spy2 = customSpy(listener2);

    const unsub1 = {
      client: c1.subscribe(spy1),
      doc: d1.subscribe(spy1),
    };
    const unsub2 = {
      client: c2.subscribe(spy2),
      doc: d2.subscribe(spy2),
    };

    // Normal Condition
    d2.update((root) => {
      root['k1'] = 'undefined';
    });

    await waitFor(DocEventType.LocalChange, listener2); // d2 should be able to update
    await waitFor(DocEventType.RemoteChange, listener1); // d1 should be able to receive d2's update
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    // Simulate network error
    const xhr = sinon.useFakeXMLHttpRequest();
    xhr.onCreate = (req) => {
      req.respond(
        400,
        {
          'Content-Type': 'application/grpc-web-text+proto',
        },
        null,
      );
    };

    d2.update((root) => {
      root['k1'] = 'v1';
    });

    await waitFor(DocEventType.LocalChange, listener2); // d2 should be able to update
    await waitFor(DocumentSyncResultType.SyncFailed, listener2); // c2 should fail to sync
    c1.sync();
    await waitFor(DocumentSyncResultType.SyncFailed, listener1); // c1 should also fail to sync
    assert.equal(d1.toSortedJSON(), '{"k1":"undefined"}');
    assert.equal(d2.toSortedJSON(), '{"k1":"v1"}');

    // Back to normal condition
    xhr.restore();

    await waitFor(DocEventType.RemoteChange, listener1); // d1 should be able to receive d2's update
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    unsub1.client();
    unsub2.client();
    unsub1.doc();
    unsub2.doc();

    await c1.detach(d1);
    await c2.detach(d2);

    await c1.deactivate();
    await c2.deactivate();
  });
});
