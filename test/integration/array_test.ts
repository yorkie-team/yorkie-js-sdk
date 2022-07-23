import { assert } from 'chai';
import { Document } from '@yorkie-js-sdk/src/document/document';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';
import {
  JSONArray,
  WrappedElement,
  Primitive,
  TimeTicket,
} from '@yorkie-js-sdk/src/yorkie';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

describe('Array', function () {
  it('should handle delete operations', function () {
    const doc = Document.create<{ k1: JSONArray<string> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.k1 = ['1', '2', '3'];
    }, 'set {"k1":["1","2","3"]}');
    assert.equal('{"k1":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root.k1[1];
      root.k1.push('4');
    }, 'set {"k1":["1","3","4"]}');
    assert.equal('{"k1":["1","3","4"]}', doc.toSortedJSON());
  });

  it('can push array element after delete operation', function () {
    const doc =
      Document.create<{ k1: JSONArray<string | Array<number>> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.k1 = ['1', '2', '3'];
    }, 'set {"k1":["1","2","3"]}');
    assert.equal('{"k1":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root.k1[1];
      root.k1.push('4');
    }, 'set {"k1":["1","3","4"]}');

    doc.update((root) => {
      root.k1.push([4, 5, 6]);
      assert.equal('{"k1":["1","3","4",[4,5,6]]}', root.toJSON!());
    });

    assert.equal('{"k1":["1","3","4",[4,5,6]]}', doc.toJSON());
  });

  it('can push object element after delete operation', function () {
    const doc = Document.create<{
      k1: JSONArray<string | { a: string; b: string }>;
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.k1 = ['1', '2', '3'];
    }, 'set {"k1":["1","2","3"]}');
    assert.equal('{"k1":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root.k1[1];
      root.k1.push('4');
    }, 'set {"k1":["1","3","4"]}');

    doc.update((root) => {
      root.k1.push({ a: '1', b: '2' });
      assert.equal('{"k1":["1","3","4",{"a":"1","b":"2"}]}', root.toJSON!());
    });

    assert.equal('{"k1":["1","3","4",{"a":"1","b":"2"}]}', doc.toJSON());
  });

  it('can push array', function () {
    const doc =
      Document.create<{ arr: Array<number | Array<number>> }>('test-doc');

    doc.update((root) => {
      root.arr = [1, 2, 3];
      root.arr.push([4, 5, 6]);
      assert.equal('{"arr":[1,2,3,[4,5,6]]}', root.toJSON!());
    });
    assert.equal('{"arr":[1,2,3,[4,5,6]]}', doc.toJSON());
  });

  it('can push element then delete it by ID in array', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let target: WrappedElement;
    doc.update((root) => {
      root.list = [];
      assert.equal(1, root.list.push(4));
      assert.equal(2, root.list.push(3));
      assert.equal(3, root.list.push(2));
      assert.equal(4, root.list.push(1));
      target = root.list.getElementByIndex!(2);
    }, 'set {"list":[4,3,2,1]}');

    assert.equal('{"list":[4,3,2,1]}', doc.toSortedJSON());

    doc.update((root) => {
      root.list.deleteByID!(target.getID!());
    }, 'delete 2');
    assert.equal('{"list":[4,3,1]}', doc.toSortedJSON());

    doc.update((root) => {
      assert.equal(4, root.list.push(2));
    }, 'push 2');
    assert.equal('{"list":[4,3,1,2]}', doc.toSortedJSON());
  });

  it('can insert an element after the given element in array', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let prev: WrappedElement;
    doc.update((root) => {
      root.list = [];
      root.list.push(1);
      root.list.push(2);
      root.list.push(4);
      prev = root.list.getElementByIndex!(1);
    }, 'set {"list":[1,2,4]}');

    assert.equal('{"list":[1,2,4]}', doc.toSortedJSON());

    doc.update((root) => {
      root.list.insertAfter!(prev.getID!(), 3);
    }, 'insert 3');
    assert.equal('{"list":[1,2,3,4]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root.list[1];
    }, 'remove 2');
    assert.equal('{"list":[1,3,4]}', doc.toSortedJSON());

    doc.update((root) => {
      prev = root.list.getElementByIndex!(0);
      root.list.insertAfter!(prev.getID!(), 2);
    }, 'insert 2');
    assert.equal('{"list":[1,2,3,4]}', doc.toSortedJSON());

    const root = doc.getRoot();
    for (let idx = 0; idx < root.list.length; idx++) {
      assert.equal(idx + 1, root.list[idx]);
    }
  });

  it('can move an element before the given element in array', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.list = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const next = root.list.getElementByIndex!(0);
      const item = root.list.getElementByIndex!(2);
      root.list.moveBefore!(next.getID!(), item.getID!());
      assert.equal('{"list":[2,0,1]}', root.toJSON!());
    });

    doc.update((root) => {
      const next = root.list.getElementByIndex!(0);
      const item = root.list.getElementByIndex!(2);
      root.list.moveBefore!(next.getID!(), item.getID!());
      assert.equal('{"list":[1,2,0]}', root.toJSON!());
    });
  });

  it('can move an element after the given element in array', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.list = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const prev = root.list.getElementByIndex!(0);
      const item = root.list.getElementByIndex!(2);
      root.list.moveAfter!(prev.getID!(), item.getID!());
      assert.equal('{"list":[0,2,1]}', root.toJSON!());
    });

    doc.update((root) => {
      const prev = root.list.getElementByIndex!(0);
      const item = root.list.getElementByIndex!(2);
      root.list.moveAfter!(prev.getID!(), item.getID!());
      assert.equal('{"list":[0,1,2]}', root.toJSON!());
    });
  });

  it('can insert an element at the first of array', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.list = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const item = root.list.getElementByIndex!(2);
      root.list.moveFront!(item.getID!());
      assert.equal('{"list":[2,0,1]}', root.toJSON!());
    });

    doc.update((root) => {
      const item = root.list.getElementByIndex!(1);
      root.list.moveFront!(item.getID!());
      assert.equal('{"list":[0,2,1]}', root.toJSON!());
    });

    doc.update((root) => {
      const item = root.list.getElementByIndex!(0);
      root.list.moveFront!(item.getID!());
      assert.equal('{"list":[0,2,1]}', root.toJSON!());
    });
  });

  it('can move an element at the last of array', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.list = [0, 1, 2];
    }, 'set {"list":[0,1,2]}');

    doc.update((root) => {
      const item = root.list.getElementByIndex!(2);
      root.list.moveLast!(item.getID!());
      assert.equal('{"list":[0,1,2]}', root.toJSON!());
    });

    doc.update((root) => {
      const item = root.list.getElementByIndex!(1);
      root.list.moveLast!(item.getID!());
      assert.equal('{"list":[0,2,1]}', root.toJSON!());
    });

    doc.update((root) => {
      const item = root.list.getElementByIndex!(0);
      root.list.moveLast!(item.getID!());
      assert.equal('{"list":[2,1,0]}', root.toJSON!());
    });
  });

  it('Can handle concurrent insertAfter operations', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      let prev: WrappedElement;
      d1.update((root) => {
        root.k1 = [1, 2, 3, 4];
        prev = root.k1.getElementByIndex!(1);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.k1.deleteByID!(prev.getID!());
        assert.equal('{"k1":[1,3,4]}', root.toJSON!());
      });
      d2.update((root) => {
        root.k1.insertAfter!(prev.getID!(), 2);
        assert.equal('{"k1":[1,2,2,3,4]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal('{"k1":[1,2,3,4]}', d1.toJSON!());

      d1.update((root) => {
        const prev = root.k1.getElementByIndex!(1);
        root.k1.insertAfter!(prev.getID!(), '2.1');
        assert.equal('{"k1":[1,2,"2.1",3,4]}', root.toJSON!());
      });
      d2.update((root) => {
        const prev = root.k1.getElementByIndex!(1);
        root.k1.insertAfter!(prev.getID!(), '2.2');
        assert.equal('{"k1":[1,2,"2.2",3,4]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveBefore operations with the same position', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON!(), d2.toJSON!());

      d1.update((root) => {
        const next = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveBefore!(next.getID!(), item.getID!());
        assert.equal('{"k1":[2,0,1]}', root.toJSON!());
      });

      d1.update((root) => {
        const next = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveBefore!(next.getID!(), item.getID!());
        assert.equal('{"k1":[1,2,0]}', root.toJSON!());
      });

      d2.update((root) => {
        const next = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveBefore!(next.getID!(), item.getID!());
        assert.equal('{"k1":[1,0,2]}', root.toJSON!());
      });

      d2.update((root) => {
        const next = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveBefore!(next.getID!(), item.getID!());
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveBefore operations from the different position', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON!(), d2.toJSON!());

      d1.update((root) => {
        const next = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveBefore!(next.getID!(), item.getID!());
        assert.equal('{"k1":[1,0,2]}', root.toJSON!());
      });

      d2.update((root) => {
        const next = root.k1.getElementByIndex!(1);
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveBefore!(next.getID!(), item.getID!());
        assert.equal('{"k1":[0,2,1]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveFront operations with the item which has the different index', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON!(), d2.toJSON!());

      d1.update((root) => {
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveFront!(item.getID!());
        assert.equal('{"k1":[2,0,1]}', root.toJSON!());
      });

      d1.update((root) => {
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveFront!(item.getID!());
        assert.equal('{"k1":[1,2,0]}', root.toJSON!());
      });

      d2.update((root) => {
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveFront!(item.getID!());
        assert.equal('{"k1":[1,0,2]}', root.toJSON!());
      });

      d2.update((root) => {
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveFront!(item.getID!());
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveFront operations with the item which has the same index', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON!(), d2.toJSON!());

      d1.update((root) => {
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveFront!(item.getID!());
        assert.equal('{"k1":[2,0,1]}', root.toJSON!());
      });

      d2.update((root) => {
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveFront!(item.getID!());
        assert.equal('{"k1":[2,0,1]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveAfter operations', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON!(), d2.toJSON!());

      d1.update((root) => {
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveLast!(item.getID!());
        assert.equal('{"k1":[0,2,1]}', root.toJSON!());
      });

      d2.update((root) => {
        const item = root.k1.getElementByIndex!(0);
        root.k1.moveLast!(item.getID!());
        assert.equal('{"k1":[1,2,0]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent insertAfter and moveBefore operations', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      let prev: WrappedElement;
      d1.update((root) => {
        root.k1 = [0];
        prev = root.k1.getElementByIndex!(0);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.k1.insertAfter!(prev.getID!(), 1);
        assert.equal('{"k1":[0,1]}', root.toJSON!());
      });

      d2.update((root) => {
        root.k1.insertAfter!(prev.getID!(), 2);
        assert.equal('{"k1":[0,2]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        const next = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveBefore!(next.getID!(), item.getID!());
      });

      d2.update((root) => {
        const next = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveBefore!(next.getID!(), item.getID!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent moveAfter', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = [0, 1, 2];
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON!(), d2.toJSON!());

      d1.update((root) => {
        const prev = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(1);
        root.k1.moveAfter!(prev.getID!(), item.getID!());
        assert.equal('{"k1":[0,1,2]}', root.toJSON!());
      });

      d2.update((root) => {
        const prev = root.k1.getElementByIndex!(0);
        const item = root.k1.getElementByIndex!(2);
        root.k1.moveAfter!(prev.getID!(), item.getID!());
        assert.equal('{"k1":[0,2,1]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent add operations', async function () {
    type TestDoc = { k1: Array<string> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = ['1'];
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.k1.push('2');
      });
      d2.update((root) => {
        root.k1.push('3');
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent delete operations', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      let prev: WrappedElement;
      d1.update((root) => {
        root.k1 = [1, 2, 3, 4];
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        prev = root.k1.getElementByIndex!(2);
        root.k1.deleteByID!(prev.getID!());
      });

      d2.update((root) => {
        prev = root.k1.getElementByIndex!(2);
        root.k1.deleteByID!(prev.getID!());
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      d1.update((root) => {
        assert.equal(3, root.k1.length);
      });
    }, this.test!.title);
  });

  it('Can handle concurrent insertBefore and delete operations', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      let prev: WrappedElement;

      d1.update((root) => {
        root.k1 = [1];
        prev = root.k1.getElementByIndex!(0);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.k1.deleteByID!(prev.getID!());
        assert.equal('{"k1":[]}', root.toJSON!());
        assert.equal(0, root.k1.length);
      });
      d2.update((root) => {
        root.k1.insertBefore!(prev.getID!(), 2);
        assert.equal('{"k1":[2,1]}', root.toJSON!());
        assert.equal(2, root.k1.length);
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      d1.update((root) => {
        assert.equal('{"k1":[2]}', root.toJSON!());
        assert.equal(1, root.k1.length);
      });
    }, this.test!.title);
  });

  it('Can handle complex concurrent insertBefore and delete operations', async function () {
    type TestDoc = { k1: JSONArray<number> };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      let prev: WrappedElement;

      d1.update((root) => {
        root.k1 = [1, 2, 3, 4];
        prev = root.k1.getElementByIndex!(1);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.k1.deleteByID!(prev.getID!());
        assert.equal('{"k1":[1,3,4]}', root.toJSON!());
        assert.equal(3, root.k1.length);
      });
      d2.update((root) => {
        root.k1.insertBefore!(prev.getID!(), 5);
        assert.equal('{"k1":[1,5,2,3,4]}', root.toJSON!());
        assert.equal(5, root.k1.length);
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      assert.equal('{"k1":[1,5,3,4]}', d1.toJSON!());

      d1.update((root) => {
        const prev = root.k1.getElementByIndex!(3);
        assert.equal(4, root.k1.length);
        root.k1.insertBefore!(prev.getID!(), 6);
        assert.equal('{"k1":[1,5,3,6,4]}', root.toJSON!());
        assert.equal(5, root.k1.length);
      });
      d2.update((root) => {
        const prev = root.k1.getElementByIndex!(0);
        assert.equal(4, root.k1.length);
        root.k1.insertBefore!(prev.getID!(), 7);
        assert.equal('{"k1":[7,1,5,3,4]}', root.toJSON!());
        assert.equal(5, root.k1.length);
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
      d1.update((root) => {
        assert.equal('{"k1":[7,1,5,3,6,4]}', root.toJSON!());
        assert.equal(6, root.k1.length);
      });
    }, this.test!.title);
  });

  it('Returns undefined when looking up an element that doesnt exist after GC', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    let targetID: TimeTicket;

    doc.update((root) => {
      root.list = [0, 1, 2];
      targetID = root.list.getElementByIndex!(2).getID!();
    });

    doc.update((root) => {
      root.list.deleteByID!(targetID);
    });

    assert.equal('{"list":[0,1]}', doc.toSortedJSON());

    doc.garbageCollect(MaxTimeTicket);
    doc.update((root) => {
      const elem = root.list.getElementByID!(targetID);
      assert.isUndefined(elem);
    });
  });

  it('Returns undefined when looking up an element that doesnt exist', function () {
    const doc = Document.create<{ list: JSONArray<number> }>('test-doc');
    let targetID: TimeTicket;

    doc.update((root) => {
      root.list = [0, 1, 2];
      targetID = root.list.getElementByIndex!(2).getID!();
    });

    doc.update((root) => {
      const elem = root.list.getElementByID!(targetID) as Primitive;
      assert.equal(2, elem.getValue());
    });

    doc.update((root) => {
      root.list.deleteByID!(targetID);
      assert.isUndefined(root.list.getElementByID!(targetID));
    });

    assert.equal('{"list":[0,1]}', doc.toSortedJSON());
  });

  describe('should support standard array read-only operations', () => {
    type TestDoc = {
      empty: [];
      list: JSONArray<number>;
      objects: JSONArray<{ id: string }>;
    };

    it('concat()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3];
      });

      assert.deepStrictEqual(
        doc.getRoot().list.concat([4, 5, 6]),
        [1, 2, 3, 4, 5, 6],
      );
    });

    it('entries()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3];
      });

      const copy = [];
      for (const x of doc.getRoot().list.entries()) {
        copy.push(x);
      }
      assert.deepStrictEqual(copy, [
        [0, 1],
        [1, 2],
        [2, 3],
      ]);
      assert.deepStrictEqual(
        [...doc.getRoot().list.entries()],
        [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
      );
    });

    it('every()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.strictEqual(
        doc.getRoot().empty.every(() => false),
        true,
      );
      assert.strictEqual(
        doc.getRoot().list.every((val) => val > 0),
        true,
      );
      assert.strictEqual(
        doc.getRoot().list.every((val) => val > 2),
        false,
      );
      assert.strictEqual(
        doc.getRoot().list.every((val, index) => index < 3),
        true,
      );
      // check that in the callback, 'this' is set to the second argument of method
      doc.getRoot().list.every(
        function (this: any) {
          assert.strictEqual(this.hello, 'world');
          return true;
        },
        { hello: 'world' },
      );
    });

    it('filter()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.deepStrictEqual(
        doc.getRoot().empty.filter(() => true),
        [],
      );

      assert.deepStrictEqual(
        doc.getRoot().list.filter((num) => num % 2 === 1),
        [1, 3],
      );

      assert.deepStrictEqual(
        doc.getRoot().list.filter(() => true),
        [1, 2, 3],
      );

      doc.getRoot().list.filter(
        function (this: any) {
          assert.strictEqual(this.hello, 'world');
          return true;
        },
        { hello: 'world' },
      );
    });

    it('find()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
        root.objects = [{ id: 'first' }, { id: 'second' }];
      });

      assert.strictEqual(
        doc.getRoot().empty.find(() => true),
        undefined,
      );

      assert.strictEqual(
        doc.getRoot().list.find((num) => num >= 2),
        2,
      );

      assert.strictEqual(
        doc.getRoot().list.find((num) => num >= 4),
        undefined,
      );

      assert.deepEqual(
        doc.getRoot().objects.find((obj) => obj.id === 'first'),
        { id: 'first' },
      );

      doc.getRoot().list.find(
        function (this: any) {
          assert.strictEqual(this.hello, 'world');
          return true;
        },
        { hello: 'world' },
      );
    });

    it('findIndex()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.strictEqual(
        doc.getRoot().empty.findIndex(() => true),
        -1,
      );

      assert.strictEqual(
        doc.getRoot().list.findIndex((num) => num >= 2),
        1,
      );

      assert.strictEqual(
        doc.getRoot().list.findIndex((num) => num >= 4),
        -1,
      );

      doc.getRoot().list.findIndex(
        function (this: any) {
          assert.strictEqual(this.hello, 'world');
          return true;
        },
        { hello: 'world' },
      );
    });

    it('forEach()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      doc
        .getRoot()
        .empty.forEach(() =>
          assert.fail('was called', 'not called', 'callback error'),
        );

      const testList: Array<number> = [];
      doc.getRoot().list.forEach((num) => testList.push(num + 1));
      assert.deepStrictEqual(testList, [2, 3, 4]);

      doc.getRoot().list.forEach(
        function (this: any) {
          assert.strictEqual(this.hello, 'world');
          return true;
        },
        { hello: 'world' },
      );
    });

    it('includes()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3];
      });

      assert.strictEqual(doc.getRoot().list.includes(3), true);
      assert.strictEqual(doc.getRoot().list.includes(0), false);
      assert.strictEqual(doc.getRoot().list.includes(1, 1), false);
      assert.strictEqual(doc.getRoot().list.includes(2, -2), true);
    });

    it('indexOf()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3];
      });

      assert.strictEqual(doc.getRoot().list.indexOf(3), 2);
      assert.strictEqual(doc.getRoot().list.indexOf(0), -1);
      assert.strictEqual(doc.getRoot().list.indexOf(1, 1), -1);
      assert.strictEqual(doc.getRoot().list.indexOf(2, -2), 1);
    });

    it('indexOf() with objects', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.objects = [{ id: 'first' }, { id: 'second' }];
      });

      // TODO: test always fails because doc.getRoot() returns a new proxy of cloned root.
      // assert.strictEqual(
      //   doc.getRoot().objects.indexOf(doc.getRoot().objects[0]),
      //   0,
      // );
    });

    it('join()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.strictEqual(doc.getRoot().empty.join(','), '');
      assert.strictEqual(doc.getRoot().list.join(), '1,2,3');
      assert.strictEqual(doc.getRoot().list.join(''), '123');
      assert.strictEqual(doc.getRoot().list.join(', '), '1, 2, 3');
    });

    it('keys()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3];
      });

      const keys = [];
      for (const x of doc.getRoot().list.keys()) {
        keys.push(x);
      }
      assert.deepStrictEqual(keys, [0, 1, 2]);
      assert.deepStrictEqual([...doc.getRoot().list.keys()], [0, 1, 2]);
    });

    it('lastIndexOf()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3];
      });

      assert.strictEqual(doc.getRoot().list.lastIndexOf(3), 2);
      assert.strictEqual(doc.getRoot().list.lastIndexOf(0), -1);
      assert.strictEqual(doc.getRoot().list.lastIndexOf(3, 1), -1);
      assert.strictEqual(doc.getRoot().list.lastIndexOf(3, -1), 2);
    });

    it('map()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.deepStrictEqual(
        doc.getRoot().empty.map((num) => num * 2),
        [],
      );

      assert.deepStrictEqual(
        doc.getRoot().list.map((num) => num * 2),
        [2, 4, 6],
      );

      assert.deepStrictEqual(
        doc.getRoot().list.map((num, index) => index + '->' + num),
        ['0->1', '1->2', '2->3'],
      );

      doc.getRoot().list.map(
        function (this: any) {
          assert.strictEqual(this.hello, 'world');
          return true;
        },
        { hello: 'world' },
      );
    });

    it('reduce()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.strictEqual(
        doc.getRoot().empty.reduce((sum, val) => sum + val, 0),
        0,
      );

      assert.strictEqual(
        doc.getRoot().list.reduce((sum, val) => sum + val, 0),
        6,
      );

      assert.strictEqual(
        doc.getRoot().list.reduce((sum, val) => sum + val, ''),
        '123',
      );

      assert.strictEqual(
        doc.getRoot().list.reduce((sum, val) => sum + val),
        6,
      );

      assert.strictEqual(
        doc
          .getRoot()
          .list.reduce(
            (sum, val, index) => (index % 2 === 0 ? sum + val : sum),
            0,
          ),
        4,
      );
    });

    it('reduceRight()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.strictEqual(
        doc.getRoot().empty.reduceRight((sum, val) => sum + val, 0),
        0,
      );

      assert.strictEqual(
        doc.getRoot().list.reduceRight((sum, val) => sum + val, 0),
        6,
      );

      assert.strictEqual(
        doc.getRoot().list.reduceRight((sum, val) => sum + val, ''),
        '321',
      );

      assert.strictEqual(
        doc.getRoot().list.reduceRight((sum, val) => sum + val),
        6,
      );

      assert.strictEqual(
        doc
          .getRoot()
          .list.reduceRight(
            (sum, val, index) => (index % 2 === 0 ? sum + val : sum),
            0,
          ),
        4,
      );
    });

    it('slice()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.deepStrictEqual(doc.getRoot().empty.slice(), []);
      assert.deepStrictEqual(doc.getRoot().list.slice(2), [3]);
      assert.deepStrictEqual(doc.getRoot().list.slice(-2), [2, 3]);
      assert.deepStrictEqual(doc.getRoot().list.slice(0, 0), []);
      assert.deepStrictEqual(doc.getRoot().list.slice(0, 1), [1]);
      assert.deepStrictEqual(doc.getRoot().list.slice(0, -1), [1, 2]);
    });

    it('some()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
      });

      assert.strictEqual(
        doc.getRoot().empty.some(() => true),
        false,
      );
      assert.strictEqual(
        doc.getRoot().list.some((val) => val > 2),
        true,
      );
      assert.strictEqual(
        doc.getRoot().list.some((val) => val > 4),
        false,
      );
      assert.strictEqual(
        doc.getRoot().list.some((val, index) => index > 2),
        false,
      );
      doc.getRoot().list.some(
        function (this: any) {
          assert.strictEqual(this.hello, 'world');
          return true;
        },
        { hello: 'world' },
      );
    });

    it('toString()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.empty = [];
        root.list = [1, 2, 3];
        root.objects = [{ id: '1' }, { id: '2' }, { id: '3' }];
      });

      assert.strictEqual(doc.getRoot().empty.toString(), '');
      assert.strictEqual(doc.getRoot().list.toString(), '1,2,3');

      // NOTE: This is not the same as the listObjects.toString()
      //       "[object object],[object object],[object object]"
      assert.strictEqual(
        doc.getRoot().objects.toString(),
        '{"id":"1"},{"id":"2"},{"id":"3"}',
      );

      // check toString with Primitive
      const num1 = Primitive.of(1, InitialTimeTicket);
      const num2 = Primitive.of(2, InitialTimeTicket);
      const crdtArray: JSONArray<CRDTElement> = [num1, num2];
      assert.strictEqual(crdtArray.toString(), '1,2');
    });

    it('values()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3];
      });

      const values = [];
      for (const x of doc.getRoot().list.values()) {
        values.push(x);
      }
      assert.deepStrictEqual(values, [1, 2, 3]);
      assert.deepStrictEqual([...doc.getRoot().list.values()], [1, 2, 3]);
    });

    it('should allow mutation of objects returned from built in list iteration', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.objects = [{ id: 'first' }, { id: 'second' }];
      });

      doc.update((root) => {
        for (const obj of root.objects) {
          if (obj.id === 'first') {
            obj.id = 'FIRST';
          }
        }
      });

      assert.equal(
        doc.toSortedJSON(),
        '{"objects":[{"id":"FIRST"},{"id":"second"}]}',
      );
    });

    it('should allow mutation of objects returned from readonly list methods', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.objects = [{ id: 'first' }, { id: 'second' }];
      });

      doc.update((root) => {
        root.objects.find((obj) => obj.id === 'first')!.id = 'FIRST';
      });

      assert.equal(
        doc.toSortedJSON(),
        '{"objects":[{"id":"FIRST"},{"id":"second"}]}',
      );
    });
  });
});
