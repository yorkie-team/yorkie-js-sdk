import { describe, it, assert } from 'vitest';
import * as yorkie from '@yorkie-js/sdk/src/yorkie';
import { testRPCAddr } from '@yorkie-js/sdk/test/integration/integration_helper';

/**
 * `waitForAttached` blocks until the channel's first RefreshChannel heartbeat
 * has populated the server-issued session_id and flipped status to Attached.
 * `client.attach(channel)` returns before this happens under the
 * RefreshChannel-only lifecycle.
 */
async function waitForAttached(
  channel: yorkie.Channel,
  { timeout = 8000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!channel.isAttached() || !channel.getSessionID()) {
    if (Date.now() > deadline) {
      throw new Error(
        `waitForAttached: ${channel.getKey()} did not attach (status=${channel.getStatus()}, sid=${channel.getSessionID() || 'empty'})`,
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * `waitForCount` polls `channel.getSessionCount()` until it matches `expected`
 * or `timeout` elapses. Used for peer-visibility checks that rely on the
 * server's TTL-based session reclamation + the next heartbeat.
 */
async function waitForCount(
  channel: yorkie.Channel,
  expected: number,
  { timeout = 25000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (channel.getSessionCount() !== expected) {
    if (Date.now() > deadline) {
      throw new Error(
        `waitForCount: ${channel.getKey()} got ${channel.getSessionCount()}, expected ${expected}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

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
    assert.equal(channel.getSessionCount(), 0);

    // Attach presence counter (returns before server-side attach completes)
    await c1.attach(channel);
    await waitForAttached(channel);

    // Verify attached state
    assert.equal(channel.getStatus(), 'attached');
    assert.isTrue(channel.isAttached());
    assert.equal(channel.getSessionCount(), 1);

    // Detach presence counter
    await c1.detach(channel);

    // Verify detached state
    assert.equal(channel.getStatus(), 'detached');
    assert.isFalse(channel.isAttached());

    await c1.deactivate();
  });

  // 45s: waits up to ~25s for cross-peer count drops via TTL reclamation.
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
    await waitForAttached(ch1);
    assert.equal(ch1.getSessionCount(), 1);

    // Second client attaches
    await c2.attach(ch2);
    await waitForAttached(ch2);
    assert.equal(ch2.getSessionCount(), 2);

    // First client should receive the update via Realtime watch stream
    await waitForCount(ch1, 2, { timeout: 8000 });

    // Third client attaches
    await c3.attach(ch3);
    await waitForAttached(ch3);
    assert.equal(ch3.getSessionCount(), 3);

    // Wait for the other Realtime peers to observe count=3
    await waitForCount(ch1, 3, { timeout: 8000 });
    await waitForCount(ch2, 3, { timeout: 8000 });

    // One client detaches (local-only under the new lifecycle; peers learn
    // about it via the server's TTL-driven session reclamation + the next
    // heartbeat). Don't assert on ch2's own count — it's detached and
    // carries the last-seen value.
    await c2.detach(ch2);

    // Other clients should see the count decrease within the TTL window
    await waitForCount(ch1, 2);
    await waitForCount(ch3, 2);

    // Cleanup
    await c1.detach(ch1);
    await c3.detach(ch3);
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  }, 45000);

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
    await waitForAttached(ch1);

    // Under the RefreshChannel-only lifecycle the first heartbeat fires
    // before the watch stream opens, so the first event is a
    // `PresenceChanged` from the heartbeat response. (Previously it was
    // `Initialized` from the watch stream's initial resourceInits batch.)
    assert.isAtLeast(events.length, 1);
    const firstEvent = events[0];
    assert.oneOf(firstEvent.type, [
      yorkie.ChannelEventType.PresenceChanged,
      yorkie.ChannelEventType.Initialized,
    ]);
    assert.equal(firstEvent.count, 1);

    // Second client attaches
    await c2.attach(ch2);
    await waitForAttached(ch2);
    await waitForCount(ch1, 2, { timeout: 8000 });

    // Should have observed the count transition to 2
    const presenceEvents = events.filter(
      (e) => e.type === yorkie.ChannelEventType.PresenceChanged,
    );
    assert.isAtLeast(presenceEvents.length, 1);
    assert.equal(presenceEvents[presenceEvents.length - 1].count, 2);

    // Cleanup
    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  }, 15000);

  // 45s: cross-peer count drop after detach goes through the server's
  // 15s TTL + ~10s cleanup interval.
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
    await waitForAttached(ch1);
    await waitForAttached(ch2);
    await waitForCount(ch1, 2, { timeout: 8000 });
    await waitForCount(ch2, 2, { timeout: 8000 });

    // One detaches (local-only; peers learn via TTL + heartbeat)
    await c1.detach(ch1);

    // Other channels should see the decrease once the server reclaims
    // c1's session and ch2's next heartbeat returns the updated count.
    await waitForCount(ch2, 1);

    // Cleanup
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  }, 45000);

  // 30s: includes a 3.5s sleep across heartbeat cycles + waitForAttached.
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
    await waitForAttached(channel);
    assert.equal(channel.getSessionCount(), 1);

    // Wait for 3 heartbeat cycles (3 seconds)
    // The presence should still be active because heartbeat refreshes TTL
    await new Promise((resolve) => setTimeout(resolve, 3500));

    // Verify presence is still active
    assert.isTrue(channel.isAttached());
    assert.equal(channel.getSessionCount(), 1);

    // Cleanup
    await c1.detach(channel);
    await c1.deactivate();
  }, 30000);

  // 60s: includes a 25s poll-sync loop after a manual-mode peer detaches
  // (the server reclaims the orphaned session via TTL).
  it('presence manual sync mode test', async function () {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    // Create presences for the same room
    const channelKey = `presence-manual-${Date.now()}`;
    const ch1 = new yorkie.Channel(channelKey);
    const ch2 = new yorkie.Channel(channelKey);

    // Attach client1 with manual sync mode (no watch stream). Manual mode
    // does not auto-refresh, so we must call sync() once to trigger the
    // first RefreshChannel and populate sessionCount.
    await c1.attach(ch1, { syncMode: yorkie.SyncMode.Manual });
    await c1.sync(ch1);
    assert.equal(ch1.getSessionCount(), 1);

    // Attach client2 with manual sync mode
    await c2.attach(ch2, { syncMode: yorkie.SyncMode.Manual });
    await c2.sync(ch2);
    assert.equal(ch2.getSessionCount(), 2);

    // In manual mode, p1's count doesn't update automatically
    // even though p2 was attached
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ch1.getSessionCount(), 1, 'p1 should still be 1');

    // Must call sync() explicitly to refresh TTL and fetch latest count
    await c1.sync(ch1);
    assert.equal(ch1.getSessionCount(), 2, 'p1 should update to 2 after sync');

    // Detach p2 and verify p1 doesn't auto-update
    await c2.detach(ch2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ch1.getSessionCount(), 2, 'p1 should still be 2');

    // Under the RefreshChannel-only lifecycle, `c2.detach(ch2)` is purely
    // local — the server reclaims c2's session only after its TTL elapses
    // (~15s). A single `c1.sync(ch1)` right after detach still observes 2.
    // Poll-sync until the server count drops to 1.
    const dropDeadline = Date.now() + 25000;
    while (ch1.getSessionCount() !== 1) {
      if (Date.now() > dropDeadline) {
        throw new Error(
          `manual-mode peer did not observe count drop within TTL window (got ${ch1.getSessionCount()})`,
        );
      }
      await c1.sync(ch1);
      if (ch1.getSessionCount() === 1) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal(ch1.getSessionCount(), 1, 'p1 eventually observes 1');

    // Cleanup
    await c1.detach(ch1);
    await c1.deactivate();
    await c2.deactivate();
  }, 60000);

  // 30s: realtime peer needs up to ~8s per cross-mode count transition.
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
    await waitForAttached(realtimeCh);
    assert.equal(realtimeCh.getSessionCount(), 1);

    // c2: Attach with manual mode. Manual mode skips auto-refresh; need an
    // explicit sync() to populate sessionCount and complete first-call.
    await c2.attach(manualCh, { syncMode: yorkie.SyncMode.Manual });
    await c2.sync(manualCh);
    assert.equal(manualCh.getSessionCount(), 2);

    // c1's realtime presence should automatically receive the update
    await waitForCount(realtimeCh, 2, { timeout: 8000 });
    assert.equal(
      realtimeCh.getSessionCount(),
      2,
      'realtime presence should auto-update',
    );

    // c2's manual presence doesn't receive updates
    assert.equal(
      manualCh.getSessionCount(),
      2,
      'manual presence should not auto-update',
    );

    // c3: Attach another client (manual mode)
    await c3.attach(thirdCh, { syncMode: yorkie.SyncMode.Manual });
    await c3.sync(thirdCh);
    assert.equal(thirdCh.getSessionCount(), 3);

    // c1's realtime presence receives the update automatically
    await waitForCount(realtimeCh, 3, { timeout: 8000 });
    assert.equal(
      realtimeCh.getSessionCount(),
      3,
      'realtime presence should be 3',
    );

    // c2's manual presence still doesn't update
    assert.equal(manualCh.getSessionCount(), 2, 'manual presence should be 2');

    // Cleanup
    await c1.detach(realtimeCh);
    await c2.detach(manualCh);
    await c3.detach(thirdCh);
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  }, 30000);
});
