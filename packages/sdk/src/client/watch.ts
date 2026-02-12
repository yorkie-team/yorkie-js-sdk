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
    onResponse,
    onStreamEnd,
    onError,
    onDisconnect,
    shouldIgnoreError,
  } = config;

  return new Promise((resolve, reject) => {
    const handleStream = async () => {
      let resolved = false;
      try {
        for await (const resp of stream) {
          onResponse(resp);

          if (!resolved && isInit(resp)) {
            resolved = true;
            resolve([stream, ac]);
          }
        }

        // Stream ended normally
        onStreamEnd();
        onDisconnect();
      } catch (err) {
        if (shouldIgnoreError && shouldIgnoreError(err)) {
          return;
        }

        if (await handleConnectError(err)) {
          // Retryable error: treat like a normal stream end
          // (disconnect event + silent reconnect).
          onStreamEnd();
          onDisconnect();
          if (!resolved) {
            reject(err);
          }
        } else {
          // Non-retryable error: surface the error and stop.
          onError(err);
          setWatchLoopInactive();
          reject(err);
        }
      }
    };

    handleStream();
  });
}
