/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

import { describe, it, assert } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text, Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTTree } from '@yorkie-js/sdk/src/document/crdt/tree';
import { alignSplitOffset } from '@yorkie-js/sdk/src/util/utf16';

/**
 * A UTF-16 offset falling between the two code units of a surrogate pair names
 * no character boundary. JS can split there; Go cannot (its strings hold no
 * lone surrogate), so both implementations move such a split forward to the
 * end of the pair. See yorkie#2031.
 */
describe('mid-surrogate-pair split', function () {
  /**
   * `hasLoneSurrogate` reports whether the given string holds half a pair.
   */
  function hasLoneSurrogate(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        i++;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  it('moves the offset to the end of the pair', function () {
    // '😀' is one pair: only offset 1 is mid-pair.
    assert.equal(alignSplitOffset('😀😀', 1), 2);
    assert.equal(alignSplitOffset('😀😀', 3), 4);
    assert.equal(alignSplitOffset('😀😀', 0), 0);
    assert.equal(alignSplitOffset('😀😀', 2), 2);
    assert.equal(alignSplitOffset('😀😀', 4), 4);
    assert.equal(alignSplitOffset('ab', 1), 1);
  });

  it('splits a tree text node after the pair', function () {
    const doc = new Document<{ t: Tree }>('doc');
    doc.update((r) => {
      r.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [{ type: 'text', value: '😀😀' }] }],
      });
      // index 2 is inside the first emoji: the split moves to index 3.
      r.t.edit(2, 2, { type: 'text', value: 'x' });
    });

    assert.equal(doc.getRoot().t.toXML(), '<r><p>😀x😀</p></r>');

    const tree = doc.getRootObject().get('t') as unknown as CRDTTree;
    tree.getIndexTree().traverseAll((node) => {
      if (node.isText) {
        assert.isFalse(hasLoneSurrogate(node.value), node.value);
      }
    });
  });

  it('splits a text node after the pair', function () {
    const doc = new Document<{ text: Text }>('doc');
    doc.update((r) => {
      r.text = new Text();
      r.text.edit(0, 0, '😀😀');
      r.text.edit(1, 1, 'x');
    });

    assert.equal(doc.getRoot().text.toString(), '😀x😀');
    // `toTestString` puts each node's meta data between the values, so a pair
    // cut across two nodes shows up as a lone surrogate here.
    const testString = doc.getRoot().text.toTestString();
    assert.isFalse(hasLoneSurrogate(testString), testString);
  });
});
