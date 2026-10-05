# Reject indexes that split a UTF-16 surrogate pair

**Created**: 2026-10-05
Tracked as #1441

## Problem

Text and Tree indexes count UTF-16 code units, so the index between the two
halves of a non-BMP character (an emoji) is accepted and splits the node
mid-pair. Go turns each lone half into U+FFFD while JS keeps the raw code
unit, so the same operation leaves different text on the two SDKs
(yorkie#2065). yorkie#2085 fixed the Go half by rejecting such a local index
where it becomes a CRDT position. This is the JS half.

## Plan

- [x] Red: port yorkie#2085's `surrogate_index_test.go` scenarios to a JS unit
      test and watch the rejection cases fail on `main` (17 failed).
- [x] Add `isUTF16Boundary`/`ensureUTF16Boundary` next to `escapeString` in
      `json/strings.ts` (Go keeps it in `crdt/strings.go`) and reject a
      mid-pair offset with `ErrInvalidArgument` and Go's message.
- [x] Text: add a checked `CRDTText.createRange` (Go's `Text.CreateRange`) and
      use it from `Text.edit` and `Text.setStyle`. Selection conversion
      (`Text.indexRangeToPosRange`) stays unchecked.
- [x] Tree: make `CRDTTree.findPos` checked (Go's `Tree.FindPos`), so
      `edit`, `editBulk`, `style`, `removeStyle`, their `ByPath` twins and
      `splitByPath` are covered. Add `findPosUnchecked` (Go's
      `FindPosUnchecked`) for indexes the document computed itself: the
      undo/redo and reverse builders in `tree_edit_operation.ts`, and the
      selection conversions (`indexRangeToPosRange`,
      `indexRangeToPosStructRange`).
- [x] Port the internal-path tests: a reconciled undo index inside a pair
      (Case 5), reverse builders inside a pair, a remote mid-pair op from an
      older client still applying along with the receiver's undo/redo. Go's
      split-history scenario does not build in JS (see lessons); a fuzz found
      a JS-native one instead: a remote change whose reverse lands inside a
      pair on the receiver.
- [x] Keep the `normalizePos` fuzz test on character boundaries.
- [x] `docs/design/`: nothing to update here. The rule is written in
      yorkie's `docs/design/document-editing.md`, which covers both SDKs.
- [x] `pnpm verify:fast`, `pnpm sdk test` with the server running.
- [x] ProseMirror binding: `diffText` widens its range to whole characters
      so an emoji replaced by one sharing a surrogate is not rejected (found
      in self review round 1).

## Out of scope

- `Document.update` already resets the clone when the updater throws
  (`document.ts` catch). yorkie#2085's deferred discard fixed a Go-only panic
  path; JS needs nothing there.
- Case 5 reconciliation arithmetic that can itself split a pair on undo. Both
  SDKs share the formula; changing it is a separate cross-SDK change.
- The Go "does not allocate" test: JS checks two `charCodeAt`s.
- Undo after a delete across a level-2 split is broken in JS with ASCII text
  too: on `<r><section><p>aXYb</p><p>cXYd</p></section></r>`,
  `edit(11,11,undefined,2)`, `edit(0,3)`, undo, undo throws "index is out of
  range: 15 > 13". Unrelated to surrogates; needs its own issue.

## Verification

- `surrogate_index_test.ts`: 17 failed on `main` behavior (Red); after the
  check without `findPosUnchecked`, the 4 internal-path cases failed with the
  surrogate error (remote apply at `tree_edit_operation.ts` reverse builder,
  Case 5 undo at the undo index resolution); all 23 pass after.
- `pnpm verify:fast` green (770 SDK unit tests).
- `pnpm sdk test` against the local server: 3398 passed, 17 skipped.
- `diff_test.ts`: 4 new cases failed before the `diffText` fix (Red), pass
  after; `pnpm prosemirror test`: 278 passed.

## Review
