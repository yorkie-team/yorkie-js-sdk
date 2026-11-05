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

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { create } from '@bufbuild/protobuf';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { SyncMode } from '@yorkie-js/sdk/src/client/client';
import { Document, DocStatus } from '@yorkie-js/sdk/src/document/document';
import {
  ChangePack as PbChangePack,
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { AttachDocumentResponseSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `deferred` returns a promise whose settlement the test controls. It stands
 * in for a `DeactivateClient` response that the page never gets to process,
 * as when the page is frozen in the back/forward cache.
 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const apiKey = 'test-api-key';
const clientKey = 'keepalive-client';

function makeClient(
  deactivateClient: () => Promise<unknown>,
  rpc: Record<string, unknown> = {},
) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    apiKey,
    key: clientKey,
    deactivateOnUnload: false,
  });
  let n = 0;
  (client as any).rpcClient = {
    activateClient: vi
      .fn()
      .mockImplementation(async () => ({ clientId: `id-${++n}` })),
    deactivateClient: vi.fn().mockImplementation(deactivateClient),
    ...rpc,
  };
  (client as any).runSyncLoop = vi.fn();
  return client;
}

/**
 * `attachResponse` builds a minimal AttachDocumentResponse acknowledging the
 * pushed pack, so the attach path runs to the point where it would register
 * the attachment.
 */
function attachResponse(docKey: string, pushed: PbChangePack) {
  return create(AttachDocumentResponseSchema, {
    documentId: `${docKey}-id`,
    changePack: create(ChangePackSchema, {
      documentKey: docKey,
      checkpoint: create(CheckpointSchema, {
        serverSeq: BigInt(pushed.changes.length),
        clientSeq: pushed.checkpoint!.clientSeq,
      }),
    }),
    disablePresence: false,
    schemaRules: [],
  });
}

async function settles(p: Promise<unknown>, ms = 50): Promise<boolean> {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  await new Promise((r) => setTimeout(r, ms));
  return done;
}

describe('deactivate({ keepalive: true }) without a response', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deactivates locally without waiting for the response', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    void client.deactivate({ keepalive: true });

    expect(client.isActive()).toBe(false);
  });

  it('settles the returned promise without waiting for the response', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    const p = client.deactivate({ keepalive: true });

    expect(await settles(p)).toBe(true);
  });

  it('can be activated again right after a keepalive deactivate', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();
    const firstID = client.getID();

    void client.deactivate({ keepalive: true });
    await client.activate();

    expect(client.getID()).not.toBe(firstID);
  });

  it('ignores a late response after the client is activated again', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    void client.deactivate({ keepalive: true });
    await client.activate();
    expect(client.isActive()).toBe(true);

    // The old response finally arrives (e.g. on bfcache restore).
    res.resolve({});
    await new Promise((r) => setTimeout(r, 0));

    expect(client.isActive()).toBe(true);
  });

  it('ignores a late error after the client is activated again', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);

    void client.deactivate({ keepalive: true });
    await client.activate();

    res.reject(new TypeError('Failed to fetch'));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(client.isActive()).toBe(true);
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it('still sends DeactivateClient with the shard key', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();
    const id = client.getID();

    await client.deactivate({ keepalive: true });

    const rpc = (client as any).rpcClient.deactivateClient;
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toEqual({
      clientId: id,
      synchronous: undefined,
    });
    expect(rpc.mock.calls[0][1]).toEqual({
      headers: { 'x-shard-key': `${apiKey}/${clientKey}` },
    });
  });

  it('forwards the synchronous option to DeactivateClient', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    await client.deactivate({ keepalive: true, synchronous: true });

    const rpc = (client as any).rpcClient.deactivateClient;
    expect(rpc.mock.calls[0][0].synchronous).toBe(true);
  });

  it('sends with the transport keepalive flag set, then resets it', async () => {
    const res = deferred<unknown>();
    let keepaliveWhileSending: boolean | undefined;
    const client: any = makeClient(() => {
      keepaliveWhileSending = (client as any).keepalive;
      return res.promise;
    });
    await client.activate();

    await client.deactivate({ keepalive: true });

    expect(keepaliveWhileSending).toBe(true);
    expect(client.keepalive).toBe(false);
  });

  it('tears down locally when the request cannot even be sent', async () => {
    const client = makeClient(() => {
      throw new TypeError('Failed to fetch');
    });
    await client.activate();

    await client.deactivate({ keepalive: true });

    expect(client.isActive()).toBe(false);
    expect((client as any).keepalive).toBe(false);
  });

  it('does not register a document attach that lands after the teardown', async () => {
    const res = deferred<unknown>();
    const sent = deferred<void>();
    const gate = deferred<void>();
    const client = makeClient(() => res.promise, {
      attachDocument: vi.fn().mockImplementation(async (req: any) => {
        sent.resolve();
        await gate.promise;
        return attachResponse('keepalive-attach', req.changePack);
      }),
    });
    await client.activate();

    const doc = new Document<{ k: string }>('keepalive-attach');
    const attached = client.attach(doc, { syncMode: SyncMode.Manual });
    const settled = attached.then(
      () => undefined,
      (err: unknown) => err,
    );
    await sent.promise;

    // The page is going away: teardown runs in this tick, outside the queue.
    void client.deactivate({ keepalive: true });
    expect(client.isActive()).toBe(false);

    // The attach response finally lands on the torn-down client.
    gate.resolve();
    const err = await settled;

    expect(err).toBeInstanceOf(YorkieError);
    expect((err as YorkieError).code).toBe(Code.ErrClientNotActivated);
    expect(client.has('keepalive-attach')).toBe(false);
    expect(doc.getStatus()).toBe(DocStatus.Detached);
  });

  it('does not register a queued channel attach after the teardown', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    // Hold the task queue so the channel attach is still queued when the
    // keepalive deactivate tears the client down outside the queue.
    const blocker = deferred<void>();
    void (client as any).enqueueTask(() => blocker.promise);

    const channel = new yorkie.Channel('keepalive-channel');
    const settled = client.attachChannel(channel).then(
      () => undefined,
      (err: unknown) => err,
    );

    void client.deactivate({ keepalive: true });
    expect(client.isActive()).toBe(false);

    blocker.resolve();
    const err = await settled;

    expect(err).toBeInstanceOf(YorkieError);
    expect((err as YorkieError).code).toBe(Code.ErrClientNotActivated);
    expect(client.has('keepalive-channel')).toBe(false);
  });
});
