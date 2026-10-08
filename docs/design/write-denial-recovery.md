---
created: 2026-10-08
updated: 2026-10-08
tags: [client, auth, recovery]
---

# Recovering from a Write Denial

## Problem

An auth webhook can start denying a client's writes while that client is still
editing: an owner locks the document, a member is downgraded to read-only, a
share link is revoked. The revocation reaches the server before it reaches the
app, and the edits made in that window are pushed and refused:

```
revocation ─┬─ server: webhook denies writes for this client
            │      ← edits pushed here are rejected (PermissionDenied)
            └────── app: learns about it and switches the UI to read-only
```

The document then stops syncing for good:

- `handleConnectError` returns `false` for `ErrPermissionDenied`, so the sync
  loop for that document stops. Push and pull share one RPC, so the client also
  stops *receiving* other peers' changes.
- The refused changes stay in `localChanges`, so every later sync re-sends them
  and is refused again.
- The only app-visible signal is `sync-status: sync-failed`, which a network
  failure produces too.

The app cannot repair this on its own. `Document.update` applies a change to
`root` immediately and keeps no server-confirmed copy, so dropping the queue
would leave edits on screen the server never took; the dropped changes have
already consumed `clientSeq`, so the next push fails
`validateClientSeqContinuity`; and undo exists only for history-tracked
changes. Until now the only way out was to throw the client and the `Document`
away and attach a new one — which remounts the editor and loses UI state.

### Goals

- Tell a write refusal apart from a network failure, in an event.
- Recover the document in place, keeping the `Document` instance (and with it
  the app's subscriptions and the editor bound to it).
- Report the edits that were lost, rather than losing them silently.

### Non-Goals

- Re-applying the refused changes. The server refused them; replaying them by
  default would only be refused again.
- Automatic recovery. The SDK cannot know whether the app wants to drop the
  user's work; the primitive is explicit, and a policy can be layered on it.
- `Watch` denials, which keep their current behavior.

## Design

Two pieces, one signal and one action.

**The signal.** The sync loop publishes `auth-error` with
`method: 'PushPull'` for `ErrPermissionDenied` as well as
`ErrUnauthenticated`. Both mean "the server refused this client", which is what
the app has to distinguish from a dropped connection. For an app whose own
revocation signal (a lock broadcast, a role change) arrives later than the
server's, this event is the first notice it gets.

**The action.** `Client.resync(doc, { discardLocalChanges: true })` re-anchors
the document on the server state, reusing the machinery the store-backed
`ErrEpochMismatch` path already uses:

1. `await attachment.waitForSyncComplete()` — an in-flight response still
   removes pushed changes by checkpoint, so the queue must not move under it.
2. Tear down offline persistence for the document (unsubscribe the appender,
   drop the watermark, remove the stored envelope) — its log is keyed by
   `clientSeq` and would otherwise outlive the re-anchor holding exactly the
   changes the server refused.
3. `doc.discardLocalChanges()` — take the un-pushed changes out of the queue
   and hand them to the caller. The `clientSeq` counter is **not** rewound; see
   the risk table.
4. `detach`, with the presence clear suppressed — the queue is empty and no
   change may be minted over the hole it left, so the pack carries nothing at
   all. A webhook refusing this client's writes has nothing to refuse.
5. `doc.resetForReanchor()`, which returns the counter to zero.
6. `attach` the same instance again, under the sync mode, poll interval, GC
   setting, and presence it had, and restart the sync loop the denial stopped.

`resync` returns the discarded change structs, so the app can tell the user
"N edits were not saved", and publishes them as a `local-changes-dropped`
event with reason `write-denied` once the detach has made the loss final.

**Failure.** The detach is the point of no return. Before it, a failure rolls
back: the queue is handed straight back with `doc.restoreLocalChanges`, the
document stays attached, and the call can be retried. After it, the changes are
gone, which is why the data-loss event is published at that moment rather than
at the end — a re-attach that fails then still leaves the app holding the
edits.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| A queue drop leaves a `clientSeq` hole, and a change minted after it is rejected with `ErrInvalidClientSeq` — a recovery path that dead-ends | Nothing is minted in that window: the detach suppresses its presence clear, so the pack carries no change, and `resetForReanchor` zeroes the counter before the re-attach. Rewinding the counter instead was rejected — the counter records which sequences this client has already minted, some of which the server may hold, so replaying them risks a silent duplicate-skip and breaks the watermarks the offline log depends on (`Document.advanceClientSeqTo`) |
| A failed detach leaves the document attached with its edits already destroyed | `discardLocalChanges` no longer moves the counter, so the discard is exactly reversible: `restoreLocalChanges` puts the queue back and the document is left as it was found |
| `resync` deadlocks if it is queued | It calls `detach`/`attach`, which enqueue tasks of their own on a strictly sequential queue, so `resync` itself is not enqueued; ordering against an in-flight sync comes from `waitForSyncComplete` instead |
| The detach is itself refused, if the webhook denies even an empty pack | The queue is restored and the error surfaces from `resync`; the call is retryable, and the app can still fall back to re-creating the client |
| The denial stopped the sync loop, and the re-attach does not restart it | `resync` restarts it after the attach, the way `attachChannel` does; otherwise the recovered document never syncs again |
| Data loss is implicit | `discardLocalChanges: true` is required at the call site, and the discarded changes are returned |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Reuse `auth-error` rather than add `write-rejected` | Both codes mean the same thing to an app — the server refused this client — and `method` already distinguishes where |
| Return `Array<ChangeStruct<P>>` | Same shape `LocalChangesDropped` already carries for dropped work, so an app that handles one handles the other |
| Carry presence over to the re-attach by default | Presence is not what the server refused, and dropping the user's cursor on recovery is a visible regression |
| Keep the discarded changes applied to `root` until the re-attach | There is no server-confirmed copy to revert to; the re-attach replaces the state wholesale a moment later |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Drop the refused changes and keep syncing without a detach | The client would still hold a checkpoint the server disagrees with, and the dropped edits would stay on screen as state no replica has |
| Undo the refused changes with reverse ops | Reverse ops exist only for history-tracked changes, and they create new changes that would be pushed and refused in turn |
| Recover automatically on the first denial | The SDK cannot decide for the app whether the user's unsaved work may be dropped |

## Tasks

- `docs/tasks/active/20261008-resync-after-write-denial-todo.md`
