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
// (stable actor + Q3 checkpoint seeding, yorkie-team/yorkie#1969). The CI server
// image now includes it, so the test runs by default.
describe('Offline persistence (reload with pending changes)', () => {
  it('resumes un-pushed local changes after a simulated reload', async ({
    task,
  }) => {
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
  });

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
  // offline-resumable-attach feature (yorkie-team/yorkie#1969), now in the CI
  // server image.
  it('re-anchors a store-backed resume after an offline force-compaction', async ({
    task,
  }) => {
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
    // Assert the default project was found: reading `project.secretKey` off an
    // undefined match would throw a confusing TypeError that masks the real
    // "default project missing" failure.
    assert.isDefined(project, 'default project not found');

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
  });
});

describe('Incremental persistence (real server round trip)', () => {
  it('keeps writing appends, not snapshots, while editing', async ({
    task,
  }) => {
    const stamp = `${new Date().getTime()}`;
    const docKey = toDocKey(`${task.name}-${stamp}`);
    const key = `incremental-e2e-${stamp}`;
    const store = new MemoryDocStore();

    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      key,
      store,
      sessionLock: noopLock,
    });
    await c1.activate();
    const d1 = new yorkie.Document<R>(docKey);
    await c1.attach(d1, { syncMode: SyncMode.Manual });

    const base = await store.load(`/${key}/${docKey}`);
    assert.isDefined(base);
    assert.deepEqual(base!.changes, []);

    for (const word of ['a', 'ab', 'abc']) {
      d1.update((root) => {
        root.text = word;
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stored = (await store.load(`/${key}/${docKey}`))!;
    // The property that distinguishes this from the snapshot-per-change
    // design: the base is untouched and the edits live in the log.
    assert.equal(stored.changes.length, 3);
    assert.deepEqual(
      Array.from(stored.snapshot),
      Array.from(base!.snapshot),
      'an edit must not rewrite the snapshot',
    );

    await c1.deactivate();
  });

  it('survives a reload and stays pushable afterwards', async ({ task }) => {
    // The end-to-end shape that unit tests missed twice: remote content pulled
    // during a session must persist, and the first edit after a restore must
    // actually reach the server rather than being silently dropped for
    // reusing a clientSeq the server has already seen.
    const stamp = `${new Date().getTime()}`;
    const docKey = toDocKey(`${task.name}-${stamp}`);
    const key = `incremental-reload-${stamp}`;
    const store = new MemoryDocStore();

    // A peer writes something the offline client will pull.
    const peer = new yorkie.Client({ rpcAddr: testRPCAddr });
    await peer.activate();
    const peerDoc = new yorkie.Document<R>(docKey);
    await peer.attach(peerDoc, { syncMode: SyncMode.Manual });
    peerDoc.update((root) => {
      root.text = 'from-peer';
    });
    await peer.sync();

    // Session 1: pull the peer's change, then edit without syncing.
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      key,
      store,
      sessionLock: noopLock,
    });
    await c1.activate();
    const d1 = new yorkie.Document<R>(docKey);
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c1.sync();
    assert.equal(d1.getRoot().text, 'from-peer');

    d1.update((root) => {
      root.text = `${root.text}+offline`;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Session 2: reload over the same store and client key.
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      key,
      store,
      sessionLock: noopLock,
    });
    await c2.activate();
    const d2 = new yorkie.Document<R>(docKey);
    await c2.attach(d2, { syncMode: SyncMode.Manual });

    assert.equal(
      d2.getRoot().text,
      'from-peer+offline',
      'both the pulled content and the offline edit must survive',
    );

    // The first edit after a restore has to be pushable: a counter left behind
    // by the replay mints a clientSeq the server has already acked and the
    // edit disappears with no error anywhere.
    d2.update((root) => {
      root.text = `${root.text}+after`;
    });
    await c2.sync();

    const verifier = new yorkie.Client({ rpcAddr: testRPCAddr });
    await verifier.activate();
    const dv = new yorkie.Document<R>(docKey);
    await verifier.attach(dv, { syncMode: SyncMode.Manual });
    await verifier.sync();
    assert.equal(
      dv.getRoot().text,
      'from-peer+offline+after',
      'the post-restore edit must reach the server',
    );

    await c2.deactivate();
    await peer.deactivate();
    await verifier.deactivate();
  });
});

describe('Offline persistence lifecycle', () => {
  it('allows re-attaching a document after detaching it', async ({ task }) => {
    // A detached document has no owner for its offline state. Leaving the
    // entry makes the next attach present a resume the server refuses for a
    // row it just detached, and it surfaces as "document already detached" —
    // an error that says nothing about storage.
    const stamp = `${new Date().getTime()}`;
    const docKey = toDocKey(`${task.name}-${stamp}`);
    const key = `lifecycle-${stamp}`;
    const store = new MemoryDocStore();

    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      key,
      store,
      sessionLock: noopLock,
    });
    await client.activate();

    const d1 = new yorkie.Document<R>(docKey);
    await client.attach(d1, { syncMode: SyncMode.Manual });
    d1.update((root) => {
      root.text = 'hello';
    });
    await client.sync();
    await client.detach(d1);

    const d2 = new yorkie.Document<R>(docKey);
    await client.attach(d2, { syncMode: SyncMode.Manual });
    assert.equal(d2.getRoot().text, 'hello');

    await client.deactivate();
  });
});

describe('Offline persistence after a server-side removal', () => {
  it('allows attaching again after learning the document was removed', async ({
    task,
  }) => {
    // A sync can be the thing that tells this client the document is gone.
    // That is the third way a document ends, and the persisted envelope has to
    // go with it: it carries a serverSeq for a row that no longer exists, so
    // the next attach presents a checkpoint ahead of the server and is
    // rejected — an error the store path does not recover from.
    const stamp = `${new Date().getTime()}`;
    const docKey = toDocKey(`${task.name}-${stamp}`);
    const key = `removal-${stamp}`;
    const store = new MemoryDocStore();

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
      root.text = 'doomed';
    });
    await c1.sync();

    // Another client removes it, and this one learns that from a sync.
    const remover = new yorkie.Client({ rpcAddr: testRPCAddr });
    await remover.activate();
    const dr = new yorkie.Document<R>(docKey);
    await remover.attach(dr, { syncMode: SyncMode.Manual });
    await remover.remove(dr);
    await remover.deactivate();

    try {
      await c1.sync();
    } catch {
      // The sync itself may reject; what matters is the state it leaves.
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A fresh document under the same key and client key must attach.
    const d2 = new yorkie.Document<R>(docKey);
    await c1.attach(d2, { syncMode: SyncMode.Manual });
    assert.equal(d2.getRoot().text, undefined);

    await c1.deactivate();
  });
});
