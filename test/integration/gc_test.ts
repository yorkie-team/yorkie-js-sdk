import { assert } from 'chai';
import { Document } from '../../src/document/document';
import { PlainText } from '../../src/document/json/plain_text';
import { MaxTimeTicket } from '../../src/document/time/ticket';
import { JSONArray } from '../../src/document/json/array';

describe('Garbage Collection', function () {
  it('garbage collection test', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'set 1, 2, 3');
    assert.equal('{"1":1,"2":[1,2,3],"3":3}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['2'];
    }, 'deletes 2');
    assert.equal('{"1":1,"3":3}', doc.toSortedJSON());
    assert.equal(4, doc.getGarbageLen());
    assert.equal(4, doc.garbageCollect(MaxTimeTicket));
    assert.equal(0, doc.getGarbageLen());
  });

  it('garbage collection test2', function () {
    const size = 10000;
    const doc = Document.create('test-col', 'test-doc');
    doc.update((root) => {
      root['1'] = Array.from(Array(size).keys());
    }, 'sets big array');

    doc.update((root) => {
      delete root['1'];
    }, 'deletes the array');

    assert.equal(size + 1, doc.garbageCollect(MaxTimeTicket));
  });

  it('garbage collection test3', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'] = [1, 2, 3];
    }, 'set 1, 2, 3');
    assert.equal('{"list":[1,2,3]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['list'][1];
    }, 'deletes 2');
    assert.equal('{"list":[1,3]}', doc.toSortedJSON());

    assert.equal(1, doc.getGarbageLen());
    assert.equal(1, doc.garbageCollect(MaxTimeTicket));
    assert.equal(0, doc.getGarbageLen());

    const root = (doc.getRootObject().get('list') as JSONArray)
      .getElements()
      .getAnnotatedString();
    const clone = (doc.getClone()!.get('list') as JSONArray)
      .getElements()
      .getAnnotatedString();

    assert.equal(root, clone);
  });

  it('text garbage collection test', function () {
    const doc = Document.create<{ text: PlainText }>('test-col', 'test-doc');
    doc.update((root) => root.createText('text'));
    doc.update((root) => root.text.edit(0, 0, 'ABCD'));
    doc.update((root) => root.text.edit(0, 2, '12'));

    assert.equal(
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:0 AB}[2:00:1:2 CD]',
      doc.getRoot().text.getAnnotatedString(),
    );

    assert.equal(1, doc.getGarbageLen());
    doc.garbageCollect(MaxTimeTicket);
    assert.equal(0, doc.getGarbageLen());

    assert.equal(
      '[0:00:0:0 ][3:00:1:0 12][2:00:1:2 CD]',
      doc.getRoot().text.getAnnotatedString(),
    );

    doc.update((root) => root.text.edit(2, 4, ''));

    assert.equal(
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:2 CD}',
      doc.getRoot().text.getAnnotatedString(),
    );
  });

  it('garbage collection test for text', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let expected_msg = '{"k1":"Hello mario"}';
    doc.update((root) => {
      const text = root.createText('k1');
      text.edit(0, 0, 'Hello world');
      text.edit(6, 11, 'mario');
      assert.equal(expected_msg, root.toJSON());
    }, 'edit text k1');
    assert.equal(expected_msg, doc.toSortedJSON());
    assert.equal(1, doc.getGarbageLen());

    expected_msg = '{"k1":"Hi jane"}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi');
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane');
      assert.equal(expected_msg, root.toJSON());
    }, 'deletes 2');
    assert.equal(expected_msg, doc.toSortedJSON());

    const expectedGarbageLen = 4;
    assert.equal(expectedGarbageLen, doc.getGarbageLen());
    assert.equal(expectedGarbageLen, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });

  it('garbage collection test for rich text', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let expected_msg =
      '{"k1":[{"attrs":{"b":"1"},"content":Hello },{"attrs":{},"content":mario},{"attrs":{},"content":\n}]}';
    doc.update((root) => {
      const text = root.createRichText('k1');
      text.edit(0, 0, 'Hello world', { b: '1' });
      text.edit(6, 11, 'mario');
      assert.equal(expected_msg, root.toJSON());
    }, 'edit rich text k1');
    assert.equal(expected_msg, doc.toSortedJSON());
    assert.equal(1, doc.getGarbageLen());

    expected_msg =
      '{"k1":[{"attrs":{"b":"1"},"content":Hi},{"attrs":{"b":"1"},"content": },{"attrs":{},"content":j},{"attrs":{"b":"1"},"content":ane},{"attrs":{},"content":\n}]}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi', { b: '1' });
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane', { b: '1' });
      assert.equal(expected_msg, root.toJSON());
    }, 'edit rich text k1');
    assert.equal(expected_msg, doc.toSortedJSON());

    const expectedGarbageLen = 4;
    assert.equal(expectedGarbageLen, doc.getGarbageLen());
    assert.equal(expectedGarbageLen, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });
});
