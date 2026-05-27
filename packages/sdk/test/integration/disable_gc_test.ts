/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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
import yorkie, { Counter, SyncMode } from '@yorkie-js/sdk/src/yorkie';
import {
  toDocKey,
  testRPCAddr,
} from '@yorkie-js/sdk/test/integration/integration_helper';

/**
 * Server-side semantics (skip minVV write, omit response VV) are validated
 * in the yorkie repo's integration tests. These tests verify that the
 * SDK-side option is wired through correctly: the option compiles, attach
 * accepts it, sync sends the field, and counter values still converge in
 * mixed-mode use.
 */
describe('disableGC attach option', function () {
  it('Can attach a Counter document with disableGC and sync without error', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ counter: Counter }>(docKey);

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();
    await c.attach(doc, {
      syncMode: SyncMode.Manual,
      disableGC: true,
    });

    doc.update((root) => {
      root.counter = new Counter(0);
      root.counter.increase(1);
    });
    await c.sync();
    assert.equal(doc.getRoot().counter.getValue(), 1);

    await c.detach(doc);
    await c.deactivate();
  });

  it('Mixed opt-in and opt-out clients converge on the Counter value', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ counter: Counter }>(docKey);
    const d2 = new yorkie.Document<{ counter: Counter }>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    d1.update((root) => {
      root.counter = new Counter(0);
    });
    await c1.sync();

    await c2.attach(d2, {
      syncMode: SyncMode.Manual,
      disableGC: true,
    });

    d1.update((root) => root.counter.increase(1));
    d2.update((root) => root.counter.increase(1));

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().counter.getValue(), 2);
    assert.equal(d2.getRoot().counter.getValue(), 2);

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Re-attach without disableGC restores normal sync behavior', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    // First attach: opt-out.
    const d1 = new yorkie.Document<{ counter: Counter }>(docKey);
    await c.attach(d1, { syncMode: SyncMode.Manual, disableGC: true });
    d1.update((root) => {
      root.counter = new Counter(0);
      root.counter.increase(1);
    });
    await c.sync();
    await c.detach(d1);

    // Re-attach without the option. The SDK reads the flag from the
    // attachment, so this PushPull omits disableGC.
    const d2 = new yorkie.Document<{ counter: Counter }>(docKey);
    await c.attach(d2, { syncMode: SyncMode.Manual });
    d2.update((root) => root.counter.increase(1));
    await c.sync();
    assert.equal(d2.getRoot().counter.getValue(), 2);

    await c.detach(d2);
    await c.deactivate();
  });
});
