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

import { describe, it, assert } from 'vitest';
import yorkie, { SyncMode, Channel } from '@yorkie-js/sdk/src/yorkie';
import { YorkieError } from '@yorkie-js/sdk/src/util/error';
import {
  toDocKey,
  testRPCAddr,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import { assertThrowsAsync } from '@yorkie-js/sdk/test/helper/helper';

describe('Channel Polling', function () {
  it('Polling mode reflects sessionCount via heartbeat without a watch stream', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const ch1 = new Channel(channelKey);
    const ch2 = new Channel(channelKey);

    // c1 attaches in Polling mode with a 200ms heartbeat for fast test.
    await c1.attachChannel(ch1, {
      syncMode: SyncMode.Polling,
      channelHeartbeatInterval: 200,
    });
    await c2.attachChannel(ch2);

    // Wait for at least one polling tick.
    await new Promise((r) => setTimeout(r, 500));

    assert.isAtLeast(ch1.getSessionCount(), 2);
    assert.isAtLeast(ch2.getSessionCount(), 2);

    await c1.detachChannel(ch1);
    await c2.detachChannel(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Polling mode does not open a watch stream', async function ({ task }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;
    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);
    let watchCalled = false;
    const origWatch = (c as any).rpcClient.watch.bind((c as any).rpcClient);
    (c as any).rpcClient.watch = (...args: Array<any>) => {
      watchCalled = true;
      return origWatch(...args);
    };

    await c.attachChannel(ch, { syncMode: SyncMode.Polling });
    await new Promise((r) => setTimeout(r, 100));
    assert.isFalse(watchCalled);

    await c.detachChannel(ch);
    await c.deactivate();
  });

  it('Polling notifies subscribers when sessionCount changes', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const ch1 = new Channel(channelKey);
    await c1.attachChannel(ch1, {
      syncMode: SyncMode.Polling,
      channelHeartbeatInterval: 200,
    });

    const observed: Array<number> = [];
    const unsub = ch1.subscribe('presence', (event) => {
      observed.push(event.count);
    });

    // Second client joins; the first client is in Polling mode and should
    // observe the count change via its heartbeat refresh, not a watch event.
    const ch2 = new Channel(channelKey);
    await c2.attachChannel(ch2);

    // Wait for at least one poll tick to deliver the new count.
    await new Promise((r) => setTimeout(r, 600));

    assert.isAtLeast(observed.length, 1);
    assert.isAtLeast(observed[observed.length - 1], 2);

    unsub();
    await c1.detachChannel(ch1);
    await c2.detachChannel(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('changeSyncMode transitions Realtime ↔ Polling for channels', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);
    // Do NOT pin channelHeartbeatInterval — we want changeSyncMode to
    // re-resolve the default (Polling → 3000) so we can verify that path.
    await c.attachChannel(ch, { syncMode: SyncMode.Realtime });

    // Switch to Polling. Default re-resolves to 3000 (because pinned=false).
    await c.changeSyncMode(ch, SyncMode.Polling);
    const att = (c as any).attachmentMap.get(ch.getKey());
    assert.equal(att.pollInterval, 3000);
    // Override to a fast interval so the test runs quickly.
    att.pollInterval = 200;

    await new Promise((r) => setTimeout(r, 500));
    const beforeSwitch = ch.getSessionCount();
    assert.isAtLeast(beforeSwitch, 1);

    // Switch back to Realtime.
    await c.changeSyncMode(ch, SyncMode.Realtime);

    await c.detach(ch);
    await c.deactivate();
  });

  it('Polling channel does not receive broadcast events', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const ch1 = new Channel(channelKey);
    const ch2 = new Channel(channelKey);

    // c2 is Polling — should not receive broadcast.
    await c2.attachChannel(ch2, {
      syncMode: SyncMode.Polling,
      channelHeartbeatInterval: 200,
    });
    await c1.attachChannel(ch1, { syncMode: SyncMode.Realtime });

    let received = false;
    ch2.subscribe('chat', () => {
      received = true;
    });

    ch1.broadcast('chat', { msg: 'hello' });
    await new Promise((r) => setTimeout(r, 500));

    assert.isFalse(received);

    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('attachChannel rejects RealtimePushOnly with ErrInvalidArgument', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);
    try {
      await assertThrowsAsync(
        () => c.attachChannel(ch, { syncMode: SyncMode.RealtimePushOnly }),
        YorkieError,
        'invalid channel sync mode',
      );
    } finally {
      await c.deactivate();
    }
  });

  it('attachChannel rejects RealtimeSyncOff with ErrInvalidArgument', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);
    try {
      await assertThrowsAsync(
        () => c.attachChannel(ch, { syncMode: SyncMode.RealtimeSyncOff }),
        YorkieError,
        'invalid channel sync mode',
      );
    } finally {
      await c.deactivate();
    }
  });

  it('changeSyncMode rejects RealtimePushOnly for channels', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);
    await c.attachChannel(ch, { syncMode: SyncMode.Realtime });

    try {
      await assertThrowsAsync(
        () => c.changeSyncMode(ch, SyncMode.RealtimePushOnly),
        YorkieError,
        'invalid channel sync mode',
      );
    } finally {
      await c.detach(ch);
      await c.deactivate();
    }
  });

  it('attachChannel rejects channelHeartbeatInterval: 0', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);
    try {
      await assertThrowsAsync(
        () => c.attachChannel(ch, { channelHeartbeatInterval: 0 }),
        YorkieError,
        'channelHeartbeatInterval must be greater than 0',
      );
    } finally {
      await c.deactivate();
    }
  });
});
