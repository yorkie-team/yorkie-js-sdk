/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { assert } from 'chai';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { Document, DocEventType } from '@yorkie-js-sdk/src/document/document';
import { JSONArray, Text, Counter } from '@yorkie-js-sdk/src/yorkie';
import { CounterType } from '@yorkie-js-sdk/src/document/crdt/counter';

describe('Document', function () {
  it('doesnt return error when trying to delete a missing key', function () {
    const doc = Document.create<{
      k1?: string;
      k2?: string;
      k3: Array<number>;
      k4: unknown;
    }>('test-doc');
    doc.update((root) => {
      root.k1 = '1';
      root.k2 = '2';
      root.k3 = [1, 2];
    });

    doc.update((root) => {
      delete root.k1;
      delete root.k3[0];
      delete root.k4; // missing key
      delete root.k3[2]; // missing index
    });
  });

  it('generic type parameter test', function () {
    type Todos = { todos: Array<{ title: string; done: boolean }> };

    const doc = Document.create<Todos>('test-doc');
    doc.update((root) => {
      root.todos = [
        {
          title: 'buy milk',
          done: false,
        },
      ];
    });
    assert.equal(
      `{"todos":[{"title":"buy milk","done":false}]}`,
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root.todos.push({
        title: 'drink water',
        done: true,
      });
    });
    const expectedTodos = [
      '{"title":"buy milk","done":false}',
      '{"title":"drink water","done":true}',
    ];
    assert.equal(`{"todos":[${expectedTodos.join(',')}]}`, doc.toSortedJSON());
  });

  it('null value test', function () {
    const doc = Document.create<{ data: { '': null; null: null } }>('test-doc');
    doc.update((root) => {
      root.data = {
        '': null,
        null: null,
      };
    });
    assert.equal('{"data":{"":null,"null":null}}', doc.toSortedJSON());
  });

  it('delete elements of array test', function () {
    const doc = Document.create<{ data: Array<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      delete root.data[0];
    });
    assert.equal('{"data":[1,2]}', doc.toSortedJSON());
    assert.equal(2, doc.getRoot().data.length);

    doc.update((root) => {
      delete root.data[1];
    });
    assert.equal('{"data":[1]}', doc.toSortedJSON());
    assert.equal(1, doc.getRoot().data.length);

    doc.update((root) => {
      delete root.data[0];
    });
    assert.equal('{"data":[]}', doc.toSortedJSON());
    assert.equal(0, doc.getRoot().data.length);
  });

  it('splice array with number', function () {
    const doc = Document.create<{ list: Array<number> }>('test-doc');
    doc.update((root) => {
      root.list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    });
    assert.equal(doc.toSortedJSON(), '{"list":[0,1,2,3,4,5,6,7,8,9]}');

    doc.update((root) => {
      const res = root.list.splice(1, 1);
      assert.equal(res.toString(), '1');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[0,2,3,4,5,6,7,8,9]}');

    doc.update((root) => {
      const res = root.list.splice(1, 2);
      assert.equal(res.toString(), '2,3');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[0,4,5,6,7,8,9]}');

    doc.update((root) => {
      const res = root.list.splice(3);
      assert.equal(res.toString(), '6,7,8,9');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[0,4,5]}');

    doc.update((root) => {
      const res = root.list.splice(1, 200);
      assert.equal(res.toString(), '4,5');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[0]}');

    doc.update((root) => {
      const res = root.list.splice(0, 0, 1, 2, 3);
      assert.equal(res.toString(), '');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[1,2,3,0]}');

    doc.update((root) => {
      const res = root.list.splice(1, 2, 4);
      assert.equal(res.toString(), '2,3');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[1,4,0]}');

    doc.update((root) => {
      const res = root.list.splice(2, 200, 2);
      assert.equal(res.toString(), '0');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[1,4,2]}');

    doc.update((root) => {
      const res = root.list.splice(2, 0, 3);
      assert.equal(res.toString(), '');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[1,4,3,2]}');

    doc.update((root) => {
      const res = root.list.splice(5, 10, 1, 2);
      assert.equal(res.toString(), '');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[1,4,3,2,1,2]}');

    doc.update((root) => {
      const res = root.list.splice(1, -3, 5);
      assert.equal(res.toString(), '');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[1,5,4,3,2,1,2]}');

    doc.update((root) => {
      const res = root.list.splice(-2, -11, 5, 6);
      assert.equal(res.toString(), '');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[1,5,4,3,2,5,6,1,2]}');

    doc.update((root) => {
      const res = root.list.splice(-11, 2, 7, 8);
      assert.equal(res.toString(), '1,5');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[7,8,4,3,2,5,6,1,2]}');
  });

  it('splice array with string', function () {
    const doc = Document.create<{ list: Array<string> }>('test-doc');

    doc.update((root) => {
      root.list = ['a', 'b', 'c'];
    });
    assert.equal(doc.toSortedJSON(), '{"list":["a","b","c"]}');

    doc.update((root) => {
      const res = root.list.splice(1, 1);
      assert.equal(res.toString(), 'b');
    });
    assert.equal(doc.toSortedJSON(), '{"list":["a","c"]}');
  });

  it('splice array with object', function () {
    const doc = Document.create<{ list: Array<{ id: number }> }>('test-doc');

    doc.update((root) => {
      root.list = [{ id: 1 }, { id: 2 }];
    });
    assert.equal(doc.toSortedJSON(), '{"list":[{"id":1},{"id":2}]}');

    doc.update((root) => {
      const res = root.list.splice(1, 1);
      assert.equal(res.toString(), '{"id":2}');
    });
    assert.equal(doc.toSortedJSON(), '{"list":[{"id":1}]}');
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
      type TestDoc = {
        list: JSONArray<number | string>;
      };
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3, NaN, '4'];
      });

      assert.strictEqual(doc.getRoot().list.includes(3), true, '1');
      assert.strictEqual(doc.getRoot().list.includes(0), false, '2');
      assert.strictEqual(doc.getRoot().list.includes(1, 1), false, '3');
      assert.strictEqual(doc.getRoot().list.includes(3, -4), true, '4');
      assert.strictEqual(doc.getRoot().list.includes(3, -100), true, '5');
      assert.strictEqual(doc.getRoot().list.includes(3, 100), false, '6');
      assert.strictEqual(doc.getRoot().list.includes(NaN), true, '7');
      assert.strictEqual(doc.getRoot().list.includes(4), false, '8');
      assert.strictEqual(doc.getRoot().list.includes('4'), true, '9');
    });

    it('includes() with objects', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.objects = [{ id: 'first' }, { id: 'second' }];
      });

      assert.strictEqual(
        doc.getRoot().objects.includes(doc.getRoot().objects[0]),
        true,
      );
    });

    it('indexOf()', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.list = [1, 2, 3, 3];
      });

      assert.strictEqual(doc.getRoot().list.indexOf(3), 2);
      assert.strictEqual(doc.getRoot().list.indexOf(0), -1);
      assert.strictEqual(doc.getRoot().list.indexOf(1, 1), -1);
      assert.strictEqual(doc.getRoot().list.indexOf(2, -3), 1);
    });

    it('indexOf() with objects', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.objects = [{ id: 'first' }, { id: 'second' }];
      });

      assert.strictEqual(
        doc.getRoot().objects.indexOf(doc.getRoot().objects[1]),
        1,
      );
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
        root.list = [1, 2, 3, 3];
      });

      assert.strictEqual(doc.getRoot().list.lastIndexOf(3), 3);
      assert.strictEqual(doc.getRoot().list.lastIndexOf(0), -1);
      assert.strictEqual(doc.getRoot().list.lastIndexOf(3, 1), -1);
      assert.strictEqual(doc.getRoot().list.lastIndexOf(3, 2), 2);
      assert.strictEqual(doc.getRoot().list.lastIndexOf(3, -1), 3);
    });

    it('lastIndexOf() with objects', () => {
      const doc = Document.create<TestDoc>('test-doc');
      doc.update((root) => {
        root.objects = [{ id: 'first' }, { id: 'second' }];
      });

      assert.strictEqual(
        doc.getRoot().objects.lastIndexOf(doc.getRoot().objects[1]),
        1,
      );
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

  it('move elements before a specific node of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0)!;
      const two = root.data.getElementByIndex!(2)!;
      root.data.moveBefore!(two.getID!(), zero.getID!());
    });
    assert.equal('{"data":[1,0,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1)!;
      const three = root.data.getElementByIndex!(3)!;
      root.data.moveBefore!(one.getID!(), three.getID!());
      assert.equal('{"data":[1,3,0,2]}', root.toJSON!());
    });
    assert.equal('{"data":[1,3,0,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements before a specific node of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot!().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1)!;
      const three = root.data.getElementByIndex!(3)!;
      root.data.moveBefore!(one.getID!(), three.getID!());
      assert.equal('{"data":[0,3,1,2]}', root.toJSON!());
    });
    assert.equal('{"data":[0,3,1,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('move elements after a specific node of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0)!;
      const two = root.data.getElementByIndex!(2)!;
      root.data.moveAfter!(two.getID!(), zero.getID!());
    });
    assert.equal('{"data":[1,2,0]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1)!;
      const three = root.data.getElementByIndex!(3)!;
      root.data.moveAfter!(one.getID!(), three.getID!());
      assert.equal('{"data":[1,2,3,0]}', root.toJSON!());
    });
    assert.equal('{"data":[1,2,3,0]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements after a specific node of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1)!;
      const three = root.data.getElementByIndex!(3)!;
      root.data.moveAfter!(one.getID!(), three.getID!());
      assert.equal('{"data":[0,1,3,2]}', root.toJSON!());
    });
    assert.equal('{"data":[0,1,3,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('move elements at the first of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const two = root.data.getElementByIndex!(2)!;
      root.data.moveFront!(two.getID!());
    });
    assert.equal('{"data":[2,0,1]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const three = root.data.getElementByIndex!(3)!;
      root.data.moveFront!(three.getID!());
      assert.equal('{"data":[3,2,0,1]}', root.toJSON!());
    });
    assert.equal('{"data":[3,2,0,1]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements at the first of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1)!;
      root.data.moveFront!(one.getID!());
      assert.equal('{"data":[1,0,2,3]}', root.toJSON!());
    });
    assert.equal('{"data":[1,0,2,3]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('move elements at the last of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const two = root.data.getElementByIndex!(2)!;
      root.data.moveLast!(two.getID!());
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const two = root.data.getElementByIndex!(2)!;
      root.data.moveLast!(two.getID!());
      assert.equal('{"data":[0,1,3,2]}', root.toJSON!());
    });
    assert.equal('{"data":[0,1,3,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements at the last of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1)!;
      root.data.moveLast!(one.getID!());
      assert.equal('{"data":[0,2,3,1]}', root.toJSON!());
    });
    assert.equal('{"data":[0,2,3,1]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('change paths test for object', async function () {
    const doc = Document.create<any>('test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    // NOTE(hackerwins): We skip nested paths after introducing the trie.
    doc.update((root) => {
      root[''] = {};
      paths.push('$.');

      root.obj = {};
      paths.push('$.obj');
      root.obj.a = 1;
      // paths.push('$.obj.a');
      delete root.obj.a;
      // paths.push('$.obj');
      root.obj['$.hello'] = 1;
      // paths.push('$.obj.\\$\\.hello');
      delete root.obj['$.hello'];
      // paths.push('$.obj');
      delete root.obj;
      // paths.push('$');
    });
  });

  it('change paths test for array', async function () {
    const doc = Document.create<any>('test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    // NOTE(hackerwins): We skip nested paths after introducing the trie.
    doc.update((root) => {
      root.arr = [];
      paths.push('$.arr');
      root.arr.push(0);
      // paths.push('$.arr.0');
      root.arr.push(1);
      // paths.push('$.arr.1');
      delete root.arr[1];
      // paths.push('$.arr');
      root['$$...hello'] = [];
      paths.push('$.\\$\\$\\.\\.\\.hello');
      root['$$...hello'].push(0);
      // paths.push('$.\\$\\$\\.\\.\\.hello.0');
    });
  });

  it('change paths test for counter', async function () {
    type TestDoc = { cnt: Counter };
    const doc = Document.create<TestDoc>('test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      root.cnt = new Counter(CounterType.IntegerCnt, 0);
      paths.push('$.cnt');
      root.cnt.increase(1);
      paths.push('$.cnt');
    });
  });

  it('support TypeScript', function () {
    type TestDoc = {
      array: Array<number>;
      text: Text;
    };

    const doc = Document.create<TestDoc>('test-doc');
    doc.update((root) => {
      root.array = [1, 2];
      root.text = new Text();
      root.text.edit(0, 0, 'hello world');
    });
  });

  it('change paths test for text', async function () {
    type TestDoc = { text: Text };

    const doc = Document.create<TestDoc>('test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      root.text = new Text();
      paths.push('$.text');
      root.text.edit(0, 0, 'hello world');
      paths.push('$.text');
      root.text.select(0, 2);
      paths.push('$.text');
    });
  });

  it('change paths test for text with attributes', async function () {
    type TestDoc = { textWithAttr: Text };
    const doc = Document.create<TestDoc>('test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      root.textWithAttr = new Text();
      paths.push('$.textWithAttr');
      root.textWithAttr.edit(0, 0, 'hello world');
      paths.push('$.textWithAttr');
      root.textWithAttr.setStyle(0, 1, { bold: 'true' });
      paths.push('$.textWithAttr');
    });
  });

  it('insert elements before a specific node of array', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0)!;
      root.data.insertBefore!(zero.getID!(), 3);
    });
    assert.equal('{"data":[3,0,1,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);

    doc.update((root) => {
      const one = root.data.getElementByIndex!(2)!;
      root.data.insertBefore!(one.getID!(), 4);
    });
    assert.equal('{"data":[3,0,4,1,2]}', doc.toSortedJSON());
    assert.equal(5, doc.getRoot().data.length);

    doc.update((root) => {
      const two = root.data.getElementByIndex!(4)!;
      root.data.insertBefore!(two.getID!(), 5);
    });
    assert.equal('{"data":[3,0,4,1,5,2]}', doc.toSortedJSON());
    assert.equal(6, doc.getRoot().data.length);
  });

  it('can insert an element before specific position after delete operation', function () {
    const doc = Document.create<{ data: JSONArray<number> }>('test-doc');
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0)!;
      root.data.deleteByID!(zero.getID!());

      const one = root.data.getElementByIndex!(0)!;
      root.data.insertBefore!(one.getID!(), 3);
    });
    assert.equal('{"data":[3,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const one = root.data.getElementByIndex!(1)!;
      root.data.deleteByID!(one.getID!());

      const two = root.data.getElementByIndex!(1)!;
      root.data.insertBefore!(two.getID!(), 4);
    });
    assert.equal('{"data":[3,4,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);
  });

  it('should remove previously inserted elements in heap when running GC', function () {
    const doc = Document.create<{ a?: number }>('test-doc');
    doc.update((root) => {
      root.a = 1;
      root.a = 2;
      delete root.a;
    });
    assert.equal('{}', doc.toSortedJSON());
    assert.equal(1, doc.getGarbageLen());

    doc.garbageCollect(MaxTimeTicket);
    assert.equal('{}', doc.toSortedJSON());
    assert.equal(0, doc.getGarbageLen());
  });

  it('escapes string for object', function () {
    const doc = Document.create<{ a?: string }>('test-doc');
    doc.update((root) => {
      root.a = '"hello"\n\f\b\r\t\\';
    });
    assert.equal(`{"a":"\\"hello\\"\\n\\f\\b\\r\\t\\\\"}`, doc.toSortedJSON());
  });

  it('escapes string for text', function () {
    const doc = Document.create<{ text?: Text }>('test-doc');
    doc.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, '"hello"');
    });
    assert.equal(
      '{"text":[{"attrs":{},"val":"\\"hello\\""}]}',
      doc.toSortedJSON(),
    );
  });

  it('escapes string for text with Attributes', function () {
    type TestDoc = { textWithAttr: Text };
    const doc = Document.create<TestDoc>('test-doc');
    doc.update((root) => {
      root.textWithAttr = new Text();
      root.textWithAttr.edit(0, 0, '"hello"', { b: '\n' });
    });
    assert.equal(
      '{"textWithAttr":[{"attrs":{"b":"\\n"},"val":"\\"hello\\""}]}',
      doc.toSortedJSON(),
    );
  });

  it('escapes string for elements in array', function () {
    const doc = Document.create<{ data: JSONArray<string> }>('test-doc');
    doc.update((root) => {
      root.data = ['"hello"', '\n', '\b', '\t', '\f', '\r', '\\'];
    });
    assert.equal(
      `{"data":["\\"hello\\"","\\n","\\b","\\t","\\f","\\r","\\\\"]}`,
      doc.toSortedJSON(),
    );
  });

  it('gets the value of the counter', function () {
    const doc = Document.create<{ counter: Counter }>('test-doc');
    doc.update((root) => {
      root.counter = new Counter(CounterType.IntegerCnt, 155);
    });
    assert.equal(155, doc.getRoot().counter.getValue());
  });

  it('sets any type of custom attribute values and can returns JSON parsable string', function () {
    type AttrsType = {
      bold?: boolean;
      indent?: number;
      italic?: boolean | null;
      color?: string;
    };
    const doc = Document.create<{ textWithAttr: Text<AttrsType> }>('test-doc');
    doc.update((root) => {
      root.textWithAttr = new Text();
      root.textWithAttr.edit(0, 0, 'aaa', { bold: true });
      root.textWithAttr.setStyle(0, 3, { italic: true });
      root.textWithAttr.setStyle(0, 3, { italic: null });
      root.textWithAttr.setStyle(0, 3, { indent: 1 });
      root.textWithAttr.setStyle(0, 3, { color: 'red' });
    });
    assert.equal(
      '{"textWithAttr":[{"attrs":{"bold":true,"color":"red","indent":1,"italic":null},"val":"aaa"}]}',
      doc.toSortedJSON(),
    );
    assert.doesNotThrow(() => {
      JSON.parse(doc.toSortedJSON());
    });
  });
});
