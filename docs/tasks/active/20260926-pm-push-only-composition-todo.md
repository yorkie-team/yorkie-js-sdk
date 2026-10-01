# Keep pushing local edits during IME composition (issue #1372)

**Created**: 2026-09-26

## Problem

`@yorkie-js/prosemirror` stops syncing local edits for the whole duration of an
IME composition. `onCompositionStart` calls `pauseRemoteSync()`, which sets the
document to `SyncMode.RealtimeSyncOff` — a mode that stops **both** push and
pull. Local ProseMirror transactions during composition are still applied to
the Yorkie tree, but nothing is pushed until `compositionend` runs
`flushPendingRemoteChanges()` → `resumeRemoteSync()`.

The intent of #1179 was only to keep *remote* changes from landing on the tree
mid-composition, because applying them breaks the browser's composing text node
and aborts jamo completion. Stopping the push is a side effect of the mode
chosen, not a requirement of that fix — and the binding already has its own
deferral path for remote changes (`hasPendingRemoteChanges`,
`diffOverlapsComposingBlock`).

The other two editor bindings do not behave this way: CodeMirror 6 pushes every
change while composing, Quill gates only selection updates on `isComposing`.

## Plan

- [x] `binding.ts`: `pauseRemoteSync()` uses `SyncMode.RealtimePushOnly`
      instead of `SyncMode.RealtimeSyncOff`.
- [x] `isSyncPaused` and the error-revert branch in `setRemoteSyncMode` treat
      `RealtimePushOnly` as the paused state. Use one shared constant so the
      three sites cannot drift.
- [x] Unit test covering the composition sync-mode transitions:
      `compositionstart` → push-only, `compositionend` → realtime, and that a
      `compositionend`/`compositionstart` pair does not resume early.
- [x] Note the push-only mode in `docs/design/prosemirror.md`'s IME section.
- [x] Apply remote changes and snapshots to the view at once, even mid
      composition, instead of deferring the ones that overlap the composing
      block. Deferring left the view behind the tree and lost local edits
      made meanwhile. Only remote cursor decorations stay deferred.
- [x] Drop the `alignBlockIndex` / `yorkieNodesEquivalent` compensation,
      which only existed for the deferred state; `syncToYorkie` is `main`'s.
- [x] Real-replica regression tests for a remote change touching the
      composing block (`binding_remote_composition_test.ts`).
- [x] Merge `origin/main` (Go-parity tree convergence and GC fixes).
- [x] SDK: take the reply to a push-only request as a push ack only, never
      its version vector; a composing client otherwise purged tombstones the
      deferred remote changes anchored on (`pushonly_gc_test.ts`).
- [x] Without `client` there is no pause: pass it in the README and design
      doc examples, warn once when it is missing, and defer every remote
      cursor decoration mid-composition while no pause is in effect.

## Out of scope

The issue asks two open questions. Neither is an acceptance criterion and both
are left alone:

- Whether jamo-level pushes (`ㄷ` → `다` → `달`) are more ops than desirable.
  The CodeMirror binding already pushes at that granularity today; changing it
  would mean adding debouncing that no binding has.
- Whether `syncPresence()` should be suppressed during composition. Presence
  now flows during composition, which is what "local edits keep flowing"
  means; suppressing it is a separate behavioural decision.

## Known limitations

- A remote change that still arrives mid-composition — before the pause
  resolves, or on a `Polling`/`Manual` document, which is never paused — is
  applied at once and may end that composition early. It no longer loses an
  edit.

## Follow-ups

On the `convert.ts` URL sanitizer this branch adds (self-review round 3):

- The blocked-URL placeholder sits in the page's DOM, so a copied link pasted
  back is restored to the peer's original `javascript:` value and written to
  the tree again under the local user.
- Only the fixed `UrlAttrNames` are checked; a custom schema keeping its URL
  in another attribute name is not.
- The placeholder registry caps at 1024 entries and then blanks values, which
  are echoed to every peer.
- `isScriptUrl` copies and lowercases whole values; only the scheme matters.
- Sanitizing at render time (`toDOM` / mark views) would keep the PM doc an
  exact mirror of the tree.

Pre-existing on `main`:

- Native merge reorders text when the second block mixes bare text and marks.
- Native split inside such a block splits only the `span` wrapper.
- `tree.edit` fails to delete text that follows an empty element; deleting the
  only character of a mark leaves such an empty wrapper.

## Verification

- `pnpm verify:fast` — lint, licence headers, doc links, SDK build, all unit
  suites (includes `pnpm prosemirror test:unit`).
- Integration suites (`pnpm prosemirror test`) and a real-browser IME check
  were not run here: they need a Yorkie server this run does not stand up, and
  a real IME.
