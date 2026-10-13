# Report a remote split where it landed, not where it was asked for

**Created**: 2026-10-06
Tracked as #1454

## Problem

When a replica receives a Tree split whose boundary already has a concurrent
insert of its own (it typed at the spot the peer split), the tree keeps that
insert on the left of the split (§7.3 Boundary Insert Migration), but the
split's `TreeChange` / OpInfo reports the index the peer asked for. A binding
that replays the event by index splits before the insert and moves it into the
new element, so its model no longer matches the tree. In an editor this is
"I keep typing at the end of a line while a peer presses Enter there": the
characters I typed jump to the new line and, once the binding resyncs from the
tree, what I typed after them can be lost.

- `fromIdx`/`fromPath` are computed before the split from `(fromParent,
fromLeft)` (`crdt/tree.ts`, Phase 3), where the RGA step only skips siblings
  created after the split's ticket.
- §7.3 (`util/index_tree.ts` `splitElement`) then moves every child the
  editor's version vector does not know to the left, regardless of ticket
  order.
- The split `TreeChange` is pushed with the pre-split `fromIdx`/`fromPath`.

Since #1233 (v0.7.7) for text splits; since #1358 (v0.7.23) also for
`splitByPath`, which used to copy content and reported a delete + insert.

## Plan

- [x] Red: `tree_split_opinfo_test.ts` replays every received OpInfo by index
      on a separate document and compares it with the tree: text split, editor
      Enter (text split then `splitByPath`), paragraph split next to an
      inserted element, a two-level split in one edit, and a control split
      away from the boundary, each in three ticket orders. 8 of 15 fail on
      `main`.
- [x] Measure the first split level after it has split, at the end of what
      stayed in `parent` (after the §7.5 advance), and report that. The split
      only adds to the right of it, so that index and path are the same before
      and after the split. CRDT state is unchanged.
- [x] Integration test with the editor's operations against a server.
- [x] Unit suites, lint, `tsc`.

## Out of scope

- Reorders: when §7.3 keeps an insert that sat after a split sibling, the
  split also reorders them and no single split position describes it (two
  replicas splitting the same boundary concurrently at level 2, or a
  paragraph split next to an inserted element after a text split). A binding
  still has to resync from the tree there.
- `TreeChange.splitLevel` is never filled for splits, so a split merged with
  content into one OpInfo cannot be told from an insert.
- `preEditFromIdx` (undo index reconciliation for remote edits) still uses the
  requested position; Go's `PreEditFromIdx` does the same, so they stay in
  step. No visible undo error was reproduced.
- Go does not materialize OpInfo, so nothing to mirror there.

## Verification

- `tree_split_opinfo_test.ts`: 8 failed / 7 passed on `main`, 15 passed with
  the change.
- `test/unit`: 819 passed; the 23 failures are `offline_persist_sync_test.ts`
  and `persist_disabled_test.ts`, which fail the same way on `main` in this
  checkout.
- Tree integration suites (11 files incl. the new one) against a local
  v0.7.24 server: 2157 passed; `packages/prosemirror`: 282 passed.
- A fuzz over 2–3 replicas that replays each delivered change by index and
  compares with the tree: 612 split steps fixed, 0 regressions; the final
  CRDT state was identical with and without the change in every run.
