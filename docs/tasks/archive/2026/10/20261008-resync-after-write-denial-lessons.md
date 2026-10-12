# Lessons: Recover a document after the server rejects local writes

**Created**: 2026-10-08

- Dropping queued local changes leaves a `clientSeq` hole: the very next change
  (even the presence clear that `detachDocument` emits) would present a
  sequence hole and be rejected with `ErrInvalidClientSeq`. The first attempt
  closed it by rewinding the counter to the acked checkpoint — wrong, and
  `Document.advanceClientSeqTo` says why in its own doc: the counter records
  sequences this client has *minted*, the server may already hold some of them,
  and the offline log's watermarks assume it only rises. The fix is to mint
  nothing in that window instead: the resync detach suppresses its presence
  clear, so the pack carries no change at all, and `resetForReanchor` zeroes
  the counter a moment later.
- Not moving the counter has a second payoff: the discard becomes exactly
  reversible, so a refused detach — the failure the premise makes likely — can
  hand the queue back rather than destroy it.
- A recovery has to restart what the failure stopped. The `ErrPermissionDenied`
  that triggers `resync` is non-retryable in `handleConnectError`, so the sync
  loop's catch clears `SyncLoop` and schedules no tick; `attachDocument` (unlike
  `attachChannel`) never starts the loop, so without an explicit restart the
  recovered document re-attaches and then never syncs again. Round-one tests
  missed this because they called `runSyncLoop()` by hand.
- `resync` must not run inside `enqueueTask`: it calls `detach` and `attach`,
  which enqueue tasks of their own, and the client's queue is strictly
  sequential, so nesting would deadlock. Waiting on
  `Attachment.waitForSyncComplete()` before touching the queue gives the
  ordering guarantee that was wanted from the task queue.
- The re-anchor machinery already existed (`resetForReanchor`, used for
  `ErrEpochMismatch` on the store path). The new work was the *entry point*,
  not the mechanism — worth grepping for a reset path before writing one.

## Review panel round (blast radius / test adequacy)

- The bullet above is wrong where it says `waitForSyncComplete()` gives the
  ordering guarantee wanted from the task queue. `setSyncPromise` was only ever
  called by the sync loop, so a hand-driven `Client.sync` was invisible to it
  and the queue could be discarded under a live push — in Manual mode, which is
  exactly where a hand-driven sync happens. Fixed from both ends: the discard
  now takes a turn in the (strictly sequential) task queue, which waits for any
  in-flight sync whether or not it registered itself, and `Client.sync` now
  registers its sync on the attachment too. The deadlock the old note worried
  about is avoided by holding the queue only for the discard, not for the
  `detach`/`attach` that follow; the gap between them is covered by the
  detaching flag the sync loop already honours.
- A refusal added to a minting entry point has to be added to its *predicate*
  in the same change. `history.canUndo()/canRedo()` are the documented way to
  ask whether `undo()/redo()` will work, so leaving them answering `true` while
  `undo()` throws turns a window into an exception at every check-then-call
  site in the examples.
- Same shape one level up: `Client.detach` mints a presence clear, so the
  refusal came back out of an API that has nothing to do with minting — and
  synchronously, into React's unmount cleanup. A change that mints as a *side
  effect* should ask (`Document.isMintable()`) rather than throw; the clear is
  a courtesy to the peers, and the server drops presence on detach anyway.
- Stubbing every test at one sync mode hid all of this. The scenario only
  occurs in Realtime (the sync loop is what carries the document and where the
  denial lands), and the Realtime test is what pins the mode being preserved
  across the re-attach — `watch` being called a second time is a direct read of
  it, since a Manual re-attach opens no stream.
