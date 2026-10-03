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
import { Document } from '@yorkie-js/sdk/src/yorkie';
import { Tree } from '@yorkie-js/sdk/src/document/json/tree';
import { TreePosStructRange } from '@yorkie-js/sdk/src/document/crdt/tree';

/**
 * `treeDoc` returns a document whose tree holds a single paragraph of text.
 */
function treeDoc(): Document<{ t: Tree }> {
  const doc = new Document<{ t: Tree }>('tree-pos-struct');
  doc.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [{ type: 'text', value: 'ABCD' }] }],
    });
  });
  return doc;
}

describe('Tree.posRangeToIndexRange', () => {
  it('should reject a position struct carrying a negative offset', () => {
    const doc = treeDoc();
    const range = doc.getRoot().t.indexRangeToPosRange([1, 3]);

    // A struct is the second deserializer of a tree position, and it is no
    // more trusted than the wire: it reaches here from a remote peer's
    // presence. Both node ids of a position carry an offset that is consumed
    // as arithmetic - never looked up - the way a text position's is.
    for (const tamper of [
      (r: TreePosStructRange) => (r[1].leftSiblingID.offset = -1),
      (r: TreePosStructRange) => (r[1].parentID.offset = -1),
      (r: TreePosStructRange) => (r[0].leftSiblingID.offset = 1.5),
      (r: TreePosStructRange) => (r[0].parentID.offset = 1.5),
    ]) {
      const tampered = JSON.parse(JSON.stringify(range)) as TreePosStructRange;
      // The untampered range resolves, so a rejection below is the offset.
      assert.deepEqual(doc.getRoot().t.posRangeToIndexRange(tampered), [1, 3]);
      tamper(tampered);
      assert.throws(
        () => doc.getRoot().t.posRangeToIndexRange(tampered),
        /non-negative integer/,
      );
    }
  });

  it('should reject a negative offset on the path range as well', () => {
    const doc = treeDoc();
    const range = doc.getRoot().t.indexRangeToPosRange([1, 3]);
    const tampered = JSON.parse(JSON.stringify(range)) as TreePosStructRange;
    tampered[1].leftSiblingID.offset = -1;

    assert.throws(
      () => doc.getRoot().t.posRangeToPathRange(tampered),
      /non-negative integer/,
    );
  });
});
