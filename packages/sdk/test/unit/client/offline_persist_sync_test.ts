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
import { create } from '@bufbuild/protobuf';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { SyncMode } from '@yorkie-js/sdk/src/client/client';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { MemoryDocStore } from '@yorkie-js/sdk/src/client/doc-store';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  AttachDocumentResponseSchema,
  PushPullChangesResponseSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const actorHex = '000000000000000000000001';
const clientKey = 'persist-sync-client';

function scopedKey(docKey: string): string {
  return `/${clientKey}/${docKey}`;
}

/**
 * `settled` drains the client's per-key persist queue.
 *
 * Writes are chained promises, and by design the store trails the document —
 * it may never lead it — so a single `await` resolves fewer links than the
 * chain holds and reads a half-written log. This is the queue settling, not a
 * timer: one macrotask turn runs every pending microtask.
 */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function activatedClient(
  store: MemoryDocStore,
  rpc: Record<string, (...args: Array<any>) => Promise<any>>,
) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    key: clientKey,
    store,
  });
  (client as any).status = 'activated';
  (client as any).id = actorHex;
  (client as any).actorID = actorHex;
  (client as any).rpcClient = rpc;
  return client;
}

describe('Offline store re-persisted after a successful sync', () => {
  it('overwrites the stored envelope with the post-sync checkpoint', async () => {
    const key = 'sync-persist';
    const store = new MemoryDocStore();

    // Attach returns an empty, freshly-anchored document.
    const attachDocument = async () =>
      create(AttachDocumentResponseSchema, {
        documentId: 'doc-id',
        changePack: create(ChangePackSchema, {
          documentKey: key,
          checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq: 0 }),
        }),
        disablePresence: false,
        schemaRules: [],
      });

    // pushPullChanges acks the pushed local change: the response checkpoint
    // carries the client sequence the request presented, so the SDK drops the
    // pushed change from `localChanges` and advances its checkpoint.
    const pushPullChanges = async (req: any) => {
      const reqPack = converter.fromChangePack(req.changePack);
      const ackedClientSeq = reqPack.getCheckpoint().getClientSeq();
      return create(PushPullChangesResponseSchema, {
        changePack: create(ChangePackSchema, {
          documentKey: key,
          checkpoint: create(CheckpointSchema, {
            serverSeq: 1n,
            clientSeq: ackedClientSeq,
          }),
        }),
      });
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    // A local edit persists an envelope with one pending change.
    doc.update((root) => {
      root.text = 'hello';
    });
    await settled();
    const afterEdit = (await store.load(scopedKey(key)))!;
    // Durability moved from the snapshot into the log: the edit is persisted
    // as an appended change, not by rewriting the document.
    assert.equal(afterEdit.changes.length, 1);
    assert.isTrue(doc.hasLocalChanges());

    // After a successful sync the pushed change is acked and dropped. The
    // stored envelope must reflect that (no pending change, advanced
    // checkpoint) rather than keeping the already-pushed change and a stale
    // checkpoint until the next local edit.
    await client.sync(doc);
    assert.isFalse(doc.hasLocalChanges());

    await settled();
    const afterSync = (await store.load(scopedKey(key)))!;
    // The acked change is dropped from the log, and the advanced checkpoint is
    // recorded in meta — without paying for a fresh snapshot, which is the
    // point of splitting meta out.
    assert.equal(afterSync.changes.length, 0);
    assert.isDefined(afterSync.meta);
    const restored = Document.fromBytes<{ text?: string }>(
      key,
      afterSync.snapshot,
    );
    restored.restoreMetaFromBytes(afterSync.meta!);
    assert.equal(
      restored.getCheckpoint().getServerSeq(),
      doc.getCheckpoint().getServerSeq(),
    );
    assert.equal(
      restored.getCheckpoint().getClientSeq(),
      doc.getCheckpoint().getClientSeq(),
    );
  });

  it('persists a presence-only local change that emits no LocalChange', async () => {
    const key = 'presence-persist';
    const store = new MemoryDocStore();
    const attachDocument = async () =>
      create(AttachDocumentResponseSchema, {
        documentId: 'doc-id',
        changePack: create(ChangePackSchema, {
          documentKey: key,
          checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq: 0 }),
        }),
        disablePresence: false,
        schemaRules: [],
      });

    const client = activatedClient(store, { attachDocument });
    const doc = new Document<{ text?: string }, { cursor: number }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      initialPresence: { cursor: 0 },
    });

    // A presence-only local change appends to localChanges but emits no
    // LocalChange (gated by opInfos.length); it must still be persisted.
    doc.update((_, presence) => {
      presence.set({ cursor: 7 });
    });

    await settled();
    const stored = await store.load(scopedKey(key));
    assert.isDefined(stored);
    // Persisted as an appended change now rather than folded into a rewritten
    // snapshot. Replaying the log onto the snapshot is what brings the
    // presence back, and that is asserted here rather than assumed.
    assert.isNotEmpty(stored!.changes);
    const restored = Document.fromBytes<{ text?: string }, { cursor: number }>(
      key,
      stored!.snapshot,
    );
    restored.restoreAppendedChanges(
      stored!.changes.map(
        (c) => JSON.parse(new TextDecoder().decode(c.bytes)) as any,
      ),
    );
    // `getPresenceForTest` reads the raw persisted presence map (the restored
    // doc is detached, so `getPresence` would short-circuit to an empty map).
    assert.equal(
      restored.getPresenceForTest(actorHex)?.cursor,
      7,
      'the presence-only change must survive through snapshot + log',
    );
  });
});

