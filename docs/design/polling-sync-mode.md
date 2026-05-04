---
created: 2026-05-04
updated: 2026-05-04
tags: [sync-mode, channel, document, polling, scaling]
---

# Polling Sync Mode

## Problem

`attachChannel` and `attach` (document) currently open a server-side gRPC
streaming subscription (`WatchChannel` / `WatchDocument`) in addition to
running the heartbeat / sync loop. The stream is the dominant server-side
cost when scaling to many concurrent connections.

Production benchmarks (8-core Yorkie pod, 20K skew) show that the stream
itself accounts for ~6.6 cores and ~21K goroutines, of which 18.8K
(85.6%) are blocked in `streamEvents`. CPU time spent purely on gRPC
response compression for the stream is 14% of total CPU. Removing the
stream and polling at 5s drops CPU usage to "idle" with `attach p(95)`
improving from 1,300ms to 3ms.

For Channel `Presence`, the stream's real-time push is not a feature
worth this cost: `sessionCount` is documented as approximate, so the
~3s latency of polling is acceptable. For read-only document viewers,
similar reasoning applies — receiving CRDT changes within a few seconds
is fine.

The SDK currently offers two channel modes (`Realtime`, `Manual` via
`isRealtime`) and four document modes (`Realtime`, `RealtimePushOnly`,
`RealtimeSyncOff`, `Manual`), all of which open a watch stream in the
non-Manual cases. There is no mode that runs the heartbeat or sync loop
without a stream.

### Goals

- Add a new `SyncMode.Polling` value that runs the resource's existing
  refresh / sync loop without opening a watch stream.
- Make `Polling` available for both Channel and Document with a single
  enum value, so the API surface is symmetric.
- Keep all existing call sites compiling and behaving identically. The
  default mode for both resources stays `Realtime`. `Polling` is opt-in.
- Allow runtime transition into and out of `Polling` via the existing
  `changeSyncMode` API.

### Non-Goals

- Removing or deprecating the watch stream. `WatchChannel` is still the
  required transport for broadcast events; `WatchDocument` is still the
  right default for collaborative editing.
- Adaptive polling (adjusting the interval based on `sessionCount`).
  Defer until production data is available.
- Server-side changes. The server already supports unary
  `RefreshChannel` and `PushPullChanges`; the design relies on these.
- `DocWatched` / `DocUnwatched` event delivery for polling clients. A
  polling document client is invisible to other watchers and does not
  receive watcher events. Documented as a known limitation.
- Pod sizing, autoscaling policy, MongoDB capacity. Tracked separately
  in deployment design.

## Design

### Mode definition

Add `Polling` to the existing `SyncMode` enum:

```ts
export enum SyncMode {
  Manual            = 'manual',
  Realtime          = 'realtime',
  RealtimePushOnly  = 'realtime-pushonly',  // document-only
  RealtimeSyncOff   = 'realtime-syncoff',   // document-only
  Polling           = 'polling',            // NEW: channel & document
}
```

`Polling` semantics differ slightly between resources but are
implementation-internal:

- **Channel**: heartbeat loop calls `RefreshChannel` at
  `channelHeartbeatInterval`. Response carries `sessionCount` and
  `seq`, applied to the channel's local state.
- **Document**: existing sync loop's `needSync()` returns `true` at
  `documentPollInterval` boundaries, causing periodic
  `PushPullChanges` calls. Remote changes arrive on the next tick;
  latency equals the polling interval.

### Public API

```ts
export interface AttachChannelOptions {
  syncMode?: SyncMode;                      // default: Realtime
  isRealtime?: boolean;                     // legacy; ignored if syncMode is set
  channelHeartbeatInterval?: number;        // default: polling=3000, realtime=30000
}

export interface AttachOptions<R, P extends Indexable> {
  syncMode?: SyncMode;                      // default: Realtime
  // ... existing fields ...
  documentPollInterval?: number;            // default: 3000 (Polling mode only)
}
```

Default sync mode for both `attach` and `attachChannel` stays
`Realtime`. Apps that want polling behavior must opt in:

```ts
client.attachChannel(channel, { syncMode: SyncMode.Polling });
client.attach(doc, { syncMode: SyncMode.Polling });
```

`isRealtime` continues to map `true → Realtime`, `false → Manual` for
back-compat. If both `syncMode` and `isRealtime` are provided,
`syncMode` wins. No runtime warning is emitted; the JSDoc marks
`isRealtime` as `@deprecated` for IDE hints only.

