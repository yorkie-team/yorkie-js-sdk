# Channel RefreshChannel-Only SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align JS SDK with yorkie server `065e4bbf` so channel attach/detach is driven by `RefreshChannel` only — no more `AttachChannel` / `DetachChannel` RPCs, default heartbeat tuned to 5 s, transparent session-expiry recovery, and `peekChannel` usable without `client.activate()`.

**Architecture:** Server already collapses `ActivateClient + AttachChannel + RefreshChannel` into a single first call (empty `session_id`). The SDK keeps the public `client.attach(channel)` / `client.detach(channel)` surface but routes everything through the sync loop's heartbeat path. Channel-only clients no longer need `activate()`: the first heartbeat response populates `Client.id` and `Channel.sessionID`.

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, Connect-RPC client, buf for protobuf, Docker-Compose for the test Yorkie server.

**Spec:** `docs/design/channel-refresh-only.md`

**Source-of-truth references inside the repo:**
- `packages/sdk/src/client/client.ts` (most edits live here)
- `packages/sdk/src/client/attachment.ts`
- `packages/sdk/src/channel/channel.ts`
- `packages/sdk/src/api/yorkie/v1/yorkie.proto` + generated `yorkie_pb.ts`
- `packages/sdk/src/util/error.ts`
- `packages/sdk/test/integration/channel_test.ts`, `channel_polling_test.ts`, `integration_helper.ts`

**Up-front terminology cheat sheet (for an engineer new to this codebase):**
- *Attachment* = the per-resource SDK-side bookkeeping object (sync mode, heartbeat interval, watch stream). Both Documents and Channels get one.
- *enqueueTask* = the Client's serial task queue. RPCs that mutate client state go through it so two flows never race.
- `pnpm sdk` is shorthand for `pnpm --filter=@yorkie-js/sdk`.

---

## Pre-flight (run once before starting)

- [ ] **Confirm Yorkie server is up to date**

  Run: `cd /Users/user/Documents/yorkie && git log --oneline origin/main -1 | grep "065e4bbf"`
  Expected: prints the commit `Channel RPC consolidation + PeekChannel (#1805)`. If not, fetch first.

- [ ] **Start Yorkie server for integration tests**

  Run: `docker compose -f docker/docker-compose.yml up --build -d`
  Expected: `yorkie` container `Started`. Server listens on `localhost:8080`.

- [ ] **Verify current branch state**

  Run: `git status` and confirm working tree is clean (other than untracked `.superpowers/`).

---

## Task 1: Update local `.proto` to match server contract

**Files:**
- Modify: `packages/sdk/src/api/yorkie/v1/yorkie.proto:282-289` (RefreshChannel messages)
- Modify: `packages/sdk/src/api/yorkie/v1/yorkie.proto` (add PeekChannel service entry near other channel RPCs around line 48-49 if missing)

The local `.proto` is the input to `buf generate`. It currently lags behind the server. Bring it in line with yorkie commit `065e4bbf`'s additions: extra fields on RefreshChannel, a new PeekChannel service entry.

- [ ] **Step 1: Read current contents around lines 45-55 and 280-302**

  Run: open the file and confirm the diff target: `RefreshChannelRequest`, `RefreshChannelResponse`, `PeekChannelRequest`, `PeekChannelResponse`.

- [ ] **Step 2: Add `client_key` and `metadata` fields to `RefreshChannelRequest` (lines 282-286 today)**

  Replace:

  ```proto
  message RefreshChannelRequest {
    string client_id = 1;
    string channel_key = 2;
    string session_id = 3;
  }
  ```

  With:

  ```proto
  message RefreshChannelRequest {
    string client_id = 1;
    string channel_key = 2;
    string session_id = 3;
    // client_key and metadata are used only on the first call (when session_id
    // is empty). The server activates the client and attaches it to the channel
    // before refreshing, collapsing ActivateClient + AttachChannel +
    // RefreshChannel into a single round trip.
    string client_key = 4;
    map<string, string> metadata = 5;
  }
  ```

- [ ] **Step 3: Add `client_id` and `session_id` to `RefreshChannelResponse`**

  Replace:

  ```proto
  message RefreshChannelResponse {
    int64 session_count = 1;
  }
  ```

  With:

  ```proto
  message RefreshChannelResponse {
    int64 session_count = 1;
    // client_id and session_id are populated only when the request was a
    // first-call (i.e. session_id was empty). Subsequent heartbeats leave
    // these empty.
    string client_id = 2;
    string session_id = 3;
  }
  ```

