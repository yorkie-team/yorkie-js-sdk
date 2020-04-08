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

describe('Document', function() {
  it('should apply updates of string', function() {
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
      root['k1'] = {'k1-1': 'v1'};
      root['k1']['k1-2'] = 'v2';
    }, 'set {"k1-1":"v1","k1-2":"v2":}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['k1-2'] = 'v3';
    }, 'set {"k1-2":"v3"}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k2'] = ["1","2"];
      root['k2'].push("3");
    }, 'set ["1","2","3"]');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}', doc.toSortedJSON());

    assert.throws(() => {
      doc.update((root) => {
        root['k2'].push("4");
        throw new Error('dummy error');
      }, 'push "4"');
    }, 'dummy error');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      root['k2'].push("4");
    }, 'push "4"');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4"]}', doc.toSortedJSON());

    doc.update((root) => {
      root['k2'].push({"k2-5": "v4"});
    }, 'push "{k2-5: 4}"');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4",{"k2-5":"v4"}]}', doc.toSortedJSON());
  });

  it('should handle delete operations', function () {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = {'k1-1': 'v1', 'k1-2': 'v2'};
      root['k2'] = ['1','2','3'];
    }, 'set {"k1":{"k1-1":"v1","k1-2":"v2"},"k2":["1","2","3"]}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"},"k2":["1","2","3"]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['k1']['k1-1'];
      root['k1']['k1-3'] = 'v4';

      delete root['k2'][1];
      root['k2'].push('4');
    }, 'set {"k1":{"k1-2":"v2"},"k2":["1","3","4"]}');
    assert.equal('{"k1":{"k1-2":"v2","k1-3":"v4"},"k2":["1","3","4"]}', doc.toSortedJSON());
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
        root['k1'].getAnnotatedString()
      );

      let range = root['k1'].createRange(0, 0);
      assert.equal('0:00:0:0:0', range[0].getAnnotatedString())

      range = root['k1'].createRange(1, 1);
      assert.equal('1:00:2:0:1', range[0].getAnnotatedString())

      range = root['k1'].createRange(2, 2);
      assert.equal('1:00:3:0:1', range[0].getAnnotatedString());

      range = root['k1'].createRange(3, 3)
      assert.equal('1:00:3:0:2', range[0].getAnnotatedString())

      range = root['k1'].createRange(4, 4);
      assert.equal('1:00:2:3:1', range[0].getAnnotatedString())
    });

    assert.equal('{"k1":"A12D"}', doc.toSortedJSON());
  });

  it('should handle type 하늘', function() {
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

  it('can push element then remove it by ID in array', function() {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());
  
    let toDelete;
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
      root['list'].removeByID(toDelete.getID());
    }, 'remove 2');
    assert.equal('{"list":[4,3,1]}', doc.toSortedJSON());

    doc.update((root) => {
      assert.equal(4, root['list'].push(2));
    }, 'push 2');
    assert.equal('{"list":[4,3,1,2]}', doc.toSortedJSON());
  });

  it('can inster an element after the given element in array', function() {
    const doc = Document.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());
  
    let prev;
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
});
