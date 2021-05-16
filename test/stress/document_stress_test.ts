import { assert } from 'chai';
import { printElapsedTime } from '../helper/helper';
import { DocumentReplica } from '../../src/document/document';
import { MaxTimeTicket } from '../../src/document/time/ticket';

describe('Document stress', function () {
  it('garbage collection test for large size text 1', function () {
    const size = 100;
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    // 01. initial
    doc.update((root) => {
      const text = root.createText('k1');
      for (let i = 0; i < size; i++) {
        text.edit(i, i, 'a');
      }
    }, 'initial');

    // 02. 100 nodes modified
    doc.update((root) => {
      const text = root['k1'];
      for (let i = 0; i < size; i++) {
        text.edit(i, i + 1, 'b');
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
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    // 01. long text by one node
    doc.update((root) => {
      const text = root.createText('k1');
      let str = '';
      for (let i = 0; i < size; i++) {
        str += 'a';
      }
      text.edit(0, 0, str);
    }, 'initial large size');

    // 02. Modify one node multiple times
    doc.update((root) => {
      const text = root['k1'];
      for (let i = 0; i < size; i++) {
        if (i !== size) {
          text.edit(i, i + 1, 'b');
        }
      }
    }, 'modify one node multiple times');

    // 03. GC
    assert.equal(size, doc.getGarbageLen());
    assert.equal(size, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });

  it('move element in large array test', function () {
    const size = 10_000;
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let start = Date.now();

    doc.update((root) => {
      root.arr = [];
      for (let i = 0; i < size; i++) {
        root.arr.push(i);
      }
    }, 'initial large array');
    printElapsedTime(start);

    start = Date.now();
    doc.update((root) => {
      for (let i = 0; i < size; i++) {
        const first = root.arr.getElementByIndex(0);
        const last = root.arr.getElementByIndex(size - 1);
        root.arr.moveBefore(first.getID(), last.getID());
      }
    }, 'move last to first');

    printElapsedTime(start);
  });
});
