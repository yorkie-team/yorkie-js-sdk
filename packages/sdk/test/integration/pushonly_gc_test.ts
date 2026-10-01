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
import yorkie, { Tree, SyncMode } from '@yorkie-js/sdk/src/yorkie';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { testRPCAddr } from '@yorkie-js/sdk/test/integration/integration_helper';

type TreeDoc = Document<{ t: Tree }>;

/**
 * `waitFor` polls `cond` until it holds or `timeoutMs` elapses.
 */
async function waitFor(
  cond: () => boolean,
  what: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * `pushed` resolves once the sync loop has pushed every local change of
 * `doc`, i.e. once a push-only round trip for it has completed.
 */
function pushed(doc: TreeDoc): Promise<void> {
  return waitFor(() => !doc.hasLocalChanges(), 'the push to land');
}

describe('RealtimePushOnly and garbage collection', function () {
  // A push-only client pushes but does not pull, and every response still
  // carries the server's minimum version vector. Collecting with it would
  // purge tombstones while the remote changes anchored on them are exactly
  // what the client has not pulled yet, leaving it unable to apply them once
  // it resumes: the sync fails with "cannot find node" and the server
  // redelivers the same pack forever. An IME composition holds a document in
  // push-only for as long as the user types, so this is the regime the
  // ProseMirror binding lives in.
  it('must not collect a tombstone a deferred remote change anchors on', async function ({
    task,
  }) {
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const key = `${task.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
    const d1: TreeDoc = new yorkie.Document(key);
    const d2: TreeDoc = new yorkie.Document(key);
    // c1 syncs by hand so each of its pushes and pulls lands in a known order.
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2);

    d1.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });
    await c1.sync();
    await waitFor(() => d2.getRoot().t !== undefined, 'c2 to see the tree');

    // c2 composes: it pushes while pulling nothing.
    await c2.changeSyncMode(d2, SyncMode.RealtimePushOnly);
    d2.update((root) => root.t.edit(2, 2, { type: 'text', value: 'X' }));
    await pushed(d2);
    await c1.sync();
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>aXb</p></doc>');

    // c2 replaces its "X": the node becomes a tombstone on both sides.
    d2.update((root) => root.t.edit(2, 3, { type: 'text', value: 'x' }));
    await pushed(d2);

    // c1 still sees "X" live, and inserts right after it — an edit anchored
    // on the node c2 just removed. Then two syncs: the first pushes the
    // insert and pulls the removal, the second reports a version vector that
    // covers the removal, so the server's minimum vector now does too.
    d1.update((root) => root.t.edit(3, 3, { type: 'text', value: 'Y' }));
    await c1.sync();
    await c1.sync();
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>axYb</p></doc>');

    // c2 keeps composing. The reply to this push carries a minimum vector
    // under which "X" is collectable, while the insert anchored on it is
    // still waiting on the server for c2 to pull.
    d2.update((root) => root.t.edit(1, 1, { type: 'text', value: 'z' }));
    await pushed(d2);

    // The composition ends: c2 resumes and pulls the deferred insert.
    await c2.changeSyncMode(d2, SyncMode.Realtime);
    await c2.sync(d2);
    await c1.sync();
    assert.equal(d2.getRoot().t.toXML(), '<doc><p>zaxYb</p></doc>');
    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });
});
