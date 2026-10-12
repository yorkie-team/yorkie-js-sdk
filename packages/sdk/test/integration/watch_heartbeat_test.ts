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

import { describe, it, assert } from 'vitest';
import yorkie, { Channel } from '@yorkie-js/sdk/src/yorkie';
import type { WatchResponse } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';

// A server with a per-stream heartbeat (yorkie-team/yorkie#2209) clamps the
// interval a stream asks for into its own bounds, 5s to 60s by default, and
// advertises the result. These tests assert on what comes back rather than on
// a fixed number, so they hold whatever those bounds are, and they skip rather
// than fail on a server image that predates the feature: such a server ignores
// the request and advertises its own global setting instead.
const RequestedIntervalMs = 1000;

// A stream advertised more than this would outlast the test waiting for its
// first heartbeat. A server tuned that high has nothing to prove here.
const MaxWaitableIntervalMs = 20000;

// How long a stream that asked for no heartbeat is watched for one. Longer
// than the 5s default minimum, so a server heartbeating it anyway shows up.
const NoHeartbeatWindowMs = 8000;

const TestTimeoutMs = 60000;

/**
 * `recordWatch` makes the client's Watch streams report every response they
 * carry, heartbeats included, which the client otherwise consumes silently.
 */
function recordWatch(client: InstanceType<typeof yorkie.Client>) {
  const responses: Array<WatchResponse> = [];
  const rpc = (client as any).rpcClient;
  const watch = rpc.watch.bind(rpc);
  rpc.watch = (...args: Array<unknown>) => {
    const stream: AsyncIterable<WatchResponse> = watch(...args);
    return (async function* () {
      for await (const resp of stream) {
        responses.push(resp);
        yield resp;
      }
    })();
  };
  return responses;
}

/**
 * `waitFor` polls until `ready` holds, failing after `timeoutMs`.
 */
async function waitFor(ready: () => boolean, timeoutMs: number, what: string) {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${what}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const advertised = (responses: Array<WatchResponse>) => {
  const init = responses.find((r) => r.body.case === 'initialization');
  return init?.body.case === 'initialization'
    ? init.body.value.heartbeatIntervalMs
    : undefined;
};

const heartbeats = (responses: Array<WatchResponse>) =>
  responses.filter((r) => r.body.case === 'heartbeat').length;

/**
 * `awaitAdvertised` waits for the stream's init response and returns the
 * heartbeat interval it advertises.
 */
async function awaitAdvertised(responses: Array<WatchResponse>) {
  await waitFor(() => advertised(responses) !== undefined, 5000, 'init');
  return advertised(responses)!;
}

/**
 * `skipReason` tells a case that asked for `RequestedIntervalMs` why the
 * interval it was advertised cannot be exercised here, or `undefined` if it
 * can. A server without #2209 ignores the request and advertises its own
 * setting, 0 by default.
 */
function skipReason(interval: bigint): string | undefined {
  if (interval === 0n) {
    return 'the server sends no heartbeats; it predates the per-stream heartbeat interval (yorkie-team/yorkie#2209)';
  }
  if (Number(interval) > MaxWaitableIntervalMs) {
    return `the server advertised ${interval}ms, too long to wait for a heartbeat here`;
  }
  return undefined;
}

describe('Watch heartbeat', () => {
  it(
    'advertises the clamped interval on a document stream and heartbeats it',
    async (ctx) => {
      const client = new yorkie.Client({
        rpcAddr: testRPCAddr,
        watchHeartbeatInterval: RequestedIntervalMs,
      });
      await client.activate();
      const responses = recordWatch(client);

      const doc = new yorkie.Document(
        toDocKey(`${ctx.task.name}-${Date.now()}`),
      );
      await client.attach(doc);

      const interval = await awaitAdvertised(responses);
      const reason = skipReason(interval);
      if (reason) {
        await client.deactivate();
        ctx.skip(reason);
      }

      assert.isAtLeast(
        Number(interval),
        RequestedIntervalMs,
        'a request under the minimum is clamped up, and the effective value advertised',
      );
      await waitFor(
        () => heartbeats(responses) > 0,
        Number(interval) * 2 + 5000,
        'a heartbeat',
      );

      await client.deactivate();
    },
    TestTimeoutMs,
  );

  it(
    'advertises the clamped interval on a channel stream and heartbeats it',
    async (ctx) => {
      const client = new yorkie.Client({
        rpcAddr: testRPCAddr,
        watchHeartbeatInterval: RequestedIntervalMs,
      });
      await client.activate();
      const responses = recordWatch(client);

      const channel = new Channel(`${toDocKey(ctx.task.name)}-${Date.now()}`);
      await client.attach(channel);

      const interval = await awaitAdvertised(responses);
      const reason = skipReason(interval);
      if (reason) {
        await client.deactivate();
        ctx.skip(reason);
      }

      assert.isAtLeast(Number(interval), RequestedIntervalMs);
      await waitFor(
        () => heartbeats(responses) > 0,
        Number(interval) * 2 + 5000,
        'a heartbeat',
      );

      await client.deactivate();
    },
    TestTimeoutMs,
  );

  it(
    'sends no heartbeat to a stream that asked for none',
    async (ctx) => {
      // This is also how an SDK older than the field is served, which is what
      // makes heartbeats safe to leave on.
      const client = new yorkie.Client({
        rpcAddr: testRPCAddr,
        watchHeartbeatInterval: 0,
      });
      await client.activate();
      const responses = recordWatch(client);

      const doc = new yorkie.Document(
        toDocKey(`${ctx.task.name}-${Date.now()}`),
      );
      await client.attach(doc);

      const interval = await awaitAdvertised(responses);
      if (interval !== 0n) {
        // The request was ignored: a server without #2209 heartbeats every
        // stream or none, and this one heartbeats.
        await client.deactivate();
        ctx.skip(
          `the server advertised ${interval}ms to a stream that asked for none; it predates yorkie-team/yorkie#2209`,
        );
      }

      // Longer than the minimum interval, so a heartbeat would have arrived.
      await new Promise((r) => setTimeout(r, NoHeartbeatWindowMs));
      assert.equal(heartbeats(responses), 0);

      await client.deactivate();
    },
    TestTimeoutMs,
  );
});
