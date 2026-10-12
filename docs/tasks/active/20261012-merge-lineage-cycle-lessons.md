**Created**: 2026-10-12

# Lessons: merge lineage cycle

## RED evidence

On main the new test never returns: the loop is synchronous, so vitest's own
timeout cannot fire. The run was killed by an outer 40s alarm (exit 142).
Wrap a RED run that may hang in an external timeout.

## Notes

- `isAncestorOf` is false for the node itself, so the guard needs
  `node === dest` as well.

## Self review

Round 1 (correctness/tests): nothing blocking. Applied: stronger assertions
(the skipped child keeps its parent, carries no MergedFrom, and the source
gets no mergedInto), clearer guard comment. Not changed here:

- Go and JS derive merge pointers differently from a forged lineage on a
  live source (JS refuses a live source since js-sdk#1406, Go does not).
  Pre-existing and separate from this fix; tracked as a follow-up issue.
- A skipped child stays live under a tombstoned parent. Honest merges reach
  the same shape already, so this adds no new state.

## Panel round 1

All three lenses converged on the same hole in the first fix: `continue`
dodged the cycle but left the child LIVE inside the merge boundary step 02
had just tombstoned. The cascade deliberately skips a boundary's children
(tree.ts:3192-3196) because they move, so a child that never moves is
tombstoned by nobody, gets no GC pair, and dangles in `nodeMapByID` once
`purge` unlinks the boundary (#2008).

The lesson: a guard that refuses an action must still leave the state
machine in a legal state. Refusing the *forwarding* rather than the *move*
does — the child goes to `fromParent`, which is where the merge was headed
before §6.3 flattening redirected it and is always outside the subtrees
being moved, so the boundary ends up with no live descendants.

Security also asked for the containment check at the source rather than at
one caller. It now lives in three places, each cheap: `rebuildMergeState`
refuses to plant a pointer into the source's own subtree,
`resolveMergeTarget` refuses to follow one, and the merge validates the
resolved destination against the set it is about to move.
