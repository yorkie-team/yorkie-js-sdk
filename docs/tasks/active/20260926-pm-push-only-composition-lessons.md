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

## Review round: the destroyed-view window is wider than `destroy()`

`view.destroy(); binding.destroy();` was blessed as a supported ordering, but
only `destroy()` itself was hardened. Between the two calls both subscriptions
are still live, so a remote change, a snapshot, a presence event or the
deferred compositionend frame can all reach `view.state` / `view.dispatch` on a
view whose `docView` is already nulled. `applySelectionDecorations()` is the
worst of them: unlike the two sync paths it has no `try/catch`, so the throw
escapes into the SDK's subscriber callback.

One predicate, `canTouchView()`, now guards every entry point instead of an
`isDestroyed` check per call site. The ordering inside the deferred flush is
load-bearing: `resumeRemoteSync()` runs *before* the guard, because it is the
only thing that takes the document back out of `PausedSyncMode` and it does not
touch the view. Guarding the whole frame would have stranded a document whose
view died mid-composition in push-only mode.

## Review round: why the attr sanitizer came back as a deny-list

An earlier round removed a URL allow-list from `deserializeAttrs` because the
PM doc it produces is also the *input* to the upstream path — `syncToYorkie`
re-serializes it with `pmToYorkie`, so anything blanked on the way in is echoed
back into the shared tree for every peer on the next block replacement. That
objection is right about an allow-list, which blanks an app's own custom
scheme, and wrong as a reason to render a peer's `javascript:` href.

The reinstated check is a deny-list: only values that can actually run script
(`javascript:`, `vbscript:`, `livescript:`, and a non-raster `data:`) are
blanked. A relative URL, `mailto:`, or `notion://page/1` round-trips untouched,
so the echo now only ever propagates the neutralization of a value that was
hostile to begin with — which is healing, not corruption.

`elementToMarkMapping[yorkieNode.type]` had the same shape of problem with no
such trade-off: the type is remote-controlled and the mapping is a plain
object, so a node named `constructor` resolved to an inherited function and was
spliced into the mark stack as a mark type. An own-key check is pure gain.
