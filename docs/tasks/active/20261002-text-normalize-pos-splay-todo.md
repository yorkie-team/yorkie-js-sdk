# Text: normalizePos walks the whole chain on every edit

**Created**: 2026-10-02

## Problem

`RGATreeSplit.normalizePos` sums `getLength()` over the whole physical `prev`
chain, so it is O(n) in the number of split nodes. Every `EditOperation`
execution calls it to build the reverse operation, local and remote alike, and
`Document.applyChange` calls it twice more per remote Edit to reconcile the
undo/redo stacks (unguarded). A remote Edit runs on the clone and on the root,
so it pays up to four walks. Typing a document is quadratic, and applying a
remote history is worse.

Measured on `main` (single-character local inserts, then applying the same
changes to a second document as one pack):

| N | local | remote apply |
|---|---|---|
| 2,000 | 64 ms | 92 ms |
| 10,000 | 469 ms | 1,745 ms |
| 40,000 | 17.9 s | 86.6 s |

The Go SDK had the same walk and fixed it in yorkie#2107 by reading the sum
from the index tree. This ports that fix 1:1.

## Plan

- [x] Reproduce: `text 10000` bench next to `text 1000` on `main` (Red)
- [x] Equivalence test: the new `normalizePos` equals the chain-walk
      definition at every offset of every node, tombstones included, across
      random edit/style/undo/redo/GC sequences
- [x] `normalizePos`: `treeByIndex.indexOf(node) + relativeOffset`, anchored on
      the head. `deleteRange` keeps tombstones in the splay tree at weight
      zero; only `purge` takes a node out, and it unlinks the chain too
- [x] Verify: Red -> Green, `pnpm verify:fast`, `pnpm sdk test`
- [x] Self review, PR

## Review

Measured locally (`vitest bench`, and a scratch script for remote apply):

| case | main | this branch |
|---|---|---|
| `text 1000` bench | 13.7 ms | 10.6 ms |
| `text 10000` bench | 515 ms | 137 ms |
| 40,000 local inserts | 17.9 s | 0.31 s |
| applying those 40,000 as a remote pack | 86.6 s | 0.34 s |

`text 10000` / `text 1000` went from 37.5x to 12.9x: linear again.

Gates: `pnpm verify:fast` green; `pnpm sdk test` green (3367 passed) against a
MongoDB-backed server, as CI runs it.

Self review, round 1 (correctness/tests) — what the author's own pass covered,
not a verdict on the change. It traced the invariant on every path (insertAfter
is the only way in, purge the only way out; deleteRange/cutOffRight keep
tombstones at weight zero; converter and deepcopy rebuild through insertAfter)
and ran a scratch 3-replica harness through protobuf change packs, checking the
root, the clone, a deepcopy and a bytes snapshot: 14.5M checks over 100 seeds, 0
mismatches against the old walk. Gaps that pass left open:

- The shipped test now covers two replicas applying each other's edits and
  deletes (the applyChange call site), and positions that only a floor
  lookup resolves. The clone, deepcopy and snapshot rebuilds are still
  covered by the scratch harness only, not the suite.
- Under 3 replicas with concurrent undo/redo, replicas sometimes do not
  converge, and with GC on some changes fail to apply. Identical with the old
  walk, so not caused by this change. The Go self review saw the same
  divergence; it needs its own task.
