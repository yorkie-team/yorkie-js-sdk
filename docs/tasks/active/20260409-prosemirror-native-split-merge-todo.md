**Created**: 2026-04-09

# ProseMirror native split/merge

Design: [prosemirror-native-split-merge.md](../../design/prosemirror-native-split-merge.md)

## Summary

Replace full block replacement with native CRDT operations for splits and
merges in the ProseMirror binding. Splits use `tree.edit(pos, pos, undefined,
splitLevel)`, merges use boundary deletion `tree.edit(from, to)`.

## Tasks

### Phase 1: Split detection and conversion

- [x] Add `detectSplit(oldBlock, newBlocks)` in `diff.ts`
- [x] Add `computeSplitLevel(oldBlock, newBlocks)` in `position.ts`
- [x] Add `findTextSplitOffset(node, charOffset, baseIdx)` in `position.ts`
- [x] Add `collectText(node)` helper in `position.ts`
- [x] Integrate into `syncToYorkie()`: split detection path before fallback
- [x] Unit tests: single level, multi-level, type mismatch, text change, edge cases

### Phase 2: Merge detection and conversion

- [x] Add `detectMerge(oldBlocks, newBlock)` in `diff.ts`
- [x] Add `computeMergeBoundary(blocks, fromBlockIdx, toBlockIdx)` in `position.ts`
- [x] Integrate into `syncToYorkie()`: merge detection with right-to-left
      boundary deletion for multi-block merges
- [ ] Handle merge + text change: two-pass approach (deferred — currently falls
      back to block replacement)
- [x] Unit tests: single merge, multi-block merge, text change fallback

### Phase 3: Integration tests

- [x] Two-client concurrent split + text input → convergence
- [x] Two-client concurrent merge + text input → convergence
- [x] Two-client concurrent split + split → convergence
- [ ] Two-client concurrent split + merge → diverges at CRDT level (skipped,
      not a binding issue)

### Phase 4: Cleanup

- [x] `pnpm lint && pnpm prosemirror build && pnpm prosemirror test` passes
- [ ] `pnpm sdk test` passes (requires full test run)
- [x] Update `docs/design/prosemirror.md` two-level diff section
