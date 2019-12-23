import { assert } from 'chai';
import { Document } from '../../src/document/document';
import { InitialCheckpoint } from '../../src/document/checkpoint/checkpoint';

describe('Document', function() {
  it('should apply updates of string', function() {
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

  it('should apply updates inside nested map', function () {
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

    doc.update((root) => {
      root['k2'].push({"k2-5": "v4"});
    }, 'push "{k2-5: 4}"');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4",{"k2-5":"v4"}]}', doc.toJSON());
  });

  it('should handle delete operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toJSON());

    doc.update((root) => {
      root['k1'] = {'k1-1': 'v1', 'k1-2': 'v2'};
      root['k2'] = ['1','2','3'];
    }, 'set {"k1":{"k1-1":"v1","k1-2":"v2"},"k2":["1","2","3"]}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"},"k2":["1","2","3"]}', doc.toJSON());

    doc.update((root) => {
      delete root['k1']['k1-1'];
      root['k1']['k1-3'] = 'v4';

      delete root['k2'][1];
      root['k2'].push('4');
    }, 'set {"k1":{"k1-2":"v2"},"k2":["1","3","4"]}');
    assert.equal('{"k1":{"k1-2":"v2","k1-3":"v4"},"k2":["1","3","4"]}', doc.toJSON());
  });

  it('should handle edit operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toJSON());

    //           ------ ins links ----
    //           |            |      |
    // [init] - [A] - [12] - {BC} - [D]
    doc.update((root) => {
      const text = root.setNewText('k1');
      text.edit(0, 0, 'ABCD');
      text.edit(1, 3, '12');
    }, 'set {"k1":"A12D"');

    doc.update((root) => {
      const text = root.getText('k1');
      assert.equal(
        '[0:0:00:0 ][1:2:00:0 A][1:3:00:0 12]{1:2:00:1 BC}[1:2:00:3 D]',
        text.getAnnotatedString()
      );

      let range = text.createRange(0, 0);
      assert.equal('0:0:00:0:0', range[0].getAnnotatedString())

      range = text.createRange(1, 1);
      assert.equal('1:2:00:0:1', range[0].getAnnotatedString())

      range = text.createRange(2, 2);
      assert.equal('1:3:00:0:1', range[0].getAnnotatedString());

      range = text.createRange(3, 3)
      assert.equal('1:3:00:0:2', range[0].getAnnotatedString())

      range = text.createRange(4, 4);
      assert.equal('1:2:00:3:1', range[0].getAnnotatedString())
    });

    assert.equal('{"k1":"A12D"}', doc.toJSON());
  });
});
