# Lessons: anchor RGATreeList.insert on position identity

**Created**: 2026-08-30

## A split accessor leaves its call sites behind

When `getLastCreatedAt()` was introduced to return position identity, the
point was to stop confusing element identity with position identity. But
introducing the correct accessor does not migrate the call sites that
still hold the old one. Both SDKs kept exactly one stale caller each, and
in both cases it was the append helper.

The lesson is that an identity split is only finished once every reader
of the old accessor has been audited. A grep for the old accessor at the
time of the split would have caught both.

## The same defect hides behind different callers in each SDK

Go and this SDK had the identical bug, but it was reachable through
different paths: in Go, `Add` was used by both `DeepCopy` and snapshot
restore; here, `deepcopy` was already correct and only `fromArray` used
`insert`.

So "the Go repro also reproduces here" is not a safe assumption — the Go
regression test uses `DeepCopy`, which passes on this SDK. The behavior
has to be reproduced through the path this SDK actually takes, or the
test proves nothing.

## Build the fixture through the path that is not under test

The obvious way to write this test is to build the array with `insert`
and then restore it. That would have been wrong: the fixture itself would
be corrupted by the bug, so the test would fail before reaching the
assertion it cares about and would not show that reconstruction is what
breaks.

Building the fixture with `doc.update` — the live path, which already
anchors on position identity — keeps the pre-snapshot document correct,
so the failure appears only in the restored copy. That is what makes it a
reconstruction-only repro.

## Describe the mechanism, not the plausible mechanism

The first draft of the doc comment blamed `getByID` for resolving to the
dead position node. `insertAfter` does not call `getByID`; it has its own
inline lookup that consults `nodeMapByCreatedAt` first. Reading the
function rather than the neighbouring one caught it.

The observed output is the check on the explanation: `[66,26,14,15]`
means both appends landed after a single anchor ahead of `14`, in
reverse. An explanation that predicts a different ordering is wrong even
if it sounds right.
