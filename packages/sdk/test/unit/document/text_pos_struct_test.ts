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
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { RGATreeSplitPos } from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';

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

describe('RGATreeSplit.findNodeWithSplit', () => {
  it('should clamp an offset running past the node it resolves to', () => {
    const doc = textDoc();
    const text = doc.getRootObject().get('t') as unknown as CRDTText;
    const split = text.getRGATreeSplit();
    const node = split.getHead().getNext()!;

    // The same arithmetic `posToIndex` clamps: the floor lookup answers with
    // the node whose id is the greatest one at or before the position, so an
    // offset past that node's content - what GC leaves behind when it purges
    // the piece the id addressed - overshoots it. `splitNode` refuses an
    // overshooting offset, and this runs on the remote-apply path, so the
    // position must resolve to the end of the survivor instead of throwing.
    const overshoot = RGATreeSplitPos.of(
      node.getID(),
      node.getContentLength() + 100,
    );
    const [left, , right] = split.findNodeWithSplit(
      overshoot,
      doc.getChangeID().next().createTimeTicket(1),
    );

    assert.equal(left, node, 'the split should land at the end of the node');
    assert.isUndefined(right, 'the node is the last one in the chain');
    assert.equal(
      split.posToIndex(overshoot, true),
      doc.getRoot().t.length,
      'the clamped position stays inside the text',
    );
  });
});
