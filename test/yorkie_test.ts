import { assert } from 'chai';
import * as sinon from 'sinon';
import { Client } from '../src/core/client';
import { Document } from '../src/document/document';
import yorkie from '../src/yorkie';

const testRPCAddr = 'http://localhost:8080';
const testCollection = 'test-col';

// NOTE: In particular, we uses general functions, not arrow functions
// to access test title in test codes.
describe('Yorkie', function() {
  it('Can be activated, deactivated', async function() {
    const clientWithKey = yorkie.createClient(testRPCAddr, this.test.title);
    assert.isFalse(clientWithKey.isActive())
    await clientWithKey.activate();
    assert.isTrue(clientWithKey.isActive())
    assert.equal(this.test.title, clientWithKey.getKey())
    await clientWithKey.deactivate();
    assert.isFalse(clientWithKey.isActive())

    const clientWithoutKey = yorkie.createClient(testRPCAddr);
    assert.isFalse(clientWithoutKey.isActive())
    await clientWithoutKey.activate();
    assert.isTrue(clientWithoutKey.isActive())
    assert.isString(clientWithoutKey.getKey());
    assert.lengthOf(clientWithoutKey.getKey(), 36)
    await clientWithoutKey.deactivate();
    assert.isFalse(clientWithoutKey.isActive())
  });

  it('Can attach/detach documents', async function() {
    const doc1 = yorkie.createDocument(testCollection, this.test.title);
    const doc2 = yorkie.createDocument(testCollection, this.test.title);

    const client1 = yorkie.createClient(testRPCAddr);
    const client2 = yorkie.createClient(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    doc1.update((root) => {
      root['k1'] = {'k1-1': 'v1'};
      root['k2'] = ['1', '2'];
    }, 'set v1, v2');
    await client1.sync();
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc1.toJSON());

    await client2.attach(doc2);
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc2.toJSON());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle sync', async function() {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      const spy = sinon.spy();
      const unsub = d2.subscribe(spy);

      assert.equal(0, spy.callCount);

      d1.update((root) => {
        root['k1'] = 'v1';
      });
      await c1.sync(); await c2.sync();
      assert.equal(1, spy.callCount);

      d1.update((root) => {
        root['k2'] = 'v2';
      });
      await c1.sync(); await c2.sync();
      assert.equal(2, spy.callCount);

      unsub();

      d1.update((root) => {
        root['k3'] = 'v3';
      });
      await c1.sync(); await c2.sync();
      assert.equal(2, spy.callCount);
    }, this.test.title);
  });

  it('Can watch documents', async function() {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      await c1.watch(d1);
      c1.subscribe(() => {
        c1.sync();
      });

      d2.update((root) => {
        root['k1'] = 'v1';
      });
      await c2.sync();

      await new Promise(resolve => setTimeout(resolve, 500));
      assert.equal(d1.toJSON(), d2.toJSON());
    }, this.test.title);
  });

  it('Can handle primitive types', async function() {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      // TODO support more primitive types
      d1.update((root) => {
        root['k1'] = true;
        root['k2'] = 2147483647;
        // root['k3'] = yorkie.Long.fromString('9223372036854775807');
        // root['k4'] = 1.79;
        root['k5'] = '4';
        // root['k6'] = new Uint8Array([65,66]);
        // root['k7'] = new Date();
      });

      await c1.sync(); await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());
    }, this.test.title);
  });

  it('Can handle concurrent set/remove operations', async function() {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = 'v1';
      });
      d2.update((root) => {
        root['k1'] = 'v2';
      });
      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        root['k2'] = {};
      });
      await c1.sync(); await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        root['k2'] = 'v2';
      });
      d2.update((root) => {
        root['k2']['k2.1'] = {'k2.1.1': 'v3'};
      });
      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        root['k3'] = 'v4';
      });
      d2.update((root) => {
        root['k4'] = 'v5';
      });
      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        delete root['k3'];
      });
      d2.update((root) => {
        root['k3'] = 'v6';
      });
      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());
    }, this.test.title);
  });

  it('Can handle concurrent add operations', async function() {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = ['1'];
      });
      await c1.sync(); await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        root['k1'].push('2');
      });
      d2.update((root) => {
        root['k1'].push('3');
      });
      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());
    }, this.test.title);
  });

  it('should handle concurrent edit operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.getOrCreateText('k1');
      }, 'set new text by c1');
      await c1.sync(); await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const text = root.getText('k1');
        text.edit(0, 0, 'ABCD');
      }, 'edit 0,0 ABCD by c1');
      d2.update((root) => {
        const text = root.getText('k1');
        text.edit(0, 0, '1234');
      }, 'edit 0,0 1234 by c2');
      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const text = root.getText('k1');
        text.edit(2, 3, 'XX');
      }, 'edit 2,3 XX by c1');
      d2.update((root) => {
        const text = root.getText('k1');
        text.edit(2, 3, 'YY');
      }, 'edit 2,3 YY by c1');
      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const text = root.getText('k1');
        text.edit(4, 5, 'ZZ');
      }, 'edit 4,5 ZZ by c1');
      d2.update((root) => {
        const text = root.getText('k1');
        text.edit(2, 3, 'TT');
      }, 'edit 2,3 TT by c1');

      await c1.sync(); await c2.sync(); await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());
    }, this.test.title);
  });
});

async function withTwoClientsAndDocuments(
  callback: (c1: Client, d1: Document, c2: Client, d2: Document) => Promise<void>,
  title: string,
) {
  const client1 = yorkie.createClient(testRPCAddr);
  const client2 = yorkie.createClient(testRPCAddr);
  await client1.activate();
  await client2.activate();

  const doc1 = yorkie.createDocument(testCollection, title);
  const doc2 = yorkie.createDocument(testCollection, title);

  await client1.attach(doc1);
  await client2.attach(doc2);

  await callback(client1, doc1, client2, doc2);

  await client1.detach(doc1);
  await client2.detach(doc2);

  await client1.deactivate();
  await client2.deactivate();
}