### Heartbeat / interval defaults

Heartbeat plays different roles per mode, so defaults differ:

| Resource | Manual | Realtime / variants            | Polling             |
|----------|--------|-------------------------------|---------------------|
| Channel  | n/a    | heartbeat 30s (TTL refresh)    | heartbeat **3s**    |
| Document | n/a    | n/a (sync loop event-driven)   | poll **3s**         |

Resolution at attach time:

```
interval = opts.channelHeartbeatInterval ??
           (syncMode === Polling ? 3000 : 30000)   // channel
interval = opts.documentPollInterval ?? 3000        // document, polling only
```

If the user explicitly sets the interval, it is preserved across mode
transitions. Otherwise, mode-specific defaults are reapplied on
`changeSyncMode`. `Attachment` tracks this with a
`pollIntervalPinned: boolean` flag.

### SDK internal flow

Channel attach:

```
attachChannel(ch, opts)
  resolve syncMode, interval, pinned-flag
  rpcClient.attachChannel(...)
  create Attachment(syncMode, interval)
  branch:
    Realtime → runWatchLoop(key)         // existing
    Polling  → runHeartbeatLoop(key)     // NEW
    Manual   → nothing
```

Document attach:

```
attach(doc, opts)
  resolve syncMode, pollInterval (if Polling)
  rpcClient.attachDocument(...)
  create Attachment(syncMode, pollInterval)
  branch:
    Realtime / variants → runWatchLoop(key)   // existing
    Polling             → (no stream)         // sync loop's needSync handles it
    Manual              → nothing
```

`runHeartbeatLoop` is new and channel-only. It loops while the
attachment is alive, sleeps for `heartbeatInterval`, calls
`RefreshChannel`, and applies `sessionCount` / `seq` to the local
channel. Errors are logged and the loop continues on the next tick;
permanent errors (auth failure, etc.) break the loop and trigger
existing error-handling paths.

Document `Polling` reuses the existing sync loop. `needSync()` gains a
`Polling` branch that returns `true` when
`Date.now() - lastSyncTime >= pollInterval`. No new loop is needed.

### Mode transitions (`changeSyncMode`)

`changeSyncMode` is currently typed for `Document`. Extend with an
overload for `Channel`, dispatching internally to
`changeChannelSyncMode` / `changeDocumentSyncMode` private methods.

Channel transition matrix:

| from \ to    | Realtime                      | Polling                       | Manual              |
|--------------|-------------------------------|-------------------------------|---------------------|
| Realtime     | —                             | cancelWatchStream → runHeartbeatLoop | cancelWatchStream  |
| Polling      | stopHeartbeatLoop → runWatchLoop | —                          | stopHeartbeatLoop   |
| Manual       | runWatchLoop                   | runHeartbeatLoop              | —                   |

Document transition matrix:

| from \ to        | Realtime / PushOnly / SyncOff       | Polling                        | Manual               |
|------------------|-------------------------------------|--------------------------------|----------------------|
| Realtime / vars  | (mode flag only)                    | cancelWatchStream              | cancelWatchStream    |
| Polling          | runWatchLoop                        | —                              | (needSync stops returning true) |
| Manual           | runWatchLoop                        | (needSync starts returning true at interval) | —      |

Tear-down precedes state change, which precedes start-up. If the user
did not pin the interval, it is recomputed for the new mode.

### Server-side impact

None. The server already supports the polling pattern:

- `AttachChannel` registers a session (independent of stream).
- `RefreshChannel` returns `sessionCount` and `seq`.
- `AttachDocument` and `PushPullChanges` operate as unary RPCs without
  requiring a stream.

The 20K production benchmark validated the channel polling path on
existing server code without modification.

### Compatibility

No breaking changes. `Realtime` remains the default for both
resources. All existing call sites are unaffected.

| Call pattern                                       | Behavior after change |
|----------------------------------------------------|----------------------|
| `attachChannel(ch)`                                | unchanged (Realtime)  |
| `attachChannel(ch, { isRealtime: true })`          | unchanged             |
| `attachChannel(ch, { isRealtime: false })`         | unchanged (Manual)    |
| `attachChannel(ch, { syncMode: Polling })`         | NEW                   |
| `attach(doc)`                                      | unchanged (Realtime)  |
| `attach(doc, { syncMode: Polling })`               | NEW                   |

Server-client wire format is unchanged, so a v0.8 SDK works against a
v0.7.x server and vice versa. Rolling deploy is safe.

