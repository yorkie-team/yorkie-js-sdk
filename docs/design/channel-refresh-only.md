---
created: 2026-05-14
updated: 2026-05-14
tags: [channel, rpc, presence]
---

# Channel lifecycle via RefreshChannel only

## Problem

Joining a presence channel currently costs three round trips
(`ActivateClient` + `AttachChannel` + `RefreshChannel`), every heartbeat
re-queries MongoDB through `FindActiveClientInfo`, and dead sessions linger
for the full 60 s TTL — inflating the visible session count.

The Yorkie server has already consolidated the wire protocol
(yorkie commit `065e4bbf`, "Channel RPC consolidation + PeekChannel"):

- `RefreshChannel` now performs `ActivateClient + AttachChannel` on its
  first call (empty `session_id`); the response returns the assigned
  `client_id` and `session_id`.
- The heartbeat path no longer reads MongoDB; the in-memory channel
  session map is the sole liveness source.
- Default `ChannelSessionTTL` dropped from 60 s to 15 s; the recommended
  client heartbeat cadence is TTL/3 = 5 s.
- `PeekChannel` is a new stateless RPC for read-only count display.

The JS SDK on `main` still calls `AttachChannel` and `DetachChannel`,
defaults the realtime heartbeat to 30 s (now longer than the 15 s TTL),
and does not yet expose `PeekChannel`. This design aligns the SDK with
the new server contract.

### Goals

- Drop `AttachChannel` / `DetachChannel` RPC calls from the SDK; route
  the channel lifecycle through `RefreshChannel` only.
- Allow `Client.activate()` to be skipped when a client is used purely
  for channels.
- Default the channel heartbeat to 5 s for both realtime and polling
  modes so sessions survive the 15 s TTL.
- Recover transparently from server-side session expiry without
  surfacing it to callers.
- Add `client.peekChannel(channelKey)` so read-only consumers do not
  create sessions.

### Non-Goals

- Modifying the proto definitions or the server. Those changes already
  shipped in yorkie `065e4bbf`.
- Changing the public shape of `client.attach()` / `client.detach()`.
- Reworking document attach/detach.
- Backwards compatibility with old servers that still require
  `AttachChannel`. The two repos move together.

## Design

### Public API

`client.attach(channel, opts)` and `client.detach(channel)` keep their
existing signatures. Internally they become RPC-free in the channel
case: `attach` registers an `Attachment` and starts the heartbeat loop,
`detach` stops the loop and removes the attachment.

`AttachChannelOptions` (`syncMode`, `channelHeartbeatInterval`) is
unchanged.

A new `client.peekChannel(channelKey: string): Promise<number>` calls
the stateless `PeekChannel` RPC and returns the current `session_count`.

### Lifecycle flow

```
attach(channel)
  │
  ├── new Attachment(sessionId=undefined, syncMode, heartbeatInterval)
  ├── attachmentMap.set(key, attachment)
  ├── channel.applyStatus(Attached)  // optimistic; finalized on first hb response
  └── start heartbeat loop (and watch loop if realtime)
        │
        └── tick → RefreshChannel
              │
              ├── if !channel.sessionID:
              │     request { client_id: client.id ?? "",
              │                channel_key, session_id: "",
              │                client_key, metadata }
              │     on response:
              │       client.id ??= res.client_id
              │       channel.setSessionID(res.session_id)
              │       channel.updateSessionCount(res.session_count)
              │
              └── else:
                    request { client_id, channel_key, session_id }
                    on response:
                      channel.updateSessionCount(res.session_count)

detach(channel)
  │
  ├── stop heartbeat loop, cancel watch stream
  ├── attachmentMap.delete(key)
  └── channel.applyStatus(Detached)
        // no RPC; server reclaims via TTL after ~15s
```

### Activate elision

If the consumer never called `client.activate()` and only uses channels:

- `Client.id` starts unset.
- The first `RefreshChannel` request is sent with `client_id=""` plus
  `client_key` and `metadata` (from `ClientOptions`).
- The response populates `Client.id`. Subsequent channel attaches on the
  same client reuse this `id`.
