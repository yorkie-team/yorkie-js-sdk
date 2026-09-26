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

## Out of scope

The issue asks two open questions. Neither is an acceptance criterion and both
are left alone:

- Whether jamo-level pushes (`ㄷ` → `다` → `달`) are more ops than desirable.
  The CodeMirror binding already pushes at that granularity today; changing it
  would mean adding debouncing that no binding has.
- Whether `syncPresence()` should be suppressed during composition. Presence
  now flows during composition, which is what "local edits keep flowing"
  means; suppressing it is a separate behavioural decision.

## Verification

- `pnpm verify:fast` — lint, licence headers, doc links, SDK build, all unit
  suites (includes `pnpm prosemirror test:unit`).
- Integration suites (`pnpm prosemirror test`) and a real-browser IME check
  were not run here: they need a Yorkie server this run does not stand up, and
  a real IME.
