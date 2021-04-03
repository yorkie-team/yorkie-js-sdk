import { assert } from 'chai';
import { Document } from '../../src/document/document';
import { InitialCheckpoint } from '../../src/document/checkpoint/checkpoint';

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
});
