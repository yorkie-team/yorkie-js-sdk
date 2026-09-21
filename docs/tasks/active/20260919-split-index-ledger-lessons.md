# Lessons — split index ledger

**Created**: 2026-09-19

Mirrored from yorkie-team/yorkie#1999. The plan is in
`20260919-split-index-ledger-todo.md`.

## Four defects arrived as one report

The tracking issue described a single symptom: undoing one of two concurrent
splits drops the text between them. Underneath it were four separate errors —
the growth never reported to reconciliation, `splitElement` inflating live
ancestors with a tombstoned clone, §7.4 re-parenting through non-tombstone-aware
primitives, and the reverse range sized from what the split asked for rather
than what it opened.

Only the first was visible from the symptom. The second surfaced because
fixing the first gave a cached size a correctness-critical reader; the third
because fixing the second removed an accidental cancellation; the fourth
because a reviewer checked whether the new measurement was used everywhere the
old assumption lived. None of them would have been found by making the
reported case pass.

## `getSize()` was already the right domain to measure in

Reconciliation works in the visible-index domain, which is exactly what
`getSize()`, `findPos` and `toIndex` report. Measuring the split's growth in
that domain rather than computing `2 * splitLevel` means the reported number
and the number the undo will execute against cannot drift apart — a computed
value can disagree with the tree, a measured delta cannot. It also handles two
cases for free that the computed form gets wrong: a split the tree has no room
for, and a split product born tombstoned.

## Share the invariant, not the comment describing it

`moveChild` already carried the tombstone-aware semantics §7.4 needed, in a
doc comment explaining why a removed node relocates only its include-removed
size. The §7.4 site restated the move by hand with `detachChild` plus
`insertBefore` and got it wrong in both directions. `moveChildBefore` and
`moveChild` now share one detach/attach pair, because restating a
two-dimension bookkeeping rule per call site is precisely how the two
dimensions drifted apart.

## Run the integration suite; the unit suite cannot see this

The headline case needs two clients and a server. The port the compose file
wants was taken by an unrelated container, so the suite ran against a
throwaway server on another port via `TEST_RPC_ADDR` — worth knowing, because
the alternative was pointing tests at someone else's running server and
polluting it. 2147 tree and history tests, and the two new cases both fail
without the fix.
