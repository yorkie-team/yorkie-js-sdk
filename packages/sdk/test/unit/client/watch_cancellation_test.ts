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

import { it, expect, vi } from 'vitest';
import { runWatchStream } from '@yorkie-js/sdk/src/client/watch';
it('does not arm a watchdog after init callback cancels the stream', async () => {
  vi.useFakeTimers();
  try {
    const ac = new AbortController();
    const never = new Promise<void>(() => {});
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield 1;
        await never;
      },
    };
    const ready = runWatchStream(
      {
        stream,
        ac,
        isInit: () => true,
        heartbeatIntervalOf: () => 1000,
        onResponse: () => ac.abort(),
        onStreamEnd: () => {},
        onError: () => {},
        onDisconnect: () => {},
      },
      async () => false,
      () => {},
    );
    await ready.catch(() => {});
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('does not finish obsolete recovery after cancellation', async () => {
  const ac = new AbortController();
  let finish!: (x: boolean) => void;
  let entered!: () => void;
  const entry = new Promise<void>((r) => (entered = r));
  const recovery = new Promise<boolean>((r) => (finish = r));
  const inactive = vi.fn();
  const stream: AsyncIterable<number> = {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.reject(Error('failure')),
    }),
  };
  const ready = runWatchStream(
    {
      stream,
      ac,
      isInit: () => true,
      heartbeatIntervalOf: () => 0,
      onResponse: () => {},
      onStreamEnd: () => {},
      onError: () => {},
      onDisconnect: () => {},
    },
    () => {
      entered();
      return recovery;
    },
    inactive,
  ).catch(() => {});
  await entry;
  ac.abort();
  await ready;
  finish(false);
  await Promise.resolve();
  expect(inactive).not.toHaveBeenCalled();
});

it('publishes the intentional disconnect off the abort stack', async () => {
  const ac = new AbortController();
  const onStreamEnd = vi.fn();
  // A transport that never settles its read, the case the abort handler is
  // there for.
  const stream: AsyncIterable<number> = {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise<IteratorResult<number>>(() => {}),
    }),
  };
  const ready = runWatchStream(
    {
      stream,
      ac,
      isInit: () => true,
      heartbeatIntervalOf: () => 0,
      onResponse: () => {},
      onStreamEnd,
      onError: () => {},
      onDisconnect: () => {},
    },
    async () => false,
    () => {},
  );

  ac.abort();
  // `cancelWatchStream()` aborts from inside `detachInternal`, itself called
  // while `deactivateInternal` iterates the attachment map. Publishing here
  // would re-enter the client through the document's subscribers.
  expect(onStreamEnd).not.toHaveBeenCalled();

  await ready.catch(() => {});
  expect(onStreamEnd).toHaveBeenCalledTimes(1);
});

it('does not start recovery when an error callback cancels the stream', async () => {
  const ac = new AbortController();
  const recover = vi.fn(async () => true);
  const stream: AsyncIterable<number> = {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.reject(Error('failure')),
    }),
  };
  const ready = runWatchStream(
    {
      stream,
      ac,
      isInit: () => true,
      heartbeatIntervalOf: () => 0,
      onResponse: () => {},
      onStreamEnd: () => {},
      onError: () => ac.abort(),
      onDisconnect: () => {},
    },
    recover,
    () => {},
  );
  await ready.catch(() => {});
  expect(recover).not.toHaveBeenCalled();
});
