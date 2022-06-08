/*
 * Copyright 2021 The Yorkie Authors. All rights reserved.
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
import * as Benchmark from 'benchmark';
import {
  JSONArray,
  PlainText,
  DocumentReplica,
} from '@yorkie-js-sdk/src/yorkie';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { InitialCheckpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';

const suite = new Benchmark.Suite();

suite
  .add('constructor test', function () {
    for (let i = 0; i < 100; i++) {
      const doc = DocumentReplica.create<{ k1: JSONArray<string> }>(`test-doc`);
      assert.equal('{}', doc.toSortedJSON());
      assert.equal(doc.getCheckpoint(), InitialCheckpoint);
      assert.isFalse(doc.hasLocalChanges());
    }
  })
  .add('garbage collection test for large size text 1', function () {
    const size = 100;
    const doc = DocumentReplica.create<{ k1: PlainText }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    // 01. initial
    doc.update((root) => {
      root.k1 = new PlainText();
      const text = root.k1;
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
  })
  .add('garbage collection test for large size text 2', function () {
    const size = 100;
    const doc = DocumentReplica.create<{ k1: PlainText }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    // 01. long text by one node
    doc.update((root) => {
      root.k1 = new PlainText();
      let str = '';
      for (let i = 0; i < size; i++) {
        str += 'a';
      }
      root.k1.edit(0, 0, str);
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
  })
  .add('insert characters in sequence then delete all-1000', function () {
    const size = 1000;
    const doc = DocumentReplica.create<{ text: PlainText }>('test-doc');

    doc.update((root) => {
      root.text = new PlainText();
    }, 'initialize');

    // 01. inserts many chracters
    for (let i = 0; i < size; i++) {
      doc.update((root) => {
        const text = root.text;
        text.edit(i, i, 'a');
      }, 'insert chracter');
    }

    // 02. deletes them
    doc.update((root) => {
      const text = root.text;
      text.edit(0, size, '');
    }, 'delete them');

    assert.equal(doc.getRoot().text.toString(), '');
  })
  .add('insert characters in sequence then delete all-3000', function () {
    const size = 3000;
    const doc = DocumentReplica.create<{ text: PlainText }>('test-doc');

    doc.update((root) => {
      root.text = new PlainText();
    }, 'initialize');

    // 01. inserts many chracters
    for (let i = 0; i < size; i++) {
      doc.update((root) => {
        const text = root.text;
        text.edit(i, i, 'a');
      }, 'insert chracter');
    }

    // 02. deletes them
    doc.update((root) => {
      const text = root.text;
      text.edit(0, size, '');
    }, 'delete them');

    assert.equal(doc.getRoot().text.toString(), '');
  })
  .on('cycle', (event: Benchmark.Event) => {
    console.log(String(event.target));
  })
  .run();
