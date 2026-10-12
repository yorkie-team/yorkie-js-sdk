# Leave a restore span with a text parent unplaced

**Created**: 2026-10-12
Fixes #1471. Mirrors yorkie-team/yorkie#2175 (yorkie#2168).

## Problem

`CRDTTree.recreateFromSpan` checks only that a span's `parentID` names an
existing node. When it names a text node, every anchor rung misses and the
id-order fallback calls `parent.insertAt`, which throws `Text node cannot have
children`. Restore spans come from the wire, so one crafted `TreeEdit` throws
on every replica that applies it, on every later pull and snapshot replay.

Review of the Go fix found a second shape: a span whose `isText` disagrees
with `nodeType`. `isText=true` with an element type recreates an element
carrying a value; the text lookup cannot see it, so the same span applied
again inserts a second node under one ID.

## Layer decision

Apply time, not decode time. Whether `parentID` names a text node depends on
the document, and stored changes go through the same decoder on pull, so a
decode rejection would leave documents already holding such a span
unloadable. Node kind never changes and the kind check reads only the span,
so every replica skips the same span. Go and JS must apply the same rules or
they diverge against each other.

## Plan

- [x] RED: document-level tests. A crafted restore `TreeEdit` round-tripped
      through the protobuf converter, applied on a pulling replica and on a
      fresh document replaying every change, for: element span under a text
      parent, text span under a text parent, element span typed as text,
      text span typed as an element (twice). Record failures in lessons.
- [x] RED: crdt-level tests on `CRDTTree.restore`/`retombstone` (ports of
      `TestTreeRestoreTextParentSkip`, `TestTreeRestoreKindMismatchSkip`).
- [x] Fix `recreateFromSpan`: return `undefined` when the parent is text.
- [x] Fix `restore`/`retombstone`: skip a span whose `isText` disagrees with
      `nodeType === DefaultTextType`.
- [x] GREEN, plus the honest path: undo after GC carrying restore spans, then
      redo, unchanged. XML matches the Go test expectations.
- [x] `pnpm verify:fast`.

## Review

- `recreateFromSpan` returns `undefined` when the resolved parent `isText`,
  right after the parent-missing check: same result as a missing parent, no
  node created, registered or paired for GC.
- `restore` and `retombstone` skip a span failing `restoreSpanKindAgrees`
  (`isText === (nodeType === DefaultTextType)`), the JS twin of Go's
  `TreeRestoreSpan.kindAgrees`. `DefaultTextType` moved from a type-only to a
  value import.
- Tests: `test/unit/document/tree_restore_text_parent_test.ts` (pulling
  replica, full replay, convergence, editability, honest undo after GC then
  redo) and `test/unit/document/crdt/tree_restore_span_kind_test.ts`. XML
  expectations are the Go test's (`<r><p>hello</p></r>`,
  `<r><p>hello!</p></r>`, `<r><p></p></r>` after redo).
- `pnpm verify:fast` green. Tree and history-tree integration suites green
  against the local server.
- No `docs/design` change: this repo has no doc describing restore-span
  placement; the rules are recorded in yorkie `docs/design/undo-redo.md`.
- Re-synced with yorkie#2175 c2460cd8: `recreateParent` also skips a span
  whose identity a surviving node holds (exactly, or inside a live text run
  of the same insertion). Tests for both shapes, the un-tombstone branch of
  the kind check, and a retombstone kind test that names a live node.
