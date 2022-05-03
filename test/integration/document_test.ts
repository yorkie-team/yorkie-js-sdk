import { assert } from 'chai';
import yorkie from '@yorkie-js-sdk/src/yorkie';
import { DocEventType } from '@yorkie-js-sdk/src/document/document';
import { testRPCAddr } from '@yorkie-js-sdk/test/integration/integration_helper';
import {
  createEmitterAndSpy,
  waitFor,
} from '@yorkie-js-sdk/test/helper/helper';

describe('Document', function () {
  it('Can attach/detach documents', async function () {
    type TestDoc = { k1: { ['k1-1']: string }; k2: Array<string> };
    const docKey = `${this.test!.title}-${new Date().getTime()}`;
    const doc1 = yorkie.createDocument<TestDoc>(docKey);
    const doc2 = yorkie.createDocument<TestDoc>(docKey);

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

  it('Can watch documents', async function () {
    const c1 = yorkie.createClient(testRPCAddr);
    const c2 = yorkie.createClient(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = `${this.test!.title}-${new Date().getTime()}`;
    const d1 = yorkie.createDocument<{ k1: string }>(docKey);
    const d2 = yorkie.createDocument<{ k1: string }>(docKey);
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
});
