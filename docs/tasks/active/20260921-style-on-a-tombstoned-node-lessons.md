# Lessons: a style on a tombstoned node

**Created**: 2026-09-21

## A guard that makes a branch unreachable hides the branch's bug

The previous commit removed `textAttrGCPair`'s third case — a live attribute
on a removed node — because the `isRemoved()` guard meant nothing could reach
it, and left a note at the call site not to add it back. That was the right
call for that commit, but it also meant the tree half's identical question
never got asked: `accAttrWrite` had no liveness parameter at all, and the
tree's `style` reaches a tombstoned node through the `insNextID` propagation
loop. It was charging `live` for attributes the container excludes, by 34
data bytes and 24 meta on the case the new test covers.

**When a guard makes an accounting branch unreachable on one path, check the
paths that have no guard before deleting the branch.**

## `docSize.gc` is `Σ registered child.getDataSize()`

Collection subtracts `pair.child.getDataSize()` read at purge time, not the
amount registration added — `gcOnlySize` exists only to make *registration*
land on that same invariant when a child's bytes are already inside a
sibling's charge. So any mutation to a registered child's size after
registration has to be mirrored into `docSize.gc`. Writing an attribute onto
a tombstoned node is such a mutation, and the only way to see it is to
rebuild a root from the same content and compare — a running accumulator
cannot detect its own drift.

## The JS `crossSync` is safe where Go's is not

`VersionVector.max` returns a new map here, so the receiver's `syncClocks`
cannot mutate a delivered change's vector. The Go side merges in place and
shares the map with the document's `changeID`, so the same in-process helper
lets the receiver rewrite what the sender "knew", and any causality check has
to be tested through the protobuf converter instead. Worth remembering when
porting a test in either direction.
