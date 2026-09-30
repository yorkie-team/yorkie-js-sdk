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

import { assert, describe, expect, it } from 'vitest';
import { create } from '@bufbuild/protobuf';
import yorkie, { Text } from '@yorkie-js/sdk/src/yorkie';
import { Client, SyncMode } from '@yorkie-js/sdk/src/client/client';
import { Document, DocStatus } from '@yorkie-js/sdk/src/document/document';
import {
  MemoryDocStore,
  StoredChange,
} from '@yorkie-js/sdk/src/client/doc-store';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  AttachDocumentResponseSchema,
  PushPullChangesResponseSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const actor = '000000000000000000000001';
const clientKey = 'local-queue-client';
const key = 'local-queue';
const storeKey = `/${clientKey}/${key}`;
type Root = { text?: Text };
type Presence = { cursor: number };

/** `drain` waits for all writes already scheduled for this store key. */
async function drain(client: Client): Promise<void> {
  await (client as any).persistQueues.get(storeKey);
}

/**
 * `backend` enforces sequence continuity on actual SDK attach and push packs.
 * It is a local synthetic peer; no network or production server is used.
 */
function backend() {
  const peer = new Document<Root, Presence>(key);
  let acked = 0;
  const pushed: Array<Array<number>> = [];
  const responsePack = () =>
    create(ChangePackSchema, {
      documentKey: key,
      checkpoint: create(CheckpointSchema, {
        serverSeq: BigInt(acked),
        clientSeq: acked,
      }),
    });
  const receive = (req: any) => {
    const pack = converter.fromChangePack<Presence>(req.changePack);
    const seqs: Array<number> = [];
    for (const change of pack.getChanges()) {
      const seq = change.getID().getClientSeq();
      if (seq <= acked) continue;
      assert.equal(
        seq,
        acked + 1,
        'the synthetic peer rejects a clientSeq gap',
      );
      peer.applyChanges([change], OpSource.Remote);
      acked = seq;
      seqs.push(seq);
    }
    return seqs;
  };
  const rpc = {
    attachDocument: async (req: any) => {
      receive(req);
      return create(AttachDocumentResponseSchema, {
        documentId: 'doc-id',
        changePack: responsePack(),
        disablePresence: false,
        schemaRules: [],
      });
    },
    pushPullChanges: async (req: any) => {
      pushed.push(receive(req));
      return create(PushPullChangesResponseSchema, {
        changePack: responsePack(),
      });
    },
    detachDocument: async () => {
      throw new Error('synthetic detach failure');
    },
    deactivateClient: async () => ({}),
  };
  return { rpc, peer, pushed };
}

/** `session` attaches a store-backed SDK client to the synthetic backend. */
async function session(
  store: MemoryDocStore,
  server: ReturnType<typeof backend>,
) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    key: clientKey,
    store,
  });
  Object.assign(client, {
    status: 'activated',
    id: actor,
    actorID: actor,
    rpcClient: server.rpc,
  });
  const doc = new Document<Root, Presence>(key);
  await client.attach(doc, {
    syncMode: SyncMode.Manual,
    initialPresence: { cursor: 0 },
  });
  await drain(client);
  return { client, doc };
}

/** `assertLog` compares durable sequences against the document's pending queue. */
async function assertLog(store: MemoryDocStore, doc: Document<Root, Presence>) {
  const stored = (await store.load(storeKey))!;
  assert.deepEqual(
    stored.changes.map((change) => change.clientSeq),
    doc
      .getPendingChangesAfter(doc.getCheckpoint().getClientSeq())
      .map((p) => p.clientSeq),
    'every pending local sequence must be appended',
  );
  return stored;
}

