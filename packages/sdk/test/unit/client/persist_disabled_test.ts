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
import { AttachDocumentResponseSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const actorHex = '000000000000000000000001';
const clientKey = 'budget-client';
const key = 'budgeted';

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const attachDocument = async (req: any) => {
  const presented = converter.fromChangePack(req.changePack).getCheckpoint();
  return create(AttachDocumentResponseSchema, {
    documentId: 'doc-id',
    changePack: create(ChangePackSchema, {
      documentKey: key,
      checkpoint: create(CheckpointSchema, {
        serverSeq: presented.getServerSeq(),
        clientSeq: presented.getClientSeq(),
      }),
    }),
    disablePresence: false,
    schemaRules: [],
  });
};

function activatedClient(store: MemoryDocStore, opts: Record<string, any>) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    key: clientKey,
    store,
    ...opts,
  });
  (client as any).status = 'activated';
  (client as any).id = actorHex;
  (client as any).actorID = actorHex;
  (client as any).rpcClient = { attachDocument };
  return client;
}

describe('persist budget', () => {
  it('latches persistence off for a document it cannot afford', async () => {
    const store = new MemoryDocStore();
    // Below any real snapshot, so the base write at attach already exceeds it.
    const client = activatedClient(store, { maxPersistBytes: 1 });
    const doc = new Document<{ text?: string }>(key);

    const events: Array<any> = [];
    doc.subscribe('persist-disabled', (event) => {
      events.push(event.value);
    });

    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    assert.equal(events.length, 1);
    assert.equal(events[0].reason, 'too-large');
  });

  it('stops serializing the document once latched', async () => {
    // The budget bounds the waste to one measurement. If the latch only
    // skipped the write, every later edit would still pay the serialization
    // it was meant to avoid.
    const store = new MemoryDocStore();
    const client = activatedClient(store, { maxPersistBytes: 1 });
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    let calls = 0;
    const realToBytes = doc.toBytes.bind(doc);
    (doc as any).toBytes = () => {
      calls += 1;
      return realToBytes();
    };

    for (const v of ['a', 'ab', 'abc']) {
      doc.update((root) => {
        root.text = v;
      });
    }
    await settled();

    assert.equal(calls, 0, 'no further toBytes after the latch');
  });

  it('leaves editing working after latching', async () => {
    const store = new MemoryDocStore();
    const client = activatedClient(store, { maxPersistBytes: 1 });
    const doc = new Document<{ text?: string }>(key);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    await settled();

    doc.update((root) => {
      root.text = 'still works';
    });
    assert.equal(doc.getRoot().text, 'still works');
    assert.isTrue(doc.hasLocalChanges());
  });

  it('does not latch a document within budget', async () => {
    const store = new MemoryDocStore();
    const client = activatedClient(store, { maxPersistBytes: 10_000_000 });
    const doc = new Document<{ text?: string }>(key);
    const events: Array<any> = [];
    doc.subscribe('persist-disabled', (event) => {
      events.push(event.value);
    });
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      disablePresence: true,
    });
    doc.update((root) => {
      root.text = 'fine';
    });
    await settled();

    assert.deepEqual(events, []);
    assert.isNotEmpty((await store.load(`/${clientKey}/${key}`))!.changes);
  });
});
