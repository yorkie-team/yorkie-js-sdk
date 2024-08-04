/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { describe, it, assert, vi, afterEach, expect } from 'vitest';

import yorkie, {
  Counter,
  SyncMode,
  ClientCondition,
  DocEventType,
  DocumentSyncStatus,
  Tree,
  Text,
} from '@yorkie-js-sdk/src/yorkie';
import { EventCollector } from '@yorkie-js-sdk/test/helper/helper';
import {
  toDocKey,
  testRPCAddr,
  withTwoClientsAndDocuments,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';
import { Code } from '@yorkie-js-sdk/src/util/error';

describe.sequential('Client', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Can be activated, deactivated', async function ({ task }) {
    const clientKey = `${task.name}-${new Date().getTime()}`;
    const clientWithKey = new yorkie.Client(testRPCAddr, {
      key: clientKey,
      syncLoopDuration: 50,
      reconnectStreamDelay: 1000,
    });
    assert.isFalse(clientWithKey.isActive());
    await clientWithKey.activate();
    assert.isTrue(clientWithKey.isActive());
    assert.equal(clientKey, clientWithKey.getKey());
    await clientWithKey.deactivate();
    assert.isFalse(clientWithKey.isActive());

    const clientWithoutKey = new yorkie.Client(testRPCAddr);
    assert.isFalse(clientWithoutKey.isActive());
    await clientWithoutKey.activate();
    assert.isTrue(clientWithoutKey.isActive());
    assert.isString(clientWithoutKey.getKey());
    assert.lengthOf(clientWithoutKey.getKey(), 36);
    await clientWithoutKey.deactivate();
    assert.isFalse(clientWithoutKey.isActive());
  });

  it('Can attach/detach document', async function ({ task }) {
    const cli = new yorkie.Client(testRPCAddr);
    await cli.activate();
    const doc = new yorkie.Document(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );

    await cli.attach(doc);
    expect(async () => cli.attach(doc)).rejects.toThrowErrorCode(
      Code.ErrDocumentNotDetached,
    );

    await cli.detach(doc);
    expect(async () => cli.detach(doc)).rejects.toThrowErrorCode(
      Code.ErrDocumentNotAttached,
    );

    await cli.deactivate();
    await cli.deactivate();
  });

  it('Can handle sync', async function ({ task }) {
    type TestDoc = { k1: string; k2: string; k3: string };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      const spy = vi.fn();
      const unsub = d2.subscribe(spy);

      assert.equal(0, spy.mock.calls.length);

      d1.update((root) => {
        root['k1'] = 'v1';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(1, spy.mock.calls.length);

      d1.update((root) => {
        root['k2'] = 'v2';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(2, spy.mock.calls.length);

      unsub();

      d1.update((root) => {
        root['k3'] = 'v3';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(2, spy.mock.calls.length);
    }, task.name);
  });

  it('Can recover from temporary disconnect (manual sync)', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ k1: string }>(async (c1, d1, c2, d2) => {
      // Normal Condition
      d2.update((root) => {
        root['k1'] = 'undefined';
      });

      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      // Simulate network error with fetch
      vi.stubGlobal('fetch', () => {
        return Promise.resolve().then(() => {
          throw new Error('Failed to fetch');
        });
      });

      d2.update((root) => {
        root['k1'] = 'v1';
      });

      await c2.sync().catch((err) => {
        assert.equal(err.message, '[unknown] Failed to fetch');
      });
      await c1.sync().catch((err) => {
        assert.equal(err.message, '[unknown] Failed to fetch');
      });
      assert.equal(d1.toSortedJSON(), '{"k1":"undefined"}');
      assert.equal(d2.toSortedJSON(), '{"k1":"v1"}');

      // Back to normal condition
      vi.unstubAllGlobals();

      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('Can recover from temporary disconnect (realtime sync)', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ k1: string }>(docKey);
    const d2 = new yorkie.Document<{ k1: string }>(docKey);

    await c1.attach(d1);
    await c2.attach(d2);

    const eventCollectorD1 = new EventCollector();
    const eventCollectorD2 = new EventCollector();
    const eventCollectorSync1 = new EventCollector();
    const eventCollectorSync2 = new EventCollector();

    const unsub1 = {
      syncEvent: d1.subscribe('sync', (event) => {
        eventCollectorSync1.add(event.value);
      }),
      doc: d1.subscribe((event) => {
        eventCollectorD1.add(event.type);
      }),
    };
    const unsub2 = {
      syncEvent: d2.subscribe('sync', (event) => {
        eventCollectorSync2.add(event.value);
      }),
      doc: d2.subscribe((event) => {
        eventCollectorD2.add(event.type);
      }),
    };

    // Normal Condition
    d2.update((root) => {
      root['k1'] = 'undefined';
    });

    await eventCollectorD2.waitAndVerifyNthEvent(1, DocEventType.LocalChange);
    await eventCollectorD1.waitAndVerifyNthEvent(1, DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    eventCollectorSync1.reset();
    eventCollectorSync2.reset();

    // Simulate network error
    vi.stubGlobal('fetch', () => {
      return Promise.resolve().then(() => {
        throw new Error('Failed to fetch');
      });
    });

    d2.update((root) => {
      root['k1'] = 'v1';
    });

    await eventCollectorD2.waitAndVerifyNthEvent(2, DocEventType.LocalChange);
    await eventCollectorSync2.waitFor(DocumentSyncStatus.SyncFailed); // c2 should fail to sync

    await c1.sync().catch((err) => {
      assert.equal(err.message, '[unknown] Failed to fetch'); // c1 should also fail to sync
    });
    await eventCollectorSync1.waitFor(DocumentSyncStatus.SyncFailed);
    assert.equal(d1.toSortedJSON(), '{"k1":"undefined"}');
    assert.equal(d2.toSortedJSON(), '{"k1":"v1"}');

    // Back to normal condition
    eventCollectorSync1.reset();
    eventCollectorSync2.reset();
    vi.unstubAllGlobals();

    await eventCollectorSync1.waitFor(DocumentSyncStatus.Synced); // wait for c1 to sync
    await eventCollectorSync2.waitFor(DocumentSyncStatus.Synced);
    await eventCollectorD1.waitAndVerifyNthEvent(2, DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), '{"k1":"v1"}'); // d1 should be able to receive d2's update

    unsub1.syncEvent();
    unsub2.syncEvent();
    unsub1.doc();
    unsub2.doc();

    await c1.detach(d1);
    await c2.detach(d2);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can change sync mode(realtime <-> manual)', async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ version: string }>(docKey);
    const d2 = new yorkie.Document<{ version: string }>(docKey);

    // 01. c1 and c2 attach the doc with manual sync mode.
    //     c1 updates the doc, but c2 does't get until call sync manually.
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    d1.update((root) => {
      root.version = 'v1';
    });
    assert.equal(d1.toSortedJSON(), `{"version":"v1"}`, 'd1');
    assert.equal(d2.toSortedJSON(), `{}`, 'd2');
    await c1.sync();
    await c2.sync();
    assert.equal(d2.toSortedJSON(), `{"version":"v1"}`, 'd2');

    // 02. c2 changes the sync mode to realtime sync mode.
    const eventCollector = new EventCollector();
    const unsub1 = d2.subscribe('sync', (event) => {
      eventCollector.add(event.value);
    });
    await c2.changeSyncMode(d2, SyncMode.Realtime);
    await eventCollector.waitFor(DocumentSyncStatus.Synced); // sync occurs when resuming

    eventCollector.reset();
    d1.update((root) => {
      root.version = 'v2';
    });
    await c1.sync();

    await eventCollector.waitFor(DocumentSyncStatus.Synced); // c2 should sync automatically
    assert.equal(d1.toSortedJSON(), `{"version":"v2"}`, 'd1');
    assert.equal(d2.toSortedJSON(), `{"version":"v2"}`, 'd2');
    unsub1();

    // 03. c2 changes the sync mode to manual sync mode again.
    await c2.changeSyncMode(d2, SyncMode.Manual);
    d1.update((root) => {
      root.version = 'v3';
    });
    assert.equal(d1.toSortedJSON(), `{"version":"v3"}`, 'd1');
    assert.equal(d2.toSortedJSON(), `{"version":"v2"}`, 'd2');
    await c1.sync();
    await c2.sync();
    assert.equal(d2.toSortedJSON(), `{"version":"v3"}`, 'd2');

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can change sync mode in realtime', async function ({ task }) {
    // |    | Step1    | Step2    | Step3    | Step4    |
    // | c1 | PushPull | PushOnly | SyncOff  | PushPull |
    // | c2 | PushPull | SyncOff  | PushOnly | PushPull |
    // | c3 | PushPull | PushPull | PushPull | PushPull |

    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    const c3 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    await c3.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ c1: number; c2: number; c3: number }>(
      docKey,
    );
    const d2 = new yorkie.Document<{ c1: number; c2: number; c3: number }>(
      docKey,
    );
    const d3 = new yorkie.Document<{ c1: number; c2: number; c3: number }>(
      docKey,
    );

    // 01. c1, c2, c3 attach to the same document in realtime sync.
    await c1.attach(d1);
    await c2.attach(d2);
    await c3.attach(d3);

    const eventCollectorD1 = new EventCollector();
    const eventCollectorD2 = new EventCollector();
    const eventCollectorD3 = new EventCollector();
    const unsub1 = d1.subscribe((event) => {
      eventCollectorD1.add(event.type);
    });
    const unsub2 = d2.subscribe((event) => {
      eventCollectorD2.add(event.type);
    });
    const unsub3 = d3.subscribe((event) => {
      eventCollectorD3.add(event.type);
    });

    // 02. [Step1] c1, c2, c3 sync in realtime.
    d1.update((root) => {
      root.c1 = 0;
    });
    d2.update((root) => {
      root.c2 = 0;
    });
    d3.update((root) => {
      root.c3 = 0;
    });
    await eventCollectorD1.waitAndVerifyNthEvent(1, DocEventType.LocalChange);
    await eventCollectorD1.waitAndVerifyNthEvent(2, DocEventType.RemoteChange);
    await eventCollectorD1.waitAndVerifyNthEvent(3, DocEventType.RemoteChange);
    await eventCollectorD2.waitAndVerifyNthEvent(1, DocEventType.LocalChange);
    await eventCollectorD2.waitAndVerifyNthEvent(2, DocEventType.RemoteChange);
    await eventCollectorD2.waitAndVerifyNthEvent(3, DocEventType.RemoteChange);
    await eventCollectorD3.waitAndVerifyNthEvent(1, DocEventType.LocalChange);
    await eventCollectorD3.waitAndVerifyNthEvent(2, DocEventType.RemoteChange);
    await eventCollectorD3.waitAndVerifyNthEvent(3, DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), '{"c1":0,"c2":0,"c3":0}', 'd1');
    assert.equal(d2.toSortedJSON(), '{"c1":0,"c2":0,"c3":0}', 'd2');
    assert.equal(d3.toSortedJSON(), '{"c1":0,"c2":0,"c3":0}', 'd3');

    // 03. [Step2] c1 sync with push-only mode, c2 sync with sync-off mode.
    // c3 can get the changes of c1 and c2, because c3 sync with push-pull mode.
    c1.changeSyncMode(d1, SyncMode.RealtimePushOnly);
    c2.changeSyncMode(d2, SyncMode.RealtimeSyncOff);
    d1.update((root) => {
      root.c1 = 1;
    });
    d2.update((root) => {
      root.c2 = 1;
    });
    d3.update((root) => {
      root.c3 = 1;
    });

    await eventCollectorD1.waitAndVerifyNthEvent(4, DocEventType.LocalChange);
    await eventCollectorD2.waitAndVerifyNthEvent(4, DocEventType.LocalChange);
    await eventCollectorD3.waitAndVerifyNthEvent(4, DocEventType.LocalChange);
    await eventCollectorD3.waitAndVerifyNthEvent(5, DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), '{"c1":1,"c2":0,"c3":0}', 'd1');
    assert.equal(d2.toSortedJSON(), '{"c1":0,"c2":1,"c3":0}', 'd2');
    assert.equal(d3.toSortedJSON(), '{"c1":1,"c2":0,"c3":1}', 'd3');

    // 04. [Step3] c1 sync with sync-off mode, c2 sync with push-only mode.
    c1.changeSyncMode(d1, SyncMode.RealtimeSyncOff);
    c2.changeSyncMode(d2, SyncMode.RealtimePushOnly);
    d1.update((root) => {
      root.c1 = 2;
    });
    d2.update((root) => {
      root.c2 = 2;
    });
    d3.update((root) => {
      root.c3 = 2;
    });

    await eventCollectorD1.waitAndVerifyNthEvent(5, DocEventType.LocalChange);
    await eventCollectorD2.waitAndVerifyNthEvent(5, DocEventType.LocalChange);
    await eventCollectorD3.waitAndVerifyNthEvent(6, DocEventType.LocalChange);
    await eventCollectorD3.waitAndVerifyNthEvent(7, DocEventType.RemoteChange);
    await eventCollectorD3.waitAndVerifyNthEvent(8, DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), '{"c1":2,"c2":0,"c3":0}', 'd1');
    assert.equal(d2.toSortedJSON(), '{"c1":0,"c2":2,"c3":0}', 'd2');
    assert.equal(d3.toSortedJSON(), '{"c1":1,"c2":2,"c3":2}', 'd3');

    // 05. [Step4] c1 and c2 sync with push-pull mode.
    c1.changeSyncMode(d1, SyncMode.Realtime);
    c2.changeSyncMode(d2, SyncMode.Realtime);
    await eventCollectorD1.waitAndVerifyNthEvent(6, DocEventType.RemoteChange);
    await eventCollectorD1.waitAndVerifyNthEvent(7, DocEventType.RemoteChange);
    await eventCollectorD1.waitAndVerifyNthEvent(8, DocEventType.RemoteChange);
    await eventCollectorD1.waitAndVerifyNthEvent(9, DocEventType.RemoteChange);
    await eventCollectorD2.waitAndVerifyNthEvent(6, DocEventType.RemoteChange);
    await eventCollectorD2.waitAndVerifyNthEvent(7, DocEventType.RemoteChange);
    await eventCollectorD2.waitAndVerifyNthEvent(8, DocEventType.RemoteChange);
    await eventCollectorD2.waitAndVerifyNthEvent(9, DocEventType.RemoteChange);
    await eventCollectorD3.waitAndVerifyNthEvent(9, DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), '{"c1":2,"c2":2,"c3":2}', 'd1');
    assert.equal(d2.toSortedJSON(), '{"c1":2,"c2":2,"c3":2}', 'd2');
    assert.equal(d3.toSortedJSON(), '{"c1":2,"c2":2,"c3":2}', 'd3');

    unsub1();
    unsub2();
    unsub3();
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });

  it('Should apply previous changes when switching to realtime sync', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ version: string }>(docKey);
    const d2 = new yorkie.Document<{ version: string }>(docKey);

    const eventCollector = new EventCollector();
    const unsub1 = d2.subscribe('sync', (event) => {
      eventCollector.add(event.value);
    });

    // 01. c2 attach the doc with realtime sync mode at first.
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2);
    d1.update((root) => {
      root.version = 'v1';
    });
    await c1.sync();
    assert.equal(d1.toSortedJSON(), `{"version":"v1"}`, 'd1');
    await eventCollector.waitFor(DocumentSyncStatus.Synced);
    assert.equal(d2.toSortedJSON(), `{"version":"v1"}`, 'd2');

    // 02. c2 is changed to manual sync. So, c2 doesn't get the changes of c1.
    await c2.changeSyncMode(d2, SyncMode.Manual);
    d1.update((root) => {
      root.version = 'v2';
    });
    await c1.sync();
    assert.equal(d1.toSortedJSON(), `{"version":"v2"}`, 'd1');
    assert.equal(d2.toSortedJSON(), `{"version":"v1"}`, 'd2');

    // 03. c2 is changed to realtime sync.
    // c2 should be able to apply changes made to the document while c2 is not in realtime sync.
    eventCollector.reset();
    await c2.changeSyncMode(d2, SyncMode.Realtime);

    await eventCollector.waitFor(DocumentSyncStatus.Synced);
    assert.equal(d2.toSortedJSON(), `{"version":"v2"}`, 'd2');

    // 04. c2 should automatically synchronize changes.
    eventCollector.reset();
    d1.update((root) => {
      root.version = 'v3';
    });
    await c1.sync();

    await eventCollector.waitFor(DocumentSyncStatus.Synced);
    assert.equal(d1.toSortedJSON(), `{"version":"v3"}`, 'd1');
    assert.equal(d2.toSortedJSON(), `{"version":"v3"}`, 'd2');
    unsub1();

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Should not include changes applied in push-only mode when switching to realtime sync', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();

    // 01. cli attach to the document having counter.
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ counter: Counter }>(docKey);
    await c1.attach(d1, { syncMode: SyncMode.Manual });

    // 02. cli update the document with creating a counter
    //     and sync with push-pull mode: CP(1, 1) -> CP(2, 2)
    d1.update((root) => {
      root.counter = new yorkie.Counter(yorkie.IntType, 0);
    });

    let checkpoint = d1.getCheckpoint();
    assert.equal(checkpoint.getClientSeq(), 1);
    assert.equal(checkpoint.getServerSeq().toInt(), 1);

    await c1.sync();
    checkpoint = d1.getCheckpoint();
    assert.equal(checkpoint.getClientSeq(), 2);
    assert.equal(checkpoint.getServerSeq().toInt(), 2);

    // 03. cli update the document with increasing the counter(0 -> 1)
    //     and sync with push-only mode: CP(2, 2) -> CP(3, 2)
    const eventCollector = new EventCollector();
    const unsub = d1.subscribe('sync', (event) => {
      eventCollector.add(event.value);
    });
    d1.update((root) => {
      root.counter.increase(1);
    });
    let changePack = d1.createChangePack();
    assert.equal(changePack.getChangeSize(), 1);
    await c1.changeSyncMode(d1, SyncMode.RealtimePushOnly);
    await eventCollector.waitFor(DocumentSyncStatus.Synced);
    checkpoint = d1.getCheckpoint();
    assert.equal(checkpoint.getClientSeq(), 3);
    assert.equal(checkpoint.getServerSeq().toInt(), 2);
    await c1.changeSyncMode(d1, SyncMode.Manual);

    // 04. cli update the document with increasing the counter(1 -> 2)
    //     and sync with push-pull mode. CP(3, 2) -> CP(4, 4)
    d1.update((root) => {
      root.counter.increase(1);
    });

    // The previous increase(0 -> 1) is already pushed to the server,
    // so the ChangePack of the request only has the increase(1 -> 2).
    changePack = d1.createChangePack();
    assert.equal(changePack.getChangeSize(), 1);

    await c1.sync();
    checkpoint = d1.getCheckpoint();
    assert.equal(checkpoint.getClientSeq(), 4);
    assert.equal(checkpoint.getServerSeq().toInt(), 4);
    assert.equal(d1.getRoot().counter.getValue(), 2);

    unsub();
    await c1.deactivate();
  });

  it('Should prevent remote changes in push-only mode', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ tree: Tree }>(docKey);
    const d2 = new yorkie.Document<{ tree: Tree }>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    const eventCollectorD1 = new EventCollector();
    const eventCollectorD2 = new EventCollector();
    const unsub1 = d1.subscribe((event) => {
      eventCollectorD1.add(event.type);
    });
    const unsub2 = d2.subscribe((event) => {
      eventCollectorD2.add(event.type);
    });

    d1.update((root) => {
      root.tree = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: '12' }],
          },
          {
            type: 'p',
            children: [{ type: 'text', value: '34' }],
          },
        ],
      });
    });
    await eventCollectorD2.waitAndVerifyNthEvent(1, DocEventType.RemoteChange);

    assert.equal(d1.getRoot().tree.toXML(), '<doc><p>12</p><p>34</p></doc>');
    assert.equal(d2.getRoot().tree.toXML(), '<doc><p>12</p><p>34</p></doc>');

    d1.update((root) => {
      root.tree.edit(2, 2, { type: 'text', value: 'a' });
    });
    await c1.sync();

    // Simulate the situation in the runSyncLoop where a pushpull request has been sent
    // but a response has not yet been received.
    c2.sync();

    // In push-only mode, remote-change events should not occur.
    c2.changeSyncMode(d2, SyncMode.RealtimePushOnly);
    let remoteChangeOccured = false;
    const unsub3 = d2.subscribe((event) => {
      if (event.type === DocEventType.RemoteChange) {
        remoteChangeOccured = true;
      }
    });
    await new Promise((res) => {
      // TODO(chacha912): We need to clean up this later because it is non-deterministic.
      setTimeout(res, 100); // Keep the push-only state.
    });
    unsub3();
    assert.isFalse(remoteChangeOccured);

    c2.changeSyncMode(d2, SyncMode.Realtime);

    d2.update((root) => {
      root.tree.edit(2, 2, { type: 'text', value: 'b' });
    });
    await eventCollectorD1.waitAndVerifyNthEvent(3, DocEventType.RemoteChange);

    assert.equal(d1.getRoot().tree.toXML(), '<doc><p>1ba2</p><p>34</p></doc>');
    assert.equal(d2.getRoot().tree.toXML(), '<doc><p>1ba2</p><p>34</p></doc>');

    unsub1();
    unsub2();
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Should prevent remote changes in sync-off mode', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ tree: Tree }>(docKey);
    const d2 = new yorkie.Document<{ tree: Tree }>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    const eventCollectorD1 = new EventCollector();
    const eventCollectorD2 = new EventCollector();
    const unsub1 = d1.subscribe((event) => {
      eventCollectorD1.add(event.type);
    });
    const unsub2 = d2.subscribe((event) => {
      eventCollectorD2.add(event.type);
    });

    d1.update((root) => {
      root.tree = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: '12' }],
          },
          {
            type: 'p',
            children: [{ type: 'text', value: '34' }],
          },
        ],
      });
    });
    await eventCollectorD2.waitAndVerifyNthEvent(1, DocEventType.RemoteChange);

    assert.equal(d1.getRoot().tree.toXML(), '<doc><p>12</p><p>34</p></doc>');
    assert.equal(d2.getRoot().tree.toXML(), '<doc><p>12</p><p>34</p></doc>');

    d1.update((root) => {
      root.tree.edit(2, 2, { type: 'text', value: 'a' });
    });
    await c1.sync();

    // Simulate the situation in the runSyncLoop where a pushpull request has been sent
    // but a response has not yet been received.
    c2.sync();

    // In sync-off mode, remote-change events should not occur.
    c2.changeSyncMode(d2, SyncMode.RealtimeSyncOff);
    let remoteChangeOccured = false;
    const unsub3 = d2.subscribe((event) => {
      if (event.type === DocEventType.RemoteChange) {
        remoteChangeOccured = true;
      }
    });
    await new Promise((res) => {
      // TODO(chacha912): We need to clean up this later because it is non-deterministic.
      setTimeout(res, 0); // Keep the sync-off state.
    });
    unsub3();
    assert.isFalse(remoteChangeOccured);

    c2.changeSyncMode(d2, SyncMode.Realtime);

    d2.update((root) => {
      root.tree.edit(2, 2, { type: 'text', value: 'b' });
    });
    await eventCollectorD1.waitAndVerifyNthEvent(3, DocEventType.RemoteChange);

    assert.equal(d1.getRoot().tree.toXML(), '<doc><p>1ba2</p><p>34</p></doc>');
    assert.equal(d2.getRoot().tree.toXML(), '<doc><p>1ba2</p><p>34</p></doc>');

    unsub1();
    unsub2();
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Should avoid unnecessary syncs in push-only mode', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ t: Text }>(docKey);
    const d2 = new yorkie.Document<{ t: Text }>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    const eventCollectorD1 = new EventCollector();
    const eventCollectorD2 = new EventCollector();
    const unsub1 = d1.subscribe('sync', (event) => {
      eventCollectorD1.add(event.value);
    });
    const unsub2 = d2.subscribe('sync', (event) => {
      eventCollectorD2.add(event.value);
    });

    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
    });
    await eventCollectorD2.waitAndVerifyNthEvent(1, DocumentSyncStatus.Synced);

    assert.equal(d1.getRoot().t.toString(), 'a');
    assert.equal(d2.getRoot().t.toString(), 'a');

    eventCollectorD1.reset();
    c1.changeSyncMode(d1, SyncMode.RealtimePushOnly);
    d2.update((root) => {
      root.t.edit(1, 1, 'b');
    });
    await eventCollectorD2.waitAndVerifyNthEvent(2, DocumentSyncStatus.Synced);
    d2.update((root) => {
      root.t.edit(2, 2, 'c');
    });
    await eventCollectorD2.waitAndVerifyNthEvent(3, DocumentSyncStatus.Synced);

    assert.equal(eventCollectorD1.getLength(), 0);
    c1.changeSyncMode(d1, SyncMode.Realtime);
    await eventCollectorD1.waitAndVerifyNthEvent(1, DocumentSyncStatus.Synced);

    assert.equal(d1.getRoot().t.toString(), 'abc');
    assert.equal(d2.getRoot().t.toString(), 'abc');

    unsub1();
    unsub2();
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Should handle each request one by one', async function ({ task }) {
    for (let i = 0; i < 10; i++) {
      const cli = new yorkie.Client(testRPCAddr);
      await cli.activate();

      const doc = new yorkie.Document<{ t: Text }>(
        toDocKey(`${task.name}-${new Date().getTime()}-${i}`),
      );
      await cli.attach(doc);

      expect(cli.detach(doc)).resolves.toBeDefined();
      await cli.deactivate();
    }
  });

  it('Should retry on network failure and eventually succeed', async ({
    task,
  }) => {
    const cli = new yorkie.Client(testRPCAddr, {
      retrySyncLoopDelay: 10,
    });
    await cli.activate();

    const doc = new yorkie.Document<{ t: Text }>(toDocKey(`${task.name}`));
    await cli.attach(doc);

    // 01. Simulate Unknown error.
    vi.stubGlobal('fetch', async () => {
      throw new ConnectError('Failed to fetch', ConnectCode.Unknown);
    });

    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
    });

    await new Promise((res) => setTimeout(res, 30));
    assert.isTrue(cli.getCondition(ClientCondition.SyncLoop));

    // 02. Simulate FailedPrecondition error.
    vi.stubGlobal('fetch', async () => {
      throw new ConnectError('Failed to fetch', ConnectCode.FailedPrecondition);
    });

    await new Promise((res) => setTimeout(res, 30));
    assert.isFalse(cli.getCondition(ClientCondition.SyncLoop));

    vi.unstubAllGlobals();
  });

  it('Should handle local changes correctly when receiving snapshot', async ({
    task,
  }) => {
    type TestDoc = { counter: Counter };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((r) => (r.counter = new Counter(yorkie.IntType, 0)));
      await c1.sync();
      await c2.sync();

      // 01. c1 increases the counter for creating snapshot.
      for (let i = 0; i < 500; i++) {
        d1.update((r) => r.counter.increase(1));
      }
      await c1.sync();

      // 02. c2 receives the snapshot and increases the counter simultaneously.
      c2.sync();
      d2.update((r) => r.counter.increase(1));

      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });
});