describe('Persistence follows the local queue', () => {
  for (const failedDetach of [false, true]) {
    it(`appends a silent presence clear${failedDetach ? ' after failed detach' : ''}`, async () => {
      const store = new MemoryDocStore();
      const server = backend();
      const { client, doc } = await session(store, server);
      const publicEvents: Array<string> = [];
      doc.subscribe('all', (events) =>
        publicEvents.push(...events.map((e) => e.type)),
      );
      const before = doc.getChangeID().getClientSeq();
      if (failedDetach) {
        await expect(client.detach(doc)).rejects.toThrow(
          'synthetic detach failure',
        );
        assert.equal(doc.getStatus(), DocStatus.Attached);
      } else {
        doc.update((_, p) => p.clear());
      }
      assert.equal(doc.getChangeID().getClientSeq(), before + 1);
      assert.deepEqual(
        publicEvents,
        [],
        'clear retains its silent public behavior',
      );
      await drain(client);
      await assertLog(store, doc);
      await client.deactivate();
      const resumed = await session(store, server);
      assert.isUndefined(resumed.doc.getPresenceForTest(actor));
      assert.isUndefined(server.peer.getPresenceForTest(actor));
      resumed.doc.update((_, p) => p.set({ cursor: 9 }));
      await resumed.client.sync(resumed.doc);
      assert.deepEqual(server.pushed.at(-1), [before + 2]);
      assert.equal(server.peer.getPresenceForTest(actor)?.cursor, 9);
      await drain(resumed.client);
      await resumed.client.deactivate();
    });
  }

  for (const operation of ['undo', 'redo'] as const) {
    it(`restores and pushes presence-only ${operation} after session shutdown`, async () => {
      const store = new MemoryDocStore();
      const server = backend();
      const { client, doc } = await session(store, server);
      const presenceSources: Array<OpSource> = [];
      let edits = 0;
      doc.subscribe('all', (events) => {
        for (const event of events) {
          if (event.type === 'presence-changed')
            presenceSources.push(event.source);
          if (event.type === 'local-change') edits++;
        }
      });
      doc.update((_, p) => p.set({ cursor: 7 }, { addToHistory: true }));
      doc.history.undo();
      if (operation === 'redo') doc.history.redo();
      assert.equal(
        edits,
        0,
        'presence history does not manufacture edit events',
      );
      assert.deepEqual(
        presenceSources,
        operation === 'undo'
          ? [OpSource.Local, OpSource.UndoRedo]
          : [OpSource.Local, OpSource.UndoRedo, OpSource.UndoRedo],
      );
      const expected = operation === 'undo' ? 0 : 7;
      assert.equal(doc.getPresenceForTest(actor)?.cursor, expected);
      await drain(client);
      const stored = await assertLog(store, doc);
      const pendingSeqs = stored.changes.map((c) => c.clientSeq);
      await client.deactivate();
      const resumed = await session(store, server);
      assert.equal(resumed.doc.getPresenceForTest(actor)?.cursor, expected);
      // Re-attach presents the durable queue to the synthetic peer. A later
      // explicit SDK push must also be contiguous and must be acknowledged.
      assert.equal(server.peer.getPresenceForTest(actor)?.cursor, expected);
      resumed.doc.update((r) => {
        r.text = new Text();
        r.text.edit(0, 0, 'after restore');
      });
      await resumed.client.sync(resumed.doc);
      assert.deepEqual(server.pushed.at(-1), [pendingSeqs.at(-1)! + 1]);
      assert.isFalse(resumed.doc.hasLocalChanges());
      assert.equal(server.peer.getRoot().text!.toString(), 'after restore');
      await drain(resumed.client);
      await resumed.client.deactivate();
    });
  }

  it('captures a silent change before a public callback starts a sync', async () => {
    const store = new MemoryDocStore();
    const server = backend();
    const { client, doc } = await session(store, server);
    let sync: Promise<unknown> | undefined;
    const unsub = doc.subscribe('all', (events) => {
      if (events.some((e) => e.type === 'presence-changed')) {
        doc.update((_, p) => p.clear());
        sync = client.sync(doc);
      }
    });
    doc.update((_, p) => p.set({ cursor: 7 }));
    unsub();
    assert.isDefined(sync);
    await sync;
    await drain(client);
    const stored = (await store.load(storeKey))!;
    assert.deepEqual(
      stored.changes.map((c) => c.clientSeq),
      [2, 3],
    );
    assert.isFalse(doc.hasLocalChanges());
    assert.isUndefined(server.peer.getPresenceForTest(actor));
    const restored = Document.fromBytes<Root, Presence>(key, stored.snapshot);
    restored.restoreAppendedChanges(
      stored.changes.map((c) => JSON.parse(new TextDecoder().decode(c.bytes))),
    );
    assert.isUndefined(restored.getPresenceForTest(actor));
    await client.deactivate();
  });

  it('keeps queued append order through a session shutdown', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class PausedStore extends MemoryDocStore {
      public override async appendChange(k: string, change: StoredChange) {
        await gate;
        return super.appendChange(k, change);
      }
    }
    const store = new PausedStore();
    const server = backend();
    const { client, doc } = await session(store, server);
    doc.update((_, p) => p.set({ cursor: 7 }));
    doc.update((_, p) => p.clear());
    await client.deactivate();
    release();
    await drain(client);
    const stored = (await store.load(storeKey))!;
    assert.deepEqual(
      stored.changes.map((c) => c.clientSeq),
      [2, 3],
    );
    const resumed = await session(store, server);
    assert.isUndefined(resumed.doc.getPresenceForTest(actor));
    assert.isUndefined(server.peer.getPresenceForTest(actor));
    await resumed.client.deactivate();
  });

  it('repairs a failed append on the next silent clear', async () => {
    class FailingStore extends MemoryDocStore {
      public override async appendChange(): Promise<void> {
        throw new Error('synthetic append failure');
      }
    }
    const store = new FailingStore();
    const server = backend();
    const { client, doc } = await session(store, server);
    doc.update((_, p) => p.set({ cursor: 7 }));
    await drain(client);
    doc.update((_, p) => p.clear());
    await drain(client);
    const stored = (await store.load(storeKey))!;
    assert.deepEqual(stored.changes, [], 'repair replaces the incomplete log');
    const restored = Document.fromBytes<Root, Presence>(key, stored.snapshot);
    assert.equal(
      restored.getChangeID().getClientSeq(),
      doc.getChangeID().getClientSeq(),
    );
    assert.deepEqual(
      restored.getPendingChangeStructs(),
      doc.getPendingChangeStructs(),
    );
    assert.isUndefined(restored.getPresenceForTest(actor));
    await client.deactivate();
    const resumed = await session(store, server);
    assert.isUndefined(server.peer.getPresenceForTest(actor));
    await resumed.client.deactivate();
  });

  it('appends a forward operation with no public OpInfo', async () => {
    const store = new MemoryDocStore();
    const server = backend();
    const { client, doc } = await session(store, server);
    doc.update((r) => {
      r.text = new Text();
    });
    await client.sync(doc);
    await drain(client);
    const events: Array<Array<unknown>> = [];
    doc.subscribe((event) => {
      if (event.type === 'local-change') events.push(event.value.operations);
    });
    const before = doc.getChangeID().getClientSeq();
    doc.update((r) => r.text!.setStyle(0, 0, { bold: true }));
    assert.equal(doc.getChangeID().getClientSeq(), before + 1);
    assert.deepEqual(events, [[]], 'retain the existing empty operation event');
    await drain(client);
    const stored = (await store.load(storeKey))!;
    assert.equal(stored.changes.at(-1)!.clientSeq, before + 1);
    const restored = Document.fromBytes<Root, Presence>(key, stored.snapshot);
    restored.restoreAppendedChanges(
      stored.changes.map((c) => JSON.parse(new TextDecoder().decode(c.bytes))),
    );
    assert.equal(restored.getChangeID().getClientSeq(), before + 1);
    await client.sync(doc);
    assert.deepEqual(server.pushed.at(-1), [before + 1]);
    await drain(client);
    await client.deactivate();
  });
});
