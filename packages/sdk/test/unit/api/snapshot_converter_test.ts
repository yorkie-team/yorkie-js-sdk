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
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { Counter, Text } from '@yorkie-js/sdk/src/yorkie';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

describe('snapshotToBytes', function () {
  it('should round-trip root and presences', function () {
    const doc = new Document<
      {
        obj: { nested: boolean; count: number };
        arr: Array<number | string>;
        text: Text;
        counter: Counter;
      },
      { cursor: number; name: string }
    >('test-doc');

    doc.update((root, presence) => {
      root.obj = { nested: true, count: 42 };
      root.arr = [1, 2, 'three'];
      root.text = new Text();
      root.text.edit(0, 0, 'hello');
      root.counter = new Counter(0);
      root.counter.increase(5);
      presence.set({ cursor: 7, name: 'alice' });
    });

    const rootObj = doc.getRootObject();
    const presences = new Map([
      [doc.getChangeID().getActorID(), doc.getMyPresence()],
    ]);

    const bytes = converter.snapshotToBytes(rootObj, presences);
    const restored = converter.bytesToSnapshot<{
      cursor: number;
      name: string;
    }>(bytes);

    assert.equal(rootObj.toSortedJSON(), restored.root.toSortedJSON());
    assert.deepEqual(
      Array.from(presences.entries()),
      Array.from(restored.presences.entries()),
    );
  });

  it('should round-trip an empty document', function () {
    const doc = new Document<Record<string, never>>('empty-doc');
    const rootObj = doc.getRootObject();
    const presences = new Map();

    const bytes = converter.snapshotToBytes(rootObj, presences);
    const restored = converter.bytesToSnapshot(bytes);

    assert.equal(rootObj.toSortedJSON(), restored.root.toSortedJSON());
    assert.equal(restored.presences.size, 0);
  });

  // A text attribute is tombstoned by a Style op carrying `attributesToRemove`.
  // The route to one through the public API is undoing a Style that introduced
  // a brand-new key: StyleOperation.execute collects such keys into
  // `reverseAttrsToRemove` and hands back a remove-style reverse op, whose
  // execution calls CRDTText.removeStyle -> RHT.remove, leaving an RHT node
  // with `removedAt` set.
  //
  // `toTextNodes` must carry that tombstone onto the wire and `fromTextNode`
  // must restore it, exactly as the tree path already does via `toRHT`/
  // `fromRHT` (converter.ts:811 writes `isRemoved`, converter.ts:1373 reads
  // it). Without that, the tombstone decodes as a live attribute stamped with
  // the removal's own ticket -- the newest ticket in play -- so it wins LWW
  // against every older write, and the GC pair is lost as well.
  it('should round-trip a tombstoned text attribute', function () {
    const doc = new Document<{ text: Text }>('test-doc');
    doc.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'hello');
    });
    doc.update((root) => {
      root.text.setStyle(0, 5, { bold: 'true' });
    });

    // Undo the style: `bold` did not exist before, so the reverse op removes
    // it, tombstoning the attribute rather than dropping it.
    assert.isTrue(doc.history.canUndo());
    doc.history.undo();

    const liveRoot = doc.getRootObject();
    assert.equal(
      liveRoot.toSortedJSON(),
      '{"text":[{"val":"hello"}]}',
      'the undone attribute must not render',
    );
    assert.equal(doc.getGarbageLen(), 1, 'the tombstone is one GC pair');

    // Size baseline. `doc.getDocSize()` is a running total accumulated op by
    // op, and its `live` half carries an unrelated, pre-existing drift here:
    // when RHT.remove supersedes a live attribute node with a tombstone node,
    // only the tombstone's size is moved out of live, so the superseded node's
    // bytes are never released. Recomputing a root from the very same object
    // graph (no converter involved) shows it: the running total reports
    // live {data:30,meta:120} where a fresh accounting of the identical graph
    // reports {data:10,meta:96}. So compare the rebuilt root's GC/Live split
    // against that fresh accounting, which is the apples-to-apples baseline
    // for "what a snapshot round-trip should reproduce". The `gc` half is
    // undrifted, and is checked against the live document too.
    const baseline = new CRDTRoot(liveRoot.deepcopy());

    const bytes = converter.snapshotToBytes(liveRoot, new Map());
    const rebuiltRoot = new CRDTRoot(converter.bytesToSnapshot(bytes).root);

    // The same four equalities the Go side asserts.
    assert.equal(
      rebuiltRoot.toSortedJSON(),
      liveRoot.toSortedJSON(),
      'content must match after a snapshot round-trip',
    );
    assert.equal(
      rebuiltRoot.getGarbageLen(),
      doc.getGarbageLen(),
      'garbage length must match after a snapshot round-trip',
    );
    assert.deepEqual(
      rebuiltRoot.getDocSize().gc,
      doc.getDocSize().gc,
      'gc size must match after a snapshot round-trip',
    );
    assert.deepEqual(
      rebuiltRoot.getDocSize().live,
      baseline.getDocSize().live,
      'live size must match after a snapshot round-trip',
    );

    // And the restored tombstone must be genuinely collectable.
    assert.equal(
      rebuiltRoot.garbageCollect(maxVectorOf([])),
      1,
      'the restored tombstone must be collectable',
    );
    assert.equal(rebuiltRoot.getGarbageLen(), 0);
  });
});
