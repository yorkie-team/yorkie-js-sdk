---
created: 2026-04-09
updated: 2026-04-09
tags: [prosemirror, tree, split, merge, concurrent-editing]
---

# ProseMirror Native Split/Merge

## Problem

The ProseMirror binding currently handles block splits (Enter key) and merges
(Backspace at block boundary) via full block replacement: delete the old block
range and re-insert the new blocks. This approach has three issues:

1. **Concurrent edit loss**: When user A splits a block while user B types in
   the same block, the block replacement can overwrite B's input because the
   entire block is deleted and re-inserted rather than structurally modified.
2. **CRDT convergence fixes unused**: The Tree CRDT has 10 fixes (Fix 1–10)
   ensuring convergence for concurrent split/merge operations. None of these
   apply when splits and merges are expressed as delete + re-insert.
3. **Unnecessary overhead**: A split that preserves all text content still
   retransmits the full block contents instead of a single structural operation.

### Goals

- Detect splits and merges in `syncToYorkie()` and convert them to native CRDT
  operations: `tree.edit(pos, pos, undefined, splitLevel)` for splits and
  boundary deletion `tree.edit(from, to)` for merges.
- Compute `splitLevel` automatically for arbitrary nesting depths.
- Fall back to the existing block replacement strategy when detection fails or
  the change is ambiguous.
- Coexist with the existing intra-block character-level diff for text-only
  changes.

### Non-Goals

- ProseMirror Step-level analysis. `ReplaceStep` does not distinguish splits
  from merges; detection must use before/after document comparison.
- New CRDT operations. The existing `tree.edit()` API with `splitLevel` and
  boundary deletion already supports both operations.
- Changes to downstream sync (Yorkie → PM). The current block-diff-based
  `syncToPMIncremental()` already handles remote splits and merges correctly.
- Schema-specific handling. The binding must work with any ProseMirror schema
  and nesting depth.

## Design

### Detection Strategy

`syncToYorkie()` already performs a block-level diff that identifies changed
block ranges. We extend this with a detection layer that classifies the change
before choosing the sync strategy:

```
syncToYorkie(tree, oldDoc, newDoc)
  ├─ 1. Block-level diff (existing)
  ├─ 2. Single block, same structure → intra-block char diff (existing)
  ├─ 3. Detect split → tree.edit(splitPos, splitPos, undefined, splitLevel)
  ├─ 4. Detect merge → tree.edit(boundaryFrom, boundaryTo)
  │     └─ If text also changed → follow-up char diff or fallback
  └─ 5. Fallback → full block replacement (existing)
```

#### Split Detection

A split is detected when **one old block becomes two or more new blocks** and
the text content is preserved:

1. The diff range covers exactly one old block and two or more new blocks.
2. Concatenating the text content of the new blocks equals the old block's text.
3. The new blocks share the same ancestor structure as the old block (modulo the
   split point).

When these conditions hold, compute the split position and `splitLevel`:

- **Split position**: The character offset where the old block's text diverges
  into the first and second new blocks. Convert to a Yorkie flat index via
  `blockIndexToYorkieIndex()` plus the intra-block offset.
- **splitLevel**: Compare the nesting structure of the old block and the new
  blocks. Walk from the text split point upward through element boundaries.
  Count how many levels of nesting are duplicated in the new blocks. For
  example:
  - `<p>ab|cd</p>` → `<p>ab</p><p>cd</p>`: splitLevel = 1 (paragraph split)
  - `<li><p>ab|cd</p></li>` → `<li><p>ab</p></li><li><p>cd</p></li>`:
    splitLevel = 2 (paragraph + list item)

The `splitLevel` calculation walks the old and new Yorkie tree structures:
1. In the old block, find the deepest node containing the split point.
2. In the new blocks, find the boundary where the first block ends and the
   second begins.
3. Count the number of element boundaries from the text level up to the first
   shared ancestor that is NOT duplicated.

#### Merge Detection

A merge is detected when **two or more old blocks become one new block** and
the text content is preserved:

1. The diff range covers two or more old blocks and exactly one new block.
2. The new block's text equals the concatenation of the old blocks' text.

