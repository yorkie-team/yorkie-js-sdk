/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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

import { WatchStream } from '@yorkie-js/sdk/src/client/attachment';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `WatchIdleTimeoutFactor` multiplies the heartbeat interval the server
 * advertises to get how long a silent stream is given before it is treated as
 * half-open. More than one interval, so a single late or dropped heartbeat
 * does not tear down a stream that is merely slow.
 */
const WatchIdleTimeoutFactor = 3;

/**
 * `WatchIdleTimeoutMin` floors the timeout. The interval arrives off the wire,
 * so a server advertising a handful of milliseconds would otherwise time every
 * stream out as soon as it came up and spin the reconnect loop.
 */
const WatchIdleTimeoutMin = 1000;

/**
 * `WatchIdleTimeoutMax` caps the timeout, so a nonsensical interval cannot
 * overflow `setTimeout`, which fires at once for delays above 2^31-1 ms.
 */
const WatchIdleTimeoutMax = 24 * 60 * 60 * 1000;

/**
 * `watchIdleTimeout` returns how long, in milliseconds, a watch stream may
 * stay silent before it is treated as half-open, given the heartbeat interval
 * the server advertised. A server that sends no heartbeats advertises 0 and
 * gets 0 back: nothing is expected to arrive on a quiet stream, so nothing may
 * time one out.
 */
export function watchIdleTimeout(heartbeatIntervalMs: number): number {
  if (!(heartbeatIntervalMs > 0)) {
    return 0;
  }

  return Math.min(
    Math.max(heartbeatIntervalMs * WatchIdleTimeoutFactor, WatchIdleTimeoutMin),
    WatchIdleTimeoutMax,
  );
}

/**
 * `WatchStreamConfig` contains callbacks for handling the watch stream lifecycle.
 */
export interface WatchStreamConfig<Resp> {
  /** The async iterable stream of responses. */
  stream: AsyncIterable<Resp>;
  /** The AbortController to cancel the stream. */
  ac: AbortController;
  /** Returns true if the response is the init (first) response. */
  isInit: (resp: Resp) => boolean;
  /**
   * Returns the heartbeat interval, in milliseconds, the server advertised in
   * the init response; 0 when it sends none. A non-zero interval arms the idle
   * watchdog.
   */
  heartbeatIntervalOf?: (init: Resp) => number;
  /** Called for each response from the stream. */
  onResponse: (resp: Resp) => void;
  /** Called when the stream ends normally. */
  onStreamEnd: () => void;
  /** Called when the stream encounters an error. */
  onError: (err: unknown) => void;
  /** Called when the error is retryable and reconnection should be attempted. */
  onDisconnect: () => void;
  /** Returns true if the error should be silently ignored (e.g. AbortError). */
  shouldIgnoreError?: (err: unknown) => boolean;
}

/**
 * `runWatchStream` runs a watch stream and returns a promise that resolves
 * with the stream and AbortController on the first (init) response.
 *
 * This extracts the shared `Promise + async for-await + error handling`
 * pattern from document and channel watch streams.
 */
export function runWatchStream<Resp>(
  config: WatchStreamConfig<Resp>,
  handleConnectError: (err: unknown) => Promise<boolean>,
  setWatchLoopInactive: () => void,
): Promise<[WatchStream, AbortController]> {
  const {
    stream,
    ac,
    isInit,
    heartbeatIntervalOf,
    onResponse,
    onStreamEnd,
    onError,
    onDisconnect,
    shouldIgnoreError,
  } = config;

  return new Promise((resolve, reject) => {
    // The idle watchdog aborts the stream when nothing, heartbeat or event,
    // arrives within the timeout. It is armed only after the init response:
    // the server's handshake includes an auth webhook with retries the client
    // has no basis to bound.
    let idleTimeout = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let idled = false;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idled = true;
        ac.abort();
      }, idleTimeout);
    };

    // An idle timeout reconnects whatever the transport made of the abort --
    // an error, an `AbortError` the caller ignores, or a quiet end.
    const handleIdle = () => {
      onError(
        new YorkieError(
          Code.ErrWatchStreamIdle,
          `watch stream is idle for ${idleTimeout}ms`,
        ),
      );
      onDisconnect();
    };

    const handleStream = async () => {
      try {
        let resolved = false;
        for await (const resp of stream) {
          if (idleTimeout > 0) {
            armIdleTimer();
          }

          onResponse(resp);

          if (!resolved && isInit(resp)) {
            resolved = true;
            idleTimeout = watchIdleTimeout(heartbeatIntervalOf?.(resp) ?? 0);
            if (idleTimeout > 0) {
              armIdleTimer();
            }
            resolve([stream, ac]);
          }
        }

        if (idled) {
          handleIdle();
          return;
        }

        // Stream ended normally
        onStreamEnd();
        onDisconnect();
      } catch (err) {
        // The stream is over; the timer must not fire during the await below.
        clearTimeout(idleTimer);

        if (idled) {
          handleIdle();
          return;
        }

        if (shouldIgnoreError && shouldIgnoreError(err)) {
          return;
        }

        onError(err);

        if (await handleConnectError(err)) {
          onDisconnect();
        } else {
          setWatchLoopInactive();
        }

        reject(err);
      } finally {
        clearTimeout(idleTimer);
      }
    };

    handleStream();
  });
}
