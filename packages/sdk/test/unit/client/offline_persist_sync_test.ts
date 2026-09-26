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
import { Counter } from '@yorkie-js/sdk/src/yorkie';
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
    // The advanced checkpoint is recorded in meta, without paying for a fresh
    // snapshot — the point of splitting meta out. The log keeps the acked
    // entry: nothing has brought the snapshot forward, so the log is still the
    // only record of that content. Compaction is what trims it, by folding it
    // into a new snapshot first.
    assert.equal(afterSync.changes.length, 1);
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
    // The acked change stays in the log until a compaction folds it into a
    // snapshot: it is the only place that content lives.
    assert.equal(stored.changes.length, 1);
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
    await store.saveMeta(scopedKey(key), seed.metaToBytes());

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
    // A log holding entries the server has already taken must still replay —
    // they are the delta between the snapshot and current content — and must
    // not be re-queued for push.
    //
    // This does NOT discriminate the two-source watermark: a pending queue only
    // holds changes above its own checkpoint, so the carried value always
    // leads and the `max` is inert. That was verified by reverting it and
    // watching every test still pass. The state the `max` guarded became
    // unreachable once `saveMeta` stopped trimming the log; the guard is
    // documented as such at the call site rather than defended by a test for a
    // state that cannot occur.
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

    // Order matters here, and an earlier version of this test got it wrong:
    // the compaction stand-in has to happen while the checkpoint is ALREADY
    // ahead of the snapshot's pending queue, or the `max` under test is inert
    // and the test passes with the fix reverted.
    //
    // So: sync first, so the checkpoint advances past 1-3...
    await client.sync(doc);
    await settled();
    // ...then two more edits, and a compaction snapshot taken while they are
    // pending. The snapshot now carries 4-5 while the checkpoint says 3.
    doc.update((root) => {
      root.text = 'four';
    });
    doc.update((root) => {
      root.text = 'five';
    });
    await settled();
    await store.saveSnapshot(scopedKey(key), doc.toBytes());
    // A second sync acks 4-5, so the checkpoint (5) now leads the snapshot's
    // queue, which is the state the two-source watermark exists for.
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

describe('Persisted state must reconstruct the live document', () => {
  const key = 'reconstruct';

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

  it('keeps pushed content after a plain edit-and-sync', async () => {
    // The log does two jobs: it holds un-pushed changes for durability, and it
    // is the delta between the snapshot and current content. Dropping acked
    // entries is right for the first and fatal for the second — the snapshot
    // is not brought forward by a push-ack, so the content would exist nowhere.
    //
    // Written with a relative op on purpose. Every earlier test used an
    // absolute `root.text = '...'`, which the last log entry reconstructs
    // whether or not the base survived — which is how this went unnoticed.
    const store = new MemoryDocStore();
    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });

    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(5));
    await client.sync();
    doc.update((root) => root.counter!.increase(3));
    await settled();

    const stored = (await store.load(scopedKey(key)))!;
    const restored = Document.fromBytes<{ counter?: Counter }>(
      key,
      stored.snapshot,
    );
    if (stored.meta) {
      restored.restoreMetaFromBytes(stored.meta);
    }
    if (stored.changes.length) {
      restored.restoreAppendedChanges(
        stored.changes.map(
          (c) => JSON.parse(new TextDecoder().decode(c.bytes)) as any,
        ),
      );
    }

    assert.equal(
      restored.toSortedJSON(),
      doc.toSortedJSON(),
      'snapshot + meta + log must reconstruct the live document',
    );
  });
});