describe('Incremental persistence write path', () => {
  const key = 'incremental';

  function mocks() {
    const attachDocument = async () =>
      create(AttachDocumentResponseSchema, {
        documentId: 'doc-id',
        changePack: create(ChangePackSchema, {
          documentKey: key,
          checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq: 0 }),
        }),
        disablePresence: false,
        schemaRules: [],
      });
    const pushPullChanges = async (req: any) => {
      const reqPack = converter.fromChangePack(req.changePack);
      const ackedClientSeq = reqPack.getCheckpoint().getClientSeq();
      return create(PushPullChangesResponseSchema, {
        changePack: create(ChangePackSchema, {
          documentKey: key,
          checkpoint: create(CheckpointSchema, {
            serverSeq: 1n,
            clientSeq: ackedClientSeq,
          }),
        }),
      });
    };
    return { attachDocument, pushPullChanges };
  }

  it('appends one change per edit instead of rewriting the snapshot', async () => {
    const store = new MemoryDocStore();
    const client = activatedClient(store, mocks());
    const doc = new Document<{ text?: string; n?: number }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    await settled();
    const base = await store.load(scopedKey(key));
    assert.isDefined(
      base,
      'attach establishes the snapshot the log appends to',
    );
    assert.deepEqual(base!.changes, []);

    doc.update((root) => {
      root.text = 'a';
    });
    doc.update((root) => {
      root.text = 'ab';
    });
    doc.update((root) => {
      root.n = 1;
    });

    await settled();
    const stored = (await store.load(scopedKey(key)))!;
    assert.equal(stored.changes.length, 3, 'one appended change per edit');
    // The snapshot is untouched: re-serializing the document per edit is the
    // cost this design exists to remove.
    assert.deepEqual(
      Array.from(stored.snapshot),
      Array.from(base!.snapshot),
      'the base snapshot is not rewritten by an edit',
    );
    assert.deepEqual(
      stored.changes.map((c) => c.clientSeq),
      [1, 2, 3],
    );
  });

  it('appends a presence-only change, which emits no LocalChange', async () => {
    // Its content is worthless after a restore — presence is re-established on
    // reconnect — but it consumes a clientSeq, and restoreFromBytes does not
    // renumber. Skipping it leaves a hole the first restored push is rejected
    // for.
    const store = new MemoryDocStore();
    const client = activatedClient(store, mocks());
    const doc = new Document<{ text?: string }, { cursor: number }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      initialPresence: { cursor: 0 },
    });

    await settled();
    const stored = (await store.load(scopedKey(key)))!;
    // Whatever `initialPresence` queued is inside the snapshot's envelope
    // already, so it must not also be in the log.
    const carriedSeqs = Document.fromBytes(key, stored.snapshot)
      .getPendingChangesAfter(0)
      .map((p) => p.clientSeq);

    doc.update((_root, presence) => presence.set({ cursor: 7 }));

    await settled();
    const after = (await store.load(scopedKey(key)))!.changes;
    assert.isNotEmpty(after, 'the presence-only change is appended');
    for (const seq of after.map((c) => c.clientSeq)) {
      assert.notInclude(
        carriedSeqs,
        seq,
        'a change already inside the snapshot must not also be logged, or ' +
          'restore would apply it twice',
      );
    }
    // Contiguous with what the snapshot carries: the property that keeps the
    // restored push valid, since restoreFromBytes does not renumber.
    const allSeqs = [...carriedSeqs, ...after.map((c) => c.clientSeq)];
    assert.deepEqual(
      allSeqs,
      allSeqs.map((_, i) => i + 1),
    );
  });

  it('records the post-sync checkpoint without re-snapshotting', async () => {
    const store = new MemoryDocStore();
    const client = activatedClient(store, mocks());
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();
    const base = (await store.load(scopedKey(key)))!;

    doc.update((root) => {
      root.text = 'hello';
    });
    await client.sync(doc);

    await settled();
    const stored = (await store.load(scopedKey(key)))!;
    assert.isDefined(stored.meta, 'a sync writes meta');
    // An online client syncs constantly; snapshotting per sync would
    // reintroduce exactly the cost being removed.
    assert.deepEqual(
      Array.from(stored.snapshot),
      Array.from(base.snapshot),
      'a sync does not rewrite the snapshot',
    );
    // The acked change is gone from the log.
    assert.deepEqual(stored.changes, []);
  });
});
