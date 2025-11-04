import { describe, it, assert } from 'vitest';
import * as yorkie from '@yorkie-js/sdk/src/yorkie';
import { testRPCAddr } from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Presence', function () {
  it('single client presence counter test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();

    // Create presence counter
    const presenceKey = `presence-${Date.now()}`;
    const counter = new yorkie.Presence(presenceKey);

    // Test initial state
    assert.equal(counter.getKey(), presenceKey);
    assert.equal(counter.getStatus(), 'detached');
    assert.isFalse(counter.isAttached());
    assert.equal(counter.getCount(), 0);

    // Attach presence counter
    await c1.attach(counter);

    // Verify attached state
    assert.equal(counter.getStatus(), 'attached');
    assert.isTrue(counter.isAttached());
    assert.equal(counter.getCount(), 1);

    // Detach presence counter
    await c1.detach(counter);

    // Verify detached state
    assert.equal(counter.getStatus(), 'detached');
    assert.isFalse(counter.isAttached());

    await c1.deactivate();
  });

  it('multiple clients presence counter test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();
    await c3.activate();

    // Create presences for the same room
    const presenceKey = `presence-room-${Date.now()}`;
    const p1 = new yorkie.Presence(presenceKey);
    const p2 = new yorkie.Presence(presenceKey);
    const p3 = new yorkie.Presence(presenceKey);

    // First client attaches
    await c1.attach(p1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(p1.getCount(), 1);

    // Second client attaches
    await c2.attach(p2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(p2.getCount(), 2);

    // First client should receive the update
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(p1.getCount(), 2);

    // Third client attaches
    await c3.attach(p3);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(p3.getCount(), 3);

    // Wait for all clients to sync
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(p1.getCount(), 3);
    assert.equal(p2.getCount(), 3);

    // One client detaches
    await c2.detach(p2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(p2.getCount(), 2);

    // Other clients should see the count decrease
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(p1.getCount(), 2);
    assert.equal(p3.getCount(), 2);

    // Cleanup
    await c1.detach(p1);
    await c3.detach(p3);
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });

  it('presence event subscription test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    const presenceKey = `presence-events-${Date.now()}`;
    const p1 = new yorkie.Presence(presenceKey);
    const p2 = new yorkie.Presence(presenceKey);

    // Track events on p1
    const events: Array<{ type: string; count?: number }> = [];
    p1.subscribe((event: yorkie.PresenceEvent) => {
      events.push({
        type: event.type,
        count:
          event.type === yorkie.PresenceEventType.Changed ||
          event.type === yorkie.PresenceEventType.Initialized
            ? event.count
            : undefined,
      });
    });

    // First client attaches
    await c1.attach(p1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should receive initialized event
    assert.isAtLeast(events.length, 1);
    assert.equal(events[0].type, yorkie.PresenceEventType.Initialized);
    assert.equal(events[0].count, 1);

    // Second client attaches
    await c2.attach(p2);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should receive count-changed event
    assert.isAtLeast(events.length, 2);
    assert.equal(
      events[events.length - 1].type,
      yorkie.PresenceEventType.Changed,
    );
    assert.equal(events[events.length - 1].count, 2);

    // Cleanup
    await c1.detach(p1);
    await c2.detach(p2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('presence detach reduces count test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    const presenceKey = `presence-detach-${Date.now()}`;
    const p1 = new yorkie.Presence(presenceKey);
    const p2 = new yorkie.Presence(presenceKey);

    // Both attach
    await c1.attach(p1);
    await c2.attach(p2);
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(p1.getCount(), 2);
    assert.equal(p2.getCount(), 2);

    // One detaches
    await c1.detach(p1);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Detached presence should show updated count
    assert.equal(p1.getCount(), 1);

    // Other presence should also see the decrease
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(p2.getCount(), 1);

    // Cleanup
    await c2.detach(p2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('presence heartbeat keeps session alive', async function () {
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      presenceHeartbeatInterval: 1000, // 1 second for faster testing
    });
    await c1.activate();

    const presenceKey = `presence-heartbeat-${Date.now()}`;
    const presence = new yorkie.Presence(presenceKey);

    // Attach presence
    await c1.attach(presence);
    assert.equal(presence.getCount(), 1);

    // Wait for 3 heartbeat cycles (3 seconds)
    // The presence should still be active because heartbeat refreshes TTL
    await new Promise((resolve) => setTimeout(resolve, 3500));

    // Verify presence is still active
    assert.isTrue(presence.isAttached());
    assert.equal(presence.getCount(), 1);

    // Cleanup
    await c1.detach(presence);
    await c1.deactivate();
  });

  it('presence manual sync mode test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    // Create presences for the same room
    const presenceKey = `presence-manual-${Date.now()}`;
    const p1 = new yorkie.Presence(presenceKey);
    const p2 = new yorkie.Presence(presenceKey);

    // Attach client1 with manual sync mode (no watch stream)
    await c1.attach(p1, { isRealtime: false });
    assert.equal(p1.getCount(), 1);

    // Attach client2 with manual sync mode
    await c2.attach(p2, { isRealtime: false });
    assert.equal(p2.getCount(), 2);

    // In manual mode, p1's count doesn't update automatically
    // even though p2 was attached
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(p1.getCount(), 1, 'p1 should still be 1');

    // Must call sync() explicitly to refresh TTL and fetch latest count
    await c1.sync(p1);
    assert.equal(p1.getCount(), 2, 'p1 should update to 2 after sync');

    // Detach p2 and verify p1 doesn't auto-update
    await c2.detach(p2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(p1.getCount(), 2, 'p1 should still be 2');

    // Sync to refresh TTL and fetch latest count after c2 detached
    await c1.sync(p1);
    assert.equal(p1.getCount(), 1, 'p1 should update to 1 after sync');

    // Cleanup
    await c1.detach(p1);
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

    const presenceKey = `presence-mode-compare-${Date.now()}`;
    const realtimePresence = new yorkie.Presence(presenceKey);
    const manualPresence = new yorkie.Presence(presenceKey);
    const thirdPresence = new yorkie.Presence(presenceKey);

    // c1: Attach with realtime mode (default)
    await c1.attach(realtimePresence);
    assert.equal(realtimePresence.getCount(), 1);

    // c2: Attach with manual mode
    await c2.attach(manualPresence, { isRealtime: false });
    assert.equal(manualPresence.getCount(), 2);

    // c1's realtime presence should automatically receive the update
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(
      realtimePresence.getCount(),
      2,
      'realtime presence should auto-update',
    );

    // c2's manual presence doesn't receive updates
    assert.equal(
      manualPresence.getCount(),
      2,
      'manual presence should not auto-update',
    );

    // c3: Attach another client
    await c3.attach(thirdPresence, { isRealtime: false });
    assert.equal(thirdPresence.getCount(), 3);

    // c1's realtime presence receives the update automatically
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(
      realtimePresence.getCount(),
      3,
      'realtime presence should be 3',
    );

    // c2's manual presence still doesn't update
    assert.equal(manualPresence.getCount(), 2, 'manual presence should be 2');

    // Cleanup
    await c1.detach(realtimePresence);
    await c2.detach(manualPresence);
    await c3.detach(thirdPresence);
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });
});
