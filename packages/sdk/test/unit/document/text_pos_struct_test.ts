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
import { Document, Text } from '@yorkie-js/sdk/src/yorkie';
import { TextPosStructRange } from '@yorkie-js/sdk/src/document/json/text';

/**
 * `textDoc` returns a document whose text holds `ABCD` as a single node.
 */
function textDoc(): Document<{ t: Text }> {
  const doc = new Document<{ t: Text }>('text-pos-struct');
  doc.update((root) => {
    root.t = new Text();
    root.t.edit(0, 0, 'ABCD');
  });
  return doc;
}

describe('Text.posRangeToIndexRange', () => {
  it('should reject a position struct carrying a negative offset', () => {
    const doc = textDoc();
    const range = doc.getRoot().t.indexRangeToPosRange([1, 3]);

    // A struct is the second deserializer of a text position, and it is no
    // more trusted than the wire: it reaches here from a remote peer's
    // presence. Both offsets are consumed as arithmetic, never looked up.
    for (const tamper of [
      (r: TextPosStructRange) => (r[1].relativeOffset = -1),
      (r: TextPosStructRange) => (r[1].id.offset = -1),
      (r: TextPosStructRange) => (r[0].relativeOffset = 1.5),
    ]) {
      const tampered = JSON.parse(JSON.stringify(range)) as TextPosStructRange;
      // The untampered range resolves, so a rejection below is the offset.
      assert.deepEqual(doc.getRoot().t.posRangeToIndexRange(tampered), [1, 3]);
      tamper(tampered);
      assert.throws(
        () => doc.getRoot().t.posRangeToIndexRange(tampered),
        /non-negative integer/,
      );
    }
  });

  it('should clamp an offset running past the node it resolves to', () => {
    const doc = textDoc();
    const range = doc.getRoot().t.indexRangeToPosRange([1, 3]);

    // The floor lookup answers with the node whose id is the greatest one at
    // or before the position - so an offset past that node's content, which
    // is what is left behind when GC purges the piece the id addressed,
    // would otherwise place the position past characters it never covered.
    range[1].relativeOffset += 100;
    const [from, to] = doc.getRoot().t.posRangeToIndexRange(range);
    assert.equal(from, 1);
    assert.equal(
      to,
      doc.getRoot().t.length,
      'the clamped offset should stay inside the text',
    );
  });
});
