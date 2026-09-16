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
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
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

describe('Incremental persistence restore path', () => {
  const key = 'restore-incremental';

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

  /**
   * Seeds a store the way a previous session would have left it: a base
   * snapshot plus the changes appended after it. Returns the seeded pieces so
   * a test can corrupt them before attaching.
   */
  async function seedStore(store: MemoryDocStore) {
    const seed = new Document<{ text?: string }>(key);
    seed.setActor(actorHex);
    const snapshot = seed.toBytes();

    const appended: Array<{ clientSeq: number; bytes: Uint8Array }> = [];
    for (const v of ['a', 'ab', 'abc']) {
      seed.update((root) => {
        root.text = v;
      });
    }
    for (const { clientSeq, struct } of seed.getPendingChangesAfter(0)) {
      appended.push({
        clientSeq,
        bytes: new TextEncoder().encode(JSON.stringify(struct)),
      });
    }

    await store.saveSnapshot(scopedKey(key), snapshot);
    for (const change of appended) {
      await store.appendChange(scopedKey(key), change);
    }
    return { seed, appended };
  }

  it('replays the appended log so offline edits survive a reload', async () => {
    const store = new MemoryDocStore();
    const { seed } = await seedStore(store);

    const client = activatedClient(store, { attachDocument });
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    // Applied: the content is back.
    assert.equal(doc.getRoot().text, 'abc');
    // And queued: the edits still reach the server on reconnect. Applying
    // without queueing would show the right document and then lose it.
    assert.equal(doc.toSortedJSON(), seed.toSortedJSON());
    assert.isTrue(doc.hasLocalChanges());
  });

  it('drops logged changes the snapshot already contains', async () => {
    // A torn compaction: the snapshot was replaced but the log clear was not
    // observed. Replaying those changes would apply them twice.
    const store = new MemoryDocStore();
    const { seed, appended } = await seedStore(store);

    // Compact: a snapshot that already carries every appended change, written
    // without clearing the log.
    const compacted = seed.toBytes();
    (store as any).store.get(scopedKey(key)).snapshot = compacted;

    const client = activatedClient(store, { attachDocument });
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    assert.isNotEmpty(appended);
    assert.equal(doc.getRoot().text, 'abc', 'not "abcabc" or a throw');
    assert.equal(doc.toSortedJSON(), seed.toSortedJSON());
  });

  it('falls back to the snapshot and reports loss on a clientSeq hole', async () => {
    const store = new MemoryDocStore();
    await seedStore(store);

    // Lose the middle change, as a failed append would.
    const entry = (store as any).store.get(scopedKey(key));
    entry.changes.splice(1, 1);

    const dropped: Array<any> = [];
    const client = activatedClient(store, { attachDocument });
    const doc = new Document<{ text?: string }>(key);
    doc.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    // A discontinuous run cannot be pushed — the server rejects the gap — so
    // restoring from the snapshot alone and saying so beats replaying it.
    assert.equal(doc.getRoot().text, undefined);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'log-discontinuity');
    // The event carries what was actually lost: the log's changes, not the
    // snapshot's pending queue (which is empty here).
    assert.isAtLeast(dropped[0].changes.length, 1);
  });
});

