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

import { describe, it, assert, beforeEach, afterEach, vi } from 'vitest';
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
  runWatchStream,
  watchHeartbeatInterval,
  watchIdleTimeout,
} from '@yorkie-js/sdk/src/client/watch';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import {
  WatchResponseSchema,
  type WatchResponse,
} from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';

const initResponse = (heartbeatIntervalMs: number): WatchResponse =>
  create(WatchResponseSchema, {
    body: {
      case: 'initialization',
      value: { heartbeatIntervalMs: BigInt(heartbeatIntervalMs) },
    },
  });

const heartbeat = (): WatchResponse =>
  create(WatchResponseSchema, { body: { case: 'heartbeat', value: {} } });

/**
 * `fakeStream` stands in for a Connect server stream bound to `signal`: it
 * yields what the test pushes, and on abort either throws `abortError()` or,
 * when that is undefined, ends quietly — both are things a transport does.
 */
function fakeStream(
  signal: AbortSignal,
  abortError: (() => unknown) | undefined,
  abortDelayMs = 0,
) {
  const queue: Array<WatchResponse> = [];
  let wake: (() => void) | undefined;
  let ended = false;
  let unwound = abortDelayMs === 0;
  signal.addEventListener('abort', () => {
    if (unwound) {
      wake?.();
      return;
    }
    if (abortDelayMs === Infinity) return;
    setTimeout(() => {
      unwound = true;
      wake?.();
    }, abortDelayMs);
  });

  const stream = (async function* () {
    while (true) {
      if (signal.aborted && unwound) {
        if (abortError) throw abortError();
        return;
      }
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      if (ended) return;
      await new Promise<void>((resolve) => (wake = resolve));
    }
  })();

  return {
    stream,
    push(resp: WatchResponse) {
      queue.push(resp);
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
  };
}

function startWatch(
  opts: {
    abortError?: (() => unknown) | null;
    shouldIgnoreError?: (err: unknown) => boolean;
    abortDelayMs?: number;
  } = {},
) {
  const ac = new AbortController();
  const fs = fakeStream(
    ac.signal,
    opts.abortError === null
      ? undefined
      : (opts.abortError ??
          (() => new ConnectError('aborted', ConnectCode.Canceled))),
    opts.abortDelayMs,
  );
  const calls = {
    errors: [] as Array<unknown>,
    ends: 0,
    disconnects: 0,
    inactive: 0,
  };

  const ready = runWatchStream<WatchResponse>(
    {
      stream: fs.stream,
      ac,
      isInit: (resp) => resp.body.case === 'initialization',
      heartbeatIntervalOf: watchHeartbeatInterval,
      onResponse: () => {},
      onStreamEnd: () => calls.ends++,
      onError: (err) => calls.errors.push(err),
      onDisconnect: () => calls.disconnects++,
      shouldIgnoreError: opts.shouldIgnoreError,
    },
    // Not retryable: a reconnect after an idle timeout must not depend on
    // how the transport happened to classify the abort.
    async () => false,
    () => calls.inactive++,
  );
  ready.catch(() => {});

  return { ac, fs, calls, ready };
}

const isIdleError = (err: unknown) =>
  err instanceof YorkieError && err.code === Code.ErrWatchStreamIdle;

describe('watchIdleTimeout', () => {
  it('is 0 when the server sends no heartbeats', () => {
    assert.equal(watchIdleTimeout(0), 0);
    assert.equal(watchIdleTimeout(-1), 0);
  });

  it('is three heartbeat intervals', () => {
    assert.equal(watchIdleTimeout(20_000), 60_000);
    assert.equal(watchIdleTimeout(334), 1002);
  });

  it('is clamped to [1s, 24h]', () => {
    assert.equal(watchIdleTimeout(1), 1000);
    assert.equal(watchIdleTimeout(333), 1000);
    assert.equal(watchIdleTimeout(Number.MAX_SAFE_INTEGER), 24 * 3600_000);
    assert.equal(watchIdleTimeout(Infinity), 24 * 3600_000);
    assert.equal(watchIdleTimeout(NaN), 0);
  });
});

describe('watchHeartbeatInterval', () => {
  it('reads the interval an init response advertises', () => {
    assert.equal(watchHeartbeatInterval(initResponse(20_000)), 20_000);
    assert.equal(watchHeartbeatInterval(initResponse(0)), 0);
    assert.equal(watchHeartbeatInterval(heartbeat()), 0);
  });
});

describe('runWatchStream idle watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts a stream that goes silent and reconnects it', async () => {
    const { ac, fs, calls, ready } = startWatch();
    fs.push(initResponse(1000));
    await ready;

    await vi.advanceTimersByTimeAsync(2999);
    assert.isFalse(ac.signal.aborted);
    assert.equal(calls.disconnects, 0);

    await vi.advanceTimersByTimeAsync(1);
    assert.isTrue(ac.signal.aborted);
    assert.equal(calls.errors.length, 1);
    assert.isTrue(isIdleError(calls.errors[0]));
    assert.equal(calls.disconnects, 1);
    assert.equal(calls.inactive, 0);
    assert.equal(vi.getTimerCount(), 0);
  });

  it('keeps a stream alive while heartbeats arrive', async () => {
    const { ac, fs, calls, ready } = startWatch();
    fs.push(initResponse(1000));
    await ready;

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(2000);
      fs.push(heartbeat());
    }
    assert.isFalse(ac.signal.aborted);
    assert.equal(calls.disconnects, 0);

    await vi.advanceTimersByTimeAsync(3000);
    assert.isTrue(ac.signal.aborted);
    assert.equal(calls.disconnects, 1);
  });

  it('never times out when the server advertises no heartbeat', async () => {
    const { ac, fs, calls, ready } = startWatch();
    fs.push(initResponse(0));
    await ready;

    await vi.advanceTimersByTimeAsync(3600_000);
    assert.isFalse(ac.signal.aborted);
    assert.equal(calls.disconnects, 0);
    assert.equal(vi.getTimerCount(), 0);
  });

  it('reconnects even where the abort error is otherwise ignored', async () => {
    // The channel stream ignores `AbortError`, which is right for a
    // cancellation the client asked for and wrong for an idle timeout.
    const abortError = () => new DOMException('aborted', 'AbortError');
    const { fs, calls, ready } = startWatch({
      abortError,
      shouldIgnoreError: (err) =>
        err instanceof Error && err.name === 'AbortError',
    });
    fs.push(initResponse(1000));
    await ready;

    await vi.advanceTimersByTimeAsync(3000);
    assert.isTrue(isIdleError(calls.errors[0]));
    assert.equal(calls.disconnects, 1);
  });

  it('reports an idle timeout when the transport ends quietly on abort', async () => {
    const { fs, calls, ready } = startWatch({ abortError: null });
    fs.push(initResponse(1000));
    await ready;

    await vi.advanceTimersByTimeAsync(3000);
    assert.isTrue(isIdleError(calls.errors[0]));
    assert.equal(calls.disconnects, 1);
  });

  it('stops the timer when the stream ends', async () => {
    const { fs, calls, ready } = startWatch();
    fs.push(initResponse(1000));
    await ready;

    fs.end();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(calls.ends, 1);
    assert.equal(calls.disconnects, 1);
    assert.equal(vi.getTimerCount(), 0);

    await vi.advanceTimersByTimeAsync(10_000);
    assert.equal(calls.errors.length, 0);
    assert.equal(calls.disconnects, 1);
  });

  it('leaves a cancellation the client asked for as it was', async () => {
    const { ac, fs, calls, ready } = startWatch();
    fs.push(initResponse(1000));
    await ready;

    ac.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    assert.equal(calls.errors.length, 1);
    assert.isFalse(isIdleError(calls.errors[0]));
    // The cancellation goes through `handleConnectError` as before, which
    // this test answers with "not retryable".
    assert.equal(calls.disconnects, 0);
    assert.equal(calls.inactive, 1);
    assert.equal(vi.getTimerCount(), 0);
  });

  it('does not report a cancellation as idle when the timer fires first', async () => {
    // The client cancels just before the deadline, and the transport takes
    // longer than that to unwind. The channel stream ignores the resulting
    // `AbortError`; a late idle report would instead reconnect a stream the
    // client stopped, and clear a successor's slot in the attachment.
    const { ac, fs, calls, ready } = startWatch({
      abortError: () => new DOMException('aborted', 'AbortError'),
      shouldIgnoreError: (err) =>
        err instanceof Error && err.name === 'AbortError',
      abortDelayMs: 5000,
    });
    fs.push(initResponse(1000));
    await ready;

    await vi.advanceTimersByTimeAsync(2900);
    ac.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    assert.equal(calls.errors.length, 0);
    assert.equal(calls.disconnects, 0);
    assert.equal(vi.getTimerCount(), 0);
  });

  it('keeps a busy stream on a single timer', async () => {
    const { ac, fs, ready } = startWatch();
    fs.push(initResponse(1000));
    await ready;

    for (let i = 0; i < 100; i++) {
      await vi.advanceTimersByTimeAsync(50);
      fs.push(heartbeat());
    }
    await vi.advanceTimersByTimeAsync(0);
    assert.isFalse(ac.signal.aborted);
    assert.equal(vi.getTimerCount(), 1);
  });

  it('reconnects even when the transport never unwinds the aborted read', async () => {
    // Seen end to end over Node's fetch: once a stream has been idle for a
    // while, aborting it leaves the pending read hanging, so a reconnect that
    // waited for the iterator to settle would never come.
    const { ac, fs, calls, ready } = startWatch({ abortDelayMs: Infinity });
    fs.push(initResponse(1000));
    await ready;

    await vi.advanceTimersByTimeAsync(3000);
    assert.isTrue(ac.signal.aborted);
    assert.equal(calls.errors.length, 1);
    assert.isTrue(isIdleError(calls.errors[0]));
    assert.equal(calls.disconnects, 1);
    assert.equal(vi.getTimerCount(), 0);
  });
});
