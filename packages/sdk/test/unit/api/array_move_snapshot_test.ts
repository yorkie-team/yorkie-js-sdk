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
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { JSONArray } from '@yorkie-js/sdk/src/yorkie';

describe('Array move snapshot', function () {
  // Regression for yorkie#1948: when the last element of an array was moved
  // into its slot, appending more elements and then restoring the array from a
  // snapshot must preserve order.
  //
  // `RGATreeList.insert` anchored on the last node's ELEMENT createdAt instead
  // of its POSITION createdAt. For a moved last element those differ, and the
  // element createdAt resolves to the element's now-dead original position
  // node, so each appended element landed before the previous one — reversing
  // the appended run. `fromArray` is the only caller of `insert`, so this
  // surfaced solely as a replica diverging after a snapshot restore.
  it('preserves order of a moved-then-appended array across a snapshot', function () {
    const doc = new Document<{ list: JSONArray<number> }>('test-doc');

    doc.update((root) => {
      root.list = [14, 15] as JSONArray<number>;
    });
    assert.equal('{"list":[14,15]}', doc.toJSON());

    // Two moves that leave two dead position nodes and a moved last element,
    // while restoring the original [14,15] order.
    doc.update((root) => {
      const n14 = root.list.getElementByIndex(0)!;
      const n15 = root.list.getElementByIndex(1)!;
      root.list.moveAfter(n15.getID(), n14.getID());
    });
    assert.equal('{"list":[15,14]}', doc.toJSON());

    doc.update((root) => {
      const n15 = root.list.getElementByIndex(0)!;
      const n14 = root.list.getElementByIndex(1)!;
      root.list.moveAfter(n14.getID(), n15.getID());
    });
    assert.equal('{"list":[14,15]}', doc.toJSON());

    // Append after the moved last element.
    doc.update((root) => {
      root.list.push(26);
      root.list.push(66);
    });
    assert.equal('{"list":[14,15,26,66]}', doc.toJSON());

    // The snapshot restore path rebuilds the list through `insert`.
    const bytes = converter.objectToBytes(doc.getRootObject());
    const restored = converter.bytesToObject(bytes);
    assert.equal(
      restored.toSortedJSON(),
      doc.toSortedJSON(),
      'snapshot restore of a moved-then-appended array must preserve order',
    );
  });
});
