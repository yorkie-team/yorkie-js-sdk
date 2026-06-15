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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client, ClientStatus } from '@yorkie-js/sdk/src/client/client';

/**
 * Tests for `registerUnloadHandlers` and the idempotency contract of
 * `deactivate()`. These are pure unit tests — no server contact — so they
 * mock the global `window` object and the internal connect-rpc client.
 *
 * Covers the graceful-detach reach-rate boost (pagehide + beforeunload) added
 * to mitigate ClientInfo / doc.presence accumulation when the host page goes
 * away without calling `deactivate()` explicitly.
 */
describe('Client unload handlers', () => {
  // Map of event name → list of registered listeners (most-recently-added
  // wins for `dispatchEvent`). Matches the subset of the DOM Window API we
  // exercise.
  type Listener = (this: unknown, evt: Event) => unknown;
  let listeners: Map<string, Array<Listener>>;
  let stubWindow: {
    addEventListener: (name: string, fn: Listener) => void;
    removeEventListener: (name: string, fn: Listener) => void;
    dispatchEvent: (evt: { type: string }) => void;
  };

  beforeEach(() => {
    listeners = new Map();
    stubWindow = {
      addEventListener(name: string, fn: Listener) {
        const list = listeners.get(name) ?? [];
        list.push(fn);
        listeners.set(name, list);
      },
      removeEventListener(name: string, fn: Listener) {
        const list = listeners.get(name);
        if (!list) return;
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      },
      dispatchEvent(evt: { type: string }) {
        const list = listeners.get(evt.type);
        if (!list) return;
        for (const fn of [...list]) {
          fn(evt as Event);
        }
      },
    };
    vi.stubGlobal('window', stubWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * Build a Client and force it into the post-activate state without making
   * an actual RPC call. We then directly invoke private hooks through `any`.
   */
  const makeActivatedClient = (): Client => {
    const client = new Client();
    const inner = client as unknown as {
      id: string;
      status: ClientStatus;
      registerUnloadHandlers: () => void;
    };
    inner.id = 'test-actor-id';
    inner.status = ClientStatus.Activated;
    inner.registerUnloadHandlers();
    return client;
  };

  it('registers pagehide and beforeunload listeners', () => {
    makeActivatedClient();
    expect(listeners.get('pagehide')?.length ?? 0).toBe(1);
    expect(listeners.get('beforeunload')?.length ?? 0).toBe(1);
  });

  it('calls deactivate({keepalive:true}) on pagehide', () => {
    const client = makeActivatedClient();
    const deactivateSpy = vi
      .spyOn(client, 'deactivate')
      .mockResolvedValue(undefined);

    stubWindow.dispatchEvent({ type: 'pagehide' });

    expect(deactivateSpy).toHaveBeenCalledTimes(1);
    expect(deactivateSpy).toHaveBeenCalledWith({ keepalive: true });
  });

  it('calls deactivate({keepalive:true}) on beforeunload', () => {
    const client = makeActivatedClient();
    const deactivateSpy = vi
      .spyOn(client, 'deactivate')
      .mockResolvedValue(undefined);

    stubWindow.dispatchEvent({ type: 'beforeunload' });

    expect(deactivateSpy).toHaveBeenCalledTimes(1);
    expect(deactivateSpy).toHaveBeenCalledWith({ keepalive: true });
  });

  it('removes both listeners on deactivateInternal', () => {
    const client = makeActivatedClient();
    expect(listeners.get('pagehide')?.length).toBe(1);
    expect(listeners.get('beforeunload')?.length).toBe(1);

    (
      client as unknown as { deactivateInternal: () => void }
    ).deactivateInternal();

    expect(listeners.get('pagehide')?.length ?? 0).toBe(0);
    expect(listeners.get('beforeunload')?.length ?? 0).toBe(0);
  });

  it('does not stack listeners when re-activating without a clean teardown', () => {
    const client = makeActivatedClient();
    // Simulate an accidental second activate() call (current code path of
    // .activate() would re-enter `registerUnloadHandlers` directly).
    (
      client as unknown as { registerUnloadHandlers: () => void }
    ).registerUnloadHandlers();

    expect(listeners.get('pagehide')?.length).toBe(1);
    expect(listeners.get('beforeunload')?.length).toBe(1);
  });

  it('no-ops in non-browser context (window undefined)', () => {
    vi.unstubAllGlobals();
    // Recreate the client now that `window` is gone — constructor must not
    // touch DOM either.
    const client = new Client();
    const inner = client as unknown as {
      id: string;
      status: ClientStatus;
      registerUnloadHandlers: () => void;
      unloadHandlers?: () => void;
    };
    inner.id = 'test-actor-id';
    inner.status = ClientStatus.Activated;

    expect(() => inner.registerUnloadHandlers()).not.toThrow();
    expect(inner.unloadHandlers).toBeUndefined();
  });
});

describe('Client.deactivate idempotency', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns resolved promise immediately if already Deactivated', async () => {
    const client = new Client();
    // Brand-new client starts as Deactivated.
    const rpcSpy = vi.fn();
    (client as unknown as { rpcClient: unknown }).rpcClient = {
      deactivateClient: rpcSpy,
    };

    await client.deactivate();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('short-circuits a re-entrant call while a deactivate is in flight', async () => {
    // Construct a client that looks Activated but whose rpcClient.deactivateClient
    // never resolves. The first deactivate() should mark `deactivating = true`
    // and stay pending; a second call must short-circuit (resolve immediately)
    // without invoking the rpc again.
    const client = new Client();
    let rpcCalls = 0;
    const neverResolves = new Promise<unknown>(() => {});
    (client as unknown as { rpcClient: unknown }).rpcClient = {
      deactivateClient: () => {
        rpcCalls += 1;
        return neverResolves;
      },
    };
    const inner = client as unknown as {
      id: string;
      status: ClientStatus;
    };
    inner.id = 'test-actor-id';
    inner.status = ClientStatus.Activated;

    // Kick off the first deactivate. The keepalive path calls rpc immediately
    // (synchronously, without going through the task queue), giving us a
    // deterministic point at which `deactivating` is set.
    const first = client.deactivate({ keepalive: true });

    expect(rpcCalls).toBe(1);

    // Second call while first is still pending must short-circuit.
    await client.deactivate({ keepalive: true });
    expect(rpcCalls).toBe(1);

    // Sanity: a third one too.
    await client.deactivate();
    expect(rpcCalls).toBe(1);

    // Avoid an unhandled-rejection warning from the dangling `first` promise.
    void first.catch(() => {});
  });
});
