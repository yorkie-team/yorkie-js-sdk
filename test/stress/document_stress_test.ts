import { assert } from 'chai';
import { DocumentReplica } from '@yorkie-js-sdk/src/document/document';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { TText } from '@yorkie-js-sdk/src/yorkie';

describe('Document stress', function () {
  it('garbage collection test for large size text 1', function () {
    const size = 100;
    const doc = DocumentReplica.create<{ k1: TText }>('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    // 01. initial
    doc.update((root) => {
      const text = root.createText!('k1');
      for (let i = 0; i < size; i++) {
        text.edit!(i, i, 'a');
      }
    }, 'initial');

    // 02. 100 nodes modified
    doc.update((root) => {
      const text = root['k1'];
      for (let i = 0; i < size; i++) {
        text.edit!(i, i + 1, 'b');
      }
    }, 'modify 100 nodes');

    // 03. GC
    assert.equal(size, doc.getGarbageLen());
    assert.equal(size, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });

  it('garbage collection test for large size text 2', function () {
    const size = 100;
    const doc = DocumentReplica.create<{ k1: TText }>('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    // 01. long text by one node
    doc.update((root) => {
      const text = root.createText!('k1');
      let str = '';
      for (let i = 0; i < size; i++) {
        str += 'a';
      }
      text.edit!(0, 0, str);
    }, 'initial large size');

    // 02. Modify one node multiple times
    doc.update((root) => {
      const text = root['k1'];
      for (let i = 0; i < size; i++) {
        if (i !== size) {
          text.edit!(i, i + 1, 'b');
        }
      }
    }, 'modify one node multiple times');

    // 03. GC
    assert.equal(size, doc.getGarbageLen());
    assert.equal(size, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });
});
