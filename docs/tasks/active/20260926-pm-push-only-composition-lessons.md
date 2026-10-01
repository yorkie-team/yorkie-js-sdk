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
thing that changes is that local changes leave. (Later rounds narrowed this:
the pause is asynchronous, a snapshot-only pack needed its own drop, and
`Polling`/`Manual` documents are not paused at all — see the human round
below for what the binding does with what still gets through.)

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

## Review round: the deny-list still had to stop writing to the CRDT

The panel came back on the same trade-off from the other side. A deny-list
narrows the false positives, but it does not remove them, and a false positive
is not a render-time blank: it is echoed upstream and destroys the attribute
for every peer. The answer was to stop making the sanitizer's output the thing
that round-trips. `deserializeAttrs` now substitutes an inert
`about:blank#yorkie-blocked-N` placeholder and `pmToYorkie` swaps the peer's
original back in, so the CRDT is byte-identical however the check decides. With
the round trip made harmless, the `String(value)` `catch` could also flip from
fail-open to fail-closed, which is where it belonged all along.

The attrs object itself was the other half. `result[key] = value` on an object
literal with `key === '__proto__'` is a *prototype assignment*, not an own
write — so a peer sending `__proto__: {href: 'javascript:…'}` left the
sanitizer nothing to inspect while ProseMirror's `computeAttrs`, which reads
`value[name]` straight through the chain, still resolved an href.
`Object.create(null)` removes the chain entirely; it also covers the
`constructor`/`toString` shape of the same bug for free.

## Review round: resume must return to the mode the host attached in

`resumeRemoteSync()` hardcoded `SyncMode.Realtime`, so a document attached as
`Polling` or `Manual` was silently promoted by the first IME composition — and
the new retry loop re-drove that promotion up to three times. Nothing on the
client reads the current mode back, so the binding now takes it as
`options.syncMode` and resumes to that. `Manual` goes further and opts out of
the pause altogether: nothing arrives unless the host syncs, and parking a
manual document in `RealtimePushOnly` would start pushing on a schedule the
host deliberately declined.

## Review round: PM-vs-tree block comparison (superseded)

An earlier round added `alignBlockIndex` / `blocksAligned` to map the PM
block indices of a local edit onto a tree that held deferred remote blocks,
then relaxed its comparison (`yorkieNodesEquivalent`) because the CRDT keeps
fragmented text runs. Both are gone with the deferral they compensated for;
see the next section. The lesson that survives: the unit helpers derive the
mock tree's `toJSON()` from `pmToYorkie`, so a PM-vs-tree comparison looks
exact by construction — tests for that boundary need a real `Tree`.

## Human round: the deferral was the bug, not the missing compensation

The blocking finding: a remote change that reaches the tree mid-composition
and touches the composing block was *deferred* from the view, and a local
edit made meanwhile — measured on the stale view — could not be placed in
the tree, so `syncToYorkie` skipped it and the compositionend flush then
erased it from the view. Requirement from the maintainer: neither side's
edit may be lost, and replicas must converge.

The CodeMirror and Quill bindings never defer: they apply each remote op to
the editor at once, composition or not (Quill only holds back selection
updates). The view is never behind the CRDT, so there is nothing to
compensate for and the CRDT merges concurrent edits by identity. The fix
here is the same: remote changes and snapshots are applied straight away;
only remote cursor decorations — not document content — are still deferred.

Why the deferral existed at all: #1167 added it because a remote change that
redraws the composing text node ends the composition. That is real for
ProseMirror, more than for CodeMirror: `prosemirror-view` keeps the
composing node only while its text is unchanged (`localCompositionInfo` /
`protectLocalComposition`), so a remote edit anywhere in the same text run
redraws it, while CodeMirror maps the composition range and rebuilds around
it. #1179 then found the deferral desynced view and tree, and switched to
`RealtimeSyncOff`; #1372 is that switch's cost. With `RealtimePushOnly`
keeping remote changes out during composition, a change can only slip in
before the pause resolves, or on an unpaused `Polling`/`Manual` document —
modes `SyncMode.Polling` documents as unsuitable for collaborative editing.
There it may end a composition early; it can no longer lose an edit.

An abandoned detour, recorded so it is not retried: a `TreeRebase` that kept
the deferral and carried local edits across it by token-diffing the view's
serialization against the tree (with three-way merges for block
replacements). It converged in fuzzing, but matching by content cannot tell
repeated text apart: composing "한" next to a remote "한글" turned the
remote word into "핟글한". Only CRDT identity resolves that, which is what
applying remote changes immediately gives for free.

The fuzzing behind that detour (two real replicas, random concurrent edits)
also surfaced three bugs that exist on `main` without any deferral, filed as
follow-ups rather than fixed here:

- Native merge into a block whose content mixes bare text and marks reorders
  text in the tree (`pc` + `g<strong>h</strong>bd` → tree
  `pc<strong>h</strong><span>bd</span>g`).
- Native split inside such a block splits only the `span` wrapper, so PM
  shows two paragraphs and the tree one.
- `tree.edit` does not delete a text node that follows an empty element in
  the same parent, and deleting the only character of a mark leaves exactly
  such an empty wrapper behind.

A manual two-tab test on the pre-merge branch also showed the two tabs'
trees disagreeing on a paragraph boundary after concurrent Enter and typing
under a throttled network. Plain JS replicas did not reproduce it; the
branch then lacked `main`'s Go-parity convergence and GC fixes (#1404,
#1405), which are merged in now. To re-check after merge.

## Why the agent loop could not converge

Panel round 11 flagged applying a remote change mid-composition on an
unpaused (Polling) document — the #1179 symptom — and the fix agent answered
with total deferral; round 12 then flagged that deferral for desyncing view
and tree, and rounds 14–16 flagged the index compensation built on top of it.
The two directions exclude each other, since deferring is what desyncs the
view. The decision taken here: apply remote changes immediately and accept
that a rare one may end a composition early, because the alternative loses
edits. `SyncMode.Polling` is documented as unsuitable for collaborative
editing, and the CodeMirror and Quill bindings make the same choice. Round 17
on that design raised no blocking finding.

## Self-review log (harness `/code-review`, not the CI lens panel)

- Round 1 and 2 reviewed the abandoned `TreeRebase` approach. Their central
  findings — content matching mispairs repeated text, the diff can give up on
  large remote edits, the rebase engages on representational differences in
  normal editing — are what led to dropping it for the immediate-apply fix
  above.
- Round 3 (on the immediate-apply branch): 10 findings, the loop's bound.
  Fixed: a binding created without `client` (the README's Quick Start) had no
  composition pause at all — the README and design doc now pass `client` and
  the binding warns once without it; the decoration gate ignored whether a
  pause was actually in effect; stale "deferral protects" wording in the
  `syncMode` option docs. Disputed: "a failed incremental sync mid-composition
  falls back to a full rebuild" (`binding.ts`, `applyRemoteTreeOps`) — the
  alternative is deferring, which reintroduces the lost-edit state; the
  rebuild only ends a composition. Deferred as follow-ups on the `convert.ts`
  sanitizer: the blocked-URL placeholder can be laundered back to the
  original by copy/paste within the page; schemas that keep URLs in other
  attribute names are not checked; the placeholder registry caps at 1024 and
  then blanks values; `isScriptUrl` scans whole values; and a render-time
  sanitizer would avoid swapping values inside the document model.