- [ ] **Step 4: Make sure `PeekChannel` service entry exists**

  Search the service block (lines ~45-55). If `rpc PeekChannel (PeekChannelRequest) returns (PeekChannelResponse) {}` is missing, insert it immediately above `rpc Broadcast`. The `PeekChannelRequest`/`Response` messages (lines ~296-302) already exist; do not duplicate.

- [ ] **Step 5: Regenerate the TypeScript stubs**

  Run: `pnpm sdk build:proto`
  Expected: command exits 0; `packages/sdk/src/api/yorkie/v1/yorkie_pb.ts` shows the new fields. Quick check:

  ```bash
  grep -n "clientKey\|client_key = 4" packages/sdk/src/api/yorkie/v1/yorkie_pb.ts | head
  ```

  Expected: at least one match inside the `RefreshChannelRequest` type.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/sdk/src/api/yorkie/v1/yorkie.proto packages/sdk/src/api/yorkie/v1/yorkie_pb.ts
  git commit -m "Sync yorkie.proto with server channel RPC consolidation"
  ```

---

## Task 2: Add `ErrSessionNotFound` to the SDK error code enum

**Files:**
- Modify: `packages/sdk/src/util/error.ts` (Code enum, near the existing `ErrNotAttached` entry around line 37)

Server returns `ErrSessionNotFound` when the session has been reclaimed by the channel manager (TTL expiry, manual drop). The SDK needs to recognise this code to auto-recover. Use the same string the server emits.

- [ ] **Step 1: Insert the new code**

  Add the following block immediately after the `ErrNotDetached` entry (around line 40):

  ```ts
    // ErrSessionNotFound is returned when the server no longer recognises a
    // channel session_id (e.g. reclaimed after TTL). Callers should treat this
    // as "session expired" and retry as a first-call (empty session_id).
    ErrSessionNotFound = 'ErrSessionNotFound',
  ```

- [ ] **Step 2: Build to confirm no type errors**

  Run: `pnpm sdk build`
  Expected: build succeeds.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/sdk/src/util/error.ts
  git commit -m "Add ErrSessionNotFound to SDK error codes"
  ```

---

## Task 3: Lower channel heartbeat defaults to 5 s

**Files:**
- Modify: `packages/sdk/src/client/client.ts` lines 199-203 (JSDoc on `ClientOptions.channelHeartbeatInterval`)
- Modify: `packages/sdk/src/client/client.ts` line 312 (`DefaultClientOptions.channelHeartbeatInterval`)
- Modify: `packages/sdk/src/client/client.ts` line 302 (`DefaultPollingIntervalMs`)
- Modify: `packages/sdk/src/client/client.ts` lines 289-294 (JSDoc on `AttachChannelOptions.channelHeartbeatInterval`)

Server `ChannelSessionTTL` is now 15 s; TTL/3 = 5 s is the safe upper bound. Both modes share the new default. Custom overrides remain.

- [ ] **Step 1: Split the constants by resource type**

  The current `DefaultPollingIntervalMs = 3000` is shared between *document* polling and *channel* polling. They now diverge: documents keep 3 s, channels move to 5 s. Rename and add.

  Replace:

  ```ts
  /**
   * `DefaultPollingIntervalMs` is the default heartbeat / poll interval
   * (ms) when `SyncMode.Polling` is in effect and the user has not set an
   * explicit interval.
   */
  const DefaultPollingIntervalMs = 3000;
  ```

  With:

  ```ts
  /**
   * `DefaultDocumentPollIntervalMs` is the default poll interval (ms) for
   * `SyncMode.Polling` documents when the user has not set an explicit
   * `documentPollInterval`.
   */
  const DefaultDocumentPollIntervalMs = 3000;

  /**
   * `DefaultChannelHeartbeatMs` is the default heartbeat interval for both
   * Realtime and Polling channel modes. Co-tuned to the server's
   * `ChannelSessionTTL` (15 s) at TTL/3.
   */
  const DefaultChannelHeartbeatMs = 5000;
  ```

  And replace:

  ```ts
  const DefaultClientOptions = {
    rpcAddr: 'https://api.yorkie.dev',
    syncLoopDuration: 50,
    retrySyncLoopDelay: 1000,
    reconnectStreamDelay: 1000,
    channelHeartbeatInterval: 30000,
  };
  ```

  With:

  ```ts
  const DefaultClientOptions = {
    rpcAddr: 'https://api.yorkie.dev',
    syncLoopDuration: 50,
    retrySyncLoopDelay: 1000,
    reconnectStreamDelay: 1000,
    channelHeartbeatInterval: DefaultChannelHeartbeatMs,
  };
  ```

