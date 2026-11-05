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
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';
import { ErrorInfoSchema } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { ClientStatus, SyncMode } from '@yorkie-js/sdk/src/client/client';
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

/**
 * `reactivateOutsideQueue` brings the client back up under a new session id
 * without going through the task queue, the way the channel heartbeat's first
 * `RefreshChannel` response does from the sync loop. The queue runs one task
 * at a time, so this is how a task that is already awaiting a round trip comes
 * back to a client that is active again under a different `clientId` — the
 * case the session guards check with `this.id !== sessionID` rather than with
 * the client status alone.
 */
function reactivateOutsideQueue(client: any, id: string) {
  client.id = id;
  client.actorID = id;
  client.status = ClientStatus.Activated;
  client.deactivating = false;
}

/**
 * `clientNotFoundError` builds the ConnectError the server answers with when
 * the `clientId` on a request no longer exists — what an RPC issued under a
 * session a `keepalive` deactivate closed comes back with.
 */
function clientNotFoundError(): ConnectError {
  const info = create(ErrorInfoSchema, {
    metadata: { code: Code.ErrClientNotFound },
  });
  return new ConnectError('client not found', ConnectCode.NotFound, undefined, [
    { desc: ErrorInfoSchema, value: info },
  ]);
}

/**
 * `attachLocally` registers an attachment without a round trip, so a test can
 * drive `remove`/`detach` without also standing up the attach path.
 */
function attachLocally(client: any, doc: Document<any>) {
  doc.setActor(client.getID()!);
  doc.applyStatus(DocStatus.Attached);
  client.attachmentMap.set(doc.getKey(), {
    resource: doc,
    resourceID: `${doc.getKey()}-id`,
    syncMode: SyncMode.Manual,
    needRealtimeSync: () => false,
    waitForSyncComplete: async () => undefined,
    markDetaching: () => undefined,
    resetDetaching: () => undefined,
    cancelWatchStream: () => undefined,
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
    expect(rpc.mock.calls[0][1].headers['x-shard-key']).toBe(
      `${apiKey}/${clientKey}`,
    );
  });

  it('forwards the synchronous option to DeactivateClient', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    await client.deactivate({ keepalive: true, synchronous: true });

    const rpc = (client as any).rpcClient.deactivateClient;
    expect(rpc.mock.calls[0][0].synchronous).toBe(true);
  });

  it('marks the request so the transport sets fetch keepalive', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    await client.deactivate({ keepalive: true });

    const rpc = (client as any).rpcClient.deactivateClient;
    expect(rpc.mock.calls[0][1].headers['x-yorkie-keepalive']).toBe('1');
  });

  it('tears down locally when the request cannot even be sent', async () => {
    const client = makeClient(() => {
      throw new TypeError('Failed to fetch');
    });
    await client.activate();

    await client.deactivate({ keepalive: true });

    expect(client.isActive()).toBe(false);
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

  it('does not register a document attach that lands under a new session', async () => {
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

    // Torn down and then brought back up under a new id while the attach is
    // still in flight: the client is active again, but this attach was made
    // under the id the server has already forgotten.
    void client.deactivate({ keepalive: true });
    reactivateOutsideQueue(client, 'id-next');
    expect(client.isActive()).toBe(true);

    gate.resolve();
    const err = await settled;

    expect(err).toBeInstanceOf(YorkieError);
    expect((err as YorkieError).code).toBe(Code.ErrClientNotActivated);
    expect(client.has('keepalive-attach')).toBe(false);
    expect(doc.getStatus()).toBe(DocStatus.Detached);
    // The abandoned attach must not take the new session down with it.
    expect(client.isActive()).toBe(true);
    expect(client.getID()).toBe('id-next');
  });

  it('does not register a queued channel attach under a new session', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise);
    await client.activate();

    const blocker = deferred<void>();
    void (client as any).enqueueTask(() => blocker.promise);

    const channel = new yorkie.Channel('keepalive-channel');
    const settled = client.attachChannel(channel).then(
      () => undefined,
      (err: unknown) => err,
    );

    void client.deactivate({ keepalive: true });
    reactivateOutsideQueue(client, 'id-next');
    expect(client.isActive()).toBe(true);

    blocker.resolve();
    const err = await settled;

    expect(err).toBeInstanceOf(YorkieError);
    expect((err as YorkieError).code).toBe(Code.ErrClientNotActivated);
    expect(client.has('keepalive-channel')).toBe(false);
    expect(client.isActive()).toBe(true);
    expect(client.getID()).toBe('id-next');
  });

  it('does not let a late task error deactivate the new session', async () => {
    const res = deferred<unknown>();
    const gate = deferred<void>();
    const sent = deferred<void>();
    const client = makeClient(() => res.promise, {
      removeDocument: vi.fn().mockImplementation(async () => {
        sent.resolve();
        await gate.promise;
        throw clientNotFoundError();
      }),
    });
    await client.activate();

    // Attach a document without a round trip, so `remove` has something to
    // work on and the only RPC in play is the one that fails late.
    const doc = new Document<{ k: string }>('keepalive-remove');
    attachLocally(client, doc);

    const settled = client.remove(doc).then(
      () => undefined,
      (err: unknown) => err,
    );
    await sent.promise;

    // Torn down outside the queue, then brought back up: the in-flight
    // `RemoveDocument` still carries the old session's `clientId`.
    void client.deactivate({ keepalive: true });
    reactivateOutsideQueue(client, 'id-next');

    gate.resolve();
    await settled;

    // `ErrClientNotFound` from the dead session must not run
    // `deactivateInternal` against the session that replaced it.
    expect(client.isActive()).toBe(true);
    expect(client.getID()).toBe('id-next');
  });

  it('still deactivates when the error belongs to the live session', async () => {
    const res = deferred<unknown>();
    const client = makeClient(() => res.promise, {
      removeDocument: vi.fn().mockImplementation(async () => {
        throw clientNotFoundError();
      }),
    });
    await client.activate();

    const doc = new Document<{ k: string }>('keepalive-remove');
    attachLocally(client, doc);

    await client.remove(doc).catch(() => undefined);

    expect(client.isActive()).toBe(false);
  });
});

describe('keepalive transport flag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('survives connect’s async interceptor chain', async () => {
    const seen: Array<{ keepalive?: boolean; marker: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init: RequestInit) => {
        seen.push({
          keepalive: init.keepalive,
          marker: new Headers(init.headers).get('x-yorkie-keepalive'),
        });
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    // A real transport, so the request goes through the auth and metric
    // interceptors — both async — before the fetch that reads the flag.
    const client: any = new yorkie.Client({
      rpcAddr: 'http://localhost',
      apiKey,
      key: clientKey,
      deactivateOnUnload: false,
    });
    client.id = 'id-1';
    client.actorID = 'id-1';
    client.status = ClientStatus.Activated;

    await client.deactivate({ keepalive: true });
    // The send is fire-and-forget; let the interceptor chain drain.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(seen).toHaveLength(1);
    expect(seen[0].keepalive).toBe(true);
    // The marker is stripped before the request leaves.
    expect(seen[0].marker).toBe(null);
  });
});
