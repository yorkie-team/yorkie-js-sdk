import { assert } from 'chai';
import { Document } from '../../src/document/document';
import { InitialCheckpoint } from '../../src/document/checkpoint/checkpoint';
import yorkie from '../../src/yorkie';
import { withTwoClientsAndDocuments } from './integration_helper';

describe('Primitive', function () {
  it('should apply updates of string', function () {
    const doc1 = Document.create('test-col', 'test-doc');
    const doc2 = Document.create('test-col', 'test-doc');

    assert.isTrue(doc1.getCheckpoint().equals(InitialCheckpoint));
    assert.isFalse(doc1.hasLocalChanges());

    doc1.update((root) => {
      root['k1'] = 'v1';
      root['k2'] = 'v2';
      assert.equal('v1', root['k1']);
    }, 'set v1, v2');
    assert.equal('{"k1":"v1","k2":"v2"}', doc1.toSortedJSON());

    assert.isTrue(doc1.hasLocalChanges());
    assert.notEqual(doc1, doc2);
  });

  it('can rollback, primitive deepcopy', function () {
    const doc = Document.create('test-col', 'test-doc');

    doc.update((root) => {
      root['k1'] = {};
      root['k1']['k1.1'] = 1;
      root['k1']['k1.2'] = 2;
    });
    assert.equal('{"k1":{"k1.1":1,"k1.2":2}}', doc.toSortedJSON());
    assert.throws(() => {
      doc.update((root) => {
        delete root['k1']['k1.1'];
        throw Error('dummy error');
      }, 'dummy error');
    });
    assert.equal('{"k1":{"k1.1":1,"k1.2":2}}', doc.toSortedJSON());
  });

  it('Can handle primitive types', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k0'] = null;
        root['k1'] = true;
        root['k2'] = 2147483647;
        root['k3'] = yorkie.Long.fromString('9223372036854775807');
        root['k4'] = 1.79;
        root['k5'] = '4';
        root['k6'] = new Uint8Array([65, 66]);
        root['k7'] = new Date();
        root['k8'] = undefined;
      });

      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });
});
