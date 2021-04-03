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
import { Document, DocEventType } from '../../../src/document/document';

describe('Document', function () {
  it('doesnt return error when trying to delete a missing key', function () {
    const doc = Document.create('test-col', 'test-doc');
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

    const doc = Document.create<Todos>('test-col', 'test-doc');
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
    const doc = Document.create('test-col', 'test-doc');
    doc.update((root) => {
      root.data = {
        null: null,
      };
    });
    assert.equal('{"data":{"null":null}}', doc.toSortedJSON());
  });

  it('change paths test', async function () {
    const doc = Document.create('test-col', 'test-doc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paths: Array<string> = [];

    doc.subscribe((event) => {
      assert.equal(event.type, DocEventType.LocalChange);
      if (event.type === DocEventType.LocalChange) {
        assert.deepEqual(event.value[0].paths, paths);
      }
    });

    doc.update((root) => {
      root.obj = {};
      paths.push('$.obj');
      root.obj.a = 1;
      paths.push('$.obj.a');
      delete root.obj.a;
      paths.push('$.obj');
      delete root.obj;
      paths.push('$');

      root.arr = [];
      paths.push('$.arr');
      root.arr.push(0);
      paths.push('$.arr.0');
      root.arr.push(1);
      paths.push('$.arr.1');
      delete root.arr[1];
      paths.push('$.arr');

      const counter = root.createCounter('cnt', 0);
      paths.push('$.cnt');
      counter.increase(1);
      paths.push('$.cnt');

      const text = root.createText('text');
      paths.push('$.text');
      text.edit(0, 0, 'hello world');
      paths.push('$.text');
      text.select(0, 2);
      paths.push('$.text');

      const rich = root.createRichText('rich');
      paths.push('$.rich');
      rich.edit(0, 0, 'hello world');
      paths.push('$.rich');
      rich.setStyle(0, 1, 'bold', 'true');
      paths.push('$.rich');
    });
  });
});
