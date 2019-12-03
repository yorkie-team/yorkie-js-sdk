import { assert } from 'chai';
import { Document } from '../../src/document/document';
import { InitialCheckpoint } from '../../src/document/checkpoint';

describe('Document', () => {
  it('should apply updates of string', () => {
    const doc1 = Document.create('test-col', 'test-doc');
    const doc2 = Document.create('test-col', 'test-doc');

    assert.isTrue(doc1.getCheckpoint().equals(InitialCheckpoint));
    assert.isFalse(doc1.hasLocalChanges());

    doc1.update((root) => {
      root['k1'] = 'v1';
      root['k2'] = 'v2';
      assert.equal('v1', root['k1']);
    }, 'set v1, v2');
    assert.equal('{"k1":"v1","k2":"v2"}', doc1.toJSON());

    assert.isTrue(doc1.hasLocalChanges());
    assert.notEqual(doc1, doc2);
  });

  it('should apply updates inside nested map', () => {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toJSON());

    doc.update((root) => {
      root['k1'] = {'k1-1': 'v1'};
      root['k1']['k1-2'] = 'v2';
    }, 'set {"k1-1":"v1","k1-2":"v2":}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toJSON());

    doc.update((root) => {
      root['k1']['k1-2'] = 'v3';
    }, 'set {"k1-2":"v3"}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"}}', doc.toJSON());

    doc.update((root) => {
      root['k2'] = ["1","2"];
      root['k2'].push("3");
    }, 'set ["1","2","3"]');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}', doc.toJSON());

    assert.throws(() => {
      doc.update((root) => {
        root['k2'].push("4");
        throw new Error('dummy error');
      }, 'push "4"');
    }, 'dummy error');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}', doc.toJSON());

    doc.update((root) => {
      root['k2'].push("4");
    }, 'push "4"');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4"]}', doc.toJSON());

  });
});
