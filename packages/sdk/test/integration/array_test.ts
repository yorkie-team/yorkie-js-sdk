import { describe, it, assert } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Client } from '@yorkie-js/sdk/src/client/client';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';
import {
  JSONArray,
  WrappedElement,
  Primitive,
  TimeTicket,
} from '@yorkie-js/sdk/src/yorkie';
import { maxVectorOf } from '../helper/helper';
import { Indexable } from '@yorkie-js/sdk/test/helper/helper';

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

  it('Can handle concurrent insertAfter operations', async function ({ task }) {
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
    }, task.name);
  });

  it('Can handle concurrent moveBefore operations with the same position', async function ({
    task,
  }) {
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
    }, task.name);
  });

  it('Can handle concurrent moveBefore operations from the different position', async function ({
    task,
  }) {
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
    }, task.name);
  });

  it('Can handle concurrent moveFront operations with the item which has the different index', async function ({
    task,
  }) {
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
    }, task.name);
  });

  it('Can handle concurrent moveFront operations with the item which has the same index', async function ({
    task,
  }) {
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
    }, task.name);
  });

  it('Can handle concurrent moveAfter operations', async function ({ task }) {
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
    }, task.name);
  });

  it('Can handle concurrent insertAfter and moveBefore operations', async function ({
    task,
  }) {
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
    }, task.name);
  });

  it('Can handle concurrent moveAfter', async function ({ task }) {
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
    }, task.name);
  });

  it('Can handle concurrent add operations', async function ({ task }) {
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
    }, task.name);
  });

  it('Can handle concurrent delete operations', async function ({ task }) {
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
    }, task.name);
  });

  it('Can handle concurrent insertBefore and delete operations', async function ({
    task,
  }) {
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
    }, task.name);
  });

  it('Can handle complex concurrent insertBefore and delete operations', async function ({
    task,
  }) {
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
    }, task.name);
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

    doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));
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

describe('Array Concurrency Table Tests', function () {
  type TestDoc = { a: JSONArray<number> };

  const initArr = [1, 2, 3, 4];
  const initMarshal = '{"a":[1,2,3,4]}';
  const oneIdx = 1;
  const otherIdxs = [2, 3];
  const newValues = [5, 6];

  interface ArrayOp {
    opName: string;
    executor: (arr: JSONArray<number>, cid: number) => void;
  }

  // NOTE(junseo): It tests all (op1, op2) pairs in operations.
  // `oneIdx` is the index where both op1 and op2 reference.
  // `opName` represents the parameter of operation selected as `oneIdx'.
  // `otherIdxs` ensures that indexs other than `oneIdx` are not duplicated.
  const operations: Array<ArrayOp> = [
    // insert
    {
      opName: 'insert.prev',
      executor: (arr: JSONArray<number>, cid: number) => {
        arr.insertIntegerAfter!(oneIdx, newValues[cid]);
      },
    },
    {
      opName: 'insert.prev.next',
      executor: (arr: JSONArray<number>, cid: number) => {
        arr.insertIntegerAfter!(oneIdx - 1, newValues[cid]);
      },
    },

    // move
    {
      opName: 'move.prev',
      executor: (arr: JSONArray<number>, cid: number) => {
        arr.moveAfterByIndex!(oneIdx, otherIdxs[cid]);
      },
    },
    {
      opName: 'move.prev.next',
      executor: (arr: JSONArray<number>, cid: number) => {
        arr.moveAfterByIndex!(oneIdx - 1, otherIdxs[cid]);
      },
    },
    {
      opName: 'move.target',
      executor: (arr: JSONArray<number>, cid: number) => {
        arr.moveAfterByIndex!(otherIdxs[cid], oneIdx);
      },
    },

    // set by index
    {
      opName: 'set.target',
      executor: (arr: JSONArray<number>, cid: number) => {
        arr.setInteger!(oneIdx, newValues[cid]);
      },
    },

    // remove
    {
      opName: 'remove.target',
      executor: (arr: JSONArray<number>) => {
        arr.delete!(oneIdx);
      },
    },
  ];

  for (const op1 of operations) {
    for (const op2 of operations) {
      it(op1.opName + ' vs ' + op2.opName, async function ({ task }) {
        // if (op1.opName !== 'set.target' || op2.opName !== 'move.target') {
        //   return;
        // }

        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.a = [...initArr];
            assert.equal(initMarshal, root.toJSON!());
          });

          await c1.sync();
          await c2.sync();

          // Verify initial state
          assert.equal(d1.toJSON!(), d2.toJSON!());

          // Apply operations concurrently
          d1.update((root) => {
            op1.executor(root.a, 0);
          });

          d2.update((root) => {
            op2.executor(root.a, 1);
          });

          // Sync and verify convergence using syncClientsThenCheckEqual
          const result = await syncClientsThenCheckEqual([
            { client: c1, doc: d1 },
            { client: c2, doc: d2 },
          ]);
          assert.isTrue(result);
        }, task.name);
      });
    }
  }
});

