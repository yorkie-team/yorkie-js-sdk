# Lessons — docSize rebuild drift (issue #1383, part 3)

**Created**: 2026-09-26

## Scope call

Issue #1383 bundles four independent server ports. Two of them (merge-delete
span, style reached set) are convergence changes that rewrite whole blocks of
`crdt/tree.ts` and need the Go acceptance vectors to port faithfully. Taking
all four in one pass would have produced a diff nobody could review as one
thing, so this branch delivers part 3 — the self-contained docSize accounting —
and says so in the PR body rather than quietly widening or half-doing the rest.

## Where the bytes actually sit

The hard part of the attribute-tombstone change is not dropping the value, it
is knowing which side of the ledger was holding it. Three cases, and they are
the same three `attrGCPair` already documents:

- live attr on a live node — the value is in `docSize.live`, so `live` pays.
- live attr on a REMOVED node — the container skips a removed node, so the
  value was never in `live`; it is inside the gc charge taken when the node was
  removed, so `gc` pays.
- attr that was already a tombstone — post-change its value is already `''`, so
  there is nothing to drop and `valueDropped` is zero.

Getting this wrong is not a rounding error: `removeStyle` in a rich-text editor
is a loop a user runs hundreds of times, so a per-call bias walks `docSize`
away without bound and eventually disables the document size limit entirely.

## `moveAfter` return shape

`moveAfter` already returned the dead position node. Adding the charge as a
second return value would have made every call site destructure a tuple whose
elements mean unrelated things, so it returns a named struct instead. The
first-stamp test is `getMovedAt()` read *before* the stamp: a second move of
the same element re-stamps a ticket that is already charged, and charging it
again is the same unbounded drift in the other direction.

## Not verified here

The integration suites (`pnpm sdk test`) need a running Yorkie server and
MongoDB, which this run does not stand up. Only `pnpm verify:fast` — lint,
licence headers, doc links, build, unit suites — was run locally.