### Risks and Mitigation

| Risk                                                                                 | Mitigation |
|--------------------------------------------------------------------------------------|------------|
| User picks `Polling` for collaborative document editing and reports lag as a bug.    | JSDoc on `Polling` enum value explicitly states unsuitability for collaborative editing. Migration guide includes the same note. |
| Polling document client is invisible to other watchers, surprising users who expect `DocWatched` events. | JSDoc and migration guide call this out as a known limitation with a recommendation to use Realtime for presence-aware document collaboration. |
| Heartbeat loop leaks on detach during in-flight RPC.                                 | Loop checks `attachmentMap.has(key)` and `isActive()` after every sleep and after every RPC return. Detach path removes the key first; loop exits at the next check. |
| Mode transition partial failure leaves the attachment in an inconsistent state.       | Tear-down is wrapped in try/finally; if start-up throws, the attachment ends up in a clean Manual-equivalent state. Existing `enqueueTask` serialization prevents concurrent transitions. |
| Channel polling default 3s overwhelms server when many channels are attached at once.| Default of 3s validated by 20K skew benchmark on 8-core pod (CPU idle). Apps with extreme channel counts can override `channelHeartbeatInterval`. |
| `SyncMode.Polling` enum value may be passed for documents in places that lack runtime checks. | `changeDocumentSyncMode` and document attach paths validate the mode at runtime; invalid combinations throw with a clear error. |

### Design Decisions

| Decision                                                                                    | Reason |
|---------------------------------------------------------------------------------------------|--------|
| One `Polling` value covers both Channel and Document.                                       | Symmetric API surface; users learn one mental model. Internal implementations differ but the contract is uniform. |
| Default mode stays `Realtime` for both resources.                                           | Avoids breaking apps that subscribe to broadcast or rely on real-time document sync. Polling is a deliberate, explicit optimization. |
| Channel polling default interval is 3s; Realtime is 30s.                                    | In Polling mode the heartbeat carries `sessionCount`, so freshness matters. In Realtime, the stream pushes presence and the heartbeat is only TTL maintenance. |
| Document polling reuses the existing sync loop.                                             | The sync loop already runs every `syncLoopDuration` and decides via `needSync()`. Adding a time-based branch is smaller than running a parallel loop and avoids two scheduling sources. |
| Channel polling uses a dedicated heartbeat loop (not shared with documents).                | Channels have no equivalent of the document sync loop; a small focused loop is the simplest fit. Asymmetric internal implementation, symmetric public API. |
| `isRealtime` retained without runtime warning.                                              | Behavior unchanged for legacy callers. Deprecation noise has costs and the team chose to skip it. JSDoc `@deprecated` is enough for IDE feedback. |
| No adaptive polling in v1.                                                                  | Threshold values would be guesswork without production `sessionCount` distribution data. Static 3s already validated. Revisit after running 200K. |
| No server-side changes.                                                                     | Existing server already handles unary RefreshChannel and PushPullChanges paths. Validated by production 20K benchmark. |

## Alternatives Considered

| Alternative                                                                                      | Why not |
|--------------------------------------------------------------------------------------------------|---------|
| Make `Polling` the default for Channel.                                                          | Silently breaks broadcast subscribers who rely on default behavior. Asymmetric defaults across resources also confuse users. |
| Channel-only `Polling`, document keeps stream-based modes.                                        | Asymmetric API surface — same enum value, different applicability. Users would have to remember per-resource matrix. |
| Add a separate `ChannelSyncMode` enum so types prevent mismatched usage.                          | Two enums named similarly increase cognitive load. Runtime validation in the (small number of) public entry points is sufficient. |
| Remove `WatchChannel` entirely and force polling.                                                 | Breaks broadcast use case (which legitimately needs push semantics). Out of scope per project constraints. |
| Adaptive polling (interval driven by `sessionCount`).                                             | Speculative thresholds. Static 3s already proven adequate by benchmark. Can be added on top of this design without API changes. |
| Server suggests polling interval in `RefreshChannel` response (`next_interval_ms`).               | Adds proto change for a problem that is not yet observed. YAGNI. |
| Run a dedicated polling loop for documents instead of reusing the sync loop.                      | Two scheduling sources for documents would race and require coordination. Reusing `needSync()` is one-line behavior. |

## Tasks

Implementation tasks tracked in `docs/tasks/active/` after this design
is approved. Validation against the 200K benchmark
(`v075-even-200k.yaml`) is the primary acceptance criterion.
