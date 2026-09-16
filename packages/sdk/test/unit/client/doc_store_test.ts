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
import { DocStore, MemoryDocStore } from '@yorkie-js/sdk/src/client/doc-store';
import { DocEventType } from '@yorkie-js/sdk/src/document/document';
import type { ChangeID } from '@yorkie-js/sdk/src/document/change/change_id';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';

const actorA = '000000000000000000000001';

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

/**
 * `persistOnLocalChange` mirrors the client's persist-on-local-change hook:
 * it subscribes to a document's local changes and writes `doc.toBytes()` into
 * the given store after each one. Returns the unsubscribe. This exercises the
 * exact wiring the client installs without needing a server.
 */
function persistOnLocalChange<R, P extends { [k: string]: any }>(
  store: DocStore,
  doc: Document<R, P>,
): () => void {
  return doc.subscribe((event) => {
    if (event.type === DocEventType.LocalChange) {
      void store.saveSnapshot(doc.getKey(), doc.toBytes());
    }
  });
}

// The `DocStore` contract, asserted against `MemoryDocStore`. Every backend
// must satisfy exactly these properties, so an app writing its own (IndexedDB,
// or anything else) should be able to lift this block wholesale and point it at
// its own implementation. Keep it free of anything Memory-specific.
describe('DocStore contract (MemoryDocStore)', function () {
  it('should answer undefined for an unknown key', async function () {
    const store = new MemoryDocStore();
    assert.isUndefined(await store.load('nope'));
  });

  it('should round-trip a snapshot with an empty change log', async function () {
    const store = new MemoryDocStore();
    await store.saveSnapshot('doc-1', new Uint8Array([1, 2, 3]));

    const stored = await store.load('doc-1');
    assert.deepEqual(Array.from(stored!.snapshot), [1, 2, 3]);
    assert.deepEqual(stored!.changes, []);
    assert.isUndefined(stored!.meta);
  });

  it('should overwrite the snapshot on repeated saveSnapshot', async function () {
    const store = new MemoryDocStore();
    await store.saveSnapshot('doc-1', new Uint8Array([1]));
    await store.saveSnapshot('doc-1', new Uint8Array([2, 3]));

    const stored = await store.load('doc-1');
    assert.deepEqual(Array.from(stored!.snapshot), [2, 3]);
  });

  it('should return appended changes ordered by clientSeq', async function () {
    const store = new MemoryDocStore();
    await store.saveSnapshot('doc-1', new Uint8Array([0]));
    // Appended out of order on purpose: the store owes the client an ordered
    // log, because replay applies them in sequence.
    await store.appendChange('doc-1', {
      clientSeq: 2,
      bytes: new Uint8Array([2]),
    });
    await store.appendChange('doc-1', {
      clientSeq: 1,
      bytes: new Uint8Array([1]),
    });

    const stored = await store.load('doc-1');
    assert.deepEqual(
      stored!.changes.map((c) => c.clientSeq),
      [1, 2],
    );
    assert.deepEqual(Array.from(stored!.changes[0].bytes), [1]);
  });

  it('should drop the change log when the snapshot is replaced', async function () {
    // Compaction: the new snapshot already contains those changes, so keeping
    // them would replay them a second time on restore.
    const store = new MemoryDocStore();
    await store.saveSnapshot('doc-1', new Uint8Array([0]));
    await store.appendChange('doc-1', {
      clientSeq: 1,
      bytes: new Uint8Array([1]),
    });
    await store.saveSnapshot('doc-1', new Uint8Array([9]));

    const stored = await store.load('doc-1');
    assert.deepEqual(Array.from(stored!.snapshot), [9]);
    assert.deepEqual(stored!.changes, []);
  });

  it('should record meta without touching the snapshot or the log', async function () {
    const store = new MemoryDocStore();
    await store.saveSnapshot('doc-1', new Uint8Array([0]));
    for (const clientSeq of [1, 2, 3]) {
      await store.appendChange('doc-1', {
        clientSeq,
        bytes: new Uint8Array([clientSeq]),
      });
    }

    await store.saveMeta('doc-1', new Uint8Array([7]));

    const stored = await store.load('doc-1');
    // The log is NOT trimmed. It is the delta between the snapshot and current
    // content as well as the queue of un-pushed changes; dropping acked
    // entries serves the queue and destroys the delta, because a push-ack does
    // not bring the snapshot forward. Only compaction trims, by folding the
    // entries into a new snapshot first.
    assert.deepEqual(
      stored!.changes.map((c) => c.clientSeq),
      [1, 2, 3],
    );
    assert.deepEqual(Array.from(stored!.meta!), [7]);
    // And the snapshot is untouched: saveMeta is the cheap post-sync write,
    // and re-snapshotting on every sync is the cost this design avoids.
    assert.deepEqual(Array.from(stored!.snapshot), [0]);
  });

  it('should treat saveMeta on an absent entry as a no-op', async function () {
    const store = new MemoryDocStore();
    await store.saveMeta('missing', new Uint8Array([1]));
    assert.isUndefined(await store.load('missing'));
  });

  it('should clear snapshot, meta and changes on remove', async function () {
    const store = new MemoryDocStore();
    await store.saveSnapshot('doc-1', new Uint8Array([1]));
    await store.saveMeta('doc-1', new Uint8Array([2]));
    await store.appendChange('doc-1', {
      clientSeq: 1,
      bytes: new Uint8Array([3]),
    });

    await store.remove('doc-1');
    assert.isUndefined(await store.load('doc-1'));
    // remove on a missing key is a no-op.
    await store.remove('missing');
  });

  it('should isolate stored bytes from caller mutation on both sides', async function () {
    const store = new MemoryDocStore();
    const snapshot = new Uint8Array([1, 2, 3]);
    const change = new Uint8Array([4, 5]);
    await store.saveSnapshot('doc-1', snapshot);
    await store.appendChange('doc-1', { clientSeq: 1, bytes: change });

    // Mutating the source buffers after writing must not corrupt the entry.
    snapshot[0] = 99;
    change[0] = 99;
    const first = (await store.load('doc-1'))!;
    assert.deepEqual(Array.from(first.snapshot), [1, 2, 3]);
    assert.deepEqual(Array.from(first.changes[0].bytes), [4, 5]);

    // Mutating what load handed back must not corrupt it either.
    first.snapshot[1] = 88;
    first.changes[0].bytes[1] = 88;
    const second = (await store.load('doc-1'))!;
    assert.deepEqual(Array.from(second.snapshot), [1, 2, 3]);
    assert.deepEqual(Array.from(second.changes[0].bytes), [4, 5]);
  });
});

