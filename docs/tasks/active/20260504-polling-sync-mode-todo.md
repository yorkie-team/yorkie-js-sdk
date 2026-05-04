# Polling Sync Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Created**: 2026-05-04

**Goal:** Add `SyncMode.Polling` for Channel and Document — an opt-in mode that runs the existing sync loop without opening a watch stream. Default mode stays `Realtime` for both resources; `Polling` is explicit.

**Architecture:** The existing `runSyncLoop` already drives both channel heartbeat and document sync via `attachment.needSync()`. Polling mode = (a) skip `runWatchLoop` at attach, (b) extend `needSync()` to return `true` at the polling interval, (c) keep the existing `syncInternal` dispatch unchanged. Per-attachment intervals are stored on `Attachment` so channel and document can use mode-specific defaults (channel polling 3s, channel realtime 30s, document polling 3s).

**Tech Stack:** TypeScript, pnpm, Vitest, yorkie-js-sdk monorepo

**Design doc:** `docs/design/polling-sync-mode.md`

---

### Task 1: Add `Polling` to `SyncMode` enum

**Files:**
- Modify: `packages/sdk/src/client/client.ts:73-97` — add new enum member with JSDoc

- [ ] **Step 1: Add the enum value with JSDoc**

In `packages/sdk/src/client/client.ts`, replace the existing `SyncMode` enum with:

```ts
/**
 * `SyncMode` defines synchronization modes for the PushPullChanges API
 * (documents) and the RefreshChannel heartbeat (channels).
 */
export enum SyncMode {
  /**
   * `Manual` mode indicates that changes are not automatically pushed or pulled.
   */
  Manual = 'manual',

  /**
   * `Realtime` mode indicates that changes are automatically pushed and pulled.
   */
  Realtime = 'realtime',

  /**
   * `RealtimePushOnly` mode indicates that only local changes are automatically pushed.
   */
  RealtimePushOnly = 'realtime-pushonly',

  /**
   * `RealtimeSyncOff` mode indicates that changes are not automatically pushed or pulled,
   * but the watch stream is kept active.
   */
  RealtimeSyncOff = 'realtime-syncoff',

  /**
   * `Polling` mode runs the sync loop without opening a watch stream.
   * - For Channel: heartbeat refreshes TTL and brings sessionCount.
   * - For Document: PushPullChanges runs at the polling interval. Remote
   *   changes arrive on the next tick (latency = interval). Not suitable
   *   for collaborative editing — use Realtime for that.
   */
  Polling = 'polling',
}
```

- [ ] **Step 2: Build to verify the enum compiles**

Run: `pnpm sdk build`

Expected: Build succeeds without TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/client/client.ts
git commit -m "Add SyncMode.Polling enum value"
```

---

### Task 2: Add per-attachment polling interval on `Attachment`

**Files:**
- Modify: `packages/sdk/src/client/attachment.ts:39-67` — add `pollInterval` field and constructor parameter

- [ ] **Step 1: Add the field and constructor parameter**

In `packages/sdk/src/client/attachment.ts`, modify the `Attachment` class declaration and constructor:

```ts
export class Attachment<R extends Attachable> {
  resource: R;
  resourceID: string;
  syncMode?: SyncMode;
  changeEventReceived?: boolean;
  lastHeartbeatTime: number;
  pollInterval: number;
  pollIntervalPinned: boolean;

  private reconnectStreamDelay: number;
  private cancelled: boolean;
  private watchStream?: WatchStream;
  private watchLoopTimerID?: ReturnType<typeof setTimeout>;
  private watchAbortController?: AbortController;
  private syncPromise?: Promise<void>;
  private _detaching = false;