describe('Can handle complicated concurrent array operations', function () {
  type TestDoc = { a: JSONArray<number> };

  const initArr = [1, 2, 3, 4];
  const initMarshal = '{"a":[1,2,3,4]}';
  const oneIdx = 1;
  const otherIdx = 0;
  const newValue = 5;

  interface ArrayOp {
    opName: string;
    executor: (arr: JSONArray<number>) => void;
  }

  // This test checks CRDT convergence in the presence of concurrent modifications:
  // - Client 0 performs a single operation (`op`) at index `oneIdx`.
  // - Client 1 performs two move operations involving index `oneIdx`.
  // The test ensures that after syncing both clients, their array states converge.
  // `oneIdx`: the index on which both the arbitrary operation and the first move operation are applied.
  // `opName`: describes the type of operation being tested (insert, move, set, or remove).
  const operations: Array<ArrayOp> = [
    // insert
    {
      opName: 'insert',
      executor: (arr: JSONArray<number>) => {
        arr.insertAfter!(arr.getElementByIndex!(oneIdx).getID!(), newValue);
      },
    },

    // move
    {
      opName: 'move',
      executor: (arr: JSONArray<number>) => {
        arr.moveAfter!(
          arr.getElementByIndex!(otherIdx).getID!(),
          arr.getElementByIndex!(oneIdx).getID!(),
        );
      },
    },

    // set (implemented as delete + insert)
    {
      opName: 'set',
      executor: (arr: JSONArray<number>) => {
        arr.deleteByID!(arr.getElementByIndex!(oneIdx).getID!());
        if (oneIdx > 0) {
          arr.insertAfter!(
            arr.getElementByIndex!(oneIdx - 1).getID!(),
            newValue,
          );
        } else {
          const firstElement = arr.getElementByIndex!(0);
          arr.insertBefore!(firstElement.getID!(), newValue);
        }
      },
    },

    // remove
    {
      opName: 'remove',
      executor: (arr: JSONArray<number>) => {
        arr.deleteByID!(arr.getElementByIndex!(oneIdx).getID!());
      },
    },
  ];

  for (const op of operations) {
    it(op.opName, async function ({ task }) {
      // TODO(emplam27): This test's move operation is not working as expected.
      // It is not converging now.
      if (op.opName == 'move') {
        return;
      }

      await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
        // Reset documents for each test case
        d1.update((root) => {
          root.a = [...initArr];
          assert.equal(initMarshal, root.toJSON!());
        });

        await c1.sync();
        await c2.sync();

        // Verify initial state
        assert.equal(d1.toJSON!(), d2.toJSON!());

        // Client 1 performs the test operation
        d1.update((root) => {
          op.executor(root.a);
        });

        // Client 2 performs two move operations
        d2.update((root) => {
          // Move element at index 2 after element at oneIdx
          root.a.moveAfter!(
            root.a.getElementByIndex!(oneIdx).getID!(),
            root.a.getElementByIndex!(2).getID!(),
          );

          // Move element at index 3 after element at index 2
          root.a.moveAfter!(
            root.a.getElementByIndex!(2).getID!(),
            root.a.getElementByIndex!(3).getID!(),
          );
        });

        // Sync and verify convergence using syncClientsThenCheckEqual
        const result = await syncClientsThenCheckEqual([
          { client: c1, doc: d1 },
          { client: c2, doc: d2 },
        ]);
        assert.isTrue(result);
      }, task.name);
    });
  }
});

