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
import { Document, DocStatus } from '@yorkie-js/sdk/src/document/document';
import { Code } from '@yorkie-js/sdk/src/util/error';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  AttachDocumentResponseSchema,
  DetachDocumentResponseSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const actorHex = '000000000000000000000001';
const clientKey = 'resync-client';

/**
 * `permissionDeniedError` builds the ConnectError an auth webhook denial
 * produces: the metadata code is what `isErrorCode` reads, so it flows through
 * the SDK exactly like a real `PushPull` refusal.
 */
function permissionDeniedError(reason: string): ConnectError {
  const info = create(ErrorInfoSchema, {
    metadata: { code: Code.ErrPermissionDenied, reason },
  });
  return new ConnectError(
    'permission denied',
    ConnectCode.PermissionDenied,
    undefined,
    [{ desc: ErrorInfoSchema, value: info }],
  );
}

/**
 * `emptyPack` builds a minimal change pack carrying nothing but a checkpoint,
 * which is what the server answers an attach or a detach with here.
 */
function emptyPack(docKey: string, clientSeq: number) {
  return create(ChangePackSchema, {
    documentKey: docKey,
    checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq }),
    epoch: 0n,
  });
}

/**
 * `activatedClient` returns a real Client forced into the active state with a
 * fake `rpcClient`, so attach/detach/push-pull run without a server.
 */
function activatedClient(rpcClient: Record<string, unknown>) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    key: clientKey,
  });
  (client as any).status = 'activated';
  (client as any).id = actorHex;
  (client as any).actorID = actorHex;
  (client as any).rpcClient = rpcClient;
  return client;
}

describe('Client.resync', () => {
  it('discards refused changes and re-anchors the same Document', async () => {
    const key = 'resync-reanchor';
    let attaches = 0;
    const detachPacks: Array<any> = [];
    const rpcClient = {
      attachDocument: async () => {
        attaches++;
        return create(AttachDocumentResponseSchema, {
          documentId: 'doc-id',
          changePack: emptyPack(key, 0),
          disablePresence: false,
          schemaRules: [],
        });
      },
      detachDocument: async (req: any) => {
        detachPacks.push(converter.fromChangePack(req.changePack));
        return create(DetachDocumentResponseSchema, {
          changePack: emptyPack(key, 1),
        });
      },
    };

    const client = activatedClient(rpcClient);
    const doc = new Document<{ text?: string }, { cursor: number }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      initialPresence: { cursor: 7 },
    });

    // The edit the webhook refused: applied locally, never acked.
    doc.update((root) => {
      root.text = 'refused edit';
    });
    assert.equal(doc.getRoot().text, 'refused edit');

    const discarded = await client.resync(doc, { discardLocalChanges: true });

    // The caller gets the refused work back, so it can report it.
    assert.isTrue(
      discarded.some((change) => (change.operations ?? []).length > 0),
      'the refused content change is handed back',
    );

    // The detach pack carries presence only: a webhook that allows
    // presence-only packs while denying content writes can still permit it.
    assert.equal(detachPacks.length, 1);
    const detachChanges = detachPacks[0].getChanges();
    for (const change of detachChanges) {
      assert.equal(
        change.getOperations().length,
        0,
        'the detach pack carries no content operations',
      );
    }
    // And it continues from the sequence the server acked (0), not from the
    // one the discarded changes consumed — otherwise the server would reject
    // the detach itself with `ErrInvalidClientSeq`.
    assert.equal(detachChanges[0].getID().getClientSeq(), 1);

    // The same instance is attached again, re-anchored on the server state.
    assert.equal(attaches, 2);
    assert.equal(doc.getStatus(), DocStatus.Attached);
    assert.equal(doc.getRoot().text, undefined);
    // Presence is not what the server refused, so it is carried over.
    assert.deepEqual(doc.getMyPresence(), { cursor: 7 });

    await client.detach(doc);
  });

  it('refuses a resync that does not opt into discarding', async () => {
    const key = 'resync-opt-in';
    const rpcClient = {
      attachDocument: async () =>
        create(AttachDocumentResponseSchema, {
          documentId: 'doc-id',
          changePack: emptyPack(key, 0),
          disablePresence: false,
          schemaRules: [],
        }),
      detachDocument: async () =>
        create(DetachDocumentResponseSchema, { changePack: emptyPack(key, 1) }),
    };
    const client = activatedClient(rpcClient);
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, { syncMode: SyncMode.Manual });

    let message = '';
    try {
      await client.resync(doc, { discardLocalChanges: false } as any);
    } catch (err) {
      message = (err as Error).message;
    }
    assert.match(message, /discardLocalChanges/);

    await client.detach(doc);
  });

  it('publishes auth-error for a PushPull the webhook denied', async () => {
    const key = 'resync-auth-error';
    const rpcClient = {
      attachDocument: async () =>
        create(AttachDocumentResponseSchema, {
          documentId: 'doc-id',
          changePack: emptyPack(key, 0),
          disablePresence: false,
          schemaRules: [],
        }),
      detachDocument: async () =>
        create(DetachDocumentResponseSchema, { changePack: emptyPack(key, 1) }),
      pushPullChanges: async () => {
        throw permissionDeniedError('document is locked');
      },
    };
    const client = activatedClient(rpcClient);
    const doc = new Document<{ text?: string }>(key);
    // Attached in Manual mode so no watch stream is opened, then switched to
    // Realtime so the sync loop picks the document up on its first tick.
    await client.attach(doc, { syncMode: SyncMode.Manual });
    doc.update((root) => {
      root.text = 'refused edit';
    });

    const events: Array<{ reason: string; method: string }> = [];
    doc.subscribe('auth-error', (event) => {
      events.push(event.value);
    });
    (client as any).attachmentMap.get(key).syncMode = SyncMode.Realtime;
    (client as any).runSyncLoop();

    await new Promise((resolve) => setTimeout(resolve, 100));

    // A refused write is reported as what it is, not as a bare `sync-failed`
    // the app cannot tell from a network error.
    assert.equal(events.length, 1);
    assert.equal(events[0].method, 'PushPull');
    assert.equal(events[0].reason, 'document is locked');

    (client as any).attachmentMap.get(key).syncMode = SyncMode.Manual;
    await client.detach(doc);
  });
});
