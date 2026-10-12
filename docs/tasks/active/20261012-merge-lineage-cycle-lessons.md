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
