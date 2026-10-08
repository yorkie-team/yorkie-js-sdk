# Recover a document after the server rejects local writes

**Created**: 2026-10-08
Tracked as #1458

## Problem

When the auth webhook starts denying a client's writes mid-session (owner
locks the document, member downgraded to read-only, share link revoked), the
document stops syncing for good:

- `handleConnectError` returns `false` for `ErrPermissionDenied`, so the sync
  loop for that document stops. Push and pull share one RPC, so the client
  also stops *receiving* other peers' changes.
- The rejected changes stay in `localChanges` and are re-sent — and re-denied
  — by every later sync.
- The app only sees `sync-status: sync-failed`. `auth-error` is published for
  `ErrUnauthenticated` only, so a write refusal is indistinguishable from a
  network failure.

The app cannot drop the queue itself: the changes are already applied to
`root`, they already consumed `clientSeq` (the next push would fail
`validateClientSeqContinuity`), and undo only exists for history-tracked
changes. Today the only way out is to throw the client away and attach a new
`Document`, which remounts the editor.

## Plan

- [x] Publish `auth-error` with `method: 'PushPull'` for `ErrPermissionDenied`
      as well as `ErrUnauthenticated`, so the app can tell "your write was
      refused" from a network failure. Carries `reason` from the error
      metadata, as the unauthenticated case does.
- [x] `Document.discardLocalChanges()`: take the un-pushed local changes out
      of the queue, return their structs, and rewind the `clientSeq` counter
      to the server-acked checkpoint so the next minted change continues from
      what the server holds instead of leaving a hole.
- [x] `Client.resync(doc, { discardLocalChanges: true })`: wait for any
      in-flight sync, discard the queue, detach (the pack then carries
      presence only, which a `presenceOnly` webhook can allow),
      `resetForReanchor()`, and attach the **same** `Document` instance again
      with the attachment's previous sync mode. Returns the discarded change
      structs so the app can tell the user "N edits were not saved".
- [x] Unit test (`test/unit/client/resync_test.ts`): a fake rpcClient asserts
      the detach pack carries no content changes, that the re-attach reuses
      the same instance and re-anchors onto the server snapshot, and that the
      discarded changes come back to the caller.
- [x] Unit test: the sync loop publishes `auth-error` for a `PermissionDenied`
      push-pull.
- [x] Document both in `docs/design/write-denial-recovery.md` and the public
      API docs.

## Out of scope

- The optional attach option (proposal item 3) that would run the recovery
  automatically after the first denial. The explicit call is the primitive;
  an automatic policy can be layered on it once apps have used it.
- Re-applying the discarded changes on top of the re-anchored state. The
  server refused them, so replaying them by default would just be refused
  again.
- `Watch` denials keep their current behavior (open question in the issue).

## Open

- Behavior with a document store attached follows today's detach semantics:
  `detachDocument` clears the persisted entry, and the re-attach writes a
  fresh base. A store-backed app therefore loses the offline queue for that
  document on `resync`, which is the point of `discardLocalChanges`.
