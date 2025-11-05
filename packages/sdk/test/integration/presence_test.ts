import { describe, it, assert } from 'vitest';
import * as yorkie from '@yorkie-js/sdk/src/yorkie';
import { testRPCAddr } from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Presence', function () {
  it('single client presence counter test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();

    // Create presence counter
    const channelKey = `presence-${Date.now()}`;
    const channel = new yorkie.Channel(channelKey);

    // Test initial state
    assert.equal(channel.getKey(), channelKey);
    assert.equal(channel.getStatus(), 'detached');
    assert.isFalse(channel.isAttached());
    assert.equal(channel.getPresenceCount(), 0);

    // Attach presence counter
    await c1.attach(channel);

    // Verify attached state
    assert.equal(channel.getStatus(), 'attached');
    assert.isTrue(channel.isAttached());
    assert.equal(channel.getPresenceCount(), 1);

    // Detach presence counter
    await c1.detach(channel);

    // Verify detached state
    assert.equal(channel.getStatus(), 'detached');
    assert.isFalse(channel.isAttached());

    await c1.deactivate();
  });

  it('multiple clients presence counter test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();
    await c3.activate();

    // Create channels for the same room
    const channelKey = `presence-room-${Date.now()}`;
    const ch1 = new yorkie.Channel(channelKey);
    const ch2 = new yorkie.Channel(channelKey);
    const ch3 = new yorkie.Channel(channelKey);

    // First client attaches
    await c1.attach(ch1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ch1.getPresenceCount(), 1);

    // Second client attaches
    await c2.attach(ch2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ch2.getPresenceCount(), 2);

    // First client should receive the update
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ch1.getPresenceCount(), 2);

    // Third client attaches
    await c3.attach(ch3);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ch3.getPresenceCount(), 3);

    // Wait for all clients to sync
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ch1.getPresenceCount(), 3);
    assert.equal(ch2.getPresenceCount(), 3);

    // One client detaches
    await c2.detach(ch2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ch2.getPresenceCount(), 2);

    // Other clients should see the count decrease
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ch1.getPresenceCount(), 2);
    assert.equal(ch3.getPresenceCount(), 2);

    // Cleanup
    await c1.detach(ch1);
    await c3.detach(ch3);
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });

  it('presence event subscription test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    const channelKey = `presence-events-${Date.now()}`;
    const ch1 = new yorkie.Channel(channelKey);
    const ch2 = new yorkie.Channel(channelKey);

    // Track events on ch1
    const events: Array<{ type: string; count?: number }> = [];
    ch1.subscribe((event: yorkie.ChannelEvent) => {
      events.push({
        type: event.type,
        count:
          event.type === yorkie.ChannelEventType.PresenceChanged ||
          event.type === yorkie.ChannelEventType.Initialized
            ? event.count
            : undefined,
      });
    });

    // First client attaches
    await c1.attach(ch1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should receive initialized event
    assert.isAtLeast(events.length, 1);
    assert.equal(events[0].type, yorkie.ChannelEventType.Initialized);
    assert.equal(events[0].count, 1);

    // Second client attaches
    await c2.attach(ch2);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should receive count-changed event
    assert.isAtLeast(events.length, 2);
    assert.equal(
      events[events.length - 1].type,
      yorkie.ChannelEventType.PresenceChanged,
    );
    assert.equal(events[events.length - 1].count, 2);

    // Cleanup
    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('presence detach reduces count test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    const channelKey = `presence-detach-${Date.now()}`;
    const ch1 = new yorkie.Channel(channelKey);
    const ch2 = new yorkie.Channel(channelKey);

    // Both attach
    await c1.attach(ch1);
    await c2.attach(ch2);
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(ch1.getPresenceCount(), 2);
    assert.equal(ch2.getPresenceCount(), 2);

    // One detaches
    await c1.detach(ch1);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Detached channel should show updated count
    assert.equal(ch1.getPresenceCount(), 1);

    // Other channels should also see the decrease
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(ch2.getPresenceCount(), 1);

    // Cleanup
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('channel heartbeat keeps session alive', async function () {
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelHeartbeatInterval: 1000, // 1 second for faster testing
    });
    await c1.activate();

    const channelKey = `presence-heartbeat-${Date.now()}`;
    const channel = new yorkie.Channel(channelKey);

    // Attach presence
    await c1.attach(channel);
    assert.equal(channel.getPresenceCount(), 1);

    // Wait for 3 heartbeat cycles (3 seconds)
    // The presence should still be active because heartbeat refreshes TTL
    await new Promise((resolve) => setTimeout(resolve, 3500));

    // Verify presence is still active
    assert.isTrue(channel.isAttached());
    assert.equal(channel.getPresenceCount(), 1);

    // Cleanup
    await c1.detach(channel);
    await c1.deactivate();
  });

  it('presence manual sync mode test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    // Create presences for the same room
    const channelKey = `presence-manual-${Date.now()}`;
    const ch1 = new yorkie.Channel(channelKey);
    const ch2 = new yorkie.Channel(channelKey);

    // Attach client1 with manual sync mode (no watch stream)
    await c1.attach(ch1, { isRealtime: false });
    assert.equal(ch1.getPresenceCount(), 1);

    // Attach client2 with manual sync mode
    await c2.attach(ch2, { isRealtime: false });
    assert.equal(ch2.getPresenceCount(), 2);

    // In manual mode, p1's count doesn't update automatically
    // even though p2 was attached
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ch1.getPresenceCount(), 1, 'p1 should still be 1');

    // Must call sync() explicitly to refresh TTL and fetch latest count
    await c1.sync(ch1);
    assert.equal(ch1.getPresenceCount(), 2, 'p1 should update to 2 after sync');

    // Detach p2 and verify p1 doesn't auto-update
    await c2.detach(ch2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ch1.getPresenceCount(), 2, 'p1 should still be 2');

    // Sync to refresh TTL and fetch latest count after c2 detached
    await c1.sync(ch1);
    assert.equal(ch1.getPresenceCount(), 1, 'p1 should update to 1 after sync');

    // Cleanup
    await c1.detach(ch1);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('presence realtime vs manual mode comparison test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();
    await c3.activate();

    const channelKey = `presence-mode-compare-${Date.now()}`;
    const realtimeCh = new yorkie.Channel(channelKey);
    const manualCh = new yorkie.Channel(channelKey);
    const thirdCh = new yorkie.Channel(channelKey);

    // c1: Attach with realtime mode (default)
    await c1.attach(realtimeCh);
    assert.equal(realtimeCh.getPresenceCount(), 1);

    // c2: Attach with manual mode
    await c2.attach(manualCh, { isRealtime: false });
    assert.equal(manualCh.getPresenceCount(), 2);

    // c1's realtime presence should automatically receive the update
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(
      realtimeCh.getPresenceCount(),
      2,
      'realtime presence should auto-update',
    );

    // c2's manual presence doesn't receive updates
    assert.equal(
      manualCh.getPresenceCount(),
      2,
      'manual presence should not auto-update',
    );

    // c3: Attach another client
    await c3.attach(thirdCh, { isRealtime: false });
    assert.equal(thirdCh.getPresenceCount(), 3);

    // c1's realtime presence receives the update automatically
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(
      realtimeCh.getPresenceCount(),
      3,
      'realtime presence should be 3',
    );

    // c2's manual presence still doesn't update
    assert.equal(manualCh.getPresenceCount(), 2, 'manual presence should be 2');

    // Cleanup
    await c1.detach(realtimeCh);
    await c2.detach(manualCh);
    await c3.detach(thirdCh);
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });
});