  constructor(
    reconnectStreamDelay: number,
    resource: R,
    resourceID: string,
    syncMode?: SyncMode,
    pollInterval: number = 0,
    pollIntervalPinned: boolean = false,
  ) {
    this.reconnectStreamDelay = reconnectStreamDelay;
    this.resource = resource;
    this.resourceID = resourceID;
    this.syncMode = syncMode;
    this.changeEventReceived = syncMode !== undefined ? false : undefined;
    this.lastHeartbeatTime = Date.now();
    this.pollInterval = pollInterval;
    this.pollIntervalPinned = pollIntervalPinned;
    this.cancelled = false;
  }
```

- [ ] **Step 2: Build to verify the field compiles**

Run: `pnpm sdk build`

Expected: Build succeeds. Existing `new Attachment(...)` call sites still compile (default parameters are backward compatible).

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/client/attachment.ts
git commit -m "Add pollInterval and pollIntervalPinned fields to Attachment"
```

---

### Task 3: Wire `Polling` into channel attach (no stream, heartbeat 3s default)

**Files:**
- Modify: `packages/sdk/src/client/client.ts:258-268` — extend `AttachChannelOptions` with `syncMode`
- Modify: `packages/sdk/src/client/client.ts:712-793` — resolve `syncMode` and `pollInterval`, skip stream in Polling

- [ ] **Step 1: Write the failing integration test**

Create `packages/sdk/test/integration/channel_polling_test.ts`:

```ts
import { describe, it, assert } from 'vitest';
import yorkie, { SyncMode, Channel } from '@yorkie-js/sdk/src/yorkie';
import { toDocKey } from '@yorkie-js/sdk/test/integration/integration_helper';
import { testRPCAddr } from '@yorkie-js/sdk/test/integration/integration_helper';

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

    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm sdk test test/integration/channel_polling_test.ts`

Expected: FAIL — `syncMode` option is not handled by `attachChannel`, so the channel attaches in Realtime mode and the test may pass coincidentally OR the test type-checks fail because `SyncMode.Polling` isn't accepted by `AttachChannelOptions`.

- [ ] **Step 3: Extend `AttachChannelOptions` with `syncMode`**

In `packages/sdk/src/client/client.ts`, replace the `AttachChannelOptions` interface:

```ts
/**
 * `AttachChannelOptions` are user-settable options used when attaching channels.
 */
export interface AttachChannelOptions {
  /**
   * `syncMode` selects how the channel keeps presence in sync with the server.
   * - `SyncMode.Realtime` (default): open a watch stream and run the heartbeat.
   *   Required to receive broadcast events.
   * - `SyncMode.Polling`: heartbeat-only. No watch stream is opened. Polling
   *   refreshes TTL and brings the latest sessionCount.
   * - `SyncMode.Manual`: no automatic activity. Caller must invoke sync().
   *
   * If both `syncMode` and `isRealtime` are set, `syncMode` wins.
   */
  syncMode?: SyncMode;

  /**
   * `isRealtime` determines whether to automatically watch channel changes
   * and send heartbeats. If false (manual mode), the client must call sync()
   * explicitly to refresh the TTL.
   * Default is true for backward compatibility.
   * @deprecated Use `syncMode` instead. Kept for back-compat.
   */
  isRealtime?: boolean;

  /**
   * `channelHeartbeatInterval` overrides the heartbeat interval (ms) for this
   * attachment. If unset, mode-specific defaults apply: Polling=3000,
   * Realtime=30000.
   */
  channelHeartbeatInterval?: number;
}
```

- [ ] **Step 4: Resolve syncMode and interval in `attachChannel`**

In `packages/sdk/src/client/client.ts`, replace the `// Determine sync mode: ...` block (around line 750) and the `attachment` construction (around line 754) with:

```ts
        // Resolve syncMode (explicit > legacy isRealtime > default Realtime).
        let syncMode: SyncMode;
        if (opts.syncMode !== undefined) {
          syncMode = opts.syncMode;
        } else if (opts.isRealtime !== undefined) {
          syncMode = opts.isRealtime ? SyncMode.Realtime : SyncMode.Manual;
        } else {
          syncMode = SyncMode.Realtime;
        }

        // Resolve heartbeat interval. Mode-specific defaults: polling=3000,
        // realtime=client-level channelHeartbeatInterval (default 30000).
        const pollIntervalPinned =
          opts.channelHeartbeatInterval !== undefined;
        const pollInterval = pollIntervalPinned
          ? opts.channelHeartbeatInterval!
          : syncMode === SyncMode.Polling
            ? 3000
            : this.channelHeartbeatInterval;

        const attachment = new Attachment(
          this.reconnectStreamDelay,
          channel,
          res.sessionId,
          syncMode,
          pollInterval,
          pollIntervalPinned,
        );
```

- [ ] **Step 5: Open the watch stream only in Realtime, not Polling**

In `packages/sdk/src/client/client.ts`, replace the `if (syncMode === SyncMode.Realtime)` block near line 776 with:

```ts
        // Realtime: open watch stream + heartbeat (driven by sync loop).
        // Polling: heartbeat only, sync loop drives RefreshChannel via syncInternal.
        // Manual: nothing.
        if (syncMode === SyncMode.Realtime) {
          await this.runWatchLoop(channel.getKey());
        }
```

- [ ] **Step 6: Update `Attachment.needSync()` to use per-attachment pollInterval for channels**

In `packages/sdk/src/client/attachment.ts:99-112`, replace the `needSync` method:

```ts
  /**
   * `needSync` determines if the attachment needs sync.
   * This includes both document sync and presence heartbeat.
   */
  public needSync(heartbeatInterval: number): boolean {
    // For Document: check if realtime sync is needed
    if (this.resource instanceof Document) {
      return this.needRealtimeSync();
    }

    // For Channel in Manual mode: never auto-sync
    if (this.syncMode === SyncMode.Manual) {
      return false;
    }

    // For Channel in Realtime or Polling mode: heartbeat at the
    // attachment's own interval (falls back to client-level value if zero).
    const interval = this.pollInterval > 0 ? this.pollInterval : heartbeatInterval;
    return Date.now() - this.lastHeartbeatTime >= interval;
  }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm sdk test test/integration/channel_polling_test.ts`

Expected: PASS — sessionCount reflects 2 within 500ms via heartbeat polling.

- [ ] **Step 8: Verify no watch stream is opened in Polling mode**

Add this test to the same file (in the `describe('Channel Polling')` block):

```ts
  it('Polling mode does not open a watch stream', async function ({ task }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;
    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);
    let watchCalled = false;
    const origWatch = (c as any).rpcClient.watch.bind((c as any).rpcClient);
    (c as any).rpcClient.watch = (...args: any[]) => {
      watchCalled = true;
      return origWatch(...args);
    };

    await c.attachChannel(ch, { syncMode: SyncMode.Polling });
    await new Promise((r) => setTimeout(r, 100));
    assert.isFalse(watchCalled);

    await c.detach(ch);
    await c.deactivate();
  });
```

Run: `pnpm sdk test test/integration/channel_polling_test.ts`

Expected: PASS — `watch` RPC is never called for a Polling-mode channel.

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/src/client/client.ts packages/sdk/src/client/attachment.ts packages/sdk/test/integration/channel_polling_test.ts
git commit -m "Support SyncMode.Polling for channels"
```

---

### Task 4: Wire `Polling` into document attach

**Files:**
- Modify: `packages/sdk/src/client/client.ts:248` (and `AttachOptions`) — add `documentPollInterval`
- Modify: `packages/sdk/src/client/client.ts` near document attach — skip stream in Polling
- Modify: `packages/sdk/src/client/attachment.ts:80-93` — extend `needRealtimeSync()` for Polling

- [ ] **Step 1: Find the `AttachOptions` (document) interface**

Run: `grep -n "AttachOptions" packages/sdk/src/client/client.ts | head`

Expected output identifies the location of the document-side `AttachOptions` interface (different from `AttachChannelOptions`). Note the line range.

- [ ] **Step 2: Add `documentPollInterval` to `AttachOptions`**

In the `AttachOptions` interface, add a new property:

```ts
  /**
   * `documentPollInterval` (ms) — only used when `syncMode` is `Polling`.
   * Default: 3000.
   */
  documentPollInterval?: number;
```

- [ ] **Step 3: Write a failing integration test for document Polling**

Create `packages/sdk/test/integration/document_polling_test.ts`:

```ts
import { describe, it, assert } from 'vitest';
import yorkie, { SyncMode } from '@yorkie-js/sdk/src/yorkie';
import {
  toDocKey,
  testRPCAddr,
} from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Document Polling', function () {
  it('Polling document receives remote changes within poll interval', async function ({
    task,
  }) {
    const docKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const d1 = new yorkie.Document<{ k?: string }>(docKey);
    const d2 = new yorkie.Document<{ k?: string }>(docKey);

    // c1 attaches in Polling mode with 200ms interval.
    await c1.attach(d1, {
      syncMode: SyncMode.Polling,
      documentPollInterval: 200,
    });
    await c2.attach(d2);

    // c2 makes a change.
    d2.update((root) => {
      root.k = 'v';
    });
    await c2.sync();

    // Wait for at least 2 polling ticks (~400ms).
    await new Promise((r) => setTimeout(r, 600));

    assert.equal(d1.getRoot().k, 'v');

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm sdk test test/integration/document_polling_test.ts`

Expected: FAIL — without Polling support, c1 has no watch stream and `needRealtimeSync()` returns false (no local changes, no `changeEventReceived`), so the change from c2 is never pulled.

- [ ] **Step 5: Resolve `syncMode` and `pollInterval` in document attach**

In `packages/sdk/src/client/client.ts:536`, replace the line:

```ts
    const syncMode = opts.syncMode ?? SyncMode.Realtime;
```

with:

```ts
    const syncMode = opts.syncMode ?? SyncMode.Realtime;
    const pollIntervalPinned = opts.documentPollInterval !== undefined;
    const pollInterval = pollIntervalPinned
      ? opts.documentPollInterval!
      : syncMode === SyncMode.Polling
        ? 3000
        : 0;
```

- [ ] **Step 6: Pass interval into `Attachment` constructor at document attach site**

In `packages/sdk/src/client/client.ts:564-572`, replace:

```ts
        this.attachmentMap.set(
          doc.getKey(),
          new Attachment(
            this.reconnectStreamDelay,
            doc,
            res.documentId,
            syncMode,
          ),
        );
```

with:

```ts
        this.attachmentMap.set(
          doc.getKey(),
          new Attachment(
            this.reconnectStreamDelay,
            doc,
            res.documentId,
            syncMode,
            pollInterval,
            pollIntervalPinned,
          ),
        );
```

- [ ] **Step 7: Skip `runWatchLoop` for document in Polling mode**

In `client.ts:574`, the existing condition is:

```ts
if (syncMode !== SyncMode.Manual) {
  await this.runWatchLoop(doc.getKey());
}
```

Replace with:

```ts
if (syncMode !== SyncMode.Manual && syncMode !== SyncMode.Polling) {
  await this.runWatchLoop(doc.getKey());
}
```

- [ ] **Step 8: Extend `needRealtimeSync()` for document Polling mode**

In `packages/sdk/src/client/attachment.ts:80-93`, replace `needRealtimeSync`:

```ts
  /**
   * `needRealtimeSync` returns whether the resource needs to be synced in real time.
   * Only applicable to Document resources with syncMode defined.
   */
  public needRealtimeSync(): boolean {
    if (this.syncMode === SyncMode.RealtimeSyncOff) {
      return false;
    }

    if (this.syncMode === SyncMode.RealtimePushOnly) {
      return this.resource.hasLocalChanges();
    }

    if (this.syncMode === SyncMode.Polling) {
      // Time-based: pull at every poll interval, regardless of local changes.
      return Date.now() - this.lastHeartbeatTime >= this.pollInterval;
    }

    return (
      this.syncMode !== SyncMode.Manual &&
      (this.resource.hasLocalChanges() || (this.changeEventReceived ?? false))
    );
  }
```

- [ ] **Step 9: Update `lastHeartbeatTime` after document sync in `syncInternal`**

In `packages/sdk/src/client/client.ts:1839-1937` (`syncInternal`), find the document path's success block (after `doc.applyChangePack(respPack);`). Add a single line so the polling baseline advances on every successful pushPull:

```ts
      doc.applyChangePack(respPack);
      attachment.updateHeartbeatTime();
      attachment.resource.publish([
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm sdk test test/integration/document_polling_test.ts`

Expected: PASS — c1 pulls c2's change within ~400ms.

- [ ] **Step 11: Commit**

```bash
git add packages/sdk/src/client/client.ts packages/sdk/src/client/attachment.ts packages/sdk/test/integration/document_polling_test.ts
git commit -m "Support SyncMode.Polling for documents"
```

---

### Task 5: `changeSyncMode` — accept Channel and handle transitions

**Files:**
- Modify: `packages/sdk/src/client/client.ts:849-897` — overload to accept Channel, dispatch to private helpers

- [ ] **Step 1: Write the failing integration test**

Append to `packages/sdk/test/integration/channel_polling_test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm sdk test test/integration/channel_polling_test.ts`

Expected: FAIL — `changeSyncMode(channel, ...)` is not in the type signature; TypeScript compilation rejects the call.

- [ ] **Step 3: Add overload + dispatch + private helpers**

In `packages/sdk/src/client/client.ts`, replace the existing `changeSyncMode` method (line 851) with overloaded signatures and a unified body:

```ts
  /**
   * `changeSyncMode` changes the synchronization mode of the given resource.
   */
  public async changeSyncMode<R, P extends Indexable>(
    doc: Document<R, P>,
    syncMode: SyncMode,
  ): Promise<Document<R, P>>;
  public async changeSyncMode(
    channel: Channel,
    syncMode: SyncMode,
  ): Promise<Channel>;
  public async changeSyncMode(
    resource: Document<any, any> | Channel,
    syncMode: SyncMode,
  ): Promise<Document<any, any> | Channel> {
    if (resource instanceof Channel) {
      return this.changeChannelSyncMode(resource, syncMode);
    }
    return this.changeDocumentSyncMode(resource, syncMode);
  }

  private async changeDocumentSyncMode<R, P extends Indexable>(
    doc: Document<R, P>,
    syncMode: SyncMode,
  ): Promise<Document<R, P>> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }

    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    const prevSyncMode = attachment.syncMode;
    if (prevSyncMode === syncMode) {
      return doc;
    }

    attachment.changeSyncMode(syncMode);

    // Tear down stream if leaving a stream-using mode.
    if (
      syncMode === SyncMode.Manual ||
      syncMode === SyncMode.Polling
    ) {
      attachment.cancelWatchStream();
    }

    if (syncMode === SyncMode.Realtime) {
      attachment.changeEventReceived = true;
    }

    // Recompute interval default if the user did not pin it.
    if (!attachment.pollIntervalPinned) {
      attachment.pollInterval =
        syncMode === SyncMode.Polling ? 3000 : 0;
    }

    // Start watch stream if entering a stream-using mode from a stream-less one.
    if (
      (prevSyncMode === SyncMode.Manual ||
        prevSyncMode === SyncMode.Polling) &&
      syncMode !== SyncMode.Manual &&
      syncMode !== SyncMode.Polling
    ) {
      await this.runWatchLoop(doc.getKey());
    }

    return doc;
  }

  private async changeChannelSyncMode(
    channel: Channel,
    syncMode: SyncMode,
  ): Promise<Channel> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }

    const attachment = this.attachmentMap.get(channel.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${channel.getKey()} is not attached`,
      );
    }

    const prevSyncMode = attachment.syncMode;
    if (prevSyncMode === syncMode) {
      return channel;
    }

    // Tear down stream if leaving Realtime.
    if (prevSyncMode === SyncMode.Realtime) {
      attachment.cancelWatchStream();
    }

    attachment.changeSyncMode(syncMode);

    // Recompute interval default if the user did not pin it.
    if (!attachment.pollIntervalPinned) {
      attachment.pollInterval =
        syncMode === SyncMode.Polling
          ? 3000
          : syncMode === SyncMode.Realtime
            ? this.channelHeartbeatInterval
            : 0;
    }

    // Start watch stream if entering Realtime.
    if (syncMode === SyncMode.Realtime) {
      await this.runWatchLoop(channel.getKey());
    }

    return channel;
  }
```

- [ ] **Step 4: Reset `cancelled` flag so reused stream creation works after re-entering Realtime**

In `packages/sdk/src/client/attachment.ts`, the `cancelled` flag set in `cancelWatchStream()` prevents `runWatchLoop` from reconnecting. Add a method to reset it:

```ts
  /**
   * `resetCancelled` clears the cancelled flag so the watch loop can run again
   * after a previous cancellation (e.g., after changeSyncMode back to Realtime).
   */
  public resetCancelled(): void {
    this.cancelled = false;
  }
```

In `client.ts`, call `attachment.resetCancelled()` immediately before `runWatchLoop` in both `changeDocumentSyncMode` and `changeChannelSyncMode`:

```ts
    attachment.resetCancelled();
    await this.runWatchLoop(...);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm sdk test test/integration/channel_polling_test.ts`

Expected: PASS — Realtime → Polling → Realtime transitions complete without error and sessionCount remains tracked.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/client/client.ts packages/sdk/src/client/attachment.ts packages/sdk/test/integration/channel_polling_test.ts
git commit -m "Overload changeSyncMode to handle Channel and Polling transitions"
```

---

### Task 6: Integration test — Polling channel does not receive broadcast

**Files:**
- Modify: `packages/sdk/test/integration/channel_polling_test.ts` — append broadcast isolation test

- [ ] **Step 1: Write the test**

Append to the `describe('Channel Polling')` block:

```ts
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
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm sdk test test/integration/channel_polling_test.ts`

Expected: PASS — broadcast does not reach Polling-mode channel because no watch stream was opened.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/channel_polling_test.ts
git commit -m "Verify Polling channel does not receive broadcast"
```

---

### Task 7: Backward compatibility test — `isRealtime` still works

**Files:**
- Modify: `packages/sdk/test/integration/channel_polling_test.ts` — append legacy test

- [ ] **Step 1: Write the test**

Append:

```ts
  it('Legacy isRealtime: true keeps Realtime mode (no behavior change)', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const ch1 = new Channel(channelKey);
    const ch2 = new Channel(channelKey);

    await c1.attachChannel(ch1, { isRealtime: true });
    await c2.attachChannel(ch2, { isRealtime: true });

    let received: any = null;
    ch2.subscribe('chat', (event) => {
      received = event.payload;
    });

    ch1.broadcast('chat', { msg: 'legacy' });
    // Wait long enough for stream to deliver.
    await new Promise((r) => setTimeout(r, 500));

    assert.deepEqual(received, { msg: 'legacy' });

    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('syncMode wins when both syncMode and isRealtime are set', async function ({
    task,
  }) {
    const channelKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c.activate();

    const ch = new Channel(channelKey);

    // Conflicting options: syncMode says Polling, isRealtime says true.
    let watchCalled = false;
    const origWatch = (c as any).rpcClient.watch.bind((c as any).rpcClient);
    (c as any).rpcClient.watch = (...args: any[]) => {
      watchCalled = true;
      return origWatch(...args);
    };

    await c.attachChannel(ch, {
      syncMode: SyncMode.Polling,
      isRealtime: true,
    });

    await new Promise((r) => setTimeout(r, 100));
    assert.isFalse(watchCalled);

    await c.detach(ch);
    await c.deactivate();
  });
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `pnpm sdk test test/integration/channel_polling_test.ts`

Expected: PASS — `isRealtime: true` still opens a watch stream and delivers broadcast; `syncMode: Polling` wins over `isRealtime: true`.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/channel_polling_test.ts
git commit -m "Verify isRealtime back-compat and syncMode precedence"
```

---

### Task 8: Run full SDK test suite for regression

**Files:** none modified — verification only.

- [ ] **Step 1: Lint**

Run: `pnpm lint`

Expected: 0 warnings, 0 errors.

- [ ] **Step 2: Build**

Run: `pnpm sdk build`

Expected: Build succeeds.

- [ ] **Step 3: Full test suite**

Ensure the test server is running:

```bash
docker compose -f docker/docker-compose.yml up --build -d
```

Run: `pnpm sdk test`

Expected: All existing tests pass, plus the new polling tests in `channel_polling_test.ts` and `document_polling_test.ts`. No regressions in `channel_test.ts`, `broadcast_test.ts`, `client_test.ts`, `presence_test.ts`, `doc_presence_test.ts`.

- [ ] **Step 4: If any regression, fix and re-run**

If any existing test fails, the most likely cause is the `attachment.updateHeartbeatTime()` call added in document `syncInternal` (Task 4 Step 9) interacting with channel heartbeat tracking. Verify channel-side `lastHeartbeatTime` semantics are unchanged by inspecting which code paths call `updateHeartbeatTime`.

- [ ] **Step 5: Commit if any fixup is needed**

```bash
git add -u
git commit -m "Fix regression in <test name>"
```

---

### Task 9: Move task file to archive

**Files:**
- Move: `docs/tasks/active/20260504-polling-sync-mode-todo.md` → `docs/tasks/archive/2026/05/`
- Create: `docs/tasks/archive/2026/05/20260504-polling-sync-mode-lessons.md` (per project convention — todo/lessons pair)

- [ ] **Step 1: Write the lessons file**

Create `docs/tasks/archive/2026/05/20260504-polling-sync-mode-lessons.md` with notes captured during implementation: surprises, deviations from plan, follow-ups (e.g., 200K even benchmark validation, future adaptive-polling decision).

- [ ] **Step 2: Move and update**

```bash
git mv docs/tasks/active/20260504-polling-sync-mode-todo.md docs/tasks/archive/2026/05/
```

Update `docs/tasks/active/README.md` and `docs/tasks/archive/README.md` if those files index task files.

- [ ] **Step 3: Commit**

```bash
git add docs/tasks/
git commit -m "Archive polling sync mode task"
```

---

## Out of Scope (Explicit)

- Adaptive polling (sessionCount-driven interval). Static defaults only.
- Server-side changes (`yorkie` repo). Verified that no proto / server change is required.
- Pod sizing, autoscaling, MongoDB capacity. Tracked in deployment design.
- Document watcher visibility for polling clients (`DocWatched`/`DocUnwatched` events). Documented as a known limitation in the design doc.
- 200K production benchmark run. Listed as the primary acceptance criterion in the design doc; out of scope for the SDK implementation plan.

## Validation Checklist

- [ ] `pnpm lint` clean.
- [ ] `pnpm sdk build` clean.
- [ ] `pnpm sdk test` clean — all existing tests pass, new polling tests pass.
- [ ] Manual smoke: `attachChannel(ch, { syncMode: 'polling' })` works against the dev server with the docker-compose stack.
- [ ] Design doc reference (`docs/design/polling-sync-mode.md`) is current.
