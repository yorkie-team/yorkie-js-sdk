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
function attachResponse(epoch: bigint) {
  const changePack = create(ChangePackSchema, {
    documentKey: 'k',
    checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq: 0 }),
    epoch,
  });
  return create(AttachDocumentResponseSchema, {
    documentId: 'doc-id',
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
  const client = new yorkie.Client({ rpcAddr: 'http://localhost', store });
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
    await store.save('k', seed.toBytes());

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
    // The stale offline edit was discarded on re-anchor (server snapshot wins).
    assert.equal(doc.getRoot().text, undefined);
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