When detected, compute the boundary range to delete:

- **Boundary range**: The Yorkie flat indices from the closing tag of the first
  old block through the opening tag of the second old block. For adjacent blocks
  `<p>ab</p><p>cd</p>`, this is the range covering `</p><p>` — deleting it
  causes the CRDT to merge the blocks naturally.
- For multi-block merges (3+ blocks → 1), apply boundary deletions sequentially
  from right to left to avoid index shifts.

#### Merge with Text Changes

When a merge is accompanied by text changes (e.g., `<p>ab</p><p>cd</p>` →
`<p>aXbcd</p>`), two strategies are possible:

1. **Two-pass**: Apply the merge (boundary deletion) first, then run
   intra-block char diff on the merged result.
2. **Fallback**: Treat the combined change as a block replacement.

The choice between these will be determined during implementation based on
complexity and reliability. The two-pass approach is preferred when feasible
because it preserves CRDT convergence for the structural change. Fallback is
acceptable when the two-pass approach proves unreliable.

#### Fallback Conditions

The detection falls back to full block replacement when:

- Text content is not preserved (split/merge + simultaneous text edit that
  cannot be separated).
- Block types change (e.g., paragraph → heading during split).
- The nesting structure is too ambiguous to compute a reliable `splitLevel`.
- Multiple structural changes overlap in the same diff range.

### Position Mapping

Split and merge operations require Yorkie flat indices, not PM positions.

- **Split**: `blockIndexToYorkieIndex(blocks, blockIdx)` gives the block start.
  Add the intra-block offset (accounting for element open tags) to get the
  split point. The existing `yorkieNodeSize()` utility computes per-node sizes.
- **Merge boundary**: `blockIndexToYorkieIndex(blocks, blockIdx)` for each
  block gives start positions. The boundary is from `end(block_n)` to
  `start(block_n+1)`, which are `blockStart + yorkieNodeSize(block) - 1` (last
  close tag) through `nextBlockStart + 1` (first open tag).

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| False positive split/merge detection | Text preservation check is strict: concatenated text must exactly match. Any mismatch triggers fallback |
| splitLevel miscalculation | Incorrect splitLevel produces wrong tree structure. Validate by comparing expected output structure; fallback on mismatch |
| Merge boundary off-by-one | Yorkie flat indices must account for open/close tags. Unit tests with known index values for each scenario |
| Performance regression from detection logic | Detection is O(block count) for the diff range, negligible compared to existing block-level diff |
| Two-pass merge + text change produces invalid state | If intermediate state after merge-only is inconsistent, fall back to block replacement |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Detect via before/after document comparison, not PM Steps | `ReplaceStep` does not distinguish split from merge. Document comparison is already the basis of `syncToYorkie()` |
| Automatic `splitLevel` calculation | The binding must work with any ProseMirror schema and nesting depth. Hardcoding levels would couple to specific schemas |
| Safe fallback to block replacement | Correctness over optimization. Block replacement is the proven baseline; native operations are an enhancement |
| Upstream-only change | Downstream sync already handles remote splits/merges via block diff. No changes needed |
| Merge via boundary deletion, not explicit API | Yorkie's Tree CRDT detects merges when a range deletion crosses element boundaries. No separate merge API is needed |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Analyze ProseMirror `ReplaceStep` / `ReplaceAroundStep` to detect splits | Steps don't label operations as split/merge. A split and a "delete then insert two blocks" produce identical steps |
| Add an explicit `tree.merge()` API | Boundary deletion already triggers CRDT merge. A separate API would add complexity with no convergence benefit |
| Support only splitLevel=1 | Would fail for nested structures (lists, blockquotes). The binding should not assume a specific schema |
| Always use native operations, no fallback | Some edge cases (type changes, combined edits) cannot be cleanly decomposed. Fallback ensures correctness |
| Change downstream sync to use native operations | Downstream sync applies the result of remote operations, not the operations themselves. Block diff is the correct approach for Yorkie→PM direction |

## Tasks

Execution plan will be tracked in `docs/tasks/active/`.
