import { describe, it, assert } from 'vitest';
import { EventCollector } from '@yorkie-js/sdk/test/helper/helper';
import { withTwoClientsAndChannels } from '@yorkie-js/sdk/test/integration/integration_helper';

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
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      const presenceCollector = new EventCollector<any>();

      // Subscribe to 'presence' events
      const unsubPresence = ch2.subscribe('presence', (event) => {
        presenceCollector.add(event.count);
      });

      // Wait for presence events (at least 1)
      await new Promise((resolve) => {
        const checkPresence = () => {
          if (presenceCollector.getLength() > 0) {
            resolve(true);
          } else {
            setTimeout(checkPresence, 100);
          }
        };
        checkPresence();
      });

      // Verify we received presence count
      assert.isAbove(presenceCollector.getLength(), 0);

      unsubPresence();
    }, task.name);
  });

  it('should get presence count', async function ({ task }) {
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      // Wait a bit for presence to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get presence count
      const count1 = ch1.getPresenceCount();
      const count2 = ch2.getPresenceCount();

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
});
