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
import yorkie from '@yorkie-js/sdk/src/yorkie';

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

function makeClient(deactivateClient: () => Promise<unknown>) {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    deactivateOnUnload: false,
  });
  let n = 0;
  (client as any).rpcClient = {
    activateClient: vi
      .fn()
      .mockImplementation(async () => ({ clientId: `id-${++n}` })),
    deactivateClient: vi.fn().mockImplementation(deactivateClient),
  };
  (client as any).runSyncLoop = vi.fn();
  return client;
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
});
