**Created**: 2026-03-31

# Tree.Style Undo/Redo

Design: [[tree-style-undo-redo]]

## Tasks

- [ ] 1. `CRDTTree.style()`: return `prevAttributes` and `attrsToRemove`
  - Change return type to `[GCPair[], TreeChange[], DataSize, Map<string, string>, string[]]`
  - Capture previous attribute values from first styleable node in `traverseInPosRange`
  - Update all callers of `tree.style()` to destructure new return values

- [ ] 2. `CRDTTree.removeStyle()`: return `prevAttributes`
  - Change return type to `[GCPair[], TreeChange[], DataSize, Map<string, string>]`
  - Capture current attribute values before removal from first styleable node
  - Update all callers of `tree.removeStyle()` to destructure new return values

- [ ] 3. `TreeStyleOperation.execute()`: generate `reverseOp`
  - Collect `reversePrevAttributes` and `reverseAttrsToRemove` from CRDT calls
  - Build reverse `TreeStyleOperation` (3 cases: set only, remove only, both)
  - Return `reverseOp` in `ExecutionResult`

- [ ] 4. Tests: single-client undo/redo
  - Style undo/redo: apply bold → undo → verify removed → redo → verify restored
  - New attribute undo: add attribute → undo → verify removed
  - RemoveStyle undo: remove attribute → undo → verify restored
  - Mixed set + remove in one operation

- [ ] 5. Tests: multi-client concurrent style + undo
  - Two clients style same range → one undoes → verify correct merged state
  - Remote style on same range before local undo
