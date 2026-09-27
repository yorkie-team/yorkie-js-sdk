# Port three GC correctness fixes from the Go SDK

**Created**: 2026-09-27

The server builds snapshots with Go semantics, so JS collection has to reach
the same result. Three gaps, each reproduced by a failing test first, one
commit each.

## Items

- [x] J3. RGA purge barrier (mirrors yorkie `ba82ed91`). `garbageCollect`
  purges a tombstone once `removedAt` is stable, which can move the stopping
  point of the RGA forward skip for Array, Text and Tree. Add
  `purgeBarrierAt` (successor stability) to `RGATreeList`, `CRDTArray`,
  `RGATreeSplit` and `CRDTTree`, check it in both purge loops, and repeat the
  pass while it both purged and deferred. Port Go's barrier tests and cost
  tests; update the integration expectations Go annotated. Go calls this a
  partial fix (in-flight anchors, tail tombstones); port the same scope.
  - [x] Unit ports: `gc_rga_barrier_test.ts` (four order cases, three cost
    cases). Red on `origin/main`: WSX/WXS, `["w","s","x"]`.
  - [x] Integration: nine `getGarbageLen` expectations annotated (Go's seven,
    plus the JS-only "no tombstone" lifecycle variant and the deactivated
    client case), and a port of `TestGarbageCollectionBarrierDrainsWithinOneRound`.
  - [x] Opt-in fuzz harness `gc_rga_fuzz_test.ts` (`RGA_FUZZ=1`), with the
    before/after counts in its header.
- [x] J5. `recreateFromSpan` books attribute tombstones (mirrors Go
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

Three commits, one per gap, each Red on `origin/main` then Green. `pnpm
verify:fast` green per commit; `pnpm sdk test` green against
`yorkieteam/yorkie:latest` (102 files) and, for `gc_test.ts`, against a server
built from yorkie `origin/main`. Self-review: two rounds, see the lessons
file.
