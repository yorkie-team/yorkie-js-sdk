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
import { ClientCondition, SyncMode } from '@yorkie-js/sdk/src/client/client';
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

    // The detach pack carries nothing at all: the queue is discarded and the
    // presence clear is suppressed, so a webhook refusing this client's writes
    // has nothing left to refuse — and, crucially, no `clientSeq` is minted
    // over the hole the discarded changes left, which would be rejected with
    // `ErrInvalidClientSeq`.
    assert.equal(detachPacks.length, 1);
    assert.equal(
      detachPacks[0].getChanges().length,
      0,
      'the detach pack mints no change',
    );

    // The same instance is attached again, re-anchored on the server state.
    assert.equal(attaches, 2);
    assert.equal(doc.getStatus(), DocStatus.Attached);
    assert.equal(doc.getRoot().text, undefined);
    // Presence is not what the server refused, so it is carried over.
    assert.deepEqual(doc.getMyPresence(), { cursor: 7 });

    // The denial that triggers a resync stops the sync loop, and re-attaching
    // does not restart it on its own: without this the recovered document sits
    // attached and never syncs again.
    assert.isTrue(client.getCondition(ClientCondition.SyncLoop));

    await client.detach(doc);
  });

  it('reports the discarded changes as a data-loss event', async () => {
    const key = 'resync-event';
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
    doc.update((root) => {
      root.text = 'refused edit';
    });

    const dropped: Array<{ reason: string; changes: Array<unknown> }> = [];
    doc.subscribe('local-changes-dropped', (event) => {
      dropped.push(event.value);
    });

    await client.resync(doc, { discardLocalChanges: true });

    // The loss reaches the app through the same event the other discard paths
    // use, so it is reported even when the caller never sees the return value.
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'write-denied');
    // Both un-pushed changes: the attach-time presence change (never pushed in
    // Manual mode) and the refused edit.
    assert.equal(dropped[0].changes.length, 2);

    await client.detach(doc);
  });

  it('restores the queue when the detach is itself refused', async () => {
    const key = 'resync-detach-denied';
    const rpcClient = {
      attachDocument: async () =>
        create(AttachDocumentResponseSchema, {
          documentId: 'doc-id',
          changePack: emptyPack(key, 0),
          disablePresence: false,
          schemaRules: [],
        }),
      detachDocument: async () => {
        throw permissionDeniedError('document is locked');
      },
    };
    const client = activatedClient(rpcClient);
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, { syncMode: SyncMode.Manual });
    doc.update((root) => {
      root.text = 'refused edit';
    });
    const pendingBefore = doc.getPendingChangeStructs();

    const dropped: Array<unknown> = [];
    doc.subscribe('local-changes-dropped', (event) => dropped.push(event));

    let failed = false;
    try {
      await client.resync(doc, { discardLocalChanges: true });
    } catch {
      failed = true;
    }

    // A refused detach is the one failure the premise makes likely, so it must
    // not destroy the work: the document is left exactly as it was found and
    // the call can be retried.
    assert.isTrue(failed);
    assert.equal(doc.getStatus(), DocStatus.Attached);
    assert.deepEqual(doc.getPendingChangeStructs(), pendingBefore);
    assert.equal(doc.getRoot().text, 'refused edit');
    // Nothing was lost, so nothing is reported as lost.
    assert.equal(dropped.length, 0);

    // "Exactly as it was found" includes writable: the hole the discard left
    // was filled back in, so the app may mint again.
    doc.update((root) => {
      root.text = 'edited after the rollback';
    });
    assert.equal(doc.getRoot().text, 'edited after the rollback');
  });

  it('refuses an edit minted inside the resync window', async () => {
    const key = 'resync-window';
    const detachPacks: Array<any> = [];
    let refused: unknown;
    const doc = new Document<{ text?: string }>(key);
    const rpcClient = {
      attachDocument: async () =>
        create(AttachDocumentResponseSchema, {
          documentId: 'doc-id',
          changePack: emptyPack(key, 0),
          disablePresence: false,
          schemaRules: [],
        }),
      detachDocument: async (req: any) => {
        // The app edits while the detach RPC is in flight — the widest part of
        // the window, since `resync` awaits a task-queued detach here.
        try {
          doc.update((root) => {
            root.text = 'minted mid-resync';
          });
        } catch (err) {
          refused = err;
        }
        detachPacks.push(converter.fromChangePack(req.changePack));
        return create(DetachDocumentResponseSchema, {
          changePack: emptyPack(key, 1),
        });
      },
    };

    const client = activatedClient(rpcClient);
    await client.attach(doc, { syncMode: SyncMode.Manual });
    doc.update((root) => {
      root.text = 'refused edit';
    });

    await client.resync(doc, { discardLocalChanges: true });

    // The edit is refused loudly rather than wedging the detach with
    // `ErrInvalidClientSeq` (it would mint over the hole the discard left) or
    // being wiped by `resetForReanchor` with nothing reported.
    assert.equal((refused as any)?.code, Code.ErrRefused);
    assert.equal(detachPacks.length, 1);
    assert.equal(
      detachPacks[0].getChanges().length,
      0,
      'the refused edit never reached the detach pack',
    );

    // The window closes with the re-anchor: the document is writable again.
    assert.equal(doc.getStatus(), DocStatus.Attached);
    doc.update((root) => {
      root.text = 'edited after the re-anchor';
    });
    assert.equal(doc.getRoot().text, 'edited after the re-anchor');

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
