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
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

const actorA = '000000000000000000000001';
const actorB = '000000000000000000000002';

/**
 * `crossSync` exchanges pending local changes between two in-process documents
 * without a server, so each document's version vector gains the other actor's
 * entry. Mirrors the helper in document_size_test.ts.
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();
  type Pack = ReturnType<Document<T>['createChangePack']>;
  const deliver = (pack: Pack) =>
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges(),
      InitialVersionVector,
    );
  d2.applyChangePack(deliver(p1));
  d1.applyChangePack(deliver(p2));
  const ack = (pack: Pack) => {
    const changes = pack.getChanges();
    const lastSeq = changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
    return ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    );
  };
  d1.applyChangePack(ack(p1));
  d2.applyChangePack(ack(p2));
}

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

  it('should round-trip a version vector with multiple actor entries', function () {
    type R = { a?: number; b?: number };
    const d1 = new Document<R>('multi-actor-doc');
    const d2 = new Document<R>('multi-actor-doc');
    d1.setActor(actorA);
    d2.setActor(actorB);

    d1.update((root) => {
      root.a = 1;
    });
    d2.update((root) => {
      root.b = 2;
    });
    crossSync(d1, d2);

    // d1's version vector now carries entries for both actors.
    assert.isTrue(Array.from(d1.getChangeID().getVersionVector()).length >= 2);

    const restored = Document.fromBytes<R>('multi-actor-doc', d1.toBytes());
    assert.equal(d1.toSortedJSON(), restored.toSortedJSON());
    assertChangeIDEqual(restored.getChangeID(), d1.getChangeID());
  });

  it('should round-trip the compaction epoch', function () {
    type R = { n?: number };
    const doc = new Document<R>('epoch-doc');
    doc.setActor(actorA);
    doc.update((root) => {
      root.n = 1;
    });

    // Learn a non-zero epoch from a server-style response pack, mirroring the
    // pull path (`applyChangePack` copies the pack's epoch onto the document).
    doc.applyChangePack(
      ChangePack.create(
        'epoch-doc',
        Checkpoint.of(0n, 1),
        false,
        [],
        InitialVersionVector,
        undefined,
        7n,
      ),
    );
    assert.equal(doc.getEpoch(), 7n);

    const restored = Document.fromBytes<R>('epoch-doc', doc.toBytes());
    assert.equal(restored.getEpoch(), 7n);
  });

  it('should present the document epoch on createChangePack', function () {
    type R = { n?: number };
    const doc = new Document<R>('present-epoch-doc');
    doc.setActor(actorA);
    doc.applyChangePack(
      ChangePack.create(
        'present-epoch-doc',
        Checkpoint.of(0n, 0),
        false,
        [],
        InitialVersionVector,
        undefined,
        11n,
      ),
    );

    assert.equal(doc.createChangePack().getEpoch(), 11n);
  });

  it('should default the epoch to 0n for a legacy four-blob envelope', function () {
    // An envelope written before epoch support has no epoch blob; fromBytes
    // must treat it as the initial epoch rather than throwing.
    type R = { n?: number };
    const doc = new Document<R>('legacy-epoch-doc');
    doc.setActor(actorA);
    doc.update((root) => {
      root.n = 1;
    });

    // Strip the trailing epoch blob to synthesize a legacy four-blob envelope.
    const full = doc.toBytes();
    const view = new DataView(full.buffer, full.byteOffset, full.byteLength);
    let offset = 0;
    for (let i = 0; i < 4; i++) {
      const len = view.getUint32(offset, true);
      offset += 4 + len;
    }
    const legacy = full.subarray(0, offset);

    const restored = Document.fromBytes<R>('legacy-epoch-doc', legacy);
    assert.equal(restored.getEpoch(), 0n);
    assert.equal(restored.toSortedJSON(), doc.toSortedJSON());
  });

  it('should reject a corrupt envelope', function () {
    const doc = new Document<{ n?: number }>('corrupt-doc');
    doc.update((root) => {
      root.n = 1;
    });
    const bytes = doc.toBytes();

    // Truncating the envelope leaves a blob length that overruns the buffer.
    const truncated = bytes.subarray(0, bytes.length - 3);
    assert.throws(() =>
      Document.fromBytes<{ n?: number }>('corrupt-doc', truncated),
    );
  });
});

describe('Document incremental restore', function () {
  type R = { text: Text; counter: Counter; n?: number };

  /** Builds a document with some content and a known actor. */
  function seed(key: string): Document<R> {
    const doc = new Document<R>(key);
    doc.setActor(actorA);
    doc.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'hello');
      root.counter = new Counter(0);
      root.counter.increase(5);
    });
    return doc;
  }

  it('should restore a snapshot plus changes appended after it', function () {
    const live = seed('inc-1');

    // The snapshot is taken here; everything below is what the append log
    // would hold. `toBytes` serializes the live root, so the snapshot already
    // reflects the seed edits.
    const snapshot = live.toBytes();
    const beforeCount = live.getPendingChangeStructs().length;

    live.update((root) => root.text.edit(5, 5, ' world'));
    live.update((root) => root.counter.increase(3));
    live.update((root) => {
      root.n = 42;
    });

    // The changes written after the snapshot, in append order.
    const appended = live.getPendingChangeStructs().slice(beforeCount);
    assert.equal(appended.length, 3);

    const restored = Document.fromBytes<R>('inc-1', snapshot);
    restored.restoreAppendedChanges(appended);

    // Applied: the root has moved forward to match the live document.
    assert.equal(restored.toSortedJSON(), live.toSortedJSON());
    // And queued: every un-pushed change is still there to push.
    assert.deepEqual(
      restored.getPendingChangeStructs(),
      live.getPendingChangeStructs(),
    );
    // And the document's own counter moved with them. `createChangePack`
    // derives the pushed checkpoint from `changeID.clientSeq`, so a counter
    // left behind the replayed run mints a colliding sequence on the next
    // edit and the server silently drops it.
    assertChangeIDEqual(restored.getChangeID(), live.getChangeID());
  });

  it('should keep the next edit pushable after a replay', function () {
    const live = seed('inc-5');
    const snapshot = live.toBytes();
    const before = live.getPendingChangeStructs().length;
    live.update((root) => root.text.edit(5, 5, 'x'));
    live.update((root) => root.text.edit(6, 6, 'y'));
    const appended = live.getPendingChangeStructs().slice(before);

    const restored = Document.fromBytes<R>('inc-5', snapshot);
    restored.restoreAppendedChanges(appended);
    restored.update((root) => root.text.edit(7, 7, 'z'));

    const seqs = restored
      .createChangePack()
      .getChanges()
      .map((c) => c.getID().getClientSeq());
    assert.deepEqual(
      seqs,
      [...seqs].sort((a, b) => a - b),
      'clientSeqs must ascend',
    );
    assert.equal(
      new Set(seqs).size,
      seqs.length,
      'a duplicate clientSeq is silently dropped by the server',
    );
  });

  it('should not re-apply the changes carried inside the envelope', function () {
    // `toBytes` writes the live root *and* the pending queue. The queue is for
    // re-pushing, not for replaying: applying it again would double every
    // operation it holds.
    const live = seed('inc-2');
    live.update((root) => root.counter.increase(7));

    const restored = Document.fromBytes<R>('inc-2', live.toBytes());

    assert.equal(restored.toSortedJSON(), live.toSortedJSON());
    assert.deepEqual(
      restored.getPendingChangeStructs(),
      live.getPendingChangeStructs(),
    );
  });

  it('should reject an appended log that is out of order', function () {
    const live = seed('inc-3');
    const snapshot = live.toBytes();
    const before = live.getPendingChangeStructs().length;
    live.update((root) => root.text.edit(5, 5, 'a'));
    live.update((root) => root.text.edit(6, 6, 'b'));
    const appended = live.getPendingChangeStructs().slice(before);

    const restored = Document.fromBytes<R>('inc-3', snapshot);
    assert.throws(
      () => restored.restoreAppendedChanges([appended[1], appended[0]]),
      /ascending/,
    );
  });

  it('should round-trip checkpoint and changeID through meta bytes', function () {
    // After a sync the checkpoint advances while the snapshot stays put, so
    // meta is what keeps a restore from resuming at a stale checkpoint.
    const live = seed('inc-4');
    const meta = live.metaToBytes();

    const restored = Document.fromBytes<R>('inc-4', live.toBytes());
    restored.restoreMetaFromBytes(meta);

    assert.equal(
      restored.getCheckpoint().getClientSeq(),
      live.getCheckpoint().getClientSeq(),
    );
    assert.equal(
      restored.getCheckpoint().getServerSeq().toString(),
      live.getCheckpoint().getServerSeq().toString(),
    );
    assertChangeIDEqual(restored.getChangeID(), live.getChangeID());
  });
});