- [ ] **Step 2: Update existing call sites**

  Run: `grep -n "DefaultPollingIntervalMs" packages/sdk/src/client/client.ts`
  Expected hits *before* edits: in `attachDocument` (~line 584), `attachChannel` (~line 820), `changeDocumentSyncMode` (~line 997), `changeChannelSyncMode` (~line 1070).

  - **`attachDocument`** (~line 584): swap to `DefaultDocumentPollIntervalMs`.
  - **`changeDocumentSyncMode`** (~line 997): swap to `DefaultDocumentPollIntervalMs`.
  - **`attachChannel`**: leave alone — Task 5 rewrites this method entirely and uses `this.channelHeartbeatInterval` (which now resolves to 5000 via `DefaultClientOptions`).
  - **`changeChannelSyncMode`** (~lines 1066-1074): replace the polling/realtime-specific branch:

    ```ts
    if (!attachment.pollIntervalPinned) {
      attachment.pollInterval =
        syncMode === SyncMode.Polling
          ? DefaultPollingIntervalMs
          : syncMode === SyncMode.Realtime
            ? this.channelHeartbeatInterval
            : 0;
    }
    ```

    With (single channel cadence for Polling + Realtime):

    ```ts
    if (!attachment.pollIntervalPinned) {
      attachment.pollInterval =
        syncMode === SyncMode.Manual ? 0 : this.channelHeartbeatInterval;
    }
    ```

  After all swaps, re-run `grep -n "DefaultPollingIntervalMs" packages/sdk/src/client/client.ts` — expect **zero** matches.

- [ ] **Step 3: Update both JSDoc blocks to reflect the new default**

  On `ClientOptions.channelHeartbeatInterval` (around line 199-203):

  ```ts
    /**
     * `channelHeartbeatInterval` is the interval of the channel heartbeat (ms).
     * The client sends a `RefreshChannel` heartbeat to refresh the channel
     * session TTL. The default value is `5000` (ms) — co-tuned to the server's
     * `ChannelSessionTTL` (15 s) at TTL/3. Values larger than the server TTL
     * risk premature session expiry.
     */
    channelHeartbeatInterval?: number;
  ```

  On `AttachChannelOptions.channelHeartbeatInterval` (around line 289-294):

  ```ts
    /**
     * `channelHeartbeatInterval` overrides the heartbeat interval (ms) for
     * this attachment. If unset, the client-level default
     * (`ClientOptions.channelHeartbeatInterval`, default 5000 ms) applies
     * to both Realtime and Polling modes.
     */
    channelHeartbeatInterval?: number;
  ```

