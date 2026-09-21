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
import { Text } from '@yorkie-js/sdk/src/document/json/text';
import { Tree } from '@yorkie-js/sdk/src/document/json/tree';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { DataSize } from '@yorkie-js/sdk/src/util/resource';

/**
 * docSize.live is a RUNNING ACCUMULATOR: operations return a diff and it is
 * added, never recomputed. So it cannot detect its own drift, and the only way
 * to see any of this is to rebuild a root from the same content and compare.
 *
 * The Go server fixed the same four defects; this is the mirror. They must
 * agree, or the same document is a different size depending on which SDK is
 * looking at it, and MaxSizeLimit is enforced client-side.
 */
function rebuilt<T>(d: Document<T>): CRDTRoot {
  return new CRDTRoot(d.getRootObject().deepcopy());
}

function assertLedgerExact<T>(d: Document<T>, msg: string): void {
  const r = rebuilt(d);
  assert.deepEqual(d.getDocSize().live, r.getDocSize().live, `${msg}: live`);
  assert.deepEqual(d.getDocSize().gc, r.getDocSize().gc, `${msg}: gc`);
  assert.equal(d.getGarbageLen(), r.getGarbageLen(), `${msg}: count`);
}

function assertNotNegative(size: DataSize, msg: string): void {
  assert.isAtLeast(size.data, 0, `${msg}: live data went negative`);
  assert.isAtLeast(size.meta, 0, `${msg}: live meta went negative`);
}

type TextDoc = { k: Text };
type TreeDoc = { t: Tree };

function seededText(): Document<TextDoc> {
  const d = new Document<TextDoc>('test-doc');
  d.update((r) => {
    r.k = new Text();
    r.k.edit(0, 0, 'abcdefghij');
  });
  return d;
}

function seededTree(): Document<TreeDoc> {
  const d = new Document<TreeDoc>('test-doc');
  d.update((r) => {
    r.t = new Tree({
      type: 'doc',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
        { type: 'p', children: [{ type: 'text', value: 'efgh' }] },
      ],
    });
  });
  return d;
}

