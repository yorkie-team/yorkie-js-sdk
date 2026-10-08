# Lessons: Stop retrying size-limit rejections and report them to the app

**Created**: 2026-10-08

- `handleConnectError` branches on the Connect code first and on the Yorkie
  error code second, so any new "do not retry" rule for a `ResourceExhausted`
  error has to go **above** the generic retry block. The existing
  `ErrTooManyAttachments` branch sits below it and is therefore unreachable
  whenever the server sends that error as `ResourceExhausted` — a reminder
  that order, not presence, decides these branches.
- Publishing the new event from `syncInternal`'s catch (next to the existing
  `SyncFailed`) covers both the sync loop and an explicit `sync(doc)` in one
  place, whereas `epoch-mismatch` is published at two call sites.

## Self review

### Round 1 (review panel on PR #1462)

- Blocking, three lenses on one defect: `handleConnectError`'s `false` is
  consumed by `runSyncLoop` on the **aggregate** of `Promise.all` over every
  attachment, so a single document's size rejection stopped push/pull for all
  other attached documents *and* the channel heartbeats that keep channel
  sessions alive against the server TTL. "Do not retry this push" and "stop the
  client's sync loop" are not the same decision, and the shared handler cannot
  tell them apart.
  Fixed by containing the rejection at the attachment: `runSyncLoop`'s
  per-attachment catch marks the attachment (`Attachment.markWriteRejected`)
  and swallows the error so it never reaches the client-wide handler; the loop
  skips that one attachment on later ticks. A successful push clears the mark,
  so an explicit `client.sync(doc)` after shrinking the document is the way
  back in (in-place recovery is still #1458).
- Blocking: the typed `subscribe('write-rejected', …)` overload was never
  exercised — the test subscribed with `'all'` and filtered by hand. Added a
  per-type subscription test, a negative test for the publish guard, and a
  sync-loop test with two attached documents that asserts the rejected one is
  pushed exactly once while the other keeps syncing. That last test was
  verified to fail without the containment fix.

## Round 3 (panel)

- Blocking: `remove()` is the other pack-carrying terminal RPC, and it got no
  equivalent of the detach fallback — so a parked document resent the refused
  pack, failed the same gate, and could never be removed. The one exit left to
  an over-limit document was closed. Fixed by giving `remove()` the same
  emptied-pack fallback and one-shot retry `detachDocument` has, with the pack
  construction shared through `Client.emptiedPack`.
- Blocking: the emptied-pack detach dropped the un-pushed local changes with
  no signal, then deleted the persisted envelope that held them — the changes
  ended up on neither the server, nor the store, nor a reachable in-memory
  doc. The SDK already has the app-visible signal for exactly this, so the
  path now emits `LocalChangesDropped` with a new `'write-rejected'` reason,
  captured before the detach response is applied.
- Taken together: whenever a code path makes data unreachable, the question is
  not only "does the call succeed" but "who is told what was lost".