describe('Snapshot and log boundary regressions', () => {
  const key = 'boundary';

  // Echoes the checkpoint the client presents, modelling a server that honors
  // a resume. A mock that always answers serverSeq 0 trips the Tier-3
  // silent-purge guard the moment the client has real persisted state — which
  // is correct behavior, but it masks everything downstream of it.
  const attachDocument = async (req: any) => {
    const presented = converter.fromChangePack(req.changePack).getCheckpoint();
    return create(AttachDocumentResponseSchema, {
      documentId: 'doc-id',
      changePack: create(ChangePackSchema, {
        documentKey: key,
        checkpoint: create(CheckpointSchema, {
          serverSeq: presented.getServerSeq(),
          clientSeq: presented.getClientSeq(),
        }),
      }),
      disablePresence: false,
      schemaRules: [],
    });
  };

  it('persists remote content pulled during a session', async () => {
    // The append log holds local changes only. If a sync that pulls wrote only
    // meta, the persisted serverSeq would advance past a root the store never
    // received — the server would never resend it, and the replica would lose
    // it while claiming to hold it.
    const store = new MemoryDocStore();

    // A peer's change, produced by an independent document.
    const peer = new Document<{ peer?: string }>(key);
    peer.setActor('000000000000000000000002');
    peer.update((root) => {
      root.peer = 'from-peer';
    });
    const peerChanges = peer.createChangePack().getChanges();

    const pushPullChanges = async (req: any) => {
      const reqPack = converter.fromChangePack(req.changePack);
      return create(PushPullChangesResponseSchema, {
        changePack: converter.toChangePack(
          ChangePack.create(
            key,
            Checkpoint.of(1n, reqPack.getCheckpoint().getClientSeq()),
            false,
            peerChanges,
          ),
        ),
      });
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ peer?: string; mine?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.mine = 'mine';
    });
    await client.sync(doc);
    assert.equal(doc.getRoot().peer, 'from-peer', 'the pull landed in memory');

    // "Reload": a fresh client and document over the same store.
    await settled();
    const persisted = (await store.load(scopedKey(key)))!;
    assert.equal(
      Document.fromBytes<{ peer?: string }>(key, persisted.snapshot).getRoot()
        .peer,
      'from-peer',
      'a sync that pulls must write the root, not just the header',
    );
    const client2 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc2 = new Document<{ peer?: string; mine?: string }>(key);
    await client2.attach(doc2, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    assert.equal(
      doc2.getRoot().peer,
      'from-peer',
      'pulled remote content must survive a reload',
    );
    assert.equal(doc2.getRoot().mine, 'mine');
  });

  it('does not regress the clocks when meta predates a compaction', async () => {
    // saveSnapshot drops meta: the new envelope embeds a newer header, and
    // applying the old one over it would regress serverSeq and lamport. A
    // regressed lamport mints tickets colliding with identities already in the
    // restored root.
    const store = new MemoryDocStore();
    const seed = new Document<{ text?: string }>(key);
    seed.setActor(actorHex);
    await store.saveSnapshot(scopedKey(key), seed.toBytes());
    await store.saveMeta(scopedKey(key), seed.metaToBytes(), 0);

    for (const v of ['a', 'ab', 'abc']) {
      seed.update((root) => {
        root.text = v;
      });
    }
    // Compaction after further edits: the snapshot is now ahead of meta.
    await store.saveSnapshot(scopedKey(key), seed.toBytes());

    const stored = (await store.load(scopedKey(key)))!;
    assert.isUndefined(stored.meta, 'compaction drops the stale header');

    const client = activatedClient(store, { attachDocument });
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    assert.equal(doc.getRoot().text, 'abc');
    assert.isAtLeast(
      Number(doc.getChangeID().getLamport()),
      Number(seed.getChangeID().getLamport()),
      'the lamport must not go backwards',
    );
  });

  it('replays a log whose earlier entries a sync already acked', async () => {
    // The snapshot's embedded queue is frozen at snapshot time while saveMeta
    // keeps acking past it, so the restore watermark has to consider both. A
    // watermark taken from the queue alone reports a false discontinuity and
    // discards the whole offline session.
    const store = new MemoryDocStore();
    const pushPullChanges = async (req: any) => {
      const reqPack = converter.fromChangePack(req.changePack);
      return create(PushPullChangesResponseSchema, {
        changePack: create(ChangePackSchema, {
          documentKey: key,
          checkpoint: create(CheckpointSchema, {
            serverSeq: 1n,
            clientSeq: reqPack.getCheckpoint().getClientSeq(),
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

    for (const v of ['one', 'two', 'three']) {
      doc.update((root) => {
        root.text = v;
      });
    }
    await settled();
    // Stand in for a compaction: a snapshot that embeds the pending queue
    // (clientSeq 1-3), replacing the log.
    await store.saveSnapshot(scopedKey(key), doc.toBytes());

    // Two more edits, then a sync that acks everything and drops them.
    doc.update((root) => {
      root.text = 'four';
    });
    doc.update((root) => {
      root.text = 'five';
    });
    await client.sync(doc);
    await settled();

    // And two more offline, which is all the log holds now.
    doc.update((root) => {
      root.text = 'six';
    });
    doc.update((root) => {
      root.text = 'seven';
    });
    await settled();

    const stored = (await store.load(scopedKey(key)))!;
    assert.isNotEmpty(stored.changes, 'the offline edits are logged');

    const dropped: Array<any> = [];
    const client2 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc2 = new Document<{ text?: string }>(key);
    doc2.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client2.attach(doc2, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    assert.deepEqual(dropped, [], 'an intact log must not be reported as lost');
    assert.equal(doc2.getRoot().text, 'seven');
  });
});
