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
import {
  DocumentReplica,
  DocEventType,
} from '@yorkie-js-sdk/src/document/document';
import { TArray } from '@yorkie-js-sdk/src/yorkie';

describe('DocumentReplica', function () {
  it('doesnt return error when trying to delete a missing key', function () {
    const doc = DocumentReplica.create<{
      k1?: string;
      k2?: string;
      k3: number[];
      k4: unknown;
    }>('test-col', 'test-doc');
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

    const doc = DocumentReplica.create<Todos>('test-col', 'test-doc');
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
    const doc = DocumentReplica.create<{ data: { '': null; null: null } }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = {
        '': null,
        null: null,
      };
    });
    assert.equal('{"data":{"":null,"null":null}}', doc.toSortedJSON());
  });

  it('delete elements of array test', function () {
    const doc = DocumentReplica.create<{ data: number[] }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root.data[0];
    });
    assert.equal('{"data":[1,2]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root.data[1];
    });
    assert.equal('{"data":[1]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root.data[0];
    });
    assert.equal('{"data":[]}', doc.toSortedJSON());
  });

  it('move elements before a specific node of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0);
      const two = root.data.getElementByIndex!(2);
      root.data.moveBefore!(two.getID(), zero.getID());
    });
    assert.equal('{"data":[1,0,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1);
      const three = root.data.getElementByIndex!(3);
      root.data.moveBefore!(one.getID(), three.getID());
      assert.equal('{"data":[1,3,0,2]}', root.toJSON!());
    });
    assert.equal('{"data":[1,3,0,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements before a specific node of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot!().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1);
      const three = root.data.getElementByIndex!(3);
      root.data.moveBefore!(one.getID(), three.getID());
      assert.equal('{"data":[0,3,1,2]}', root.toJSON!());
    });
    assert.equal('{"data":[0,3,1,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('move elements after a specific node of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0);
      const two = root.data.getElementByIndex!(2);
      root.data.moveAfter!(two.getID(), zero.getID());
    });
    assert.equal('{"data":[1,2,0]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1);
      const three = root.data.getElementByIndex!(3);
      root.data.moveAfter!(one.getID(), three.getID());
      assert.equal('{"data":[1,2,3,0]}', root.toJSON!());
    });
    assert.equal('{"data":[1,2,3,0]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements after a specific node of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1);
      const three = root.data.getElementByIndex!(3);
      root.data.moveAfter!(one.getID(), three.getID());
      assert.equal('{"data":[0,1,3,2]}', root.toJSON!());
    });
    assert.equal('{"data":[0,1,3,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('move elements at the first of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const two = root.data.getElementByIndex!(2);
      root.data.moveFront!(two.getID());
    });
    assert.equal('{"data":[2,0,1]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const three = root.data.getElementByIndex!(3);
      root.data.moveFront!(three.getID());
      assert.equal('{"data":[3,2,0,1]}', root.toJSON!());
    });
    assert.equal('{"data":[3,2,0,1]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements at the first of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1);
      root.data.moveFront!(one.getID());
      assert.equal('{"data":[1,0,2,3]}', root.toJSON!());
    });
    assert.equal('{"data":[1,0,2,3]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('move elements at the last of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const two = root.data.getElementByIndex!(2);
      root.data.moveLast!(two.getID());
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const two = root.data.getElementByIndex!(2);
      root.data.moveLast!(two.getID());
      assert.equal('{"data":[0,1,3,2]}', root.toJSON!());
    });
    assert.equal('{"data":[0,1,3,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('simple move elements at the last of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      root.data.push(3);
      const one = root.data.getElementByIndex!(1);
      root.data.moveLast!(one.getID());
      assert.equal('{"data":[0,2,3,1]}', root.toJSON!());
    });
    assert.equal('{"data":[0,2,3,1]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);
  });

  it('change paths test for object', async function () {
    const doc = DocumentReplica.create<any>('test-col', 'test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      root[''] = {};
      paths.push('$.');

      root.obj = {};
      paths.push('$.obj');
      root.obj.a = 1;
      paths.push('$.obj.a');
      delete root.obj.a;
      paths.push('$.obj');
      root.obj['$.hello'] = 1;
      paths.push('$.obj.\\$\\.hello');
      delete root.obj['$.hello'];
      paths.push('$.obj');
      delete root.obj;
      paths.push('$');
    });
  });

  it('change paths test for array', async function () {
    const doc = DocumentReplica.create<any>('test-col', 'test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      root.arr = [];
      paths.push('$.arr');
      root.arr.push(0);
      paths.push('$.arr.0');
      root.arr.push(1);
      paths.push('$.arr.1');
      delete root.arr[1];
      paths.push('$.arr');
      root['$$...hello'] = [];
      paths.push('$.\\$\\$\\.\\.\\.hello');
      root['$$...hello'].push(0);
      paths.push('$.\\$\\$\\.\\.\\.hello.0');
    });
  });

  it('change paths test for counter', async function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      const counter = root.createCounter!('cnt', 0);
      paths.push('$.cnt');
      counter.increase(1);
      paths.push('$.cnt');
      root.createCounter!('$$..#.hello', 0);
      paths.push('$.\\$\\$\\.\\.#\\.hello');
    });
  });

  it('change paths test for text', async function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      const text = root.createText!('text');
      paths.push('$.text');
      text.edit(0, 0, 'hello world');
      paths.push('$.text');
      text.select(0, 2);
      paths.push('$.text');
      root.createText!('$$..#.hello');
      paths.push('$.\\$\\$\\.\\.#\\.hello');
    });
  });

  it('change paths test for rich text', async function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      const rich = root.createRichText!('rich');
      paths.push('$.rich');
      rich.edit(0, 0, 'hello world');
      paths.push('$.rich');
      rich.setStyle(0, 1, { bold: 'true' });
      paths.push('$.rich');
      root.createRichText!('$$..#.hello');
      paths.push('$.\\$\\$\\.\\.#\\.hello');
    });
  });

  it('insert elements before a specific node of array', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0);
      root.data.insertBefore!(zero.getID(), 3);
    });
    assert.equal('{"data":[3,0,1,2]}', doc.toSortedJSON());
    assert.equal(4, doc.getRoot().data.length);

    doc.update((root) => {
      const one = root.data.getElementByIndex!(2);
      root.data.insertBefore!(one.getID(), 4);
    });
    assert.equal('{"data":[3,0,4,1,2]}', doc.toSortedJSON());
    assert.equal(5, doc.getRoot().data.length);

    doc.update((root) => {
      const two = root.data.getElementByIndex!(4);
      root.data.insertBefore!(two.getID(), 5);
    });
    assert.equal('{"data":[3,0,4,1,5,2]}', doc.toSortedJSON());
    assert.equal(6, doc.getRoot().data.length);
  });

  it('can insert an element before specific position after delete operation', function () {
    const doc = DocumentReplica.create<{ data: TArray<number> }>(
      'test-col',
      'test-doc',
    );
    doc.update((root) => {
      root.data = [0, 1, 2];
    });
    assert.equal('{"data":[0,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const zero = root.data.getElementByIndex!(0);
      root.data.deleteByID!(zero.getID());

      const one = root.data.getElementByIndex!(0);
      root.data.insertBefore!(one.getID(), 3);
    });
    assert.equal('{"data":[3,1,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);

    doc.update((root) => {
      const one = root.data.getElementByIndex!(1);
      root.data.deleteByID!(one.getID());

      const two = root.data.getElementByIndex!(1);
      root.data.insertBefore!(two.getID(), 4);
    });
    assert.equal('{"data":[3,4,2]}', doc.toSortedJSON());
    assert.equal(3, doc.getRoot().data.length);
  });

  it('should remove previously inserted elements in heap when running GC', function () {
    const doc = DocumentReplica.create<{ a?: number }>('test-col', 'test-doc');
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
});
