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

import { describe, it, assert, vi, afterEach, expect } from 'vitest';

import yorkie from '@yorkie-js/sdk/src/yorkie';
import { EventCollector } from '@yorkie-js/sdk/test/helper/helper';
import {
  toDocKey,
  testRPCAddr,
  withTwoClientsAndChannels,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';
import { Json } from '@yorkie-js/sdk/src/document/document';

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

  it('Should trigger the handler for a subscribed broadcast event', async ({
    task,
  }) => {
    await withTwoClientsAndChannels(async (c1, p1, c2, p2) => {
      const eventCollector = new EventCollector<[string, Json]>();
      const broadcastTopic = 'test';
      const unsubscribe = p2.subscribe('broadcast', (event) => {
        const { topic, payload } = event;
        if (topic === broadcastTopic) {
          eventCollector.add([topic, payload]);
        }
      });

      const payload = { a: 1, b: '2' };
      p1.broadcast(broadcastTopic, payload);
      await eventCollector.waitAndVerifyNthEvent(1, [broadcastTopic, payload]);

      assert.equal(eventCollector.getLength(), 1);

      unsubscribe();
    }, task.name);
  });

  it('Should not trigger the handler for an unsubscribed broadcast event', async ({
    task,
  }) => {
    await withTwoClientsAndChannels(async (c1, p1, c2, p2) => {
      const eventCollector = new EventCollector<[string, Json]>();
      const broadcastTopic1 = 'test1';
      const broadcastTopic2 = 'test2';

      const unsubscribe = p2.subscribe('broadcast', (event) => {
        const { topic, payload } = event;
        if (topic === broadcastTopic1) {
          eventCollector.add([topic, payload]);
        } else if (topic === broadcastTopic2) {
          eventCollector.add([topic, payload]);
        }
      });

      const payload = { a: 1, b: '2' };
      p1.broadcast(broadcastTopic1, payload);
      await eventCollector.waitAndVerifyNthEvent(1, [broadcastTopic1, payload]);

      assert.equal(eventCollector.getLength(), 1);

      unsubscribe();
    }, task.name);
  });

  it('Should not trigger the handler for a broadcast event after unsubscribing', async ({
    task,
  }) => {
    await withTwoClientsAndChannels(async (c1, p1, c2, p2) => {
      const eventCollector = new EventCollector<[string, Json]>();
      const broadcastTopic = 'test';
      const unsubscribe = p2.subscribe('broadcast', (event) => {
        const { topic, payload } = event;
        if (topic === broadcastTopic) {
          eventCollector.add([topic, payload]);
        }
      });

      const payload = { a: 1, b: '2' };

      p1.broadcast(broadcastTopic, payload);
      await eventCollector.waitAndVerifyNthEvent(1, [broadcastTopic, payload]);

      unsubscribe();

      p1.broadcast(broadcastTopic, payload);

      // Assuming that every subscriber can receive the broadcast event within 1000ms.
      await new Promise((res) => setTimeout(res, 1000));

      // No change in the number of calls
      assert.equal(eventCollector.getLength(), 1);
    }, task.name);
  });

  it('Should not trigger the handler for a broadcast event sent by the publisher to itself', async ({
    task,
  }) => {
    await withTwoClientsAndChannels(async (c1, p1, c2, p2) => {
      const eventCollector1 = new EventCollector<[string, Json]>();
      const eventCollector2 = new EventCollector<[string, Json]>();
      const broadcastTopic = 'test';
      const payload = { a: 1, b: '2' };

      // Publisher subscribes to the broadcast event
      const unsubscribe1 = p1.subscribe('boradcast', (event) => {
        const { topic, payload } = event;
        if (topic === broadcastTopic) {
          eventCollector1.add([topic, payload]);
        }
      });

      const unsubscribe2 = p2.subscribe('broadcast', (event) => {
        const { topic, payload } = event;
        if (topic === broadcastTopic) {
          eventCollector2.add([topic, payload]);
        }
      });

      p1.broadcast(broadcastTopic, payload);

      // Assuming that p2 takes longer to receive the broadcast event compared to p1
      await eventCollector2.waitAndVerifyNthEvent(1, [broadcastTopic, payload]);

      unsubscribe1();
      unsubscribe2();

      assert.equal(eventCollector1.getLength(), 0);
      assert.equal(eventCollector2.getLength(), 1);
    }, task.name);
  });

  it('Should retry broadcasting on network failure with retry option and succeeds when network is restored', async ({
    task,
  }) => {
    await withTwoClientsAndChannels(async (c1, p1, c2, p2) => {
      const eventCollector = new EventCollector<[string, Json]>();
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

      p1.broadcast(broadcastTopic, payload);

      // Failed to broadcast due to network failure
      await new Promise((res) => setTimeout(res, 3000));
      assert.equal(eventCollector.getLength(), 0);

      // 02. Back to normal condition
      vi.unstubAllGlobals();

      await eventCollector.waitAndVerifyNthEvent(1, [broadcastTopic, payload]);

      unsubscribe();
    }, task.name);
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
