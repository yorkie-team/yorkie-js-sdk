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
 * End-to-end coverage for the disablePresence Document option paired with
 * yorkie-team/yorkie#1841. The wire send/receive call sites in client.ts
 * are currently parked behind TODO(yorkie/disable_presence); these tests
 * are left in a failing state intentionally so the gap is visible on the
 * PR until the server PR merges and a release ships disable_presence
 * end-to-end. CI red here is the explicit "do not merge this PR until
 * the server release lands" signal — it is not a regression in the
 * committed SDK code.
 *
 * Once the server side is released and the TODO markers are flipped to
 * forward DisablePresence over the wire, these assertions should start
 * passing and the file becomes a normal integration test.
 */
describe('disablePresence attach option', function () {
  it('First attach fixates disable_presence on DocInfo', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ counter: Counter }>(docKey, {
      disableGC: true,
      disablePresence: true,
    });

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();
    try {
      await c.attach(doc, {
        syncMode: SyncMode.Manual,
        disableGC: true,
        disablePresence: true,
      });

      // The SDK reads back the server-fixated flag from the attach
      // response; until the server release ships the field this stays
      // false and the assertion fails (intentional, see file header).
      assert.equal(
        doc.isPresenceDisabled(),
        true,
        'first attach with disablePresence must observe the server-fixated true',
      );
    } finally {
      await c.deactivate();
    }
  });

  it('Late attacher without the option observes the persisted value', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ counter: Counter }>(docKey, {
      disableGC: true,
      disablePresence: true,
    });
    const d2 = new yorkie.Document<{ counter: Counter }>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    try {
      // First attach fixates the document as presenceless.
      await c1.attach(d1, {
        syncMode: SyncMode.Manual,
        disableGC: true,
        disablePresence: true,
      });

      // Second client attaches without the option but should observe
      // the server-fixated true.
      await c2.attach(d2, { syncMode: SyncMode.Manual });

      assert.equal(
        d2.isPresenceDisabled(),
        true,
        'late attacher must observe the server-fixated value (true)',
      );
    } finally {
      await c1.deactivate();
      await c2.deactivate();
    }
  });

  it('Presence emits from any client are stripped on a presenceless doc', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const dOwner = new yorkie.Document<{ counter: Counter }, { name: string }>(
      docKey,
      { disableGC: true, disablePresence: true },
    );
    const dOther = new yorkie.Document<{ counter: Counter }, { name: string }>(
      docKey,
    );

    const cOwner = new yorkie.Client({ rpcAddr: testRPCAddr });
    const cOther = new yorkie.Client({ rpcAddr: testRPCAddr });
    await cOwner.activate();
    await cOther.activate();
    try {
      await cOwner.attach(dOwner, {
        syncMode: SyncMode.Manual,
        disableGC: true,
        disablePresence: true,
      });

      // Opt-out client attaches without the option, then tries to set
      // presence. The server must strip the change so dOwner never sees
      // any presence entry on the wire.
      await cOther.attach(dOther, { syncMode: SyncMode.Manual });
      dOther.update((_, p) => {
        p.set({ name: 'leaker' });
      });
      await cOther.sync();
      await cOwner.sync();

      assert.deepEqual(
        dOwner.getPresences(),
        [],
        'presenceless doc must surface no presence to other clients',
      );
    } finally {
      await cOwner.deactivate();
      await cOther.deactivate();
    }
  });

  it('Re-attach with the opposite option still observes the fixated value', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();
    try {
      // First attach: fixates the doc as presenceless.
      const d1 = new yorkie.Document<{ counter: Counter }>(docKey, {
        disableGC: true,
        disablePresence: true,
      });
      await c.attach(d1, {
        syncMode: SyncMode.Manual,
        disableGC: true,
        disablePresence: true,
      });
      await c.detach(d1);

      // Re-attach declaring the opposite option. The server returns the
      // persisted true; the SDK aligns local state from the response.
      const d2 = new yorkie.Document<{ counter: Counter }>(docKey, {
        disableGC: true,
        disablePresence: false,
      });
      await c.attach(d2, {
        syncMode: SyncMode.Manual,
        disableGC: true,
        disablePresence: false,
      });

      assert.equal(
        d2.isPresenceDisabled(),
        true,
        're-attach must observe the persisted fixated value, not the request',
      );
    } finally {
      await c.deactivate();
    }
  });
});
