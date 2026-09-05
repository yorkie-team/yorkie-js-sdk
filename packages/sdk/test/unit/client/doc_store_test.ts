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
      void store.save(doc.getKey(), doc.toBytes());
    }
  });
}

describe('MemoryDocStore', function () {
  it('should round-trip bytes through save/load', async function () {
    const store = new MemoryDocStore();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    assert.isUndefined(await store.load('doc-1'));

    await store.save('doc-1', bytes);
    const loaded = await store.load('doc-1');
    assert.deepEqual(Array.from(loaded!), Array.from(bytes));
  });

  it('should isolate stored bytes from later caller mutation', async function () {
    const store = new MemoryDocStore();
    const bytes = new Uint8Array([1, 2, 3]);
    await store.save('doc-1', bytes);

    // Mutating the source buffer after save must not corrupt the snapshot.
    bytes[0] = 99;
    const loaded = await store.load('doc-1');
    assert.deepEqual(Array.from(loaded!), [1, 2, 3]);

    // Mutating the loaded buffer must not corrupt the snapshot either.
    loaded![0] = 88;
    const reloaded = await store.load('doc-1');
    assert.deepEqual(Array.from(reloaded!), [1, 2, 3]);
  });

  it('should overwrite on repeated save', async function () {
    const store = new MemoryDocStore();
    await store.save('doc-1', new Uint8Array([1]));
    await store.save('doc-1', new Uint8Array([2, 3]));
    const loaded = await store.load('doc-1');
    assert.deepEqual(Array.from(loaded!), [2, 3]);
  });

  it('should remove stored bytes', async function () {
    const store = new MemoryDocStore();
    await store.save('doc-1', new Uint8Array([1]));
    await store.remove('doc-1');
    assert.isUndefined(await store.load('doc-1'));
    // remove on a missing key is a no-op.
    await store.remove('missing');
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
    const bytes = await store.load('persist-doc');
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
    const bytes = await store.load('restore-doc');
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
