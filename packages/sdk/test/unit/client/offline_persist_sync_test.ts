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
    const afterEdit = Document.fromBytes<{ text?: string }>(
      key,
      (await store.load(scopedKey(key)))!,
    );
    assert.equal(afterEdit.getPendingChangeStructs().length, 1);
    assert.isTrue(doc.hasLocalChanges());

    // After a successful sync the pushed change is acked and dropped. The
    // stored envelope must reflect that (no pending change, advanced
    // checkpoint) rather than keeping the already-pushed change and a stale
    // checkpoint until the next local edit.
    await client.sync(doc);
    assert.isFalse(doc.hasLocalChanges());

    const afterSync = Document.fromBytes<{ text?: string }>(
      key,
      (await store.load(scopedKey(key)))!,
    );
    assert.equal(afterSync.getPendingChangeStructs().length, 0);
    assert.equal(
      afterSync.getCheckpoint().getServerSeq(),
      doc.getCheckpoint().getServerSeq(),
    );
    assert.equal(
      afterSync.getCheckpoint().getClientSeq(),
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

    const stored = await store.load(scopedKey(key));
    assert.isDefined(stored);
    const restored = Document.fromBytes<{ text?: string }, { cursor: number }>(
      key,
      stored!,
    );
    // `getPresenceForTest` reads the raw persisted presence map (the restored
    // doc is detached, so `getPresence` would short-circuit to an empty map).
    assert.equal(
      restored.getPresenceForTest(actorHex)?.cursor,
      7,
      'the presence-only change must be captured in the stored envelope',
    );
  });
});
