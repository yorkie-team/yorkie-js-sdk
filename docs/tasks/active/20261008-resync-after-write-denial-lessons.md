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
