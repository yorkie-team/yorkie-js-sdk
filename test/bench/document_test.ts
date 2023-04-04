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
import { JSONArray, Text, Document } from '@yorkie-js-sdk/src/yorkie';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { InitialCheckpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';

const tests = [
  {
    name: 'Document#constructor',
    run: (): void => {
      const doc = Document.create<{ text: JSONArray<string> }>(`test-doc`);
      assert.equal('{}', doc.toJSON());
      assert.equal(doc.getCheckpoint(), InitialCheckpoint);
      assert.isFalse(doc.hasLocalChanges());
    },
  },
  {
    name: 'Document#equals',
    run: (): void => {
      const doc1 = Document.create<{ text: string }>('d1');
      const doc2 = Document.create<{ text: string }>('d2');
      const doc3 = Document.create<{ text: string }>('d3');

      doc1.update((root) => {
        root.text = 'value';
      }, 'update text');

      assert.notEqual(doc1.toJSON(), doc2.toJSON());
      assert.equal(doc2.toJSON(), doc3.toJSON());
    },
  },
  {
    name: 'Document#nested update',
    run: (): void => {
      const expected = `{"k1":"v1","k2":{"k4":"v4"},"k3":["v5","v6"]}`;

      const doc = Document.create<{
        k1: string;
        k2: { k4: string };
        k3: Array<string>;
      }>('test-doc');
      assert.equal('{}', doc.toJSON());
      assert.isFalse(doc.hasLocalChanges());

      doc.update((root) => {
        root.k1 = 'v1';
        root.k2 = { k4: 'v4' };
        root.k3 = ['v5', 'v6'];
      }, 'updates k1,k2,k3');

      assert.equal(expected, doc.toJSON());
      assert.isTrue(doc.hasLocalChanges());
    },
  },
  {
    name: 'Document#delete',
    run: (): void => {
      const doc = Document.create<{
        k1?: string;
        k2?: { k4: string };
        k3?: Array<string>;
      }>('test-doc');
      assert.equal('{}', doc.toJSON());
      assert.isFalse(doc.hasLocalChanges());

      let expected = `{"k1":"v1","k2":{"k4":"v4"},"k3":["v5","v6"]}`;
      doc.update((root) => {
        root.k1 = 'v1';
        root.k2 = { k4: 'v4' };
        root.k3 = ['v5', 'v6'];
      }, 'updates k1,k2,k3');
      assert.equal(expected, doc.toJSON());

      expected = `{"k1":"v1","k3":["v5","v6"]}`;
      doc.update((root) => {
        delete root.k2;
      }, 'deletes k2');
      assert.equal(expected, doc.toJSON());
    },
  },
  {
    name: 'Document#object',
    run: (): void => {
      const doc = Document.create<{ k1: string }>('test-doc');
      doc.update((root) => {
        root.k1 = 'v1';
        root.k1 = 'v2';
      });
      assert.equal(`{"k1":"v2"}`, doc.toJSON());
    },
  },
  {
    name: 'Document#garbage collection test for large size text 1',
    run: (): void => {
      const size = 100;
      const doc = Document.create<{ text: Text }>('test-doc');
      assert.equal('{}', doc.toJSON());

      // 01. initial
      doc.update((root) => {
        root.text = new Text();
        const { text } = root;
        for (let i = 0; i < size; i++) {
          text.edit(i, i, 'a');
        }
      }, 'initial');

      // 02. 100 nodes modified
      doc.update((root) => {
        const { text } = root;
        for (let i = 0; i < size; i++) {
          text.edit(i, i + 1, 'b');
        }
      }, 'modify 100 nodes');

      // 03. GC
      assert.equal(size, doc.getGarbageLen());
      assert.equal(size, doc.garbageCollect(MaxTimeTicket));

      const empty = 0;
      assert.equal(empty, doc.getGarbageLen());
    },
  },
  {
    name: 'Document#garbage collection test for large size text 2',
    run: (): void => {
      const size = 100;
      const doc = Document.create<{ text: Text }>('test-doc');
      assert.equal('{}', doc.toJSON());

      // 01. long text by one node
      doc.update((root) => {
        root.text = new Text();
        const str = 'a'.repeat(size);
        root.text.edit(0, 0, str);
      }, 'initial large size');

      // 02. Modify one node multiple times
      doc.update((root) => {
        const { text } = root;
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
    },
  },
  {
    name: 'Document#insert characters in sequence then delete all-1000',
    run: (): void => {
      const size = 1000;
      const doc = Document.create<{ text: Text }>('test-doc');

      doc.update((root) => {
        root.text = new Text();
      }, 'initialize');

      // 01. inserts many chracters
      for (let i = 0; i < size; i++) {
        doc.update((root) => {
          const { text } = root;
          text.edit(i, i, 'a');
        }, 'insert chracter');
      }

      // 02. deletes them
      doc.update((root) => {
        const { text } = root;
        text.edit(0, size, '');
      }, 'delete them');

      assert.equal(doc.getRoot().text.toString(), '');
    },
  },
  {
    name: 'Document#insert characters in sequence then delete all-3000',
    run: (): void => {
      const size = 3000;
      const doc = Document.create<{ text: Text }>('test-doc');

      doc.update((root) => {
        root.text = new Text();
      }, 'initialize');

      // 01. inserts many chracters
      for (let i = 0; i < size; i++) {
        doc.update((root) => {
          const { text } = root;
          text.edit(i, i, 'a');
        }, 'insert chracter');
      }

      // 02. deletes them
      doc.update((root) => {
        const { text } = root;
        text.edit(0, size, '');
      }, 'delete them');

      assert.equal(doc.getRoot().text.toString(), '');
    },
  },
];

export default tests;
