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

## Panel round 2

The round-1 containment check was put in three places, and all three were
too narrow:

- `resolveMergeTarget` compared the candidate hop against the CURRENT hop
  only, so a forged two-hop chain A->B->C (B outside A, C inside A) passed
  both per-hop checks and still landed the destination inside A's subtree.
- The §1.1 insert redirect and the §6.2 delete cascade read `mergedInto`
  with a bare one-hop `findMergeNode`, so neither saw the bound at all.
- The runtime plant `src.mergedInto = dest.id` in the merge checked only
  `src.removedAt`, so a crafted `mergedFrom` naming a removed element that
  CONTAINS the destination installed the exact pointer the snapshot rebuild
  refuses — leaving an op-applying replica forwarding where a
  snapshot-loading one does not.

The lesson: "check it at the source, not at one caller" only holds if every
consumer actually goes through that source, and if the invariant is stated
over the whole walk rather than one step of it. The bound now lives in one
reader, `mergeDestinationOf(node, within)`, which every `mergedInto`
consumer calls; `resolveMergeTarget` passes the full set of hops walked so
far, which also subsumes the old cycle guard. The two producers
(`rebuildMergeState` and the merge's plant) apply the identical condition
`src.isAncestorOf(dest)` -- no wider on either side, since a gate that
differs between the op path and the snapshot path is itself a divergence --
and the self-loop case is refused at the reader instead.

## Panel round 3

"Every consumer reads through `mergeDestinationOf`" was true of every
consumer that wanted the destination NODE, and false of the one that only
wanted to know whether a merge happened: the §9.3 range-boundary branch
still tested `realParent.mergedInto` as a bare boolean and moved the style
boundary out of the tombstone on the strength of it. A self-loop pointer --
which `rebuildMergeState` admits, since a source is not its own strict
ancestor -- is refused by every other consumer and was honoured by that
one. `findNodesAndSplitText` now resolves the destination ONCE, before
either branch, and both branches hang off that resolved node.

The lesson: a truthiness test on a validated pointer is a consumer too. A
centralized validator only covers what routes through it, so the audit has
to be "every read of the field", not "every read that dereferences it".

## Parity restore

Rounds 1-3 here and the yorkie panel fixed the same hole (a refused child
left live under a tombstoned boundary, #2008) in two different ways: Go
tombstones the child in place, JS moved it to `fromParent`. On the same
fixture Go leaves `c` tombstoned under `b`, JS moved it live under the
tombstoned `a`, so a server rebuild and a client disagreed on tree shape.
The JS shape also did not meet its own goal: `a` is a tombstone too.

The JS tree code was reset to the parity head and the Go head's tombstone
approach ported line for line, including the later-children rule and the
removed-size accounting. A probe printing parent, tombstones, GC pair order,
removed size and XML gave identical output on both SDKs.

The lesson: on a mirror PR, compare the two heads' behaviour on one fixture
before trusting either panel's ready label.