describe('Store write failures must not persist a lie', () => {
  const key = 'write-failures';

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

  /** Reconstructs from the persisted triple the way a restore does. */
  function reconstruct(stored: any): Document<any> {
    const doc = Document.fromBytes<any>(key, stored.snapshot);
    if (stored.meta) {
      doc.restoreMetaFromBytes(stored.meta);
    }
    if (stored.changes.length) {
      doc.restoreAppendedChanges(
        stored.changes.map(
          (c: any) => JSON.parse(new TextDecoder().decode(c.bytes)) as any,
        ),
      );
    }
    return doc;
  }

  it('repairs after a failed base snapshot instead of appending into a void', async () => {
    // `appendChange` on a key with no entry is a silent success in both
    // shipped stores, so a failed base write leaves the client appending into
    // nothing — persisting nothing and reporting nothing — until the in-memory
    // accounting happens to trip compaction, up to a thousand changes later.
    const inner = new MemoryDocStore();
    let failNextSnapshot = true;
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => {
        if (failNextSnapshot) {
          failNextSnapshot = false;
          return Promise.reject(new Error('disk full'));
        }
        return inner.saveSnapshot(k, b);
      },
      appendChange: (k: string, c: any) => inner.appendChange(k, c),
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(4));
    await settled();

    const stored = await store.load(scopedKey(key));
    assert.isDefined(stored, 'the next edit must repair the missing base');
    assert.equal(reconstruct(stored).toSortedJSON(), doc.toSortedJSON());
  });

  it('re-poisons when the repair snapshot itself fails', async () => {
    // Callers clear `poisoned` and reset the accounting before the repair
    // write resolves, so appends can resume at once. If that write then
    // rejects, the store still holds the holed log while the client believes
    // it is clean — the next append lands past the hole and the following
    // restore discards everything since the base snapshot.
    const inner = new MemoryDocStore();
    let failAppend = true;
    let failRepair = true;
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => {
        // Let the attach base write through, then fail the first repair.
        if (!failAppend && failRepair) {
          failRepair = false;
          return Promise.reject(new Error('disk full'));
        }
        return inner.saveSnapshot(k, b);
      },
      appendChange: (k: string, c: any) => {
        if (failAppend) {
          failAppend = false;
          return Promise.reject(new Error('quota'));
        }
        return inner.appendChange(k, c);
      },
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.counter = new Counter(0);
    });
    await settled();

    // This edit attempts the repair, which fails.
    doc.update((root) => root.counter!.increase(2));
    await settled();
    // This one must try again rather than append past the hole.
    doc.update((root) => root.counter!.increase(3));
    await settled();

    const stored = await store.load(scopedKey(key));
    assert.isDefined(stored);
    assert.equal(
      reconstruct(stored).toSortedJSON(),
      doc.toSortedJSON(),
      'a failed repair must be retried, not assumed to have worked',
    );
  });

  it('rejects meta that reaches past what the log can replay', async () => {
    // The header can only be trusted as far as the log backs it. If the log is
    // missing the entries between the snapshot and the acked checkpoint — lost
    // to a store eviction, a partial quota failure, a lossy backend — then
    // restoring with that header gives a root without those changes and a
    // checkpoint that stops the server from ever resending them.
    const inner = new MemoryDocStore();
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => inner.saveSnapshot(k, b),
      appendChange: (k: string, c: any) => inner.appendChange(k, c),
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(6));
    await client.sync();
    await settled();

    // The log is what backs the acked header. Lose it, as an evicting store
    // would, leaving the snapshot and the advanced meta behind.
    const entry = (inner as any).store.get(scopedKey(key));
    entry.changes = [];

    const dropped: Array<any> = [];
    const client2 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc2 = new Document<{ counter?: Counter }>(key);
    doc2.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client2.attach(doc2, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    // Reported, not silently accepted.
    assert.equal(dropped.length, 1);
    // And the restored checkpoint must fall back to the snapshot's own, so the
    // server can resend what the log lost instead of considering it delivered.
    assert.equal(doc2.getCheckpoint().getClientSeq(), 0);

    // The rebased base must not carry the advanced header either.
    const rebased = (await store.load(scopedKey(key)))!;
    assert.deepEqual(rebased.changes, []);
    assert.equal(
      Document.fromBytes<{ counter?: Counter }>(key, rebased.snapshot)
        .getCheckpoint()
        .getClientSeq(),
      0,
      'a rebase must not bake in a checkpoint its root cannot back',
    );
  });

  it('rejects a log that does not start where the snapshot ends', async () => {
    // Contiguity has two edges and the run's own `every` only checks one: it
    // compares each entry with the one before it, so a run that is internally
    // perfect but starts *past* the snapshot passes. Replaying it would apply
    // an edit whose predecessor the root never saw.
    const inner = new MemoryDocStore();
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => inner.saveSnapshot(k, b),
      appendChange: (k: string, c: any) => inner.appendChange(k, c),
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(2));
    doc.update((root) => root.counter!.increase(3));
    await settled();

    // Drop the *first* entry, leaving a run that is contiguous within itself.
    const entry = (inner as any).store.get(scopedKey(key));
    assert.isAbove(entry.changes.length, 2);
    entry.changes.shift();

    const dropped: Array<any> = [];
    const client2 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc2 = new Document<{ counter?: Counter }>(key);
    doc2.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client2.attach(doc2, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'log-discontinuity');
    // The snapshot is kept whole rather than advanced over the hole.
    assert.equal(doc2.getRoot().counter, undefined);
  });

  it('rejects meta whose counter the log cannot reach', async () => {
    // The header carries two positions, not one: the checkpoint the server
    // acked, and `changeID` — how many changes this client has minted. They
    // differ whenever an edit is minted while a sync is in flight, which is
    // ordinary rather than exotic: the response acks N while meta records a
    // counter of N+1.
    //
    // Losing that trailing entry is the dangerous case, because measuring the
    // log against the *checkpoint* alone accepts it: the log still reaches N.
    // The restore then leaves the counter at N+1 over a root that only holds
    // N, and the next edit mints N+2 — a gap the server rejects with
    // ErrInvalidClientSeq on every push from then on. It is not an epoch
    // mismatch, so nothing re-anchors; the document is wedged for good.
    const inner = new MemoryDocStore();
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => inner.saveSnapshot(k, b),
      appendChange: (k: string, c: any) => inner.appendChange(k, c),
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, {
      attachDocument,
      // The edit lands *during* the push, so it is minted but not acked.
      pushPullChanges: async (req: any) => {
        doc.update((root) => root.counter!.increase(1));
        return pushPullChanges(req);
      },
    });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(6));
    await client.sync();
    await settled();

    // The header now leads its checkpoint, which is the precondition.
    const beforeLoss = (await store.load(scopedKey(key)))!;
    const carried = Document.fromBytes<{ counter?: Counter }>(
      key,
      beforeLoss.snapshot,
    );
    carried.restoreMetaFromBytes(beforeLoss.meta!);
    assert.isAbove(
      carried.getChangeID().getClientSeq(),
      carried.getCheckpoint().getClientSeq(),
      'the in-flight edit must leave the counter ahead of the checkpoint',
    );
    const acked = carried.getCheckpoint().getClientSeq();

    // An evicting store drops the newest entry — the one the counter needs.
    const entry = (inner as any).store.get(scopedKey(key));
    entry.changes.pop();

    const dropped: Array<any> = [];
    const client2 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc2 = new Document<{ counter?: Counter }>(key);
    doc2.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client2.attach(doc2, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    // Reported, not silently accepted.
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'log-discontinuity');

    // And what the document does next must be pushable. The server validates
    // continuity from the position *it* holds, which the header's checkpoint
    // names, so the counter has to fall back to that — not to the counter the
    // lost entry gave it (which would skip a clientSeq), and not to the
    // snapshot's (which would mint sequences the server has already taken).
    doc2.update((root) => {
      root.counter = new Counter(0);
    });
    await settled();
    const pending = doc2.getPendingChangesAfter(0);
    assert.isNotEmpty(pending);
    assert.equal(
      pending[0].clientSeq,
      acked + 1,
      'the next push must continue from the acked checkpoint',
    );
  });

  it('does not reuse clientSeqs the discarded header said were acked', async () => {
    // The repair undoes the header by re-restoring from the snapshot bytes.
    // That is right for the checkpoint and the epoch and wrong for the
    // counter: the header's checkpoint names sequences the server has already
    // taken, and the snapshot's counter sits below it. Minting them again gets
    // them skipped as duplicates on push, and the next ack — whose clientSeq
    // covers them — drops them from `localChanges` as pushed. The edits are
    // gone with no event, which is the one outcome the repair exists to avoid.
    const inner = new MemoryDocStore();
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => inner.saveSnapshot(k, b),
      appendChange: (k: string, c: any) => inner.appendChange(k, c),
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(2));
    doc.update((root) => root.counter!.increase(3));
    // Ack everything, so the header records a checkpoint the snapshot — taken
    // at attach, before any of these — knows nothing about.
    await client.sync();
    await settled();

    const header = (await store.load(scopedKey(key)))!;
    const carried = Document.fromBytes<{ counter?: Counter }>(
      key,
      header.snapshot,
    );
    const acked = (() => {
      const d = Document.fromBytes<{ counter?: Counter }>(key, header.snapshot);
      d.restoreMetaFromBytes(header.meta!);
      return d.getCheckpoint().getClientSeq();
    })();
    assert.isAbove(
      acked,
      carried.getChangeID().getClientSeq(),
      'the snapshot must predate the acked checkpoint for this to test anything',
    );

    // Lose the whole log: the header now claims a position nothing backs.
    (inner as any).store.get(scopedKey(key)).changes = [];

    const dropped: Array<any> = [];
    const client2 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc2 = new Document<{ counter?: Counter }>(key);
    doc2.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client2.attach(doc2, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'log-discontinuity');
    // The header is undone where it describes content...
    assert.equal(
      doc2.getCheckpoint().getClientSeq(),
      carried.getCheckpoint().getClientSeq(),
      'the checkpoint must fall back so the server resends what was lost',
    );
    // ...and carried where it describes sequences already spent.
    doc2.update((root) => {
      root.counter = new Counter(0);
    });
    await settled();
    const pending = doc2.getPendingChangesAfter(0);
    assert.isNotEmpty(pending);
    assert.equal(
      pending[0].clientSeq,
      acked + 1,
      'a new edit must not reuse a clientSeq the server has already taken',
    );
  });

  it('persists the repaired counter so a second reload does not reuse it', async () => {
    // The repair is only worth anything if it survives the reload after it.
    // Writing the *original* snapshot bytes back would rebase onto an envelope
    // whose `changeID` still holds the pre-ack counter — and `saveSnapshot`
    // drops the meta blob that held the right one — so the very next attach
    // would repeat the repair and mint the acked sequences again. The edit
    // appended after the repair must also still replay: its clientSeq starts
    // from the carried counter, above the snapshot's checkpoint, and the
    // contiguity guard has to measure it against that.
    const inner = new MemoryDocStore();
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => inner.saveSnapshot(k, b),
      appendChange: (k: string, c: any) => inner.appendChange(k, c),
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(2));
    await client.sync();
    await settled();

    const header = (await store.load(scopedKey(key)))!;
    const acked = (() => {
      const d = Document.fromBytes<{ counter?: Counter }>(key, header.snapshot);
      d.restoreMetaFromBytes(header.meta!);
      return d.getCheckpoint().getClientSeq();
    })();
    assert.isAbove(
      acked,
      Document.fromBytes<{ counter?: Counter }>(key, header.snapshot)
        .getChangeID()
        .getClientSeq(),
      'the snapshot must predate the acked checkpoint for this to test anything',
    );

    // Lose the whole log, so the next attach takes the repair branch.
    (inner as any).store.get(scopedKey(key)).changes = [];

    const dropped2: Array<any> = [];
    const client2 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc2 = new Document<{ counter?: Counter }>(key);
    doc2.subscribe('local-changes-dropped', (event) =>
      dropped2.push(event.value),
    );
    await client2.attach(doc2, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();
    assert.equal(dropped2.length, 1);
    assert.equal(dropped2[0].reason, 'log-discontinuity');

    // The rebase must have carried the counter into the persisted base.
    const rebased = (await store.load(scopedKey(key)))!;
    assert.isAtLeast(
      Document.fromBytes<{ counter?: Counter }>(key, rebased.snapshot)
        .getChangeID()
        .getClientSeq(),
      acked,
      'the rebased base must carry the acked counter, not the snapshot ones',
    );

    // One edit after the repair, appended to the freshly cleared log.
    doc2.update((root) => {
      root.counter = new Counter(7);
    });
    await settled();
    const appended = doc2.getPendingChangesAfter(0);
    assert.isNotEmpty(appended);

    // The reload after the repair must be quiet: no second repair, no dropped
    // edit, and the counter still above what the server already took.
    const dropped3: Array<any> = [];
    const client3 = activatedClient(store, { attachDocument, pushPullChanges });
    const doc3 = new Document<{ counter?: Counter }>(key);
    doc3.subscribe('local-changes-dropped', (event) =>
      dropped3.push(event.value),
    );
    await client3.attach(doc3, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    assert.isEmpty(
      dropped3,
      'the edit appended after a repair must replay, not be discarded',
    );
    assert.isAtLeast(
      doc3.getChangeID().getClientSeq(),
      appended[appended.length - 1].clientSeq,
      'the counter must not rewind onto sequences already minted',
    );
  });

  it('does not advance the header over a log that has a hole', async () => {
    // A failed append leaves that change only in memory. Writing meta anyway
    // pushes the persisted serverSeq past content the store does not hold, and
    // since it is our own acked change the server will never resend it.
    const inner = new MemoryDocStore();
    let failNextAppend = true;
    const store: any = {
      load: (k: string) => inner.load(k),
      saveSnapshot: (k: string, b: Uint8Array) => inner.saveSnapshot(k, b),
      appendChange: (k: string, c: any) => {
        if (failNextAppend) {
          failNextAppend = false;
          return Promise.reject(new Error('quota'));
        }
        return inner.appendChange(k, c);
      },
      saveMeta: (k: string, b: Uint8Array) => inner.saveMeta(k, b),
      remove: (k: string) => inner.remove(k),
    };

    const client = activatedClient(store, { attachDocument, pushPullChanges });
    const doc = new Document<{ counter?: Counter }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.counter = new Counter(0);
    });
    doc.update((root) => root.counter!.increase(7));
    await settled();

    // A sync reaches the store before any further edit could repair the log.
    await client.sync();
    await settled();

    const stored = await store.load(scopedKey(key));
    assert.isDefined(stored);
    assert.equal(
      reconstruct(stored).toSortedJSON(),
      doc.toSortedJSON(),
      'the persisted triple must still reconstruct the document',
    );
  });
});