describe('Array Set By Index Tests', function () {
  it('Can handle simple array set operations', async function ({ task }) {
    type TestDoc = { k1: JSONArray<number> };

    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = [-1, -2, -3];
        assert.equal('{"k1":[-1,-2,-3]}', root.toJSON!());
      });

      await c1.sync();
      await c2.sync();
      assert.equal(d1.toJSON!(), d2.toJSON!());

      d2.update((root) => {
        root.k1.setInteger!(1, -4);
        assert.equal('{"k1":[-1,-4,-3]}', root.toJSON!());
      });

      d1.update((root) => {
        root.k1.setInteger!(0, -5);
        assert.equal('{"k1":[-5,-2,-3]}', root.toJSON!());
      });

      const result = await syncClientsThenCheckEqual([
        { client: c1, doc: d1 },
        { client: c2, doc: d2 },
      ]);
      assert.isTrue(result);
    }, task.name);
  });

    it('can handle array set operation by Proxy', () => {
    const doc = new Document<{ list: JSONArray<any> }>('test-doc');

    doc.update((root) => {
      root.list = ['a', 'b', 'c'];
    }, 'init');
    assert.equal(doc.toSortedJSON(), '{"list":["a","b","c"]}');

    doc.update((root) => {
      const prev = root.list.getElementByIndex!(0);
      root.list.insertAfter!(prev.getID!(), 'newV');
    }, 'insertAfter #1');
    assert.equal(doc.toSortedJSON(), '{"list":["a","newV","b","c"]}');

    doc.update((root) => {
      const prev = root.list.getElementByIndex!(0);
      root.list.insertAfter!(prev.getID!(), 'newV');
    }, 'insertAfter #2');
    assert.equal(doc.toSortedJSON(), '{"list":["a","newV","newV","b","c"]}');

    doc.update((root) => {
      root.list[0] = 'setV';
    }, 'set #1');
    assert.equal(doc.toSortedJSON(), '{"list":["setV","newV","newV","b","c"]}');

    doc.update((root) => {
      const idx = root.list.findIndex((v) => v === 'setV');
      if (idx >= 0) root.list[idx] = 'setV2';
    }, 'set #2');
    assert.equal(doc.toSortedJSON(), '{"list":["setV2","newV","newV","b","c"]}');
    
    doc.update((root) => {
      const idx = root.list.findIndex((v) => v === 'setV2');
      if (idx >= 0) root.list[idx] = ['s', 'e', 't', 'V', '3'];
    }, 'set #2');
    assert.equal(doc.toSortedJSON(), '{"list":[["s","e","t","V","3"],"newV","newV","b","c"]}');
  });
});

interface ClientAndDocPair<T extends Indexable> {
  client: Client;
  doc: Document<T>;
}

async function syncClientsThenCheckEqual<T extends Indexable>(
  pairs: Array<ClientAndDocPair<T>>,
): Promise<boolean> {
  assert.isTrue(pairs.length > 1);

  // Save own changes and get previous changes.
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    console.log(`before d${i + 1}: ${pair.doc.toSortedJSON()}`);
    await pair.client.sync();
  }

  // Get last client changes.
  // Last client get all precede changes in above loop.
  for (const pair of pairs.slice(0, -1)) {
    await pair.client.sync();
  }

  // Assert start.
  const expected = pairs[0].doc.toSortedJSON();
  console.log(`after d1: ${expected}`);
  for (let i = 1; i < pairs.length; i++) {
    const v = pairs[i].doc.toSortedJSON();
    console.log(`after d${i + 1}: ${v}`);
    if (expected !== v) {
      return false;
    }
  }

  return true;
}
