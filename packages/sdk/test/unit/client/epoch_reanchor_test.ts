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
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import { ErrorInfoSchema } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { SyncMode } from '@yorkie-js/sdk/src/client/client';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { MemoryDocStore } from '@yorkie-js/sdk/src/client/doc-store';
import { Code } from '@yorkie-js/sdk/src/util/error';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { AttachDocumentResponseSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const actorHex = '000000000000000000000001';

// A fixed client key so the store key the client derives
// (`apiKey/clientKey/docKey`) is deterministic and the test can pre-seed the
// store under the same scoped key the client will read.
const clientKey = 'test-client';

/**
 * `scopedKey` mirrors `Client.storeKey`: the store is keyed by
 * `apiKey/clientKey/docKey` so a store shared across identities cannot collide.
 * The test client is created without an apiKey, so it is the empty string.
 */
function scopedKey(docKey: string): string {
  return `/${clientKey}/${docKey}`;
}

/**
 * `epochMismatchError` builds a ConnectError carrying the `ErrEpochMismatch`
 * metadata code the SDK reads via `errorMetadataOf`, so it flows through
 * `isErrorCode(err, Code.ErrEpochMismatch)` exactly like a real server error.
 */
function epochMismatchError(): ConnectError {
  const info = create(ErrorInfoSchema, {
    metadata: { code: Code.ErrEpochMismatch },
  });
  return new ConnectError(
    'epoch mismatch',
    ConnectCode.FailedPrecondition,
    undefined,
    [{ desc: ErrorInfoSchema, value: info }],
  );
}

/**
 * `attachResponse` builds a minimal AttachDocumentResponse whose change pack
 * carries the given epoch, mirroring a fresh server-side re-anchor.
 */
function attachResponse(
  epoch: bigint,
  opts: { documentId?: string; serverSeq?: bigint } = {},
) {
  const changePack = create(ChangePackSchema, {
    documentKey: 'k',
    checkpoint: create(CheckpointSchema, {
      serverSeq: opts.serverSeq ?? 0n,
      clientSeq: 0,
    }),
    epoch,
  });
  return create(AttachDocumentResponseSchema, {
    documentId: opts.documentId ?? 'doc-id',
    changePack,
    disablePresence: false,
    schemaRules: [],
  });
}

/**
 * `activatedClient` returns a real Client forced into the active state with a
 * fake `rpcClient`, so the attach code path runs without a server.
 */
function activatedClient(
  store: MemoryDocStore,
  attachDocument: (...args: Array<any>) => Promise<any>,
) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    key: clientKey,
    store,
  });
  (client as any).status = 'activated';
  (client as any).id = actorHex;
  (client as any).actorID = actorHex;
  (client as any).rpcClient = { attachDocument };
  return client;
}

describe('Store-backed epoch re-anchor', () => {
  it('clears the store and re-attaches fresh on ErrEpochMismatch', async () => {
    // Pre-seed the store with a persisted (stale-epoch) envelope, as if a
    // prior offline session had synced under epoch 5.
    const store = new MemoryDocStore();
    const seed = new Document<{ text?: string }>('k');
    seed.setActor(actorHex);
    seed.update((root) => {
      root.text = 'offline edit';
    });
    (seed as any).epoch = 5n;
    await store.save(scopedKey('k'), seed.toBytes());

    let calls = 0;
    const presentedEpochs: Array<bigint> = [];
    const attachDocument = async (req: any) => {
      calls++;
      const pack = converter.fromChangePack(req.changePack);
      presentedEpochs.push(pack.getEpoch());
      if (calls === 1) {
        // The resume presents the stale epoch → server rejects.
        throw epochMismatchError();
      }
      // The retry is a fresh attach; server re-anchors at the current epoch.
      return attachResponse(9n);
    };

    const client = activatedClient(store, attachDocument);
    const doc = new Document<{ text?: string }>('k');
    // Subscribe to the data-loss event before attaching so the re-anchor's
    // drop is observed. The offline edit is discarded (server snapshot wins),
    // but the loss must be surfaced, not silent, and must carry the edit.
    const dropped: Array<{ reason: string; changes: Array<unknown> }> = [];
    doc.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client.attach(doc, { syncMode: SyncMode.Manual });

    // Two attach RPCs: the rejected resume and the fresh retry.
    assert.equal(calls, 2);
    // First presented the stale epoch 5, the retry presented a fresh 0.
    assert.equal(presentedEpochs[0], 5n);
    assert.equal(presentedEpochs[1], 0n);

    // The stale persisted entry was removed and re-anchor dropped local state.
    // A brand-new envelope may be written by later local changes, but the
    // re-anchored document must reflect the server epoch, not the stale one.
    assert.equal(doc.getEpoch(), 9n);
    // The stale offline edit is not on the re-anchored root (server wins)...
    assert.equal(doc.getRoot().text, undefined);
    // ...but the loss was surfaced as an app-visible data-loss event carrying
    // the dropped edit, rather than silently vanishing.
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'epoch-reanchor');
    assert.isAtLeast(dropped[0].changes.length, 1);
  });

  it('does not re-anchor when no store is configured', async () => {
    let calls = 0;
    const attachDocument = async () => {
      calls++;
      throw epochMismatchError();
    };
    const client = new yorkie.Client({ rpcAddr: 'http://localhost' });
    (client as any).status = 'activated';
    (client as any).id = actorHex;
    (client as any).actorID = actorHex;
    (client as any).rpcClient = { attachDocument };

    const doc = new Document<{ text?: string }>('k');
    let threw = false;
    try {
      await client.attach(doc, { syncMode: SyncMode.Manual });
    } catch {
      threw = true;
    }

    // Non-store path: the error propagates, no automatic retry.
    assert.isTrue(threw);
    assert.equal(calls, 1);
  });
});

