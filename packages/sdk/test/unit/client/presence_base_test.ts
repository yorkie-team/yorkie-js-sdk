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
import { Code } from '@yorkie-js/sdk/src/util/error';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  PresenceChangeType,
  PresencePatchCapability,
} from '@yorkie-js/sdk/src/document/presence/change';
import {
  ChangePack as PbChangePack,
  ChangePackSchema,
  CheckpointSchema,
  PresenceChange_ChangeType as PbPresenceChangeType,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  AttachDocumentResponseSchema,
  PushPullChangesResponseSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const actorHex = '000000000000000000000001';

type TestPresence = { name?: string; cursor?: { x: number; y: number } };

/**
 * `presenceBaseUnavailableError` builds a ConnectError carrying the
 * `ErrPresenceBaseUnavailable` metadata code the SDK reads via
 * `errorMetadataOf`, so it flows through `isErrorCode` exactly like a real
 * server error.
 */
function presenceBaseUnavailableError(): ConnectError {
  const info = create(ErrorInfoSchema, {
    metadata: { code: Code.ErrPresenceBaseUnavailable },
  });
  return new ConnectError(
    'presence base unavailable',
    ConnectCode.FailedPrecondition,
    undefined,
    [{ desc: ErrorInfoSchema, value: info }],
  );
}

/**
 * `serverPack` builds a reply pack acking everything pushed so far and
 * advertising the given capabilities.
 */
function serverPack(clientSeq: number, capabilities: Array<string>) {
  return create(ChangePackSchema, {
    documentKey: 'k',
    checkpoint: create(CheckpointSchema, { serverSeq: 0n, clientSeq }),
    capabilities,
  });
}

/**
 * `activatedClient` returns a real Client forced into the active state with
 * the given fake RPCs, so the push paths run without a server.
 */
function activatedClient(rpcClient: Record<string, unknown>) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    key: 'presence-base-client',
  });
  (client as any).status = 'activated';
  (client as any).id = actorHex;
  (client as any).actorID = actorHex;
  (client as any).rpcClient = rpcClient;
  return client;
}

/**
 * `presenceTypes` lists the presence-change type of every change on a pushed
 * protobuf pack.
 */
function presenceTypes(pack: PbChangePack): Array<number | undefined> {
  return pack.changes.map((change) => change.presenceChange?.type);
}

/**
 * `withPendingPatch` returns a detached document whose queue holds a presence
 * patch minted in an earlier session, as a restore from offline persistence
 * leaves it: `toBytes`/`fromBytes` keep a queued patch a patch.
 */
function withPendingPatch(key: string): Document<{ k?: string }, TestPresence> {
  const source = new Document<{ k?: string }, TestPresence>(key);
  source.update((_, p) => p.set({ name: 'a' }));
  source.applyChangePack(
    converter.fromChangePack<TestPresence>(
      serverPack(1, [PresencePatchCapability]),
    ),
  );
  source.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
  return Document.fromBytes<{ k?: string }, TestPresence>(
    key,
    source.toBytes(),
  );
}

describe('Presence base unavailable', () => {
  it('resends an attach pack with a full put when the base is gone', async () => {
    const doc = withPendingPatch('k-attach');
    // The restored queue still holds the patch its earlier session minted.
    assert.deepEqual(
      doc
        .createChangePack()
        .getChanges()
        .map((change) => change.getPresenceChange()?.type),
      [PresenceChangeType.Patch],
    );

    const sent: Array<PbChangePack> = [];
    const attachDocument = async (req: any) => {
      sent.push(req.changePack);
      if (sent.length === 1) {
        throw presenceBaseUnavailableError();
      }
      return create(AttachDocumentResponseSchema, {
        documentId: 'doc-id',
        changePack: serverPack(0, [PresencePatchCapability]),
        disablePresence: false,
        schemaRules: [],
      });
    };

    const client = activatedClient({ attachDocument });
    await client.attach(doc, { syncMode: SyncMode.Manual });

    // Two attaches: the rejected one carrying the patch, and the resend that
    // replaced it with the full put it stands for. Without the retry the
    // attach fails, and fails identically on every later try.
    assert.equal(sent.length, 2);
    assert.equal(presenceTypes(sent[0])[0], PbPresenceChangeType.PATCH);
    assert.equal(presenceTypes(sent[1])[0], PbPresenceChangeType.PUT);
    assert.deepEqual(
      Object.keys(sent[1].changes[0].presenceChange!.presence!.data).sort(),
      ['cursor', 'name'],
    );
  });

  it('resends a push-pull pack with a full put when the base is gone', async () => {
    const attachDocument = async () =>
      create(AttachDocumentResponseSchema, {
        documentId: 'doc-id',
        // Ack the attach's initial presence put and advertise the capability,
        // so the next update is recorded as a patch.
        changePack: serverPack(1, [PresencePatchCapability]),
        disablePresence: false,
        schemaRules: [],
      });

    const sent: Array<PbChangePack> = [];
    const pushPullChanges = async (req: any) => {
      sent.push(req.changePack);
      if (sent.length === 1) {
        throw presenceBaseUnavailableError();
      }
      return create(PushPullChangesResponseSchema, {
        changePack: serverPack(2, [PresencePatchCapability]),
      });
    };

    const client = activatedClient({ attachDocument, pushPullChanges });
    const doc = new Document<{ k?: string }, TestPresence>('k-sync');
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      initialPresence: { name: 'a' },
    });
    assert.isTrue(doc.isPresencePatchableForTest());

    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    await client.sync(doc);

    assert.equal(sent.length, 2);
    assert.equal(presenceTypes(sent[0])[0], PbPresenceChangeType.PATCH);
    assert.equal(presenceTypes(sent[1])[0], PbPresenceChangeType.PUT);
    assert.deepEqual(
      Object.keys(sent[1].changes[0].presenceChange!.presence!.data).sort(),
      ['cursor', 'name'],
    );
  });

  it('propagates an error that is not a lost presence base', async () => {
    let calls = 0;
    const attachDocument = async () => {
      calls++;
      throw new ConnectError('boom', ConnectCode.Internal);
    };
    const client = activatedClient({ attachDocument });
    const doc = new Document<{ k?: string }, TestPresence>('k-other-error');

    let threw = false;
    try {
      await client.attach(doc, { syncMode: SyncMode.Manual });
    } catch {
      threw = true;
    }
    assert.isTrue(threw);
    assert.equal(calls, 1, 'only a lost presence base is retried');
  });
});
