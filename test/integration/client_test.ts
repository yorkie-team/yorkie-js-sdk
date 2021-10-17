import { assert } from 'chai';
import * as sinon from 'sinon';
import yorkie from '@yorkie-js-sdk/src/yorkie';
import { DocEventType } from '@yorkie-js-sdk/src/document/document';
import {
  ClientEventType,
  DocumentSyncResultType,
} from '@yorkie-js-sdk/src/core/client';
import {
  createEmitterAndSpy,
  waitFor,
  delay,
} from '@yorkie-js-sdk/test/helper/helper';
import {
  testCollection,
  testRPCAddr,
  withTwoClientsAndDocuments,
} from '@yorkie-js-sdk/test/integration/integration_helper';

describe('Client', function () {
  it('Can be activated, deactivated', async function () {
    const clientKey = `${this.test!.title}-${new Date().getTime()}`;
    const clientWithKey = yorkie.createClient(testRPCAddr, {
      key: clientKey,
      syncLoopDuration: 50,
      reconnectStreamDelay: 1000,
    });
    assert.isFalse(clientWithKey.isActive());
    await clientWithKey.activate();
    assert.isTrue(clientWithKey.isActive());
    assert.equal(clientKey, clientWithKey.getKey());
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
    }, this.test!.title);
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
          '',
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
    }, this.test!.title);
  });

  it('Can recover from temporary disconnect (realtime sync)', async function () {
    const c1 = yorkie.createClient(testRPCAddr);
    const c2 = yorkie.createClient(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = `${this.test!.title}-${new Date().getTime()}`;
    const d1 = yorkie.createDocument(testCollection, docKey);
    const d2 = yorkie.createDocument(testCollection, docKey);

    await c1.attach(d1);
    await c2.attach(d2);

    const [emitter1, spy1] = createEmitterAndSpy((event) =>
      event.type === ClientEventType.DocumentSynced ? event.value : event.type,
    );
    const [emitter2, spy2] = createEmitterAndSpy((event) =>
      event.type === ClientEventType.DocumentSynced ? event.value : event.type,
    );

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

    await waitFor(DocEventType.LocalChange, emitter2); // d2 should be able to update
    await waitFor(DocEventType.RemoteChange, emitter1); // d1 should be able to receive d2's update
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    // Simulate network error
    const xhr = sinon.useFakeXMLHttpRequest();
    xhr.onCreate = (req) => {
      req.respond(
        400,
        {
          'Content-Type': 'application/grpc-web-text+proto',
        },
        '',
      );
    };

    d2.update((root) => {
      root['k1'] = 'v1';
    });

    await waitFor(DocEventType.LocalChange, emitter2); // d2 should be able to update
    await waitFor(DocumentSyncResultType.SyncFailed, emitter2); // c2 should fail to sync
    c1.sync();
    await waitFor(DocumentSyncResultType.SyncFailed, emitter1); // c1 should also fail to sync
    assert.equal(d1.toSortedJSON(), '{"k1":"undefined"}');
    assert.equal(d2.toSortedJSON(), '{"k1":"v1"}');

    // Back to normal condition
    xhr.restore();

    await waitFor(DocEventType.RemoteChange, emitter1); // d1 should be able to receive d2's update
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

  it('Can update its metadata', async function () {
    const c1 = yorkie.createClient(testRPCAddr, { metadata: { name: 'c1' } });
    const c2 = yorkie.createClient(testRPCAddr, { metadata: { name: 'c2' } });
    await c1.activate();
    await c2.activate();

    const [emitter1, spy1] = createEmitterAndSpy();
    const [emitter2, spy2] = createEmitterAndSpy();

    const docKey = `${this.test!.title}-${new Date().getTime()}`;
    const d1 = yorkie.createDocument(testCollection, docKey);
    const d2 = yorkie.createDocument(testCollection, docKey);

    await c1.attach(d1);
    await c2.attach(d2);

    // Since attach's response doesn't wait for the watch ready,
    // We need to wait here until the threshold.
    await delay(100);

    const unsub1 = c1.subscribe(spy1);
    const unsub2 = c2.subscribe(spy2);

    // Since `updateMetadata` handles event publishing synchronously with
    // Memory Coordinator, We need to wait for the event from the peer wihout
    // waiting for the response of `updateMetadata` here.
    c1.updateMetadata('name', 'c1+');
    await waitFor(ClientEventType.PeersChanged, emitter2);

    c2.updateMetadata('name', 'c2+');
    await waitFor(ClientEventType.PeersChanged, emitter1);

    assert.equal(
      JSON.stringify(c1.getPeers(d1.getKey())),
      JSON.stringify(c2.getPeers(d2.getKey())),
    );

    unsub1();
    unsub2();

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });
});
