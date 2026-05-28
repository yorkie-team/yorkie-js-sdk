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
    try {
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
    } finally {
      await c.deactivate();
    }
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
    try {
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
    } finally {
      await c1.deactivate();
      await c2.deactivate();
    }
  });

  it('Opt-out clients keep per-Change VV at size 1 under multi-actor fanout', async function ({
    task,
  }) {
    // Regression for the bug where Change.ID.versionVector accumulated
    // O(num_actors) entries on every opt-out client because applyChange
    // -> syncClocks merged every remote actor into the local VV. After
    // the syncLamport fix the per-Change VV must stay at size 1 so the
    // on-the-wire savings the opt-out promises actually materialize.
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ counter: Counter }>(docKey);
    const d2 = new yorkie.Document<{ counter: Counter }>(docKey);
    const d3 = new yorkie.Document<{ counter: Counter }>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c3.activate();
    try {
      await c1.attach(d1, { syncMode: SyncMode.Manual, disableGC: true });
      await c2.attach(d2, { syncMode: SyncMode.Manual, disableGC: true });
      await c3.attach(d3, { syncMode: SyncMode.Manual, disableGC: true });

      d1.update((root) => {
        root.counter = new Counter(0);
      });
      await c1.sync();
      await c2.sync();
      await c3.sync();

      for (let round = 0; round < 3; round++) {
        d1.update((root) => root.counter.increase(1));
        d2.update((root) => root.counter.increase(1));
        d3.update((root) => root.counter.increase(1));
        await c1.sync();
        await c2.sync();
        await c3.sync();
      }
      // Drain remaining pushed changes so every client sees them.
      await c1.sync();
      await c2.sync();
      await c3.sync();
      await c1.sync();

      assert.equal(d1.getRoot().counter.getValue(), 9);
      assert.equal(d2.getRoot().counter.getValue(), 9);
      assert.equal(d3.getRoot().counter.getValue(), 9);

      // The contract assertion: every opt-out doc's VV stays at size 1.
      for (const [i, d] of [d1, d2, d3].entries()) {
        assert.equal(
          d.getVersionVector().size(),
          1,
          `opt-out doc[${i}].versionVector must stay at size 1`,
        );
      }
    } finally {
      await c1.deactivate();
      await c2.deactivate();
      await c3.deactivate();
    }
  });

  it('Opt-out client picks up server lamport when attach returns a snapshot', async function ({
    task,
  }) {
    // Latent issue: server/packs/pushpull.go used to nil the response
    // VV for opt-out clients even on snapshot pulls, which prevented the
    // client's change clock from catching up to the server's actual
    // state. With the server fix (single-entry VV for opt-out snapshot
    // responses), the lamport must advance to at least the server's max.
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    // SnapshotThreshold is project-wide; default in the dev server is
    // small enough that this many writes will trigger a snapshot.
    const docA = new yorkie.Document<Record<string, number>>(docKey);
    const cA = new yorkie.Client({ rpcAddr: testRPCAddr });
    await cA.activate();
    try {
      await cA.attach(docA, { syncMode: SyncMode.Manual });
      for (let i = 0; i < 30; i++) {
        docA.update((root) => {
          root[`k${i}`] = i;
        });
      }
      await cA.sync();

      // docB attaches with opt-out; the pull crosses the snapshot
      // threshold so the response is a snapshot.
      const docB = new yorkie.Document<{ counter: Counter }>(docKey);
      const cB = new yorkie.Client({ rpcAddr: testRPCAddr });
      await cB.activate();
      try {
        await cB.attach(docB, {
          syncMode: SyncMode.Manual,
          disableGC: true,
        });

        // After a snapshot pull on an opt-out client, lamport must be
        // at least the count of remote operations the snapshot subsumed.
        // We use 30 as a conservative lower bound for the 30 updates
        // docA pushed; if the lamport bug were still present, docB's
        // lamport would be 1.
        assert.isAtLeast(
          Number(docB.getChangeID().getLamport()),
          30,
          'opt-out client must catch up to server lamport via snapshot',
        );
        assert.equal(
          docB.getVersionVector().size(),
          1,
          'opt-out doc.VV must stay size 1 after snapshot pull',
        );
      } finally {
        await cB.deactivate();
      }
    } finally {
      await cA.deactivate();
    }
  });

  it('Re-attach without disableGC restores normal sync behavior', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();
    try {
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
    } finally {
      await c.deactivate();
    }
  });
});
