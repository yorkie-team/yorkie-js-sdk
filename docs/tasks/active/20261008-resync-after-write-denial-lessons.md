# Lessons: Recover a document after the server rejects local writes

**Created**: 2026-10-08

- Dropping queued local changes is not enough on its own: the dropped changes
  already consumed `clientSeq`, so the counter has to be rewound to the
  server-acked checkpoint. Otherwise the very next change (even the presence
  clear that `detachDocument` emits) presents a sequence hole and the detach
  pack is rejected with `ErrInvalidClientSeq` — turning a recovery path into a
  second dead end.
- `resync` must not run inside `enqueueTask`: it calls `detach` and `attach`,
  which enqueue tasks of their own, and the client's queue is strictly
  sequential, so nesting would deadlock. Waiting on
  `Attachment.waitForSyncComplete()` before touching the queue gives the
  ordering guarantee that was wanted from the task queue.
- The re-anchor machinery already existed (`resetForReanchor`, used for
  `ErrEpochMismatch` on the store path). The new work was the *entry point*,
  not the mechanism — worth grepping for a reset path before writing one.