- [ ] **Step 4: Build, lint**

  Run: `pnpm lint && pnpm sdk build`
  Expected: both succeed with zero warnings.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/sdk/src/client/client.ts
  git commit -m "Default channel heartbeat to 5s (TTL/3)"
  ```

---

## Task 4: Allow `Attachment.resourceID` to be assigned post-construction

**Files:**
- Modify: `packages/sdk/src/client/attachment.ts` lines 39-73

Channels no longer know their `sessionId` at construction time — it arrives in the first `RefreshChannel` response. Make `resourceID` optional in the constructor and add a setter that the client calls when the first response lands.

- [ ] **Step 1: Update the class field and constructor signature**

  Replace the field declaration:

  ```ts
    resource: R;
    resourceID: string;
  ```

  With:

  ```ts
    resource: R;
    /**
     * For Documents: the document's resourceID, available at attach time.
     * For Channels: the server-issued session_id. Starts empty and is
     * populated after the first `RefreshChannel` first-call response.
     */
    resourceID: string;
  ```

  Then change the constructor parameter default for `resourceID` so it accepts an empty string:

  Replace:

  ```ts
    constructor(
      reconnectStreamDelay: number,
      resource: R,
      resourceID: string,
      syncMode?: SyncMode,
      pollInterval: number = 0,
      pollIntervalPinned: boolean = false,
    ) {
  ```

  With:

  ```ts
    constructor(
      reconnectStreamDelay: number,
      resource: R,
      resourceID: string = '',
      syncMode?: SyncMode,
      pollInterval: number = 0,
      pollIntervalPinned: boolean = false,
    ) {
  ```

  No other body changes needed — assignment is already direct.

- [ ] **Step 2: Build to confirm**

  Run: `pnpm sdk build`
  Expected: build succeeds; no callers break (Document path still passes its `resourceID`).

- [ ] **Step 3: Commit**

  ```bash
  git add packages/sdk/src/client/attachment.ts
  git commit -m "Allow Attachment.resourceID to default empty for channels"
  ```

---

## Task 5: Drop `AttachChannel` RPC from `client.attach(channel)`

**Files:**
- Modify: `packages/sdk/src/client/client.ts:763-866` (the `attachChannel` method)

After this task, `client.attach(channel)` is purely local bookkeeping: validate, create `Attachment`, register `local-broadcast` subscription, start the watch loop for Realtime. The first heartbeat (driven by the sync loop) handles the server-side attach.

- [ ] **Step 1: Write a failing integration test for "attach without activate"**

  Append to `packages/sdk/test/integration/channel_test.ts`:

  ```ts
  it('can attach a channel without activating the client', async function () {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    const channel = new yorkie.Channel(
      `${toDocKey(this.test!.fullTitle())}-${Date.now()}`,
    );

    // No client.activate() call here.
    await client.attach(channel);

    // Within ~heartbeat interval the channel becomes attached and gets a
    // session_id from the server.
    await waitFor(() => channel.isAttached() && !!channel.getSessionID(), {
      timeout: 8000,
      message: 'channel did not finish first-call attach',
    });

    assert.isString(channel.getSessionID());
    assert.notStrictEqual(channel.getSessionID(), '');

    await client.detach(channel);
  });
  ```

  Add the `toDocKey` import at the top of the file if missing, and a small inline `waitFor` helper at the bottom of the file (if no existing helper):

  ```ts
  async function waitFor(
    pred: () => boolean,
    { timeout = 5000, interval = 100, message = 'waitFor timeout' } = {},
  ): Promise<void> {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > timeout) throw new Error(message);
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm sdk test test/integration/channel_test.ts -t "without activating"`
  Expected: FAIL with `ErrClientNotActivated` (or equivalent), because today's `attachChannel` requires `isActive()`.

- [ ] **Step 3: Refactor `attachChannel` to drop the RPC and the activate guard**

  Replace the body of `public async attachChannel(channel, opts = {})` (lines 763-866) with:

  ```ts
  public async attachChannel(
    channel: Channel,
    opts: AttachChannelOptions = {},
  ): Promise<Channel> {
    if (channel.getStatus() !== ChannelStatus.Detached) {
      throw new YorkieError(
        Code.ErrNotDetached,
        `${channel.getKey()} is not detached`,
      );
    }

    const syncMode = opts.syncMode ?? SyncMode.Realtime;
    this.assertValidChannelSyncMode(syncMode);

    if (
      opts.channelHeartbeatInterval !== undefined &&
      opts.channelHeartbeatInterval <= 0
    ) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'channelHeartbeatInterval must be greater than 0',
      );
    }

    const pollIntervalPinned = opts.channelHeartbeatInterval !== undefined;
    const pollInterval =
      opts.channelHeartbeatInterval ?? this.channelHeartbeatInterval;

    const task = async () => {
      // Channel doesn't get an actor ID until the first refresh response
      // populates the client's own id. Once `this.id` exists, propagate it
      // to the channel so broadcasts attribute correctly.
      if (this.id) {
        channel.setActor(this.id);
      }

      const attachment = new Attachment<Channel>(
        this.reconnectStreamDelay,
        channel,
        '', // sessionID populated on first refresh response
        syncMode,
        pollInterval,
        pollIntervalPinned,
      );

      // Forward local broadcast events to the RPC client. Unsubscribe lives
      // in detachChannel (Task 6).
      channel.subscribe('local-broadcast', (event) => {
        const { topic, payload, options } = event;
        this.broadcast(channel.getKey(), topic, payload, options).catch(
          (error) => {
            if (options?.error) options.error(error);
            logger.error(`[BC] c:"${this.getKey()}" failed: ${error}`);
          },
        );
      });

      this.attachmentMap.set(channel.getKey(), attachment);

      // Make sure the sync loop is running so the first refresh fires.
      if (!this.conditions[ClientCondition.SyncLoop]) {
        this.runSyncLoop();
      }

      // Realtime: open the watch stream now (idempotent against later
      // first-refresh activations of this client).
      if (syncMode === SyncMode.Realtime) {
        await this.runWatchLoop(channel.getKey());
      }

      logger.info(
        `[AP] c:"${this.getKey()}" attaches p:"${channel.getKey()}" mode:${syncMode}`,
      );
      return channel;
    };

    return this.enqueueTask(task);
  }
  ```

  Notes for the engineer:
  - `channel.applyStatus(ChannelStatus.Attached)` is intentionally NOT called here. That transition happens in `syncInternal` when the first refresh response lands (Task 7).
  - The `isActive()` check is removed: a channel-only client uses the same code path. Document attach (`attachDocument`) keeps its own `isActive()` check, untouched.

- [ ] **Step 4: Run the failing test — should now pass**

  Run: `pnpm sdk test test/integration/channel_test.ts -t "without activating"`
  Expected: FAIL still — `syncInternal` hasn't been taught the first-call protocol yet. The test will hang until timeout because `channel.isAttached()` never flips. That's the expected mid-state.

  Continue to Task 7; do not commit until the test passes. (Task 6 is independent and can land first.)

---

## Task 6: Drop `DetachChannel` RPC from `client.detach(channel)`

**Files:**
- Modify: `packages/sdk/src/client/client.ts:872-919` (the `detachChannel` method)

Detach is now local-only. The server reclaims sessions via TTL.

- [ ] **Step 1: Add a peer-visibility integration test**

  Append to `packages/sdk/test/integration/channel_test.ts`:

  ```ts
  it('peers see count drop after detach within TTL window', async function () {
    await withTwoClientsAndChannels(async (c1, ch1, c2, ch2) => {
      await waitFor(() => ch1.getSessionCount() === 2 && ch2.getSessionCount() === 2);
      await c2.detach(ch2);
      // TTL is 15 s on the server; allow up to 20 s for c1's heartbeat to
      // observe the lower count.
      await waitFor(() => ch1.getSessionCount() === 1, { timeout: 20000 });
    }, this.test!.fullTitle());
  });
  ```

- [ ] **Step 2: Run the test before refactor**

  Run: `pnpm sdk test test/integration/channel_test.ts -t "count drop after detach"`
  Expected: PASS today (existing DetachChannel immediately drops the count). We are tightening the contract — the test must still pass after the refactor, just for a different reason (TTL expiry).

- [ ] **Step 3: Refactor `detachChannel` body**

  Replace the body of `public async detachChannel(channel)` (lines 872-919) with:

  ```ts
  public async detachChannel(channel: Channel): Promise<Channel> {
    if (!this.attachmentMap.has(channel.getKey())) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${channel.getKey()} is not attached`,
      );
    }

    const task = async () => {
      // No DetachChannel RPC: the server reclaims the session via TTL.
      // We only need local cleanup.
      channel.applyStatus(ChannelStatus.Detached);
      this.detachInternal(channel.getKey());

      logger.info(
        `[DP] c:"${this.getKey()}" detaches p:"${channel.getKey()}" (local)`,
      );
      return channel;
    };

    return this.enqueueTask(task);
  }
  ```

  Notes:
  - The `isActive()` check is removed for symmetry with attach.
  - The previous response-driven `channel.updateSessionCount(...)` call is dropped; peer counts converge via heartbeats.

- [ ] **Step 4: Re-run the test**

  Run: `pnpm sdk test test/integration/channel_test.ts -t "count drop after detach"`
  Expected: PASS within ~20 s.

- [ ] **Step 5: Commit Task 5 + Task 6 together**

  ```bash
  git add packages/sdk/src/client/client.ts packages/sdk/test/integration/channel_test.ts
  git commit -m "Drop AttachChannel/DetachChannel RPC calls from client"
  ```

  (Task 5's test will still be timing out at this point — that's OK; it will pass after Task 7.)

---

## Task 7: Teach `syncInternal` the first-call refresh protocol + session-expiry recovery

**Files:**
- Modify: `packages/sdk/src/client/client.ts:2057-2100` (the Channel branch of `syncInternal`)
- Modify: `packages/sdk/src/channel/channel.ts:227-229` (`applyStatus`) — no change, just relied on
- Modify: `packages/sdk/src/client/client.ts` — `Client.id` is currently `private` and `readonly`-ish; allow mutation through a small helper

This is the heart of the change. The sync loop already calls `refreshChannel` once per interval; we just enrich the request/response handling.

- [ ] **Step 1: Add an integration test for session-expiry auto-recovery**

  Append to `packages/sdk/test/integration/channel_test.ts`:

  ```ts
  it('recovers transparently when the server forgets the session', async function () {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    const channel = new yorkie.Channel(
      `${toDocKey(this.test!.fullTitle())}-${Date.now()}`,
    );
    await client.attach(channel);
    await waitFor(() => !!channel.getSessionID());

    const original = channel.getSessionID();

    // Simulate server-side expiry by overwriting the channel's session_id
    // with a known-bad value. The next refresh tick should receive
    // ErrSessionNotFound and silently re-attach.
    channel.setSessionID('does-not-exist');

    await waitFor(() => channel.getSessionID() && channel.getSessionID() !== 'does-not-exist', {
      timeout: 10000,
      message: 'session was not re-issued after forced expiry',
    });

    assert.notStrictEqual(channel.getSessionID(), original);
    await client.detach(channel);
  });
  ```

- [ ] **Step 2: Replace the Channel branch of `syncInternal`**

  Locate lines ~2063-2100 in `client.ts`. Replace the entire `if (resource instanceof Channel) { ... return resource; }` block with:

  ```ts
  if (resource instanceof Channel) {
    const isFirstCall = !resource.getSessionID();
    try {
      const res = await this.rpcClient.refreshChannel(
        {
          clientId: this.id ?? '',
          channelKey: resource.getKey(),
          sessionId: resource.getSessionID() ?? '',
          // First-call only — these fields are ignored by the server
          // once a session_id is established.
          clientKey: isFirstCall ? this.key : '',
          metadata: isFirstCall ? this.metadata : {},
        },
        {
          headers: {
            'x-shard-key': `${this.apiKey}/${resource.getFirstKeyPath()}`,
          },
        },
      );

      if (isFirstCall) {
        // Server has just activated the client and attached the channel.
        if (res.clientId) {
          this.id = res.clientId;
          this.status = ClientStatus.Activated;
          resource.setActor(res.clientId);
        }
        if (res.sessionId) {
          resource.setSessionID(res.sessionId);
          attachment.resourceID = res.sessionId;
        }
        resource.applyStatus(ChannelStatus.Attached);
      }

      const prevCount = resource.getSessionCount();
      if (resource.updateSessionCount(Number(res.sessionCount), 0)) {
        if (resource.getSessionCount() !== prevCount) {
          resource.publish({
            type: ChannelEventType.PresenceChanged,
            count: resource.getSessionCount(),
          });
        }
      }
      attachment.updateHeartbeatTime();

      logger.debug(
        `[RP] c:"${this.getKey()}" refreshes p:"${resource.getKey()}" mode:${attachment.syncMode}`,
      );
    } catch (err) {
      if (isErrorCode(err, Code.ErrSessionNotFound)) {
        // Server has reclaimed our session (TTL expiry, restart, etc.).
        // Clear local sessionID so the next tick re-enters the first-call
        // branch and re-attaches transparently. Do not surface to caller.
        logger.info(
          `[RP] c:"${this.getKey()}" session expired for p:"${resource.getKey()}", re-attaching`,
        );
        resource.setSessionID('');
        attachment.resourceID = '';
        return resource;
      }
      logger.error(`[RP] c:"${this.getKey()}" err :`, err);
      throw err;
    }
    return resource;
  }
  ```

  Notes:
  - `attachment` is already in scope (`const { resource } = attachment;` two lines above).
  - We use `??` (not `||`) so an empty string client_id is preserved.
  - `setSessionID('')` is allowed because the field is `string | undefined`; we treat empty string and undefined symmetrically when reading (`!resource.getSessionID()` covers both).

- [ ] **Step 3: Confirm `Channel.setSessionID` accepts empty string**

  Look at `packages/sdk/src/channel/channel.ts:262`. The signature is `public setSessionID(sessionID: string)`; empty string is fine. No code change needed, but verify by reading.

- [ ] **Step 4: Run the new test plus the Task 5 test**

  Run: `pnpm sdk test test/integration/channel_test.ts -t "without activating"`
  Expected: PASS.

  Run: `pnpm sdk test test/integration/channel_test.ts -t "recovers transparently"`
  Expected: PASS.

- [ ] **Step 5: Run the full channel test suite**

  Run: `pnpm sdk test test/integration/channel_test.ts test/integration/channel_polling_test.ts`
  Expected: all pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/sdk/src/client/client.ts packages/sdk/test/integration/channel_test.ts
  git commit -m "Implement first-call RefreshChannel + auto re-attach on expiry"
  ```

---

## Task 8: Loosen `isActive()` guards that no longer apply

**Files:**
- Modify: `packages/sdk/src/client/client.ts:1489-1508` (`peekChannel`)
- Modify: `packages/sdk/src/client/client.ts:1033-1083` (`changeChannelSyncMode`)
- Modify: `packages/sdk/src/client/client.ts:1108-1115` (`sync(channel)` overload entry)
- Modify: `packages/sdk/src/client/client.ts:1520-1530` (`broadcast`)
- Modify: `packages/sdk/src/client/client.ts:1613-1619` (`runSyncLoop` exit condition)

`peekChannel` is stateless and must work for unactivated clients. `changeChannelSyncMode`, `sync(channel)`, and `broadcast` operate on already-attached channels, so requiring `isActive()` adds nothing — the attachment is the precondition. The sync loop must also keep running when only channels are attached.

- [ ] **Step 1: Remove `isActive()` checks from the four channel-aware methods**

  In `peekChannel`, delete the `if (!this.isActive()) throw ...` block at the start.

  In `changeChannelSyncMode`, same: delete the `if (!this.isActive())` block (lines 1037-1042). The attachment lookup right below remains.

  In `sync(channel)` overload (around line 1108): delete the `isActive` check. Document-side `sync()` does its own check inside the document branch already — verify before deleting, and if Document path relies on the shared check, restructure to:

  ```ts
  if (resource instanceof Channel) {
    // Channels don't require activate().
  } else if (!this.isActive()) {
    throw new YorkieError(
      Code.ErrClientNotActivated,
      `${this.key} is not active`,
    );
  }
  ```

  In `broadcast` (lines 1520-1530): same pattern — gate on attachment, not on `isActive()`. The attachment lookup that follows is sufficient.

- [ ] **Step 2: Keep the sync loop running for channel-only clients**

  Replace the early-exit at the top of `runSyncLoop.doLoop`:

  ```ts
  if (!this.isActive() || this.deactivating) {
    logger.debug(`[SL] c:"${this.getKey()}" exit sync loop`);
    this.conditions[ClientCondition.SyncLoop] = false;
    return;
  }
  ```

  With:

  ```ts
  if (this.deactivating) {
    logger.debug(`[SL] c:"${this.getKey()}" exit sync loop (deactivating)`);
    this.conditions[ClientCondition.SyncLoop] = false;
    return;
  }
  // Stop the loop only when nothing remains to sync. A channel-only client
  // has no `Activated` status until the first refresh succeeds, but its
  // attachment is enough to keep ticking.
  if (!this.isActive() && this.attachmentMap.size === 0) {
    logger.debug(`[SL] c:"${this.getKey()}" exit sync loop (idle)`);
    this.conditions[ClientCondition.SyncLoop] = false;
    return;
  }
  ```

- [ ] **Step 3: Add an integration test for peekChannel without activate**

  Append to `packages/sdk/test/integration/channel_test.ts`:

  ```ts
  it('peekChannel works without client.activate()', async function () {
    const channelKey = `${toDocKey(this.test!.fullTitle())}-${Date.now()}`;
    const writer = new yorkie.Client({ rpcAddr: testRPCAddr });
    const writerChannel = new yorkie.Channel(channelKey);
    await writer.attach(writerChannel);
    await waitFor(() => !!writerChannel.getSessionID());

    const peeker = new yorkie.Client({ rpcAddr: testRPCAddr });
    const count = await peeker.peekChannel(channelKey);
    assert.strictEqual(count, 1);

    await writer.detach(writerChannel);
  });
  ```

- [ ] **Step 4: Run all channel tests**

  Run: `pnpm sdk test test/integration/channel_test.ts test/integration/channel_polling_test.ts`
  Expected: every test passes, including the three new ones (Task 5, Task 7, Task 8).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/sdk/src/client/client.ts packages/sdk/test/integration/channel_test.ts
  git commit -m "Allow channel ops on unactivated clients; keep sync loop alive for channel-only clients"
  ```

---

## Task 9: Update integration test helper to demonstrate the new flow

**Files:**
- Modify: `packages/sdk/test/integration/integration_helper.ts:71-94` (`withTwoClientsAndChannels`)

The helper still calls `activate()` / `deactivate()` because the old API required it. Drop those calls in the channel-only helper — both to exercise the new flow and to shave a round trip per test.

- [ ] **Step 1: Replace the helper body**

  Replace the entire `withTwoClientsAndChannels` function with:

  ```ts
  export async function withTwoClientsAndChannels(
    callback: (c1: Client, p1: Channel, c2: Client, p2: Channel) => Promise<void>,
    title: string,
  ): Promise<void> {
    const client1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    const channelKey = `${toDocKey(title)}-${new Date().getTime()}`;
    const ch1 = new yorkie.Channel(channelKey);
    const ch2 = new yorkie.Channel(channelKey);

    await client1.attach(ch1);
    await client2.attach(ch2);

    await callback(client1, ch1, client2, ch2);

    await client1.detach(ch1);
    await client2.detach(ch2);

    // Channel-only clients are never explicitly activated, so they have
    // nothing to deactivate. If a test activated them, deactivate is the
    // test's responsibility.
  }
  ```

- [ ] **Step 2: Run the affected suites**

  Run: `pnpm sdk test test/integration/channel_test.ts test/integration/channel_polling_test.ts`
  Expected: all green.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/sdk/test/integration/integration_helper.ts
  git commit -m "Drop activate/deactivate from channel-only test helper"
  ```

---

## Task 10: Whole-SDK regression sweep + docs

**Files:**
- Run all SDK tests
- Update `docs/design/channel-refresh-only.md` to mark the design as implemented if you wish (optional)

- [ ] **Step 1: Lint**

  Run: `pnpm lint`
  Expected: zero warnings.

- [ ] **Step 2: Build**

  Run: `pnpm sdk build`
  Expected: success.

- [ ] **Step 3: Full SDK test run**

  Run: `pnpm sdk test`
  Expected: all suites pass. Watch especially for:
  - `test/integration/channel_test.ts`
  - `test/integration/channel_polling_test.ts`
  - `test/integration/presence_test.ts` (uses Documents — should be untouched but verify)

- [ ] **Step 4: Smoke-test the React playground**

  Run: `pnpm --filter=react-polling-playground dev`
  Open the printed URL, navigate to `/`, then `/write`, and confirm presence counts populate without errors. (No code changes expected; this just verifies the React hook hasn't drifted.)

- [ ] **Step 5: Move the task file to archive**

  ```bash
  git mv docs/tasks/active/20260514-channel-refresh-only-todo.md docs/tasks/archive/
  ```

  And drop a sibling `20260514-channel-refresh-only-lessons.md` capturing anything surprising encountered during implementation (if nothing surprising, a one-line "no surprises" note is fine).

- [ ] **Step 6: Final commit**

  ```bash
  git add docs/tasks/
  git commit -m "Archive channel-refresh-only task with lessons"
  ```

---

## Out-of-scope follow-ups (do NOT implement here)

- Port `usePeekChannel` React hook from `channel-peek` branch onto this base (separate task).
- Add a `Channel.SessionExpired` event for callers who want to observe expiry rather than rely on transparent recovery.
- Migrate React hooks to assume `client.activate()` is optional for channel-only flows.

---

## Self-Review checklist (filled before this plan is final)

- **Spec coverage:** Every section in the design doc maps to a task —
  Public API (Tasks 5, 6), Lifecycle flow (Tasks 5, 6, 7), Activate elision (Tasks 5, 8), Heartbeat defaults (Task 3), Session expiry recovery (Task 7), PeekChannel (Task 8), Risks → covered by tests in Tasks 5/6/7/8.
- **Placeholder scan:** No "TBD"/"TODO"/"similar to" entries. Every code step has the actual replacement text inline.
- **Type consistency:** `clientKey` / `metadata` / `clientId` / `sessionId` field names match the proto in Task 1. `ErrSessionNotFound` matches the server constant. `Channel.setSessionID` already exists; no rename. `DefaultChannelHeartbeatMs` is introduced in Task 3 and used wherever the old `DefaultPollingIntervalMs` was referenced.
