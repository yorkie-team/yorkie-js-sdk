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
import {
  Document,
  DocEventType,
  DocStatus,
  DocSyncStatus,
  type WriteRejectedEvent,
} from '@yorkie-js/sdk/src/document/document';
import { Code } from '@yorkie-js/sdk/src/util/error';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  AttachDocumentResponseSchema,
  DetachDocumentResponseSchema,
  PushPullChangesResponseSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const actorHex = '000000000000000000000001';

/**
 * `rejection` builds the `ResourceExhausted` ConnectError the server returns
 * when its size gate refuses a push, with the Yorkie code in the error detail
 * metadata where `errorCodeOf` reads it.
 */
function rejection(code: Code, message: string): ConnectError {
  const info = create(ErrorInfoSchema, { metadata: { code } });
  return new ConnectError(message, ConnectCode.ResourceExhausted, undefined, [
    { desc: ErrorInfoSchema, value: info },
  ]);
}

/**
 * `attachedToRejectingServer` attaches a document to a client whose every
 * push is refused with the given error, and returns both plus the events the
 * document published while syncing.
 */
async function attachedToRejectingServer(err: ConnectError) {
  const key = 'write-rejected';
  const client = new yorkie.Client({ rpcAddr: 'http://localhost' });
  (client as any).status = 'activated';
  (client as any).id = actorHex;
  (client as any).actorID = actorHex;
  (client as any).rpcClient = {
    attachDocument: async () =>
      create(AttachDocumentResponseSchema, {
        documentId: 'doc-id',
        changePack: create(ChangePackSchema, {
          documentKey: key,
          checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq: 0 }),
        }),
        disablePresence: false,
        schemaRules: [],
      }),
    pushPullChanges: async () => {
      throw err;
    },
  };

  const doc = new Document<{ text?: string }>(key);
  await client.attach(doc, {
    syncMode: SyncMode.Manual,
    disablePresence: true,
  });

  const events: Array<any> = [];
  doc.subscribe('all', (docEvents) => {
    events.push(...docEvents);
  });

  doc.update((root) => {
    root.text = 'over the limit';
  });

  return { client, doc, events };
}

describe('Server rejections that resending cannot fix', () => {
  for (const [code, message] of [
    [Code.ErrDocumentSizeExceedsLimit, 'document size exceeds limit'],
    [Code.ErrChangeTooLarge, 'change is too large'],
  ] as Array<[Code, string]>) {
    it(`reports ${code} to the app and does not retry it`, async () => {
      const err = rejection(code, message);
      const { client, doc, events } = await attachedToRejectingServer(err);

      await client.sync(doc).then(
        () => assert.fail('the push should be rejected'),
        (e) => assert.strictEqual(e, err),
      );

      const rejected = events.filter(
        (e) => e.type === DocEventType.WriteRejected,
      );
      assert.lengthOf(rejected, 1, 'the rejection is reported once');
      assert.deepEqual(rejected[0].value, {
        code,
        reason: message,
        method: 'PushPull',
      });

      // The app still gets the status it has always got, so a listener that
      // only watches `sync` keeps working.
      assert.isTrue(
        events.some(
          (e) =>
            e.type === DocEventType.SyncStatusChanged &&
            e.value === DocSyncStatus.SyncFailed,
        ),
        'sync-failed is published as well',
      );

      // Retrying cannot succeed: the server re-evaluates the same pack and
      // refuses it again, while the shared PushPull RPC blocks pulls too.
      assert.isFalse(
        await (client as any).handleConnectError(err),
        'the sync loop stops instead of resending',
      );
    });
  }

  it('delivers the code to a typed write-rejected subscription', async () => {
    const err = rejection(
      Code.ErrDocumentSizeExceedsLimit,
      'document size exceeds limit',
    );
    const { client, doc } = await attachedToRejectingServer(err);

    // The typed overload is what an app reaches for; it must narrow to this
    // event alone and hand over the code without a cast.
    const received: Array<WriteRejectedEvent['value']> = [];
    const unsubscribe = doc.subscribe('write-rejected', (event) => {
      received.push(event.value);
    });

    await client.sync(doc).catch(() => {});
    unsubscribe();

    assert.deepEqual(received, [
      {
        code: Code.ErrDocumentSizeExceedsLimit,
        reason: 'document size exceeds limit',
        method: 'PushPull',
      },
    ]);
  });

  it('still retries a ResourceExhausted error that carries no Yorkie code', async () => {
    const client = new yorkie.Client({ rpcAddr: 'http://localhost' });
    const err = new ConnectError('slow down', ConnectCode.ResourceExhausted);

    assert.isTrue(await (client as any).handleConnectError(err));
  });
});

