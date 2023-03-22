import { assert } from 'chai';
import yorkie, { DocEventType } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import {
  createEmitterAndSpy,
  waitFor,
  assertThrowsAsync,
} from '@yorkie-js-sdk/test/helper/helper';
import type { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { DocumentStatus } from '@yorkie-js-sdk/src/document/document';
import { YorkieError } from '@yorkie-js-sdk/src/util/error';

describe('Document', function () {
  it('Can attach/detach documents', async function () {
    type TestDoc = { k1: { ['k1-1']: string }; k2: Array<string> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
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

  it('Can watch documents', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ k1: string }>(docKey);
    const d2 = new yorkie.Document<{ k1: string }>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    const [emitter1, spy1] = createEmitterAndSpy();
    const [emitter2, spy2] = createEmitterAndSpy();
    const unsub1 = d1.subscribe(spy1);
    const unsub2 = d2.subscribe(spy2);

    d2.update((root) => {
      root['k1'] = 'v1';
    });

    await waitFor(DocEventType.LocalChange, emitter2);
    await waitFor(DocEventType.RemoteChange, emitter1);
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    unsub1();
    unsub2();

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle tombstone', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    await c1.attach(d1);
    await c2.attach(d2);

    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');

    await c1.sync();
    await c2.sync();
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    let prevArray: CRDTElement | undefined;
    d1.update((root) => {
      root.k1.push(3);
      prevArray = d1.getRootObject().get('k1') as unknown as CRDTElement;
    }, 'push element to k1');
    d2.update((root) => {
      root.k1 = [];
    }, 'reassign k1 with new array');
    await c2.sync();
    await c1.sync();

    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    assert.isTrue(prevArray?.isRemoved());
  });

  it('Can remove document', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client(testRPCAddr);
    const c1Key = c1.getKey();

    // 01. client is not activated.
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${c1Key} is not active`,
    );

    // 02. document is not attached.
    await c1.activate();
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );

    // 03. document is attached.
    await c1.attach(d1);
    await c1.remove(d1);

    // 04. try to update a removed document.
    assert.throws(
      () => {
        d1.update((root) => {
          root['k1'] = [1, 2];
        }, 'set array');
      },
      YorkieError,
      `${docKey} is removed`,
    );

    // 05. try to attach a removed document.
    assertThrowsAsync(
      async () => {
        await c1.attach(d1);
      },
      YorkieError,
      `${docKey} is not detached`,
    );

    await c1.deactivate();
  });

  it('Can create document with the same key as the removed document key', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 creates d1 and removes it.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');
    await c1.remove(d1);

    // 02. c2 creates d2 with the same key.
    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2);

    // 02. c1 creates d2 with the same key.
    const d3 = new yorkie.Document<TestDoc>(docKey);
    await c1.attach(d3);
    assert.equal(d2.toSortedJSON(), '{}');
    assert.equal(d3.toSortedJSON(), '{}');

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can know that document has been removed when doing client.sync()', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2);
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 updates d1 and removes it.
    d1.update((root) => {
      root['k1'].push(3);
    });
    await c1.remove(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2,3]}');
    assert.equal(d1.getStatus(), DocumentStatus.Removed);

    // 03. c2 syncs and checks that d2 is removed.
    await c2.sync();
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2,3]}');
    assert.equal(d2.getStatus(), DocumentStatus.Removed);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can know that document has been removed when doing client.detach()', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2);
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 removes d1 and c2 detaches d2.
    await c1.remove(d1);
    await c2.detach(d2);

    assert.equal(d1.getStatus(), DocumentStatus.Removed);
    assert.equal(d2.getStatus(), DocumentStatus.Removed);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('removed document removal test', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2);
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 removes d1 and c2 removes d2.
    await c1.remove(d1);
    await c2.remove(d2);
    assert.equal(d1.getStatus(), DocumentStatus.Removed);
    assert.equal(d2.getStatus(), DocumentStatus.Removed);

    await c1.deactivate();
    await c2.deactivate();
  });

  // State transition of document
  // ┌──────────┐ Attach ┌──────────┐ Remove ┌─────────┐
  // │ Detached ├───────►│ Attached ├───────►│ Removed │
  // └──────────┘        └─┬─┬──────┘        └─────────┘
  //           ▲           │ │     ▲
  //           └───────────┘ └─────┘
  //              Detach     PushPull
  it('document state transition test', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();

    // 01. abnormal behavior on detached state
    const d1 = new yorkie.Document<TestDoc>(docKey);
    assertThrowsAsync(
      async () => {
        await c1.detach(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.sync(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );

    // 02. abnormal behavior on attached state
    await c1.attach(d1);
    assertThrowsAsync(
      async () => {
        await c1.attach(d1);
      },
      YorkieError,
      `${docKey} is not detached`,
    );

    // 03. abnormal behavior on removed state
    await c1.remove(d1);
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.sync(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.detach(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );

    await c1.deactivate();
  });
});
