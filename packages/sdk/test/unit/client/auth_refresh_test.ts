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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import { ErrorInfoSchema } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { Code } from '@yorkie-js/sdk/src/util/error';
import { ClientStatus, SyncMode } from '@yorkie-js/sdk/src/client/client';
import { Attachment } from '@yorkie-js/sdk/src/client/attachment';
import { Channel } from '@yorkie-js/sdk/src/channel/channel';
import { runWatchStream } from '@yorkie-js/sdk/src/client/watch';

const ExpiredToken = 'expired token';

/**
 * `unauthenticated` builds the 401 the server returns when the auth webhook
 * refuses the token, with the Yorkie code and the webhook's reason in the
 * error detail metadata where `errorMetadataOf` reads them.
 */
function unauthenticated(): ConnectError {
  const info = create(ErrorInfoSchema, {
    metadata: { code: Code.ErrUnauthenticated, reason: ExpiredToken },
  });
  return new ConnectError('unauthenticated', ConnectCode.Unauthenticated, {}, [
    { desc: ErrorInfoSchema, value: info },
  ]);
}

/**
 * `newClient` returns a client with the given injector, typed loosely so the
 * tests can reach its private error handling.
 */
function newClient(authTokenInjector: (reason?: string) => Promise<string>) {
  return new yorkie.Client({
    rpcAddr: 'http://localhost',
    authTokenInjector,
  }) as any;
}

/**
 * `attachChannel` puts a realtime channel attachment on the client without a
 * server, so the tests can reach the paths that read the attachment map. Its
 * Watch stream reconnects after 100ms, or as `loopRetryDelay` holds it.
 */
function attachChannel(client: any, key: string, pollInterval = 0) {
  client.attachmentMap.set(
    key,
    new Attachment(
      (err) => client.loopRetryDelay(err, 100),
      new Channel(key),
      '',
      SyncMode.Realtime,
      pollInterval,
      pollInterval > 0,
    ),
  );
}

/**
 * `refusedStream` stands in for a Watch stream that the server ends with a
 * 401 before its init response, through the client's error handling.
 */
function refusedStream(client: any, onDisconnect: (err?: unknown) => void) {
  const stream: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.reject(unauthenticated()),
    }),
  };
  return runWatchStream(
    {
      stream,
      ac: new AbortController(),
      isInit: () => true,
      heartbeatIntervalOf: () => 0,
      onResponse: () => {},
      onStreamEnd: () => {},
      onError: () => {},
      onDisconnect,
    },
    (err) => client.handleConnectError(err, true),
    () => {},
  );
}

/**
 * `settled` reports whether the promise has settled after pending microtasks
 * and timers due now have run.
 */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