describe('the attribute ledger', () => {
  /**
   * `RHT.set` drops a superseded LIVE node from the map and reports only the
   * node it installed, so nothing ever subtracts the old value's bytes. Every
   * overwrite leaks one attribute, on the most common operation a rich-text
   * editor performs, and `MaxSizeLimit` reads live + gc.
   */
  it('does not leak when a text attribute is overwritten', () => {
    const d = seededText();
    for (const v of ['1', '2', '3']) {
      d.update((r) => r.k.setStyle(0, 10, { b: v }));
    }
    assertLedgerExact(d, 'after three text overwrites');
  });

  it('does not leak when a tree attribute is overwritten', () => {
    const d = seededTree();
    for (const v of ['1', '2', '3']) {
      d.update((r) => r.t.styleByPath([0], [1], { b: v }));
    }
    assertLedgerExact(d, 'after three tree overwrites');
  });

  /**
   * A tombstoned attribute belongs to gc, not to live. `CRDTTextValue
   * .getDataSize` counts removed attributes while the tree's skips them, so
   * the text half held the tombstone in live and in gc at once, and kept it in
   * live after collection purged it from gc.
   */
  it('moves a tombstoned text attribute out of live', () => {
    const d = seededText();
    const before = { ...d.getDocSize().live };

    d.update((r) => r.k.setStyle(0, 10, { b: '1' }));
    d.history.undo();

    assert.equal(d.getGarbageLen(), 1, 'the tombstone is registered');
    assert.deepEqual(
      d.getDocSize().live,
      before,
      'charged to gc and live at once',
    );
    assertLedgerExact(d, 'after undoing a text style');
  });

  it('does not strand a purged text attribute in live', () => {
    const d = seededText();
    const before = { ...d.getDocSize().live };

    d.update((r) => r.k.setStyle(0, 10, { b: '1' }));
    d.history.undo();
    d.garbageCollect(d.getVersionVector());

    assert.equal(d.getGarbageLen(), 0);
    assert.deepEqual(
      d.getDocSize().live,
      before,
      'the purged tombstone never left live',
    );
    assertLedgerExact(d, 'after collecting a text attribute tombstone');
  });

  /**
   * A style whose range opens inside one element and runs past its end yields
   * that element as an End token with no Start token. Both halves of the
   * per-token accounting have to agree about such a visit.
   */
  it('keeps live exact for a style straddling an element boundary', () => {
    const d = seededTree();
    d.update((r) => r.t.styleByPath([0], [2], { b: '1' }));

    for (let i = 0; i < 6; i += 1) {
      d.update((r) => r.t.style(1, 6, { b: `v${i}` }));
      assertLedgerExact(d, `straddling overwrite ${i + 1}`);
      assertNotNegative(d.getDocSize().live, `straddling overwrite ${i + 1}`);
    }
  });

  /**
   * A split deep-copies the value's attributes, tombstones included, so the
   * copy is new garbage under a new parent with no registration of its own.
   *
   * JS has a second problem the Go side does not: `splitValue` replaces the
   * LEFT node's value with a brand new object, and `keyOf` identifies a pair's
   * parent by object identity, so every pair already registered against that
   * value is orphaned -- purge is then called on an object nothing references,
   * and the tombstone survives while the ledger says it was collected.
   */
  it('keeps a split text attribute tombstone collectable', () => {
    const d = seededText();
    d.update((r) => r.k.setStyle(0, 10, { b: '1' }));
    d.history.undo();
    assert.equal(d.getGarbageLen(), 1, 'one tombstone before the split');

    d.update((r) => r.k.edit(5, 5, 'X'));
    assertLedgerExact(d, 'after splitting the node the tombstone rides on');

    const purged = d.garbageCollect(d.getVersionVector());
    assert.isAbove(purged, 0);
    assert.equal(d.getGarbageLen(), 0, 'every tombstone was collected');
  });

  /**
   * `splitValue` used to replace the LEFT node's value with a brand new
   * object, and `CRDTRoot.keyOf` identifies a pair's parent by object
   * identity, so every pair already registered against that value was
   * orphaned. Purge was then called on an object nothing references: the
   * ledger reported the tombstone collected while it survived in the content
   * forever. This needs no split at style time -- the pair is registered
   * first, and any later split of that node orphans it.
   */
  it('keeps a registered pair alive across a later split', () => {
    const d = seededText();
    d.update((r) => r.k.setStyle(0, 10, { b: '1' }));
    d.history.undo();
    assert.equal(d.getGarbageLen(), 1, 'registered before any split');

    d.update((r) => r.k.edit(3, 3, 'Z'));
    assertLedgerExact(d, 'after a split of the node the pair names');

    d.garbageCollect(d.getVersionVector());
    assertLedgerExact(d, 'after collecting');
    assert.equal(d.getGarbageLen(), 0);
    assert.deepEqual(
      new CRDTRoot(d.getRootObject().deepcopy()).getDocSize().gc,
      { data: 0, meta: 0 },
      'the content still holds a tombstone the ledger called collected',
    );
  });

  /**
   * `removeStyle` on a node the editor has already deleted: the attribute's
   * bytes are not in live (getDataSize skips removed nodes) and are already
   * inside the gc charge taken when the node was removed.
   */
  it('balances removing an attribute from a tombstoned text node', () => {
    const d = seededText();
    d.update((r) => r.k.setStyle(4, 6, { bbbbbbbbbb: 'vvvvvvvvvv' }));
    d.update((r) => r.k.edit(4, 6, ''));
    d.update((r) => r.k.setStyle(0, 8, { bbbbbbbbbb: 'vvvvvvvvvv' }));
    d.history.undo();

    assertLedgerExact(d, 'after removing an attribute from a tombstoned node');
    assertNotNegative(d.getDocSize().live, 'tombstoned node');

    d.garbageCollect(d.getVersionVector());
    assert.equal(d.getGarbageLen(), 0);
    assert.deepEqual(d.getDocSize().gc, { data: 0, meta: 0 }, 'gc residue');
  });
});
