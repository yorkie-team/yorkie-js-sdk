import { describe, it, assert } from 'vitest';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import {
  toDocKey,
  testRPCAddr,
} from '@yorkie-js/sdk/test/integration/integration_helper';

/**
 * `waitUntil` polls the predicate until it returns true or the deadline
 * passes. Returns the elapsed time so tests can assert on convergence speed.
 */
async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  pollMs = 20,
): Promise<number> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitUntil: predicate did not become true within ${timeoutMs}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return Date.now() - start;
}

describe('Channel', function () {
  it('starts polling on attach and converges session count', async function ({
    task,
  }) {
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    await c1.activate();
    await c2.activate();

    const key = `${toDocKey(task.name)}-${Date.now()}`;
    const ch1 = new yorkie.Channel(key);
    const ch2 = new yorkie.Channel(key);

    await c1.attach(ch1);
    assert.isTrue(ch1.isAttached(), 'ch1 must be attached after attach()');
    assert.equal(ch1.getSessionCount(), 1, 'initial session count is 1');

    await c2.attach(ch2);

    // c1's polling loop must pick up c2's session within a few polls.
    await waitUntil(() => ch1.getSessionCount() === 2, 2000);
    assert.equal(ch1.getSessionCount(), 2);

    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('stops polling on detach (no further session count updates)', async function ({
    task,
  }) {
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    await c1.activate();
    await c2.activate();

    const key = `${toDocKey(task.name)}-${Date.now()}`;
    const ch1 = new yorkie.Channel(key);
    const ch2 = new yorkie.Channel(key);

    await c1.attach(ch1);
    await c2.attach(ch2);
    await waitUntil(() => ch1.getSessionCount() === 2, 2000);

    await c1.detach(ch1);
    assert.isFalse(ch1.isAttached(), 'ch1 must be detached');
    const countAtDetach = ch1.getSessionCount();

    // c2 stays attached; the server-side count would still be 1, but ch1's
    // local count must not change after detach because polling stopped.
    await new Promise((r) => setTimeout(r, 500)); // ~5 polling intervals
    assert.equal(
      ch1.getSessionCount(),
      countAtDetach,
      'session count must not change after detach (poll loop stopped)',
    );

    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('re-attach after detach starts a fresh polling loop', async function ({
    task,
  }) {
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    await c1.activate();
    await c2.activate();

    const key = `${toDocKey(task.name)}-${Date.now()}`;
    const ch1a = new yorkie.Channel(key);
    const ch1b = new yorkie.Channel(key);
    const ch2 = new yorkie.Channel(key);

    await c1.attach(ch1a);
    await c2.attach(ch2);
    await waitUntil(() => ch1a.getSessionCount() === 2, 2000);

    await c1.detach(ch1a);
    await c1.attach(ch1b);
    assert.isTrue(ch1b.isAttached(), 'fresh channel must be attached');

    // New polling loop on ch1b must converge.
    await waitUntil(() => ch1b.getSessionCount() === 2, 2000);
    assert.equal(ch1b.getSessionCount(), 2);

    await c1.detach(ch1b);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('multiple channels on the same client poll independently', async function ({
    task,
  }) {
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 100,
    });
    await c1.activate();
    await c2.activate();

    const stamp = Date.now();
    const keyA = `${toDocKey(task.name)}-a-${stamp}`;
    const keyB = `${toDocKey(task.name)}-b-${stamp}`;
    const chA1 = new yorkie.Channel(keyA);
    const chA2 = new yorkie.Channel(keyA);
    const chB1 = new yorkie.Channel(keyB);

    await c1.attach(chA1);
    await c1.attach(chB1);
    await c2.attach(chA2);

    // chA1 is shared with c2 — must converge to 2.
    await waitUntil(() => chA1.getSessionCount() === 2, 2000);
    assert.equal(chA1.getSessionCount(), 2);

    // chB1 has no peer — must stay at 1.
    assert.equal(
      chB1.getSessionCount(),
      1,
      'unshared channel must remain at session count 1',
    );

    await c1.detach(chA1);
    await c1.detach(chB1);
    await c2.detach(chA2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('respects custom channelPollInterval option', async function ({ task }) {
    // Short interval (60ms ± 20% jitter = 48-72ms) means session count
    // must converge well under the 3000ms default poll interval.
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 60,
    });
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      channelPollInterval: 60,
    });
    await c1.activate();
    await c2.activate();

    const key = `${toDocKey(task.name)}-${Date.now()}`;
    const ch1 = new yorkie.Channel(key);
    const ch2 = new yorkie.Channel(key);

    await c1.attach(ch1);
    await c2.attach(ch2);

    const elapsed = await waitUntil(() => ch1.getSessionCount() === 2, 800);
    assert.equal(ch1.getSessionCount(), 2);
    assert.isBelow(
      elapsed,
      800,
      'short channelPollInterval must converge faster than default',
    );

    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });
});
