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
import {
  Document,
  DocEventType,
  DocSyncStatus,
} from '@yorkie-js/sdk/src/document/document';
import { Code } from '@yorkie-js/sdk/src/util/error';
import {
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  AttachDocumentResponseSchema,
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

  it('still retries a ResourceExhausted error that carries no Yorkie code', async () => {
    const client = new yorkie.Client({ rpcAddr: 'http://localhost' });
    const err = new ConnectError('slow down', ConnectCode.ResourceExhausted);

    assert.isTrue(await (client as any).handleConnectError(err));
  });

  it('reaches a `write-rejected` subscriber registered by type', async () => {
    const err = rejection(Code.ErrChangeTooLarge, 'change is too large');
    const { client, doc } = await attachedToRejectingServer(err);

    const seen: Array<any> = [];
    doc.subscribe('write-rejected', (event) => {
      seen.push(event);
    });

    await client.sync(doc).catch(() => {});

    assert.lengthOf(seen, 1, 'the per-type subscriber is called once');
    assert.strictEqual(seen[0].type, DocEventType.WriteRejected);
    assert.deepEqual(seen[0].value, {
      code: Code.ErrChangeTooLarge,
      reason: 'change is too large',
      method: 'PushPull',
    });
  });

  it('does not publish `write-rejected` for an unrelated failure', async () => {
    const { client, doc, events } = await attachedToRejectingServer(
      new ConnectError('slow down', ConnectCode.ResourceExhausted),
    );

    await client.sync(doc).catch(() => {});

    assert.isEmpty(
      events.filter((e) => e.type === DocEventType.WriteRejected),
      'only the size rejections are reported as a rejected write',
    );
  });
});

describe('A rejected document does not take the whole client down', () => {
  /**
   * `tick` yields to the event loop long enough for a few sync-loop
   * iterations at the 1ms `syncLoopDuration` the test configures.
   */
  function tick(ms = 60): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it('parks only the rejected document and keeps syncing the rest', async () => {
    const err = rejection(
      Code.ErrDocumentSizeExceedsLimit,
      'document size exceeds limit',
    );
    const pushes: Record<string, number> = { big: 0, small: 0 };

    const client = new yorkie.Client({
      rpcAddr: 'http://localhost',
      syncLoopDuration: 1,
    });
    (client as any).status = 'activated';
    (client as any).id = actorHex;
    (client as any).actorID = actorHex;
    (client as any).rpcClient = {
      attachDocument: async (req: any) =>
        create(AttachDocumentResponseSchema, {
          documentId: req.changePack.documentKey,
          changePack: create(ChangePackSchema, {
            documentKey: req.changePack.documentKey,
            checkpoint: create(CheckpointSchema, {
              serverSeq: 0n,
              clientSeq: 0,
            }),
          }),
          disablePresence: false,
          schemaRules: [],
        }),
      pushPullChanges: async (req: any) => {
        pushes[req.documentId]++;
        if (req.documentId === 'big') {
          throw err;
        }
        return create(PushPullChangesResponseSchema, {
          changePack: create(ChangePackSchema, {
            documentKey: req.documentId,
            checkpoint: create(CheckpointSchema, {
              serverSeq: 0n,
              clientSeq: 0,
            }),
          }),
        });
      },
    };

    const big = new Document<{ text?: string }>('big');
    const small = new Document<{ text?: string }>('small');
    for (const doc of [big, small]) {
      // Manual keeps `attach` from opening a watch stream the fake RPC
      // client cannot serve; the sync loop reads the attachment's mode, so
      // flip it to Realtime right after.
      await client.attach(doc, {
        syncMode: SyncMode.Manual,
        disablePresence: true,
      });
      (client as any).attachmentMap.get(doc.getKey()).syncMode =
        SyncMode.Realtime;
    }

    const rejected: Array<any> = [];
    big.subscribe('write-rejected', (event) => {
      rejected.push(event);
    });

    big.update((root) => {
      root.text = 'over the limit';
    });
    small.update((root) => {
      root.text = 'well within it';
    });

    (client as any).runSyncLoop();
    await tick();
    (client as any).deactivating = true;
    await tick(10);

    assert.strictEqual(
      pushes.big,
      1,
      'the rejected push is not sent a second time',
    );
    assert.isAbove(
      pushes.small,
      1,
      'the other document keeps syncing on the shared loop',
    );
    assert.lengthOf(rejected, 1, 'the rejection is reported to its document');
    assert.isTrue(
      (client as any).attachmentMap.get('big').isWriteRejected(),
      'the rejected document is the one that is parked',
    );
    assert.isFalse(
      (client as any).attachmentMap.get('small').isWriteRejected(),
    );
  });
});
