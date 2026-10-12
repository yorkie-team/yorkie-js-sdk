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

// These tests run against a server with the default heartbeat bounds, 5s to
// 60s (yorkie-team/yorkie#2209): a client asking for less than 5s is clamped
// up to it, which keeps each test to a few seconds.
const ServerMinHeartbeatMs = 5000n;

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

describe('Watch heartbeat', () => {
  it('advertises the clamped interval on a document stream and heartbeats it', async ({
    task,
  }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      watchHeartbeatInterval: 1000,
    });
    await client.activate();
    const responses = recordWatch(client);

    const doc = new yorkie.Document(toDocKey(`${task.name}-${Date.now()}`));
    await client.attach(doc);

    await waitFor(() => advertised(responses) !== undefined, 5000, 'init');
    assert.equal(
      advertised(responses),
      ServerMinHeartbeatMs,
      'a request under the minimum is clamped up, and the effective value advertised',
    );

    await waitFor(() => heartbeats(responses) > 0, 10000, 'a heartbeat');

    await client.deactivate();
  }, 20000);

  it('advertises the clamped interval on a channel stream and heartbeats it', async ({
    task,
  }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      watchHeartbeatInterval: 1000,
    });
    await client.activate();
    const responses = recordWatch(client);

    const channel = new Channel(`${toDocKey(task.name)}-${Date.now()}`);
    await client.attach(channel);

    await waitFor(() => advertised(responses) !== undefined, 5000, 'init');
    assert.equal(advertised(responses), ServerMinHeartbeatMs);

    await waitFor(() => heartbeats(responses) > 0, 10000, 'a heartbeat');

    await client.deactivate();
  }, 20000);

  it('sends no heartbeat to a stream that asked for none', async ({ task }) => {
    // This is also how an SDK older than the field is served, which is what
    // makes heartbeats safe to leave on.
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      watchHeartbeatInterval: 0,
    });
    await client.activate();
    const responses = recordWatch(client);

    const doc = new yorkie.Document(toDocKey(`${task.name}-${Date.now()}`));
    await client.attach(doc);

    await waitFor(() => advertised(responses) !== undefined, 5000, 'init');
    assert.equal(advertised(responses), 0n);

    // Longer than the minimum interval, so a heartbeat would have arrived.
    await new Promise((r) =>
      setTimeout(r, Number(ServerMinHeartbeatMs) + 2000),
    );
    assert.equal(heartbeats(responses), 0);

    await client.deactivate();
  }, 20000);
});
