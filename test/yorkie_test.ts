import { assert } from 'chai';
import yorkie from '../src/yorkie';

const testRPCAddr = 'http://localhost:8080';

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
    const doc1 = yorkie.createDocument('test-col', this.test.title);
    const doc2 = yorkie.createDocument('test-col', this.test.title);

    const client1 = yorkie.createClient(testRPCAddr);
    const client2 = yorkie.createClient(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attachDocument(doc1);
    doc1.update((root) => {
      root['k1'] = {'k1-1': 'v1'};
      root['k2'] = ['1', '2'];
    }, 'set v1, v2');
    await client1.pushPull();
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc1.toJSON());

    await client2.attachDocument(doc2);
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc2.toJSON());

    await client1.detachDocument(doc1);
    await client2.detachDocument(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });
});
