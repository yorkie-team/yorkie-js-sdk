import { assert } from 'chai';
import { Document } from '../../src/document/document';

describe('Object', function () {
  it('should apply updates inside nested map', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k1']['k1-2'] = 'v2';
    }, 'set {"k1-1":"v1","k1-2":"v2":}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['k1-2'] = 'v3';
    }, 'set {"k1-2":"v3"}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k2'] = ['1', '2'];
      root['k2'].push('3');
    }, 'set ["1","2","3"]');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

    assert.throws(() => {
      doc.update((root) => {
        root['k2'].push('4');
        throw new Error('dummy error');
      }, 'push "4"');
    }, 'dummy error');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root['k2'].push('4');
    }, 'push "4"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root['k2'].push({ 'k2-5': 'v4' });
    }, 'push "{k2-5: 4}"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4",{"k2-5":"v4"}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle delete operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1', 'k1-2': 'v2' };
    }, 'set {"k1":{"k1-1":"v1","k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['k1']['k1-1'];
      root['k1']['k1-3'] = 'v4';
    }, 'set {"k1":{"k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-2":"v2","k1-3":"v4"}}', doc.toSortedJSON());
  });

  it('Object.keys, Object.values and Object.entries test', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.content = { a: 1, b: 2, c: 3 };
    }, 'set a, b, c');
    assert.equal('{"content":{"a":1,"b":2,"c":3}}', doc.toSortedJSON());

    const content = doc.getRoot().content;
    assert.equal('a,b,c', Object.keys(content).join(','));
    assert.equal('1,2,3', Object.values(content).join(','));
    assert.equal('a,1,b,2,c,3', Object.entries(content).join(','));
  });
});
