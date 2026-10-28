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
        expect(await client.handleConnectError(unauthenticated())).toBe(true);
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
    await client.handleConnectError(unauthenticated());
    expect(injector).toHaveBeenCalledTimes(5);
  });

  it('caps the backoff at 30s', async () => {
    const injector = vi.fn(async (): Promise<string> => {
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);

    // Fail six times in a row, 1 + 2 + 4 + 8 + 16 = 31s.
    for (const wait of [1000, 2000, 4000, 8000, 16000, 0]) {
      await client.handleConnectError(unauthenticated());
      await vi.advanceTimersByTimeAsync(wait);
    }
    expect(injector).toHaveBeenCalledTimes(6);

    await vi.advanceTimersByTimeAsync(29999);
    await client.handleConnectError(unauthenticated());
    expect(injector).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    await client.handleConnectError(unauthenticated());
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
      client.handleConnectError(unauthenticated()),
      client.handleConnectError(unauthenticated()),
      client.handleConnectError(unauthenticated()),
    ]);
    await vi.advanceTimersByTimeAsync(300);
    expect(await handled).toEqual([true, true, true]);
    expect(injector).toHaveBeenCalledTimes(3);

    // The next refresh may run 1s later, not 4s.
    expect(client.loopRetryDelay(0)).toBe(1000);
  });

  it('holds the loop retries until the next refresh may run', async () => {
    const injector = vi.fn(async (): Promise<string> => {
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);
    expect(client.loopRetryDelay(100)).toBe(100);

    await client.handleConnectError(unauthenticated());
    expect(client.loopRetryDelay(100)).toBe(1000);
    await vi.advanceTimersByTimeAsync(400);
    expect(client.loopRetryDelay(100)).toBe(600);
    await vi.advanceTimersByTimeAsync(600);
    expect(client.loopRetryDelay(100)).toBe(100);
  });

  it('lets a one-shot call fail at once without waiting for the backoff', async () => {
    const injector = vi.fn(async (): Promise<string> => {
      throw new Error('token api unavailable');
    });
    const client = newClient(injector);

    // The first 401 waits for one call to the injector only.
    expect(await settled(client.handleConnectError(unauthenticated()))).toBe(
      true,
    );
    expect(injector).toHaveBeenCalledTimes(1);

    // A 401 during the backoff does not call it at all.
    expect(await settled(client.handleConnectError(unauthenticated()))).toBe(
      true,
    );
    expect(injector).toHaveBeenCalledTimes(1);
  });
});
