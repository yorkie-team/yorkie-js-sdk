import { describe, it, assert } from 'vitest';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { EventCollector } from '@yorkie-js/sdk/test/helper/helper';
import {
  withTwoClientsAndChannels,
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Channel', function () {
  it('should subscribe to specific topic for broadcast events', async function ({
    task,
  }) {
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      const chatCollector = new EventCollector<any>();
      const notificationCollector = new EventCollector<any>();

      // Subscribe to 'chat' topic
      const unsubChat = ch2.subscribe('chat', (event) => {
        chatCollector.add(event.payload);
      });

      // Subscribe to 'notification' topic
      const unsubNotification = ch2.subscribe('notification', (event) => {
        notificationCollector.add(event.payload);
      });

      // Broadcast to 'chat' topic
      ch1.broadcast('chat', { message: 'Hello, world!' });
      await chatCollector.waitAndVerifyNthEvent(1, {
        message: 'Hello, world!',
      });

      // Broadcast to 'notification' topic
      ch1.broadcast('notification', { alert: 'New message' });
      await notificationCollector.waitAndVerifyNthEvent(1, {
        alert: 'New message',
      });

      // Verify chat collector only received chat messages
      assert.equal(chatCollector.getLength(), 1);
      assert.equal(notificationCollector.getLength(), 1);

      unsubChat();
      unsubNotification();
    }, task.name);
  });

  it('should subscribe to presence events', async function ({ task }) {
    // Subscribe ON the channel object *before* attaching so the first
    // PresenceChanged from the initial RefreshChannel response is caught.
    // Under the RefreshChannel-only lifecycle the initial presence event
    // fires inside `attach()`'s first-heartbeat path — a subscriber
    // registered after attach (as in the pre-PR layout) would miss it
    // and wait forever for a count change that never comes.
    const channelKey = `${toDocKey(task.name)}-${Date.now()}`;
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client.activate();

    const channel = new yorkie.Channel(channelKey);
    const presenceCollector = new EventCollector<any>();
    const unsubPresence = channel.subscribe('presence', (event) => {
      presenceCollector.add(event.count);
    });

    await client.attach(channel);
    await waitFor(() => presenceCollector.getLength() > 0, {
      timeout: 10000,
      message: 'no presence event received within timeout',
    });

    assert.isAbove(presenceCollector.getLength(), 0);
    unsubPresence();

    await client.detach(channel);
    await client.deactivate();
  }, 15000);

  it('should get presence count', async function ({ task }) {
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      // Wait a bit for presence to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get presence count
      const count1 = ch1.getSessionCount();
      const count2 = ch2.getSessionCount();

      // Both channels should see at least 2 clients (themselves)
      assert.isAtLeast(count1, 2);
      assert.isAtLeast(count2, 2);
      assert.equal(count1, count2);
    }, task.name);
  });

  it('should support legacy broadcast subscription', async function ({ task }) {
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      const eventCollector = new EventCollector<string>();
      const topic = 'test-topic';

      // Legacy way: subscribe to all broadcast events and filter by topic
      const unsubscribe = ch2.subscribe('broadcast', (event) => {
        if (event.topic === topic) {
          eventCollector.add(event.payload as string);
        }
      });

      ch1.broadcast(topic, 'test-data');
      await eventCollector.waitAndVerifyNthEvent(1, 'test-data');

      unsubscribe();
    }, task.name);
  });

  it('should mix topic-based and type-based subscriptions', async function ({
    task,
  }) {
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      const chatCollector = new EventCollector<any>();
      const allBroadcastCollector = new EventCollector<any>();

      // Topic-based subscription
      const unsubChat = ch2.subscribe('chat', (event) => {
        chatCollector.add(event.payload);
      });

      // Type-based subscription (all broadcasts)
      const unsubAll = ch2.subscribe('broadcast', (event) => {
        allBroadcastCollector.add(
          `${event.topic}:${JSON.stringify(event.payload)}`,
        );
      });

      // Broadcast to 'chat' topic
      ch1.broadcast('chat', 'message1');
      await chatCollector.waitAndVerifyNthEvent(1, 'message1');

      // Broadcast to 'notification' topic
      ch1.broadcast('notification', 'message2');

      // Wait a bit for all events to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Chat collector should only have chat messages
      assert.equal(chatCollector.getLength(), 1);

      // All broadcast collector should have both
      assert.equal(allBroadcastCollector.getLength(), 2);

      unsubChat();
      unsubAll();
    }, task.name);
  });

  it('can attach a channel without activating the client', async function () {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    const channel = new yorkie.Channel(
      `${toDocKey('can attach a channel without activating the client')}-${Date.now()}`,
    );

    // No client.activate() call here.
    await client.attach(channel);

    // Within ~heartbeat interval the channel becomes attached and gets a
    // session_id from the server.
    await waitFor(() => channel.isAttached() && !!channel.getSessionID(), {
      timeout: 8000,
      message: 'channel did not finish first-call attach',
    });

    assert.isString(channel.getSessionID());
    assert.notStrictEqual(channel.getSessionID(), '');

    await client.detach(channel);
  });

  it('peers see count drop after detach within TTL window', async ({
    task,
  }) => {
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      await waitFor(
        () => ch1.getSessionCount() === 2 && ch2.getSessionCount() === 2,
      );
      await c2.detach(ch2);
      // TTL is 15 s and the server's cleanup interval is 10 s, so it can
      // take up to ~25 s before c1's heartbeat sees the lower count.
      await waitFor(() => ch1.getSessionCount() === 1, { timeout: 30000 });
    }, task.name);
  }, 45000);

  it('recovers transparently when the server forgets the session', async function ({
    task,
  }) {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    const channel = new yorkie.Channel(`${toDocKey(task.name)}-${Date.now()}`);
    await client.attach(channel);
    await waitFor(() => !!channel.getSessionID(), { timeout: 10000 });

    // Simulate server-side expiry by overwriting the channel's session_id
    // with a syntactically valid but unknown ID. The next refresh tick
    // should receive ErrSessionNotFound and silently re-attach.
    channel.setSessionID('000000000000000000000000');

    await waitFor(
      () =>
        !!channel.getSessionID() &&
        channel.getSessionID() !== '000000000000000000000000',
      {
        timeout: 15000,
        message: 'session was not re-issued after forced expiry',
      },
    );

    assert.notStrictEqual(channel.getSessionID(), '000000000000000000000000');
    await client.detach(channel);
  }, 30000);

  it('peekChannel works without client.activate()', async ({ task }) => {
    const channelKey = `${toDocKey(task.name)}-${Date.now()}`;
    const writer = new yorkie.Client({ rpcAddr: testRPCAddr });
    const writerChannel = new yorkie.Channel(channelKey);
    await writer.attach(writerChannel);
    await waitFor(() => !!writerChannel.getSessionID(), { timeout: 10000 });

    const peeker = new yorkie.Client({ rpcAddr: testRPCAddr });
    const count = await peeker.peekChannel(channelKey);
    assert.strictEqual(count, 1);

    await writer.detach(writerChannel);
  });
});

/**
 * `waitFor` polls `pred` until it returns truthy or `timeout` elapses.
 */
async function waitFor(
  pred: () => boolean,
  { timeout = 5000, interval = 100, message = 'waitFor timeout' } = {},
): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await new Promise((r) => setTimeout(r, interval));
  }
}
