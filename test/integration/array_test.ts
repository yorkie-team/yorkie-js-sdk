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

describe('Array', function () {
  it('should handle delete operations', function () {
    const doc = new Document<{ k1: JSONArray<string> }>('test-doc');
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
    const doc = new Document<{ k1: JSONArray<string | Array<number>> }>(
      'test-doc',
    );
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
    const doc = new Document<{
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
    const doc = new Document<{ arr: Array<number | Array<number>> }>(
      'test-doc',
    );

    doc.update((root) => {
      root.arr = [1, 2, 3];
      root.arr.push([4, 5, 6]);
      assert.equal('{"arr":[1,2,3,[4,5,6]]}', root.toJSON!());
    });
    assert.equal('{"arr":[1,2,3,[4,5,6]]}', doc.toJSON());
  });

  it('can push element then delete it by ID in array', function () {
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');
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
});
