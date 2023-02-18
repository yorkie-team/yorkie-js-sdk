import { assert } from 'chai';
import yorkie, { DocEventType } from '@yorkie-js-sdk/src/yorkie';
import { testRPCAddr } from '@yorkie-js-sdk/test/integration/integration_helper';
import {
  createEmitterAndSpy,
  waitFor,
} from '@yorkie-js-sdk/test/helper/helper';
import type { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';

describe('Document', function () {
  it('Can attach/detach documents', async function () {
    type TestDoc = { k1: { ['k1-1']: string }; k2: Array<string> };
    const docKey = `${this.test!.title}-${new Date().getTime()}`;
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

    const docKey = `${this.test!.title}-${new Date().getTime()}`;
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
    const docKey = `${this.test!.title}-${new Date().getTime()}`;
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
});