describe('DocStore persistence loop', function () {
  it('should persist bytes on local change that fromBytes reconstructs', async function () {
    type R = { text: Text; counter: Counter };
    type P = { cursor: number };

    const store = new MemoryDocStore();
    const doc = new Document<R, P>('persist-doc');
    doc.setActor(actorA);
    const unsub = persistOnLocalChange(store, doc);

    doc.update((root, presence) => {
      root.text = new Text();
      root.text.edit(0, 0, 'hello');
      root.counter = new Counter(0);
      root.counter.increase(3);
      presence.set({ cursor: 4 });
    });
    unsub();

    // A local change was persisted.
    const bytes = (await store.load('persist-doc'))!.snapshot;
    assert.isDefined(bytes);

    const restored = Document.fromBytes<R, P>('persist-doc', bytes!);
    assert.equal(doc.toSortedJSON(), restored.toSortedJSON());

    const actor = doc.getChangeID().getActorID();
    assert.deepEqual(
      restored.getPresenceForTest(actor),
      doc.getPresenceForTest(actor),
    );
  });

  it('should restore root, presence, checkpoint, changeID, and pending changes', async function () {
    type R = { obj: { flag: boolean }; text: Text };
    type P = { name: string };

    const store = new MemoryDocStore();
    const doc = new Document<R, P>('restore-doc');
    doc.setActor(actorA);
    const unsub = persistOnLocalChange(store, doc);

    doc.update((root, presence) => {
      root.obj = { flag: true };
      root.text = new Text();
      root.text.edit(0, 0, 'abc');
      presence.set({ name: 'alice' });
    });
    unsub();

    // Load the persisted envelope written by the local change above; this is
    // what a fresh instance restores from on attach.
    const bytes = (await store.load('restore-doc'))!.snapshot;
    assert.isDefined(bytes);

    // Rehydrate a fresh document instance in place, mirroring attach.
    const target = new Document<R, P>('restore-doc');
    target.setActor(actorA);
    target.restoreFromBytes(bytes!);

    // root.
    assert.equal(target.toSortedJSON(), doc.toSortedJSON());

    // presence.
    assert.deepEqual(
      target.getPresenceForTest(actorA),
      doc.getPresenceForTest(actorA),
    );
    assert.deepEqual(target.getPresenceForTest(actorA), { name: 'alice' });

    // checkpoint.
    assert.equal(
      target.getCheckpoint().getServerSeq(),
      doc.getCheckpoint().getServerSeq(),
    );
    assert.equal(
      target.getCheckpoint().getClientSeq(),
      doc.getCheckpoint().getClientSeq(),
    );

    // changeID (lamport + version vector + actor).
    assertChangeIDEqual(target.getChangeID(), doc.getChangeID());

    // pending local changes: the restored document re-produces the same
    // change pack, which is what the attach path pushes to the server.
    const originalPack = doc.createChangePack();
    const restoredPack = target.createChangePack();
    assert.isTrue(originalPack.getChanges().length >= 1);
    assert.equal(
      restoredPack.getChanges().length,
      originalPack.getChanges().length,
    );
    assert.deepEqual(
      restoredPack.getChanges().map((c) => c.toStruct()),
      originalPack.getChanges().map((c) => c.toStruct()),
    );
  });

  it('should carry a non-zero restored checkpoint into the attach pack', function () {
    // The attach path builds the pack from `doc.createChangePack()`, which
    // reads `doc.checkpoint`. Seeding a document with a non-zero serverSeq
    // checkpoint and restoring it must make that serverSeq visible on the
    // pack the server (Q3) seeds from.
    type R = { n?: number };
    const source = new Document<R>('cp-doc');
    source.setActor(actorA);
    source.update((root) => {
      root.n = 1;
    });

    // Force a non-zero serverSeq checkpoint, then serialize.
    (source as any).checkpoint = Checkpoint.of(
      42n,
      source.getCheckpoint().getClientSeq(),
    );
    const bytes = source.toBytes();

    const target = new Document<R>('cp-doc');
    target.setActor(actorA);
    target.restoreFromBytes(bytes);

    assert.equal(target.getCheckpoint().getServerSeq(), 42n);

    // createChangePack preserves the serverSeq (it only advances clientSeq).
    const pack = target.createChangePack();
    assert.equal(pack.getCheckpoint().getServerSeq(), 42n);
    assert.isTrue(pack.getChanges().length >= 1);
  });

  it('should re-clone from restored state on next update', function () {
    type R = { a?: number; b?: number };
    const source = new Document<R>('reclone-doc');
    source.setActor(actorA);
    source.update((root) => {
      root.a = 1;
    });
    const bytes = source.toBytes();

    const target = new Document<R>('reclone-doc');
    target.setActor(actorA);
    // Touch the target so it has a stale clone before restore.
    target.update((root) => {
      root.b = 999;
    });
    target.restoreFromBytes(bytes);

    // A subsequent update must build on the restored root, not the stale one.
    target.update((root) => {
      root.b = 2;
    });
    assert.deepEqual(JSON.parse(target.toSortedJSON()), { a: 1, b: 2 });
  });
});
