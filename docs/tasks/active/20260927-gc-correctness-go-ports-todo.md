# Port three GC correctness fixes from the Go SDK

**Created**: 2026-09-27

The server builds snapshots with Go semantics, so JS collection has to reach
the same result. Three gaps, each reproduced by a failing test first, one
commit each.

## Items

- [ ] J3. RGA purge barrier (mirrors yorkie `ba82ed91`). `garbageCollect`
  purges a tombstone once `removedAt` is stable, which can move the stopping
  point of the RGA forward skip for Array, Text and Tree. Add
  `purgeBarrierAt` (successor stability) to `RGATreeList`, `CRDTArray`,
  `RGATreeSplit` and `CRDTTree`, check it in both purge loops, and repeat the
  pass while it both purged and deferred. Port Go's barrier tests and cost
  tests; update the integration expectations Go annotated. Go calls this a
  partial fix (in-flight anchors, tail tombstones); port the same scope.
- [ ] J5. `recreateFromSpan` books attribute tombstones (mirrors Go
  `recreateFromSpan` in `tree.go`). The recreated node deep-copies
  `span.attrs` but never registers their GC pairs, so running `docSize` and
  garbage count drift from a rebuild. Port `TestRecreateCarriesAttributeTombstones`.
  Fix the stale `AdjustDiffForGCPair` comment.
- [x] J6. `registerElement` books internal GC pairs (mirrors yorkie
  `96bcb779`, `registerInternalGCPairs`). Only the constructor registered
  Text/Tree/Array internal tombstones, so undo of a removed container and a
  remote `Set`/`Add` leave them uncollectable. Port
  `TestRegisterElementBooksInternalTombstones` and
  `TestRegisterElementSkipsTombstonedTreeRoot`; cover a remote replica.

## Verify

- `pnpm verify:fast` green per commit.
- `pnpm sdk test` against a local server.
- Red on `origin/main`, Green after each fix.

## Review

(filled in after self-review)
