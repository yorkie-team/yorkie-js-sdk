import { assert } from 'chai';
import { DocumentReplica } from '../../src/document/document';
import { JSONElement } from '../../src/document/json/element';
import { TimeTicket } from '../../src/document/time/ticket';
import { MaxTimeTicket } from '../../src/document/time/ticket';

import { withTwoClientsAndDocuments } from './integration_helper';

describe('Array', function () {
  it('should handle delete operations', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = ['1', '2', '3'];
    }, 'set {"k1":["1","2","3"]}');
    assert.equal('{"k1":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['k1'][1];
      root['k1'].push('4');
    }, 'set {"k1":["1","3","4"]}');
    assert.equal('{"k1":["1","3","4"]}', doc.toSortedJSON());
  });

  it('can push array element after delete operation', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = ['1', '2', '3'];
    }, 'set {"k1":["1","2","3"]}');
    assert.equal('{"k1":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['k1'][1];
      root['k1'].push('4');
    }, 'set {"k1":["1","3","4"]}');

    doc.update((root) => {
      root['k1'].push([4, 5, 6]);
      assert.equal('{"k1":["1","3","4",[4,5,6]]}', root.toJSON());
    });

    assert.equal('{"k1":["1","3","4",[4,5,6]]}', doc.toJSON());
  });

  it('can push object element after delete operation', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = ['1', '2', '3'];
    }, 'set {"k1":["1","2","3"]}');
    assert.equal('{"k1":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['k1'][1];
      root['k1'].push('4');
    }, 'set {"k1":["1","3","4"]}');

    doc.update((root) => {
      root['k1'].push({ a: '1', b: '2' });
      assert.equal('{"k1":["1","3","4",{"a":"1","b":"2"}]}', root.toJSON());
    });

    assert.equal('{"k1":["1","3","4",{"a":"1","b":"2"}]}', doc.toJSON());
  });

  it('can push array', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');

    doc.update((root) => {
      root.arr = [1, 2, 3];
      root.arr.push([4, 5, 6]);
      assert.equal('{"arr":[1,2,3,[4,5,6]]}', root.toJSON());
    });
    assert.equal('{"arr":[1,2,3,[4,5,6]]}', doc.toJSON());
  });

  it('can push element then delete it by ID in array', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let toDelete: JSONElement;
    doc.update((root) => {
      root['list'] = [];
      assert.equal(1, root['list'].push(4));
      assert.equal(2, root['list'].push(3));
      assert.equal(3, root['list'].push(2));
      assert.equal(4, root['list'].push(1));
      toDelete = root['list'].getElementByIndex(2);
    }, 'set {"list":[4,3,2,1]}');

    assert.equal('{"list":[4,3,2,1]}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'].deleteByID(toDelete.getID());
    }, 'delete 2');
    assert.equal('{"list":[4,3,1]}', doc.toSortedJSON());

    doc.update((root) => {
      assert.equal(4, root['list'].push(2));
    }, 'push 2');
    assert.equal('{"list":[4,3,1,2]}', doc.toSortedJSON());
  });

  it('can insert an element after the given element in array', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let prev: JSONElement;
    doc.update((root) => {
      root['list'] = [];
      root['list'].push(1);
      root['list'].push(2);
      root['list'].push(4);
      prev = root['list'].getElementByIndex(1);
    }, 'set {"list":[1,2,4]}');

    assert.equal('{"list":[1,2,4]}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'].insertAfter(prev.getID(), 3);
    }, 'insert 3');
    assert.equal('{"list":[1,2,3,4]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['list'][1];
    }, 'remove 2');
    assert.equal('{"list":[1,3,4]}', doc.toSortedJSON());

    doc.update((root) => {
      prev = root['list'].getElementByIndex(0);
      root['list'].insertAfter(prev.getID(), 2);
    }, 'insert 2');
    assert.equal('{"list":[1,2,3,4]}', doc.toSortedJSON());

    const root = doc.getRoot();
    for (let idx = 0; idx < root['list'].length; idx++) {
      assert.equal(idx + 1, root['list'][idx]);
      assert.equal(idx + 1, root['list'].getElementByIndex(idx).getValue());
    }
  });

  it('can move an element before the given element in array', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'] = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const next = root['list'].getElementByIndex(0);
      const item = root['list'].getElementByIndex(2);
      root['list'].moveBefore(next.getID(), item.getID());
      assert.equal('{"list":[2,0,1]}', root.toJSON());
    });

    doc.update((root) => {
      const next = root['list'].getElementByIndex(0);
      const item = root['list'].getElementByIndex(2);
      root['list'].moveBefore(next.getID(), item.getID());
      assert.equal('{"list":[1,2,0]}', root.toJSON());
    });
  });

  it('can move an element after the given element in array', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'] = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const prev = root['list'].getElementByIndex(0);
      const item = root['list'].getElementByIndex(2);
      root['list'].moveAfter(prev.getID(), item.getID());
      assert.equal('{"list":[0,2,1]}', root.toJSON());
    });

    doc.update((root) => {
      const prev = root['list'].getElementByIndex(0);
      const item = root['list'].getElementByIndex(2);
      root['list'].moveAfter(prev.getID(), item.getID());
      assert.equal('{"list":[0,1,2]}', root.toJSON());
    });
  });

  it('can insert an element at the first of array', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'] = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const item = root['list'].getElementByIndex(2);
      root['list'].moveFront(item.getID());
      assert.equal('{"list":[2,0,1]}', root.toJSON());
    });

    doc.update((root) => {
      const item = root['list'].getElementByIndex(1);
      root['list'].moveFront(item.getID());
      assert.equal('{"list":[0,2,1]}', root.toJSON());
    });

    doc.update((root) => {
      const item = root['list'].getElementByIndex(0);
      root['list'].moveFront(item.getID());
      assert.equal('{"list":[0,2,1]}', root.toJSON());
    });
  });

  it('can move an element at the last of array', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'] = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const item = root['list'].getElementByIndex(2);
      root['list'].moveLast(item.getID());
      assert.equal('{"list":[0,1,2]}', root.toJSON());
    });

    doc.update((root) => {
      const item = root['list'].getElementByIndex(1);
      root['list'].moveLast(item.getID());
      assert.equal('{"list":[0,2,1]}', root.toJSON());
    });

    doc.update((root) => {
      const item = root['list'].getElementByIndex(0);
      root['list'].moveLast(item.getID());
      assert.equal('{"list":[2,1,0]}', root.toJSON());
    });
  });

  it('Can handle concurrent insertAfter operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      let prev: JSONElement;
      d1.update((root) => {
        root['k1'] = [1, 2, 3, 4];
        prev = root['k1'].getElementByIndex(1);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].deleteByID(prev.getID());
        assert.equal('{"k1":[1,3,4]}', root.toJSON());
      });
      d2.update((root) => {
        root['k1'].insertAfter(prev.getID(), 2);
        assert.equal('{"k1":[1,2,2,3,4]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal('{"k1":[1,2,3,4]}', d1.toJSON());

      d1.update((root) => {
        const prev = root['k1'].getElementByIndex(1);
        root['k1'].insertAfter(prev.getID(), '2.1');
        assert.equal('{"k1":[1,2,"2.1",3,4]}', root.toJSON());
      });
      d2.update((root) => {
        const prev = root['k1'].getElementByIndex(1);
        root['k1'].insertAfter(prev.getID(), '2.2');
        assert.equal('{"k1":[1,2,"2.2",3,4]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveBefore operations with the same position', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[2,0,1]}', root.toJSON());
      });

      d1.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[1,2,0]}', root.toJSON());
      });

      d2.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[1,0,2]}', root.toJSON());
      });

      d2.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveBefore operations from the different position', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[1,0,2]}', root.toJSON());
      });

      d2.update((root) => {
        const next = root['k1'].getElementByIndex(1);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
        assert.equal('{"k1":[0,2,1]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveFront operations with the item which has the different index', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveFront(item.getID());
        assert.equal('{"k1":[2,0,1]}', root.toJSON());
      });

      d1.update((root) => {
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveFront(item.getID());
        assert.equal('{"k1":[1,2,0]}', root.toJSON());
      });

      d2.update((root) => {
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveFront(item.getID());
        assert.equal('{"k1":[1,0,2]}', root.toJSON());
      });

      d2.update((root) => {
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveFront(item.getID());
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveFront operations with the item which has the same index', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveFront(item.getID());
        assert.equal('{"k1":[2,0,1]}', root.toJSON());
      });

      d2.update((root) => {
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveFront(item.getID());
        assert.equal('{"k1":[2,0,1]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveAfter operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveLast(item.getID());
        assert.equal('{"k1":[0,2,1]}', root.toJSON());
      });

      d2.update((root) => {
        const item = root['k1'].getElementByIndex(0);
        root['k1'].moveLast(item.getID());
        assert.equal('{"k1":[1,2,0]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent insertAfter and moveBefore operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      let prev: JSONElement;
      d1.update((root) => {
        root['k1'] = [0];
        prev = root['k1'].getElementByIndex(0);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].insertAfter(prev.getID(), 1);
        assert.equal('{"k1":[0,1]}', root.toJSON());
      });

      d2.update((root) => {
        root['k1'].insertAfter(prev.getID(), 2);
        assert.equal('{"k1":[0,2]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveBefore(next.getID(), item.getID());
      });

      d2.update((root) => {
        const next = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveBefore(next.getID(), item.getID());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveAfter', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        const prev = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(1);
        root['k1'].moveAfter(prev.getID(), item.getID());
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });

      d2.update((root) => {
        const prev = root['k1'].getElementByIndex(0);
        const item = root['k1'].getElementByIndex(2);
        root['k1'].moveAfter(prev.getID(), item.getID());
        assert.equal('{"k1":[0,2,1]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent add operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = ['1'];
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].push('2');
      });
      d2.update((root) => {
        root['k1'].push('3');
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent insertBefore and delete operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      let prev: JSONElement;

      d1.update((root) => {
        root['k1'] = [1];
        prev = root['k1'].getElementByIndex(0);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].deleteByID(prev.getID());
        assert.equal('{"k1":[]}', root.toJSON());
      });
      d2.update((root) => {
        root['k1'].insertBefore(prev.getID(), 2);
        assert.equal('{"k1":[2,1]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal('{"k1":[2]}', d1.toJSON());
    }, this.test!.title);
  });

  it('Can handle complex concurrent insertBefore and delete operations', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      let prev: JSONElement;

      d1.update((root) => {
        root['k1'] = [1, 2, 3, 4];
        prev = root['k1'].getElementByIndex(1);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].deleteByID(prev.getID());
        assert.equal('{"k1":[1,3,4]}', root.toJSON());
      });
      d2.update((root) => {
        root['k1'].insertBefore(prev.getID(), 5);
        assert.equal('{"k1":[1,5,2,3,4]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal('{"k1":[1,5,3,4]}', d1.toJSON());

      d1.update((root) => {
        const prev = root['k1'].getElementByIndex(3);
        root['k1'].insertBefore(prev.getID(), 6);
        assert.equal('{"k1":[1,5,3,6,4]}', root.toJSON());
      });
      d2.update((root) => {
        const prev = root['k1'].getElementByIndex(0);
        root['k1'].insertBefore(prev.getID(), 7);
        assert.equal('{"k1":[7,1,5,3,4]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal('{"k1":[7,1,5,3,6,4]}', d1.toJSON());
    }, this.test!.title);
  });

  it('Returns undefined when looking up an element that doesnt exist', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    let targetID: TimeTicket;

    doc.update((root) => {
      root['list'] = [0, 1, 2];
      targetID = root['list'].getElementByIndex(2).getID();
    });

    doc.update((root) => {
      root['list'].deleteByID(targetID);
    });

    assert.equal('{"list":[0,1]}', doc.toSortedJSON());

    doc.garbageCollect(MaxTimeTicket);
    doc.update((root) => {
      const elem = root['list'].getElementByID(targetID);
      assert.isUndefined(elem);
    });
  });

  it('Can set value in array index', async function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());
    doc.update((root) => {
      root['k1'] = [];
      root['k1'][0] = 1;
      assert.equal('{"k1":[]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'] = [0, 1, 2];
      assert.equal('{"k1":[0,1,2]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'][0] = 3;
      assert.equal('{"k1":[3,1,2]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'][1] = 4;
      assert.equal('{"k1":[3,4,2]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'][2] = 5;
      assert.equal('{"k1":[3,4,5]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1']['a'] = 5;
      assert.equal('{"k1":[3,4,5]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'][4] = 6;
      assert.equal('{"k1":[3,4,5]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'][-1] = 7;
      assert.equal('{"k1":[3,4,5]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'][0] = [1, 2, 3];
      assert.equal('{"k1":[[1,2,3],4,5]}', root.toJSON());
    });
    doc.update((root) => {
      root['k1'][1] = { a: 1 };
      assert.equal('{"k1":[[1,2,3],{"a":1},5]}', root.toJSON());
    });
  });

  it('Can handle concurrent value setting', async function () {
    await withTwoClientsAndDocuments(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON());
      });
      await c1.sync();
      await c2.sync();

      assert.equal(d1.toJSON(), d2.toJSON());

      d1.update((root) => {
        root['k1'][0] = 3;
        assert.equal('{"k1":[3,1,2]}', root.toJSON());
      });

      d2.update((root) => {
        root['k1'][0] = 4;
        assert.equal('{"k1":[4,1,2]}', root.toJSON());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toJSON(), d2.toJSON());
      assert.equal('{"k1":[4,1,2]}', d1.toJSON());
    }, this.test!.title);
  });
});
