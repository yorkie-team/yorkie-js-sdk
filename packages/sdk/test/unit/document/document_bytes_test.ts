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
import { Counter, Text } from '@yorkie-js/sdk/src/yorkie';
import type { ChangeID } from '@yorkie-js/sdk/src/document/change/change_id';

const actorA = '000000000000000000000001';
const actorB = '000000000000000000000002';

/**
 * `assertChangeIDEqual` asserts the lamport, version vector, and actor of two
 * change ids are equal.
 */
function assertChangeIDEqual(actual: ChangeID, expected: ChangeID) {
  assert.equal(actual.getLamport(), expected.getLamport());
  assert.equal(actual.getActorID(), expected.getActorID());
  assert.deepEqual(
    Array.from(actual.getVersionVector()),
    Array.from(expected.getVersionVector()),
  );
}

describe('Document.toBytes / fromBytes', function () {
  it('should round-trip a document with root, presence, and pending changes', function () {
    type R = {
      obj: { flag: boolean; num: number };
      arr: Array<number | string>;
      text: Text;
      counter: Counter;
    };
    type P = { cursor: number; name: string };

    const doc = new Document<R, P>('round-trip-doc');
    doc.setActor(actorA);

    doc.update((root, presence) => {
      root.obj = { flag: true, num: 42 };
      root.arr = [1, 2, 'three'];
      root.text = new Text();
      root.text.edit(0, 0, 'hello');
      root.counter = new Counter(0);
      root.counter.increase(5);
      presence.set({ cursor: 7, name: 'alice' });
    });

    // The document has un-pushed local changes at this point.
    assert.isTrue(doc.hasLocalChanges());

    const bytes = doc.toBytes();
    const restored = Document.fromBytes<R, P>('round-trip-doc', bytes);

    // root JSON.
    assert.equal(doc.toSortedJSON(), restored.toSortedJSON());

    // presences.
    const actor = doc.getChangeID().getActorID();
    assert.deepEqual(
      restored.getPresenceForTest(actor),
      doc.getPresenceForTest(actor),
    );
    assert.deepEqual(restored.getPresenceForTest(actor), {
      cursor: 7,
      name: 'alice',
    });

    // checkpoint.
    assert.equal(
      doc.getCheckpoint().getServerSeq(),
      restored.getCheckpoint().getServerSeq(),
    );
    assert.equal(
      doc.getCheckpoint().getClientSeq(),
      restored.getCheckpoint().getClientSeq(),
    );

    // changeID (lamport + version vector + actor).
    assertChangeIDEqual(restored.getChangeID(), doc.getChangeID());

    // pending local changes: count and content.
    const originalPack = doc.createChangePack();
    const restoredPack = restored.createChangePack();
    assert.equal(
      restoredPack.getChanges().length,
      originalPack.getChanges().length,
    );
    assert.deepEqual(
      restoredPack.getChanges().map((c) => c.toStruct()),
      originalPack.getChanges().map((c) => c.toStruct()),
    );
  });

  it('should round-trip an empty document', function () {
    const doc = new Document<Record<string, never>>('empty-doc');

    assert.isFalse(doc.hasLocalChanges());

    const bytes = doc.toBytes();
    const restored = Document.fromBytes<Record<string, never>>(
      'empty-doc',
      bytes,
    );

    assert.equal(doc.toSortedJSON(), restored.toSortedJSON());
    assert.isFalse(restored.hasLocalChanges());
    assert.equal(
      restored.getCheckpoint().getServerSeq(),
      doc.getCheckpoint().getServerSeq(),
    );
    assert.equal(
      restored.getCheckpoint().getClientSeq(),
      doc.getCheckpoint().getClientSeq(),
    );
    assertChangeIDEqual(restored.getChangeID(), doc.getChangeID());
  });

  it('should preserve pending changes across restore', function () {
    const doc = new Document<{ count: Counter }>('pending-doc');
    doc.setActor(actorB);

    doc.update((root) => {
      root.count = new Counter(0);
    });
    doc.update((root) => {
      root.count.increase(10);
    });

    const originalChanges = doc.createChangePack().getChanges();
    assert.isTrue(originalChanges.length >= 1);

    const restored = Document.fromBytes<{ count: Counter }>(
      'pending-doc',
      doc.toBytes(),
    );
    const restoredChanges = restored.createChangePack().getChanges();

    assert.equal(restoredChanges.length, originalChanges.length);
    assert.deepEqual(
      restoredChanges.map((c) => c.toStruct()),
      originalChanges.map((c) => c.toStruct()),
    );
  });
});
