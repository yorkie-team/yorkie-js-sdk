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
import { Document } from '../../src/document/document';
import { InitialCheckpoint } from '../../src/document/checkpoint/checkpoint';
import { MaxTimeTicket } from '../../src/document/time/ticket';
import { JSONElement } from '../../src/document/json/element';
import { JSONArray } from '../../src/document/json/array';

describe('Document', function () {
  it('should apply updates of string', function () {
    const doc1 = Document.create('test-col', 'test-doc');
    const doc2 = Document.create('test-col', 'test-doc');

    assert.isTrue(doc1.getCheckpoint().equals(InitialCheckpoint));
    assert.isFalse(doc1.hasLocalChanges());

    doc1.update((root) => {
      root['k1'] = 'v1';
      root['k2'] = 'v2';
      assert.equal('v1', root['k1']);
    }, 'set v1, v2');
    assert.equal('{"k1":"v1","k2":"v2"}', doc1.toSortedJSON());

    assert.isTrue(doc1.hasLocalChanges());
    assert.notEqual(doc1, doc2);
  });

  it('should apply updates inside nested map', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k1']['k1-2'] = 'v2';
    }, 'set {"k1-1":"v1","k1-2":"v2":}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['k1-2'] = 'v3';
    }, 'set {"k1-2":"v3"}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k2'] = ['1', '2'];
      root['k2'].push('3');
    }, 'set ["1","2","3"]');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

    assert.throws(() => {
      doc.update((root) => {
        root['k2'].push('4');
        throw new Error('dummy error');
      }, 'push "4"');
    }, 'dummy error');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root['k2'].push('4');
    }, 'push "4"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root['k2'].push({ 'k2-5': 'v4' });
    }, 'push "{k2-5: 4}"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4",{"k2-5":"v4"}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle delete operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1', 'k1-2': 'v2' };
      root['k2'] = ['1', '2', '3'];
    }, 'set {"k1":{"k1-1":"v1","k1-2":"v2"},"k2":["1","2","3"]}');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v2"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      delete root['k1']['k1-1'];
      root['k1']['k1-3'] = 'v4';

      delete root['k2'][1];
      root['k2'].push('4');
    }, 'set {"k1":{"k1-2":"v2"},"k2":["1","3","4"]}');
    assert.equal(
      '{"k1":{"k1-2":"v2","k1-3":"v4"},"k2":["1","3","4"]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle edit operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    //           ------ ins links ----
    //           |            |      |
    // [init] - [A] - [12] - {BC} - [D]
    doc.update((root) => {
      const text = root.createText('k1');
      text.edit(0, 0, 'ABCD');
      text.edit(1, 3, '12');
    }, 'set {"k1":"A12D"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 A][1:00:3:0 12]{1:00:2:1 BC}[1:00:2:3 D]',
        root['k1'].getAnnotatedString(),
      );

      let range = root['k1'].createRange(0, 0);
      assert.equal('0:00:0:0:0', range[0].getAnnotatedString());

      range = root['k1'].createRange(1, 1);
      assert.equal('1:00:2:0:1', range[0].getAnnotatedString());

      range = root['k1'].createRange(2, 2);
      assert.equal('1:00:3:0:1', range[0].getAnnotatedString());

      range = root['k1'].createRange(3, 3);
      assert.equal('1:00:3:0:2', range[0].getAnnotatedString());

      range = root['k1'].createRange(4, 4);
      assert.equal('1:00:2:3:1', range[0].getAnnotatedString());
    });

    assert.equal('{"k1":"A12D"}', doc.toSortedJSON());
  });

  it('should handle rich text edit operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      const text = root.createRichText('k1');
      text.edit(0, 0, 'ABCD', { b: '1' });
      text.edit(3, 3, '\n');
    }, 'set {"k1":"ABC\nD"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 ABC][1:00:3:0 \n][1:00:2:3 D][1:00:1:0 \n]',
        root['k1'].getAnnotatedString(),
      );
    });

    assert.equal(
      '{"k1":[{"attrs":{"b":"1"},"content":ABC},{"attrs":{},"content":\n},{"attrs":{"b":"1"},"content":D},{"attrs":{},"content":\n}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle edit operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    //           -- ins links ---
    //           |              |
    // [init] - [ABC] - [\n] - [D]
    doc.update((root) => {
      const text = root.createText('k1');
      text.edit(0, 0, 'ABCD');
      text.edit(3, 3, '\n');
    }, 'set {"k1":"ABC\nD"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 ABC][1:00:3:0 \n][1:00:2:3 D]',
        root['k1'].getAnnotatedString(),
      );
    });

    assert.equal('{"k1":"ABC\nD"}', doc.toSortedJSON());
  });

  it('should handle type 하늘', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      const text = root.createText('k1');
      text.edit(0, 0, 'ㅎ');
      text.edit(0, 1, '하');
      text.edit(0, 1, '한');
      text.edit(0, 1, '하');
      text.edit(1, 1, '느');
      text.edit(1, 2, '늘');
    }, 'set {"k1":"하늘"}');

    assert.equal('{"k1":"하늘"}', doc.toSortedJSON());
  });

  it('can push element then delete it by ID in array', function () {
    const doc = Document.create('test-col', 'test-doc');
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
    const doc = Document.create('test-col', 'test-doc');
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

    const root = doc.getRootObject();
    for (let idx = 0; idx < root['list'].length; idx++) {
      assert.equal(idx + 1, root['list'][idx]);
      assert.equal(idx + 1, root['list'].getElementByIndex(idx).getValue());
    }
  });

  it('garbage collection test', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'set 1, 2, 3');
    assert.equal('{"1":1,"2":[1,2,3],"3":3}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['2'];
    }, 'deletes 2');
    assert.equal('{"1":1,"3":3}', doc.toSortedJSON());
    assert.equal(4, doc.getGarbageLen());
    assert.equal(4, doc.garbageCollect(MaxTimeTicket));
    assert.equal(0, doc.getGarbageLen());
  });

  it('garbage collection test2', function () {
    const size = 10000;
    const doc = Document.create('test-col', 'test-doc');
    doc.update((root) => {
      root['1'] = Array.from(Array(size).keys());
    }, 'sets big array');

    doc.update((root) => {
      delete root['1'];
    }, 'deletes the array');

    assert.equal(size + 1, doc.garbageCollect(MaxTimeTicket));
  });

  it('garbage collection test3', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'] = [1, 2, 3];
    }, 'set 1, 2, 3');
    assert.equal('{"list":[1,2,3]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['list'][1];
    }, 'deletes 2');
    assert.equal('{"list":[1,3]}', doc.toSortedJSON());

    assert.equal(1, doc.getGarbageLen());
    assert.equal(1, doc.garbageCollect(MaxTimeTicket));
    assert.equal(0, doc.getGarbageLen());

    const root = (doc.getRoot().get('list') as JSONArray)
      .getElements()
      .getAnnotatedString();
    const clone = (doc.getClone().get('list') as JSONArray)
      .getElements()
      .getAnnotatedString();

    assert.equal(root, clone);
  });

  it('garbage collection test for text', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let expected_msg = '{"k1":"Hello mario"}';
    doc.update((root) => {
      const text = root.createText('k1');
      text.edit(0, 0, 'Hello world');
      text.edit(6, 11, 'mario');
      assert.equal(expected_msg, root.toJSON());
    }, 'edit text k1');
    assert.equal(expected_msg, doc.toSortedJSON());
    assert.equal(1, doc.getGarbageLen());

    expected_msg = '{"k1":"Hi jane"}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi');
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane');
      assert.equal(expected_msg, root.toJSON());
    }, 'deletes 2');
    assert.equal(expected_msg, doc.toSortedJSON());

    const expectedGarbageLen = 4;
    assert.equal(expectedGarbageLen, doc.getGarbageLen());
    assert.equal(expectedGarbageLen, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });

  it('garbage collection test for rich text', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let expected_msg =
      '{"k1":[{"attrs":{"b":"1"},"content":Hello },{"attrs":{},"content":mario},{"attrs":{},"content":\n}]}';
    doc.update((root) => {
      const text = root.createRichText('k1');
      text.edit(0, 0, 'Hello world', { b: '1' });
      text.edit(6, 11, 'mario');
      assert.equal(expected_msg, root.toJSON());
    }, 'edit rich text k1');
    assert.equal(expected_msg, doc.toSortedJSON());
    assert.equal(1, doc.getGarbageLen());

    expected_msg =
      '{"k1":[{"attrs":{"b":"1"},"content":Hi},{"attrs":{"b":"1"},"content": },{"attrs":{},"content":j},{"attrs":{"b":"1"},"content":ane},{"attrs":{},"content":\n}]}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi', { b: '1' });
      text.edit(3, 4, 'j', null);
      text.edit(4, 8, 'ane', { b: '1' });
      assert.equal(expected_msg, root.toJSON());
    }, 'edit rich text k1');
    assert.equal(expected_msg, doc.toSortedJSON());

    const expectedGarbageLen = 4;
    assert.equal(expectedGarbageLen, doc.getGarbageLen());
    assert.equal(expectedGarbageLen, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });

  it('garbage collection test for large size text 1', function () {
    const size = 100;
    const doc = Document.create('test-col', 'test-doc');
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
    const doc = Document.create('test-col', 'test-doc');
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

  it('can insert an element after the given element in array', function () {
    const doc = Document.create('test-col', 'test-doc');
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

  it('can rollback, primitive deepcopy', function () {
    const doc = Document.create('test-col', 'test-doc');

    doc.update((root) => {
      root['k1'] = {};
      root['k1']['k1.1'] = 1;
      root['k1']['k1.2'] = 2;
    });
    assert.equal('{"k1":{"k1.1":1,"k1.2":2}}', doc.toSortedJSON());
    assert.throws(() => {
      doc.update((root) => {
        delete root['k1']['k1.1'];
        throw Error('dummy error');
      }, 'dummy error');
    });
    assert.equal('{"k1":{"k1.1":1,"k1.2":2}}', doc.toSortedJSON());
  });

  it('can be increased by Counter type', function () {
    const doc = Document.create('test-col', 'test-doc');

    doc.update((root) => {
      root['k1'] = {};
      root['k1'].createCounter('age', 1);
      root['k1'].createCounter('length', 10.5);

      root['k1']['age'].increase(5);
      root['k1']['length'].increase(3.5);
    });
    assert.equal(`{"k1":{"age":6,"length":14}}`, doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['age'].increase(1.5).increase(1);
      root['k1']['length'].increase(3.5).increase(1);
    });
    assert.equal(`{"k1":{"age":8.5,"length":18.5}}`, doc.toSortedJSON());

    // error test
    assert.Throw(() => {
      doc.update((root) => {
        root['k1']['age'].increase(true);
      });
    }, 'Unsupported type of value: boolean');
    assert.equal(`{"k1":{"age":8.5,"length":18.5}}`, doc.toSortedJSON());
  });
});
