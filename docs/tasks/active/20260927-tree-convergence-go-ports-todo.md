# Port three tree convergence fixes from Go

**Created**: 2026-09-27

The Go SDK is the source of truth for tree semantics, and the server builds
snapshots through Go. Three Go fixes have no JS counterpart yet, so a JS
client and the server (or two JS clients) end up with different documents
for the same changes. Each gap gets one failing test first, then the port,
then Green, in its own commit.

## Gaps

- [x] **J4. Undo/redo mints split tickets for split reverses.** Go
      `executeUndoRedo` (yorkie#1932, `36235fd4`) issues one ticket per
      split level and records them with `SetSplitTickets`. JS issues one
      ticket per operation only, so a split reverse falls back to counting
      delimiters up from its own `executedAt` and lands on the ticket of the
      next operation in the same undo change: two live nodes share one ID on
      every replica.
      - [x] Red: two L2 merges in one change, undo, duplicate live IDs
            (Go `TestTreeSplitUndo` "a multi op undo entry ...", plus the
            wire variant).
      - [x] Port the ticket loop into `executeUndoRedoInternal`.
- [x] **J1. Merge-delete propagation skips only declared boundaries.**
      Go `9d9d5c37` (yorkie#2042). `propagateMergeDeletes` used to skip any
      source whose children already sit in this edit's destination; it now
      skips only a source the edit's own positions named
      (`declaredBoundaries`). Fixes #1331.
      - [x] Red: `<r><p>ab</p><p>cd</p></r>`, `edit(0,1)` ‖ `edit(0,5)`.
      - [x] Port `declaredBoundaries` + exact `findMergeNode` lookup.
      - [x] Port Go `TestTreeUnwrapAndMergeDelete` (three subtests).
- [x] **J2. A style's reached set comes from the change, not the tree.**
      Go `ac88215d` (yorkie#2038), design doc §9.1/§9.2/§9.5/§9.6 and its
      "Port specification".
      - [x] Red: base `<r><p>ab</p><p>cd</p><p>ef</p></r>`:
            `edit(6,6,∅,1)` ‖ `style(5,8)`, `edit(1,5)` ‖ `style(1,6)`,
            `edit(1,5)` ‖ `style(6,8)`.
      - [x] Port `styleTargets` (shared by `style`/`removeStyle`),
            `isSplitProductOf`, `endsInside`, `beginsInside`,
            `unknownSplitSiblings`, `splitFamilyOf`, `boundaryElements`,
            `boundaryRangeCovers`, and the collapsed-or-empty rule in
            `reversedFromAnchorRecovery`.
      - [x] Reject a backwards range in `styleByPath`/`removeStyleByPath`.
      - [x] JS-only: a split family reached through an End token is styled
            only if the change began inside it. Go main diverges on the
            split-2 x style `A -> B` integration case without it; see
            lessons.
      - [x] Port Go `tree_style_reached_set_test.go`: the four pinned
            pairs, the thirteen complex-suite goldens and the exhaustive
            split/merge scans with Go's absolute counts.
- [x] Point the #1383 part 1/2 notes in `20260926-docsize-rebuild-drift-*`
      at this task.

## Out of scope

- The GC-pairs case in the audit repro file (undo re-set books internal
  tombstones). Separate defect.
- Go's own known limitations carried over as-is: merge-moved child order
  (Go `20260924-merge-moved-child-order`), tombstone-only attribute
  divergence on the merge scan.

## Verification

- [x] `pnpm verify:fast` green per commit.
- [x] `pnpm sdk test` against a local `yorkieteam/yorkie:latest`: 102 files,
      3252 passed.

## Review

- J4: `split_ticket_test.ts` two new cases fail on `main` (duplicate id
  `3:...:3:0`), pass here.
- J1: `tree_unwrap_merge_delete_test.ts` first case fails on `main`
  (`<r>abcd</r>` vs `<r>cd</r>`), pass here; integration case likewise.
- J2: `tree_style_reached_set_test.ts` 10 of 23 fail on `main` (scans report
  135 and 297 rendered divergences, Go's "before"), all pass here with Go's
  absolute counts.