describe('Token refresh after a 401', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // No jitter: the waits are exactly 1s, 2s, 4s, ...
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls a rejecting injector again only after a doubling backoff', async () => {
    let failures = 3;
    const injector = vi.fn(async () => {
      if (failures-- > 0) {
        throw new Error('token api unavailable');
      }
      return 'new-token';
    });
    const client = newClient(injector);

    // A 401 every 100ms, as from loops that retried at their own delay.
    const callsAt = async (ms: number) => {
      for (let t = 0; t < ms; t += 100) {
        expect(await client.handleConnectError(unauthenticated(), true)).toBe(
          true,
        );
        await vi.advanceTimersByTimeAsync(100);
      }
      return injector.mock.calls.length;
    };

    expect(await callsAt(1000)).toBe(1);
    expect(await callsAt(2000)).toBe(2);
    expect(await callsAt(4000)).toBe(3);
    expect(await callsAt(100)).toBe(4);
    expect(injector).toHaveBeenCalledWith(ExpiredToken);

    // The refresh succeeded: the next 401 refreshes at once.
    await client.handleConnectError(unauthenticated(), true);
    expect(injector).toHaveBeenCalledTimes(5);
  });

  it('caps the backoff at 30s', async () => {
    const injector = vi.fn(async (): Promise<string> => {
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);

    // Fail six times in a row, 1 + 2 + 4 + 8 + 16 = 31s.
    for (const wait of [1000, 2000, 4000, 8000, 16000, 0]) {
      await client.handleConnectError(unauthenticated(), true);
      await vi.advanceTimersByTimeAsync(wait);
    }
    expect(injector).toHaveBeenCalledTimes(6);

    await vi.advanceTimersByTimeAsync(29999);
    await client.handleConnectError(unauthenticated(), true);
    expect(injector).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    await client.handleConnectError(unauthenticated(), true);
    expect(injector).toHaveBeenCalledTimes(7);
  });

  it('counts 401s that arrive together as one failure', async () => {
    const injector = vi.fn(async (): Promise<string> => {
      await new Promise((res) => setTimeout(res, 300));
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);

    // The sync loop's and two Watch streams' 401s when the token expires.
    const handled = Promise.all([
      client.handleConnectError(unauthenticated(), true),
      client.handleConnectError(unauthenticated(), true),
      client.handleConnectError(unauthenticated(), true),
    ]);
    await vi.advanceTimersByTimeAsync(300);
    expect(await handled).toEqual([true, true, true]);
    expect(injector).toHaveBeenCalledTimes(3);

    // The next refresh may run 1s later, not 4s.
    expect(client.loopRetryDelay(unauthenticated(), 0)).toBe(1000);
  });

  it('lets a later 401 refresh while an earlier call never settles', async () => {
    const injector = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(new Promise<string>(() => {}))
      .mockResolvedValue('new-token');
    const client = newClient(injector);

    // A Watch stream's call hangs on a token API that does not answer.
    const hung = client.handleConnectError(unauthenticated(), true);
    expect(await settled(hung)).toBe(false);

    // The sync loop's 401 is not held by it: once the token API answers
    // again, its own call gets the new token.
    expect(
      await settled(client.handleConnectError(unauthenticated(), true)),
    ).toBe(true);
    expect(injector).toHaveBeenCalledTimes(2);
  });

  it('holds only the retries that got a 401 until the next refresh may run', async () => {
    const injector = vi.fn(async (): Promise<string> => {
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);
    const unavailable = new ConnectError('down', ConnectCode.Unavailable);
    expect(client.loopRetryDelay(unauthenticated(), 100)).toBe(100);

    await client.handleConnectError(unauthenticated(), true);
    expect(client.loopRetryDelay(unauthenticated(), 100)).toBe(1000);
    // A stream or call that failed for another reason keeps its own delay:
    // it may use a method the webhook does not guard.
    expect(client.loopRetryDelay(unavailable, 100)).toBe(100);
    await vi.advanceTimersByTimeAsync(400);
    expect(client.loopRetryDelay(unauthenticated(), 100)).toBe(600);
    await vi.advanceTimersByTimeAsync(600);
    expect(client.loopRetryDelay(unauthenticated(), 100)).toBe(100);
  });

  it('lets an earlier call that settles later neither set its token nor count', async () => {
    const calls: Array<{
      resolve: (token: string) => void;
      reject: (err: Error) => void;
    }> = [];
    const injector = vi.fn(
      () =>
        new Promise<string>((resolve, reject) =>
          calls.push({ resolve, reject }),
        ),
    );
    const client = newClient(injector);
    client.setAuthToken = vi.fn();

    // The Watch stream's call is still pending when the sync loop's settles.
    const first = client.handleConnectError(unauthenticated(), true);
    const second = client.handleConnectError(unauthenticated(), true);
    calls[1].resolve('new-token');
    await second;
    calls[0].resolve('old-token');
    await first;
    expect(client.setAuthToken.mock.calls).toEqual([['new-token']]);

    // Nor does a late rejection start a backoff after a refresh succeeded.
    const third = client.handleConnectError(unauthenticated(), true);
    const fourth = client.handleConnectError(unauthenticated(), true);
    calls[3].resolve('newer-token');
    await fourth;
    calls[2].reject(new Error('token api unavailable'));
    await third;
    expect(client.loopRetryDelay(unauthenticated(), 0)).toBe(0);
  });

  it('sets the token of a call that settles while a later one is pending', async () => {
    // A token API that answers in 3s, slower than the loops retry.
    let issued = 0;
    const injector = vi.fn(() => {
      const token = `token-${++issued}`;
      return new Promise<string>((res) => setTimeout(() => res(token), 3000));
    });
    const client = newClient(injector);
    client.setAuthToken = vi.fn();

    // The sync loop's call, then a Watch stream's 2s later: the first must
    // not be dropped for the second, or the loops would drop each other's.
    const syncLoop = client.handleConnectError(unauthenticated(), true);
    await vi.advanceTimersByTimeAsync(2000);
    const watch = client.handleConnectError(unauthenticated(), true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.setAuthToken.mock.calls).toEqual([['token-1']]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.setAuthToken.mock.calls).toEqual([['token-1'], ['token-2']]);
    expect(await Promise.all([syncLoop, watch])).toEqual([true, true]);
  });

  it('holds a Watch reconnect after a 401 until the next refresh may run', async () => {
    const injector = vi.fn(async (): Promise<string> => {
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);
    const attachment = new Attachment(
      (err) => client.loopRetryDelay(err, 100),
      new Channel('channel-a'),
      '',
      SyncMode.Realtime,
    );

    // Each stream the loop opens ends with a 401 before its init response.
    let opened = 0;
    void attachment.runWatchLoop((onDisconnect) => {
      opened++;
      return refusedStream(client, onDisconnect);
    });

    // The refresh failed: the stream reconnects 1s later, not 100ms.
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(opened).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(opened).toBe(2);
    expect(injector).toHaveBeenCalledTimes(2);
    attachment.cancelWatchStream();
  });

  it('retries the sync loop at least every 5s while the refresh backs off', async () => {
    const start = Date.now();
    const syncedAt: Array<number> = [];
    const refreshedAt: Array<number> = [];
    const injector = vi.fn(async (): Promise<string> => {
      refreshedAt.push(Date.now() - start);
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);
    client.status = ClientStatus.Activated;
    client.syncInternal = vi.fn(async () => {
      syncedAt.push(Date.now() - start);
      throw unauthenticated();
    });
    attachChannel(client, 'channel-a', 60000);

    client.runSyncLoop();
    await vi.advanceTimersByTimeAsync(31000);

    // The injector backs off to 16s, but the loop never waits more than 5s,
    // so a channel session outlives the server's 15s TTL and a token that
    // came back another way is picked up within 5s.
    expect(refreshedAt).toEqual([0, 1000, 3000, 7000, 15000, 31000]);
    expect(syncedAt).toEqual([
      0, 1000, 3000, 7000, 12000, 15000, 20000, 25000, 30000, 31000,
    ]);

    // A retry that waits longer on its own, as a broadcast's may, keeps it.
    expect(client.loopRetryDelay(unauthenticated(), 8000)).toBe(8000);

    client.deactivating = true;
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('lets a one-shot sync call the injector during the backoff and throw its error', async () => {
    const injector = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('token api unavailable'))
      .mockRejectedValueOnce(new Error('token api unavailable'))
      .mockResolvedValue('new-token');
    const client = newClient(injector);
    client.syncInternal = vi.fn(async () => {
      throw unauthenticated();
    });
    attachChannel(client, 'channel-a');
    const channel = client.attachmentMap.get('channel-a').resource;

    // A loop's 401 waits for one call to the injector only, and the loop's
    // next 401 during the backoff does not call it.
    expect(
      await settled(client.handleConnectError(unauthenticated(), true)),
    ).toBe(true);
    expect(
      await settled(client.handleConnectError(unauthenticated(), true)),
    ).toBe(true);
    expect(injector).toHaveBeenCalledTimes(1);

    // The app's `sync` calls it all the same and throws its error, as before
    // this change, and the failure counts toward the backoff.
    await expect(client.sync(channel)).rejects.toThrow('token api unavailable');
    expect(injector).toHaveBeenCalledTimes(2);
    expect(client.loopRetryDelay(unauthenticated(), 0)).toBe(2000);

    // Once the token API is back, the call sets the new token at once and
    // throws the 401 it got, for the app to retry.
    await expect(client.sync(channel)).rejects.toThrow('unauthenticated');
    expect(injector).toHaveBeenCalledTimes(3);
    expect(client.loopRetryDelay(unauthenticated(), 0)).toBe(0);
  });

  it('deactivates locally when the deactivation gets a 401 that cannot be refreshed', async () => {
    let signOut: (err: Error) => void = () => {};
    const injector = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('new-token')
      .mockReturnValue(new Promise((_, reject) => (signOut = reject)));
    const client = newClient(injector);
    client.id = 'client-id';
    client.status = ClientStatus.Activated;
    client.rpcClient = {
      deactivateClient: vi.fn(async () => {
        throw unauthenticated();
      }),
    };
    attachChannel(client, 'channel-a');

    // A token the injector refreshes: the app may retry, so stay activated.
    await expect(client.deactivate()).rejects.toThrow('unauthenticated');
    expect(client.status).toBe(ClientStatus.Activated);

    // Signed out: nothing could stop the loops resending the refused token.
    // It stays deactivating throughout, as a deactivation that succeeds
    // does, so the sync loop exits rather than resume, and throws the
    // injector's error.
    const deactivated = client.deactivate();
    await vi.advanceTimersByTimeAsync(0);
    expect(injector).toHaveBeenCalledTimes(2);
    expect(client.deactivating).toBe(true);
    signOut(new Error('signed out'));
    await expect(deactivated).rejects.toThrow('signed out');
    expect(client.status).toBe(ClientStatus.Deactivated);
    expect(client.attachmentMap.size).toBe(0);
    expect(client.deactivating).toBe(true);
  });

  it('drops an injector call still pending when the client activates again', async () => {
    let oldSession: (token: string) => void = () => {};
    const injector = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(new Promise((res) => (oldSession = res)))
      .mockResolvedValue('new-session-token');
    const client = newClient(injector);
    client.setAuthToken = vi.fn();
    client.rpcClient = {
      activateClient: vi.fn(async () => ({
        clientId: 'client-id',
        actorId: 'client-id',
      })),
    };

    // A loop's call from the previous session is still pending.
    void client.handleConnectError(unauthenticated(), true);
    await client.activate();
    oldSession('old-session-token');
    await vi.advanceTimersByTimeAsync(0);
    expect(client.setAuthToken.mock.calls).toEqual([['new-session-token']]);

    client.deactivating = true;
    await vi.advanceTimersByTimeAsync(100);
  });

  it('runs one sync loop after a deactivate and activate within a retry wait', async () => {
    const client = newClient(async () => 'new-token');
    client.id = 'client-id';
    client.status = ClientStatus.Activated;
    client.rpcClient = {
      activateClient: vi.fn(async () => ({
        clientId: 'client-id',
        actorId: 'client-id',
      })),
      deactivateClient: vi.fn(async () => ({})),
    };
    client.syncInternal = vi.fn(async () => {
      throw new ConnectError('down', ConnectCode.Unavailable);
    });

    // The loop failed and waits 1s to retry.
    attachChannel(client, 'channel-a', 60000);
    client.runSyncLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.syncInternal).toHaveBeenCalledTimes(1);

    // The app deactivates and activates again within that second, as a
    // React StrictMode remount does.
    await client.deactivate();
    await client.activate();
    const ticks = vi.spyOn(client, 'enqueueTask');

    // One loop ticks every 50ms; the old one must not join it at 1s.
    await vi.advanceTimersByTimeAsync(2000);
    expect(ticks.mock.calls.length).toBeLessThanOrEqual(41);

    client.deactivating = true;
    await vi.advanceTimersByTimeAsync(100);
  });

  it("calls the injector on a broadcast's first try during the backoff", async () => {
    const injector = vi.fn(async (): Promise<string> => {
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);
    client.id = 'client-id';
    client.rpcClient = {
      broadcast: vi.fn(async () => {
        throw unauthenticated();
      }),
    };
    attachChannel(client, 'channel-a');

    // A loop's 401 started the backoff.
    await client.handleConnectError(unauthenticated(), true);
    expect(injector).toHaveBeenCalledTimes(1);

    // The app's broadcast is a one-shot call on its first try.
    await expect(
      client.broadcast('channel-a', 'topic', 'payload', { maxRetries: 0 }),
    ).rejects.toThrow('token api unavailable');
    expect(injector).toHaveBeenCalledTimes(2);
  });
});
