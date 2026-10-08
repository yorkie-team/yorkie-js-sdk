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
import { AttachDocumentResponseSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

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
});