- Document attach still requires an activated client; calling
  `client.attach(document)` on an unactivated client throws as today.

Concurrent first-attach for two channels on the same unactivated client
is serialized through the existing `enqueueTask` queue, so only one
`RefreshChannel` is in flight when `Client.id` is being assigned.

### Heartbeat defaults

| Mode      | Before              | After    |
|-----------|---------------------|----------|
| Realtime  | 30 000 ms           | 5 000 ms |
| Polling   | 3 000 ms            | 5 000 ms |
| Manual    | n/a (no auto sync)  | n/a      |

`channelHeartbeatInterval` on `ClientOptions` / `AttachChannelOptions`
remains a user-tunable override. Values larger than the server TTL
risk premature expiry; the JSDoc will note this.

### Session expiry recovery

When `RefreshChannel` returns a server error indicating the session is
no longer recognised (channel-session-not-found / equivalent), the SDK:

1. Clears `channel.sessionID` (back to `undefined`).
2. Schedules the next heartbeat normally.
3. The next tick re-enters the first-call branch and obtains a fresh
   `session_id` transparently.

Callers see at most a brief gap in `PresenceChanged` events; no event
is required to signal expiry.

### PeekChannel

`peekChannel(channelKey)` is stateless — no `Attachment`, no heartbeat,
no presence side effects. It calls the new RPC and returns the count.
The existing `usePeekChannel` work on the `channel-peek` branch can be
ported on top of this once the core API lands.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| TTL (15 s) shorter than legacy heartbeat default → sessions expire silently after upgrade | Bump default heartbeat to 5 s; document the relationship between TTL and `channelHeartbeatInterval`. |
| `detach()` no longer emits an immediate count drop on peers | Accept up to TTL of staleness; document the behaviour. If we need sharper drop later, add an opt-in leave hint in a follow-up. |
| Re-attaching the same channel immediately after detach inflates the count for one TTL window | Document. Re-attach is uncommon; cost is bounded by TTL. |
| First `RefreshChannel` fails (network, auth) | Reject `attach()` promise, roll back local state (`status=Detached`, remove attachment). Same surface as today's attach failure. |
| `Client.id` race between first channel attach and `client.activate()` called in parallel | `enqueueTask` already serialises both flows; activate-and-attach interleavings produce a single consistent `id`. |
| Old server still requires `AttachChannel` | Out of scope. Server and SDK move together; release notes will pin the minimum server version. |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Keep `client.attach(channel)` / `client.detach(channel)` public surface | Minimises churn for React hooks and examples; the semantic change is internal. |
| No "leave" hint on detach | Server PR intentionally relies on TTL as the only liveness source. Adding a hint would re-introduce the explicit-detach surface we are removing. |
| Auto re-attach on session expiry instead of surfacing an event | Network blips during heartbeat must not require user-level recovery code; the channel concept is "eventually consistent presence". |
| Default heartbeat 5 s in both modes | TTL/3 from the server PR; one number is easier to reason about than two. |
| Allow `activate()` elision for channel-only clients | Direct consequence of the server collapsing activate+attach into the first refresh. Forcing activate would defeat the new round-trip savings. |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Rename `attach`/`detach` to `subscribeChannel`/`unsubscribe` to reflect new semantics | Breaking change for React hooks and every example; the semantic difference is too small to justify churn. |
| Make channels owners (`channel.join(client)`) | Breaks symmetry with documents and forces an API split; rejected. |
| Keep `AttachChannel` call but have it skip when server reports unknown | Defeats the point of the consolidation — first call already does both jobs. |
| Send a final `RefreshChannel` with a leave flag on detach | Requires new proto + server work, contradicts the server PR's TTL-only liveness model. |
| Surface `SessionExpired` event and require callers to re-attach | Higher boilerplate for every consumer with no clear benefit, since the SDK already knows how to recover. |

## Tasks

Implementation plan will live in `docs/tasks/active/20260514-channel-refresh-only-todo.md`
(to be created via the writing-plans skill after this design is approved).
