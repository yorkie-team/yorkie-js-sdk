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

    // Create presence counters for the same room
    const presenceKey = `presence-room-${Date.now()}`;
    const counter1 = new yorkie.Presence(presenceKey);
    const counter2 = new yorkie.Presence(presenceKey);
    const counter3 = new yorkie.Presence(presenceKey);

    // First client attaches
    await c1.attach(counter1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counter1.getCount(), 1);

    // Second client attaches
    await c2.attach(counter2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counter2.getCount(), 2);

    // First client should receive the update
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counter1.getCount(), 2);

    // Third client attaches
    await c3.attach(counter3);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counter3.getCount(), 3);

    // Wait for all clients to sync
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counter1.getCount(), 3);
    assert.equal(counter2.getCount(), 3);

    // One client detaches
    await c2.detach(counter2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counter2.getCount(), 2);

    // Other clients should see the count decrease
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counter1.getCount(), 2);
    assert.equal(counter3.getCount(), 2);

    // Cleanup
    await c1.detach(counter1);
    await c3.detach(counter3);
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });

  it('presence counter event subscription test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    const presenceKey = `presence-events-${Date.now()}`;
    const counter1 = new yorkie.Presence(presenceKey);
    const counter2 = new yorkie.Presence(presenceKey);

    // Track events on counter1
    const events: Array<{ type: string; count: number }> = [];
    counter1.subscribe((event: yorkie.PresenceEvent) => {
      events.push({ type: event.type, count: event.count });
    });

    // First client attaches
    await c1.attach(counter1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should receive initialized event
    assert.isAtLeast(events.length, 1);
    assert.equal(events[0].type, yorkie.PresenceEventType.Initialized);
    assert.equal(events[0].count, 1);

    // Second client attaches
    await c2.attach(counter2);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should receive count-changed event
    assert.isAtLeast(events.length, 2);
    assert.equal(
      events[events.length - 1].type,
      yorkie.PresenceEventType.Changed,
    );
    assert.equal(events[events.length - 1].count, 2);

    // Cleanup
    await c1.detach(counter1);
    await c2.detach(counter2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('presence counter detach reduces count test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    const presenceKey = `presence-detach-${Date.now()}`;
    const counter1 = new yorkie.Presence(presenceKey);
    const counter2 = new yorkie.Presence(presenceKey);

    // Both attach
    await c1.attach(counter1);
    await c2.attach(counter2);
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(counter1.getCount(), 2);
    assert.equal(counter2.getCount(), 2);

    // One detaches
    await c1.detach(counter1);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Detached counter should show updated count
    assert.equal(counter1.getCount(), 1);

    // Other counter should also see the decrease
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(counter2.getCount(), 1);

    // Cleanup
    await c2.detach(counter2);
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
    const counter = new yorkie.Presence(presenceKey);

    // Attach presence counter
    await c1.attach(counter);
    assert.equal(counter.getCount(), 1);

    // Wait for 3 heartbeat cycles (3 seconds)
    // The presence should still be active because heartbeat refreshes TTL
    await new Promise((resolve) => setTimeout(resolve, 3500));

    // Verify presence is still active
    assert.isTrue(counter.isAttached());
    assert.equal(counter.getCount(), 1);

    // Cleanup
    await c1.detach(counter);
    await c1.deactivate();
  });
});
