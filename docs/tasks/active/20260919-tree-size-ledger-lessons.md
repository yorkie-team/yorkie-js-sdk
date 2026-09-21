# Lessons — tree size ledger

**Created**: 2026-09-19

Mirrored from yorkie-team/yorkie#1998. The plan is in
`20260919-tree-size-ledger-todo.md`.

## A mirror is a hypothesis, not a patch to transplant

Three defects were fixed in the Go SDK; only two of them exist here. Toggling
a style key drifts `live` there and is stable here, because this SDK credits
`live` for the node the restyle revives and Go does not. Measuring each case
against this SDK's own baseline before touching it is what caught that —
otherwise the toggle case would have been "fixed" and the commit would claim a
repair that repaired nothing.

The two that do reproduce were confirmed the same way, by running the
unmodified tree and reading the numbers: `{data: -12, meta: 120}` for removing
a key never set, `{data: -14, meta: 120}` for removing one twice. Port the
reasoning; re-derive the symptom.

## Constants do not port even when the bug does

The size arithmetic matched Go exactly for the tree (`{20, 168}` seeded,
`{20, 216}` split, `{20, 192}` merged) and then did not for attributes:
`bold="true"` costs 20 bytes of data here and 16 there, because this SDK
stores attribute values JSON-encoded and Go stores them raw. Copying Go's
expected values produced a failing test that looked like a bug in the fix.

That difference is worth more than the test it broke. `MaxSizeLimit` is
enforced client-side in both SDKs, so the same document edited from the two
reports different sizes and is held to different limits. Recorded in the todo;
it wants its own issue.

## A skipped test's expectation can be as wrong as the code

`KNOWN: split and merge cycles drive the live size negative` asserted the live
size returns to its pre-split value. It does not, and should not: the merge
rejoins the element but the CRDT text split is permanent, so one extra live
text node persists — live, not garbage, so gc never reclaims it. Restoring the
test meant correcting what it asserts, not just deleting `.skip`.

A skipped test records a symptom someone observed. It does not record a
verified expectation, and the two are easy to conflate when the file already
reads like a specification.

## Verify the reviewer's citations against the right revision

Two reviews reported that a test referenced by the tracking issue "does not
exist", both looking at a submodule checkout one commit behind `origin/main`.
It does exist. Any claim about what a sibling repository contains has to name
the revision it was checked against, or it is unfalsifiable a day later.
