**Created**: 2026-04-28

# Tree reverseOp Pre-tombstoned Descendant Filtering

**Goal:** Stop `TreeEditOperation.toReverseOperation` from resurrecting
descendants that were tombstoned before the current edit. Without this
filter, the redo wire op for a parent-delete grows by one cycle of
typed text on every undo→redo round of nested edits, observed in
production wafflebase docs as `[2 → 4 → 6 → 7]` content nodes per
cycle.

**Architecture:** `CRDTTree.edit()` already collected a
`preTombstoned: Set<string>` of node IDs marked removed before the
edit ran (added previously but not exposed). Expose it through the
`editT` return tuple and consume it in `toReverseOperation` to drop
matching descendants from the deep-copied subtree.

**Tech Stack:** TypeScript, Vitest. Repro test runs offline (single
`Document`, no Yorkie server required).

**Canonical design:** `yorkie/docs/design/tree-split-undo-redo.md`
(§ Pre-tombstoned Descendant Filtering).

---

### Task 1: Reproduce in SDK

**Files:**
- Add: `packages/sdk/test/integration/history_tree_split_test.ts`

- [x] **Step 1: Mirror the production scenario.** Insert
      `<doc><p><inline></inline></p></doc>`, add a sibling `<p><inline></inline></p>`,
      then loop 4 cycles of: type "asdf" / undo each char / undo block-insert.
      Inspect `redoStack` top right before each redo (= the wire op for the
      next redo).
- [x] **Step 2: Assert the reverseOp `contents` length is constant
      across cycles.** Pre-fix: `[6, 10, 14, 18]`. Post-fix:
      `[2, 2, 2, 2]`.

### Task 2: Expose `preTombstoned`

**Files:**
- Modify: `packages/sdk/src/document/crdt/tree.ts`

- [x] **Step 3: Append `preTombstoned: Set<string>` to `editT`'s return
      tuple.** The set is populated in the existing `editT` body
      (around line 1607); only the return signature and statement need
      updating.

### Task 3: Filter descendants in reverseOp

**Files:**
- Modify: `packages/sdk/src/document/operation/tree_edit_operation.ts`

- [x] **Step 4: Replace `clearRemovedAt` with
      `cloneAndDropPreTombstoned`.** Deep-copy the top-level removed
      node, drop descendants whose IDs are in `preTombstoned`, then
      clear `removedAt` on the survivors.
- [x] **Step 5: Plumb `preTombstoned` through `toReverseOperation`'s
      signature.** Add the parameter and pass it from `execute()`.

### Task 4: Regression check

- [x] **Step 6: Run history suites.** `history_tree_test.ts` (207),
      `history_text_test.ts` (73), `tree_test.ts` (17), and the new
      repro test. All pass; no regressions.

### Task 5: Doc updates (cross-repo)

- [x] **Step 7: Update yorkie/docs/design/undo-redo.md.** Mention
      `preTombstoned` in the Tree.Edit reverse-op subsection and add a
      Risks entry for the accumulation defect.
- [x] **Step 8: Create yorkie/docs/design/tree-split-undo-redo.md.**
      Move L1+L2 boundary deletion + pre-tombstoned filtering into a
      single canonical doc. Update yorkie's design README index.
- [x] **Step 9: Remove yorkie-js-sdk's tree-split-undo-redo.md.**
      Implementation specifics belong in this task; canonical design
      is now in yorkie.