describe('Tier-3 silent-purge guard', () => {
  it('emits a data-loss event when the server minted a new documentId', async () => {
    // Pre-seed a persisted envelope from a prior session under documentId
    // "doc-id-old" carrying an un-pushed offline edit.
    // A doc key unique to this test so its session lock does not collide with
    // another test's still-held lock (attachments here never detach).
    const key = 'k-purge';
    const store = new MemoryDocStore();
    const seed = new Document<{ text?: string }>(key);
    seed.setActor(actorHex);
    seed.update((root) => {
      root.text = 'offline edit';
    });
    seed.setDocID('doc-id-old');
    await store.save(scopedKey(key), seed.toBytes());

    // The server GC'd/deleted the document while offline, so attach mints a
    // fresh doc under a different documentId. The resume itself succeeds (no
    // epoch mismatch), so the guard must catch the id change.
    const attachDocument = async () =>
      attachResponse(0n, { documentId: 'doc-id-new' });

    const client = activatedClient(store, attachDocument);
    const doc = new Document<{ text?: string }>(key);
    const dropped: Array<{ reason: string; changes: Array<unknown> }> = [];
    doc.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client.attach(doc, { syncMode: SyncMode.Manual });

    // The persisted edit was dropped, but surfaced as a data-loss event
    // carrying the dropped change and the purge reason.
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'document-purged');
    assert.isAtLeast(dropped[0].changes.length, 1);
    // The re-anchored document reflects the fresh (empty) server doc, and the
    // stale store entry was cleared.
    assert.equal(doc.getRoot().text, undefined);
    assert.equal(doc.getDocID(), 'doc-id-new');
    assert.isUndefined(await store.load(scopedKey(key)));
  });

  it('drops stale edits when the persisted actor does not match', async () => {
    // Seed under a different actor than the client's current stable actor,
    // simulating a store reused under a different clientKey.
    const key = 'k-actor';
    const otherActor = '000000000000000000000009';
    const store = new MemoryDocStore();
    const seed = new Document<{ text?: string }>(key);
    seed.setActor(otherActor);
    seed.update((root) => {
      root.text = 'foreign edit';
    });
    await store.save(scopedKey(key), seed.toBytes());

    const attachDocument = async () => attachResponse(0n);
    const client = activatedClient(store, attachDocument);
    const doc = new Document<{ text?: string }>(key);
    const dropped: Array<{ reason: string; changes: Array<unknown> }> = [];
    doc.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });
    await client.attach(doc, { syncMode: SyncMode.Manual });

    // The mismatched persisted edits were dropped with an actor-mismatch
    // reason rather than divergently restored under the current actor.
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'actor-mismatch');
    assert.isAtLeast(dropped[0].changes.length, 1);
    assert.equal(doc.getRoot().text, undefined);
    assert.isUndefined(await store.load(scopedKey(key)));
  });
});
