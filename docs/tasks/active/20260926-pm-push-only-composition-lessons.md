# Lessons — push-only during IME composition (issue #1372)

**Created**: 2026-09-26

## Why `RealtimePushOnly` is safe here, and not just "less off"

The worry with weakening the composition guard is that it re-opens #1179: a
remote change applied to the tree mid-composition diverges PM from Yorkie and
kills the browser's composing text node. It does not, because `PushOnly` is
push-only on the *apply* side too, not merely on the request side:

- `client.ts` sends `pushOnly: syncMode === SyncMode.RealtimePushOnly` on
  `pushPullChanges`, so the server is asked for nothing.
- Even if a response carries changes, the guard right below it returns before
  `doc.applyChangePack(respPack)` when the attachment is `RealtimePushOnly` or
  `RealtimeSyncOff`. Both modes are treated identically there.
- `attachment.needRealtimeSync()` returns `hasLocalChanges()` for
  `RealtimePushOnly` versus a flat `false` for `RealtimeSyncOff` — that
  single line is the whole behavioural difference for the sync loop.

So nothing reaches the tree during composition under either mode; the only
thing that changes is that local changes leave.

## The paused flag is a two-place invariant

`isSyncPaused` is written in one place (`setRemoteSyncMode`'s `.then`) and read
in two (`flushPendingRemoteChanges`'s early return, and the revert branch of
the `.catch`). The revert branch reconstructs a `SyncMode` from the boolean, so
the mode constant appears three times and all three must agree. Changing only
`pauseRemoteSync()` would have left `isSyncPaused` permanently `false` — the
binding would have kept working by luck, because `hasPendingRemoteChanges`
usually also gates the flush, but a composition with no overlapping remote
change would never call `resumeRemoteSync()` and the document would stay
push-only forever after the first composition.

That is why the fix hoists the mode into a module-level `PausedSyncMode`
constant rather than substituting the enum member at each site: the invariant
is "the same mode in all three places", and a named constant states it.

## What could not be verified here

The real test is a browser with a live IME and two peers. This run has neither,
so the unit test drives `compositionstart`/`compositionend` against a fake
client that records `changeSyncMode` calls. That proves the transitions and the
constant agree; it does not prove that a jamo-level push stream is pleasant to
watch on the remote side, which is the thing the issue's recordings show and
which only a human on yorkie.dev can confirm.
