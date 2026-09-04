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
import yorkie, { SyncMode } from '@yorkie-js/sdk/src/yorkie';
import { MemoryDocStore } from '@yorkie-js/sdk/src/client/doc-store';
import { SessionLock } from '@yorkie-js/sdk/src/client/session-lock';
import {
  toDocKey,
  testRPCAddr,
  testAPIID,
  testAPIPW,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import axios from 'axios';

type R = { text?: string };

// A no-op session lock so the simulated "reload" (a second in-process client
// with the same key) is not blocked by the multi-tab guard. In a real browser a
// reload frees the old tab's Web Lock; the same-process test cannot replicate
// that, and the multi-tab guard is covered by its own unit tests.
const noopLock: SessionLock = {
  acquire: async () => ({ release: () => {} }),
};

// This end-to-end test requires a server that supports offline-resumable attach
// (stable actor + Q3 checkpoint seeding), which is unreleased. The default CI
// server image does not have it, so the test is opt-in: run it against a server
// built from this feature branch with `OFFLINE_E2E=1 TEST_RPC_ADDR=... pnpm sdk
// test test/integration/offline_persistence_test.ts`.
describe('Offline persistence (reload with pending changes)', () => {
  it.skipIf(!process.env.OFFLINE_E2E)(
    'resumes un-pushed local changes after a simulated reload',
    async ({ task }) => {
      const stamp = `${new Date().getTime()}`;
      const docKey = toDocKey(`${task.name}-${stamp}`);
      // A stable client key → the same derived stable actor across sessions.
      const key = `offline-e2e-${stamp}`;
      // A shared store instance simulates durable local storage across a reload.
      const store = new MemoryDocStore();

      // --- Session 1: sync "hello", then edit "world" WITHOUT syncing. ---
      const c1 = new yorkie.Client({
        rpcAddr: testRPCAddr,
        key,
        store,
        sessionLock: noopLock,
      });
      await c1.activate();
      const d1 = new yorkie.Document<R>(docKey);
      await c1.attach(d1, { syncMode: SyncMode.Manual });

      d1.update((root) => {
        root.text = 'hello';
      });
      await c1.sync(); // server now has "hello"; checkpoint acked.

      d1.update((root) => {
        root.text = `${root.text} world`;
      });
      // Do NOT sync: "world" is an un-pushed local change, persisted to `store`
      // by the persist-on-local-change hook. c1 is abandoned (tab crash/close).

      // --- Session 2: reload — same key + same store, brand-new client. ---
      const c2 = new yorkie.Client({
        rpcAddr: testRPCAddr,
        key,
        store,
        sessionLock: noopLock,
      });
      await c2.activate();
      const d2 = new yorkie.Document<R>(docKey);
      await c2.attach(d2, { syncMode: SyncMode.Manual });

      // Restored from the store on attach: the un-pushed "world" survived.
      assert.equal(d2.getRoot().text, 'hello world');

      await c2.sync(); // re-push the resumed pending change to the server.

      // --- Session 3: a fresh observer must see the resumed change. ---
      const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
      await c3.activate();
      const d3 = new yorkie.Document<R>(docKey);
      await c3.attach(d3, { syncMode: SyncMode.Manual });
      await c3.sync();

      assert.equal(
        d3.getRoot().text,
        'hello world',
        'the offline pending change must reach the server via checkpoint resume',
      );

      await c2.deactivate();
      await c3.deactivate();
    },
  );

  // A resumed offline client whose document was force-compacted while offline
  // presents a stale epoch on the resume attach. The server rejects it with
  // ErrEpochMismatch and the store-backed attach path must auto-recover: clear
  // the persisted (stale) entry and re-attach fresh so the server re-anchors
  // the client from the current snapshot. The un-pushed offline edit cannot be
  // replayed onto the compacted state, so it is dropped — but NOT silently: an
  // app-visible `local-changes-dropped` data-loss event fires carrying the
  // dropped change so the app can react/re-apply. (Replaying the dropped edit
  // on top of the re-anchored state is a documented follow-up.) Requires a
  // server with epoch support (yorkie-team/yorkie#1714) plus the
  // offline-resumable-attach feature, so it is opt-in alongside the resume test
  // above.
  it.skipIf(!process.env.OFFLINE_E2E)(
    're-anchors a store-backed resume after an offline force-compaction',
    async ({ task }) => {
      const stamp = `${new Date().getTime()}`;
      const docKey = toDocKey(`${task.name}-${stamp}`);
      const key = `offline-epoch-e2e-${stamp}`;
      const store = new MemoryDocStore();

      // Admin login to force-compact the document out of band.
      const login = await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/LogIn`,
        { username: testAPIID, password: testAPIPW },
      );
      const list = await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/ListProjects`,
        {},
        { headers: { Authorization: `Bearer ${login.data.token}` } },
      );
      const project = list.data.projects.find(
        (p: { name: string }) => p.name === 'default',
      );

      const compact = () =>
        axios.post(
          `${testRPCAddr}/yorkie.v1.AdminService/CompactDocumentByAdmin`,
          { document_key: docKey, force: true },
          { headers: { Authorization: `API-Key ${project.secretKey}` } },
        );

      // --- Setup: seed content and compact once so the doc epoch is non-zero
      // before the offline client joins. (A brand-new doc starts at epoch 0,
      // which the server treats as "no epoch presented"; a client that first
      // syncs an already-compacted doc learns a real, non-zero epoch.) ---
      const cInit = new yorkie.Client({ rpcAddr: testRPCAddr });
      await cInit.activate();
      const dInit = new yorkie.Document<R>(docKey);
      await cInit.attach(dInit, { syncMode: SyncMode.Manual });
      dInit.update((root) => {
        root.text = 'hello';
      });
      await cInit.sync();
      await compact(); // doc epoch 0 -> 1
      await cInit.deactivate();

      // --- Session 1: a fresh client learns the non-zero epoch, then edits
      // "world" WITHOUT syncing and goes offline. ---
      const c1 = new yorkie.Client({
        rpcAddr: testRPCAddr,
        key,
        store,
        sessionLock: noopLock,
      });
      await c1.activate();
      const d1 = new yorkie.Document<R>(docKey);
      await c1.attach(d1, { syncMode: SyncMode.Manual });
      assert.equal(d1.getRoot().text, 'hello');
      d1.update((root) => {
        root.text = `${root.text} world`;
      });
      // "world" is un-pushed and persisted to `store` with the epoch-1 baseline;
      // c1 goes offline.

      // Force-compact again while c1 is offline: doc epoch 1 -> 2, so c1's
      // persisted epoch (1) is now stale.
      await compact();

      // --- Session 2: reload — same key + store, brand-new client. The resume
      // attach presents the stale epoch, the server rejects with
      // ErrEpochMismatch, and the store-backed path re-anchors fresh. ---
      const c2 = new yorkie.Client({
        rpcAddr: testRPCAddr,
        key,
        store,
        sessionLock: noopLock,
      });
      await c2.activate();
      const d2 = new yorkie.Document<R>(docKey);
      // The re-anchor drops the un-pushed offline "world"; capture the
      // app-visible data-loss event so we can assert the loss is surfaced (not
      // silent) and carries the dropped change.
      const dropped: Array<{ reason: string; changes: Array<unknown> }> = [];
      d2.subscribe('local-changes-dropped', (event) => {
        dropped.push(event.value);
      });
      // Must NOT throw: the re-anchor recovers automatically.
      await c2.attach(d2, { syncMode: SyncMode.Manual });

      // Re-anchored from the compacted snapshot: "hello" survives the
      // compaction; the un-pushed offline "world" is dropped (re-anchor
      // discards stale local state), and the document is usable again.
      assert.equal(d2.getRoot().text, 'hello');
      // The drop was surfaced as a data-loss event carrying the dropped edit,
      // not silently discarded.
      assert.equal(dropped.length, 1);
      assert.equal(dropped[0].reason, 'epoch-reanchor');
      assert.isAtLeast(dropped[0].changes.length, 1);
      d2.update((root) => {
        root.text = `${root.text} again`;
      });
      await c2.sync();
      assert.equal(d2.getRoot().text, 'hello again');

      await c1.deactivate();
      await c2.deactivate();
    },
  );
});
