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

import { describe, it, vi, afterEach, expect } from 'vitest';

import yorkie from '@yorkie-js/sdk/src/yorkie';
import { EventCollector } from '@yorkie-js/sdk/test/helper/helper';
import {
  toDocKey,
  testRPCAddr,
  withTwoClientsAndChannels,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';

describe.sequential('Channel', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Should successfully broadcast serializeable payload', async ({
    task,
  }) => {
    const cli = new yorkie.Client({ rpcAddr: testRPCAddr });
    await cli.activate();

    const channelKey = toDocKey(`${task.name}-presence`);
    const channel = new yorkie.Channel(channelKey);
    await cli.attach(channel);

    const broadcastTopic = 'test';
    const payload = { a: 1, b: '2' };

    expect(async () =>
      channel.broadcast(broadcastTopic, payload),
    ).not.toThrow();

    await cli.detach(channel);
    await cli.deactivate();
  });

  it('Should throw error when broadcasting unserializeable payload', async ({
    task,
  }) => {
    const eventCollector = new EventCollector<string>();
    const cli = new yorkie.Client({ rpcAddr: testRPCAddr });
    await cli.activate();

    const channelKey = toDocKey(`${task.name}-presence`);
    const channel = new yorkie.Channel(channelKey);
    await cli.attach(channel);

    // broadcast unserializable payload

    const payload = () => {};
    const broadcastTopic = 'test';
    const broadcastErrMessage = 'payload is not serializable';

    const errorHandler = (error: Error) => {
      eventCollector.add(error.message);
    };

    // @ts-ignore
    // Disable type checking for testing purposes
    channel.broadcast(broadcastTopic, payload, {
      error: errorHandler,
    });

    await eventCollector.waitAndVerifyNthEvent(1, broadcastErrMessage);

    await cli.detach(channel);
    await cli.deactivate();
  });

  it('Should not retry broadcasting on network failure when maxRetries is set to zero', async ({
    task,
  }) => {
    await withTwoClientsAndChannels(async (c1, p1, c2, p2) => {
      const eventCollector = new EventCollector<[string, any]>();
      const eventCollector2 = new EventCollector<ConnectCode>();
      const broadcastTopic = 'test';
      const unsubscribe = p2.subscribe('broadcast', (event) => {
        const { topic, payload } = event;
        if (topic === broadcastTopic) {
          eventCollector.add([topic, payload]);
        }
      });

      // 01. Simulate Unknown error.
      vi.stubGlobal('fetch', async () => {
        throw new ConnectError('Failed to fetch', ConnectCode.Unknown);
      });

      await new Promise((res) => setTimeout(res, 30));

      const payload = { a: 1, b: '2' };

      const errorHandler = (error: Error) => {
        if (error instanceof ConnectError) {
          eventCollector2.add(error.code);
        }
      };

      p1.broadcast(broadcastTopic, payload, {
        error: errorHandler,
        maxRetries: 0,
      });

      // 02. Back to normal condition
      vi.unstubAllGlobals();

      await eventCollector2.waitAndVerifyNthEvent(1, ConnectCode.Unknown);

      unsubscribe();
    }, task.name);
  });
});