describe('Recovering a document the size gate refused', () => {
  it('resyncs with the oversized changes discarded and syncs again', async () => {
    const key = 'write-rejected-resync';
    const emptyPack = (clientSeq: number) =>
      create(ChangePackSchema, {
        documentKey: key,
        checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq }),
        epoch: 0n,
      });
    const carriesOversized = (pack: any) =>
      pack
        .getChanges()
        .some((change: any) => change.toTestString().includes('oversized'));

    let attaches = 0;
    let watches = 0;
    const detachPacks: Array<any> = [];
    const pushedPacks: Array<any> = [];
    const refusedPacks: Array<any> = [];
    const client = new yorkie.Client({ rpcAddr: 'http://localhost' });
    (client as any).status = 'activated';
    (client as any).id = actorHex;
    (client as any).actorID = actorHex;
    (client as any).rpcClient = {
      attachDocument: async () => {
        attaches++;
        return create(AttachDocumentResponseSchema, {
          documentId: 'doc-id',
          changePack: emptyPack(0),
          disablePresence: false,
          schemaRules: [],
        });
      },
      detachDocument: async (req: any) => {
        const pack = converter.fromChangePack(req.changePack);
        detachPacks.push(pack);
        if (carriesOversized(pack)) {
          refusedPacks.push(pack);
          throw rejection(
            Code.ErrDocumentSizeExceedsLimit,
            'document size exceeds limit',
          );
        }
        return create(DetachDocumentResponseSchema, {
          changePack: emptyPack(pack.getCheckpoint().getClientSeq()),
        });
      },
      // The size gate, as the server applies it: every pack that carries the
      // oversized change is refused, however often it is resent; anything else
      // is stored and acked.
      pushPullChanges: async (req: any) => {
        const pack = converter.fromChangePack(req.changePack);
        pushedPacks.push(pack);
        if (carriesOversized(pack)) {
          refusedPacks.push(pack);
          throw rejection(
            Code.ErrDocumentSizeExceedsLimit,
            'document size exceeds limit',
          );
        }
        const acked = pack
          .getChanges()
          .reduce(
            (max: number, change: any) =>
              Math.max(max, change.getID().getClientSeq()),
            pack.getCheckpoint().getClientSeq(),
          );
        return create(PushPullChangesResponseSchema, {
          changePack: emptyPack(acked),
        });
      },
      // A failed stream creation is handled as an ordinary disconnect and
      // retried after `reconnectStreamDelay` (1s), past the end of this test.
      watch: () => {
        watches++;
        throw new Error('no watch stream in this test');
      },
    };

    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, { syncMode: SyncMode.Realtime });

    const rejected: Array<WriteRejectedEvent['value']> = [];
    doc.subscribe('write-rejected', (event) => rejected.push(event.value));

    doc.update((root) => {
      root.text = 'oversized';
    });

    // The loop pushes once, is refused, and stops instead of resending.
    (client as any).runSyncLoop();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.lengthOf(rejected, 1);
    assert.equal(rejected[0].code, Code.ErrDocumentSizeExceedsLimit);
    assert.lengthOf(pushedPacks, 1, 'the refused pack is not resent');
    assert.isFalse(client.getCondition(ClientCondition.SyncLoop));

    const discarded = await client.resync(doc, { discardLocalChanges: true });
    assert.isTrue(discarded.length > 0, 'the oversized change is handed back');

    // The detach carries nothing for the size gate to refuse, and the same
    // instance is re-anchored on the server state with the loop running.
    assert.lengthOf(detachPacks, 1);
    assert.lengthOf(detachPacks[0].getChanges(), 0);
    assert.equal(attaches, 2);
    assert.equal(watches, 2);
    assert.equal(doc.getStatus(), DocStatus.Attached);
    assert.equal(doc.getRoot().text, undefined);
    assert.isTrue(client.getCondition(ClientCondition.SyncLoop));

    // An edit made after the recovery is pushed by the loop and acked, and no
    // pack the server refused went out after the first push.
    doc.update((root) => {
      root.text = 'small';
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.isTrue(pushedPacks.length > 1, 'the loop pushed after the recovery');
    assert.isFalse(doc.hasLocalChanges(), 'the pushed change was acked');
    assert.lengthOf(refusedPacks, 1, 'only the original push was refused');
    assert.lengthOf(rejected, 1);

    await client.detach(doc);
  });
});
