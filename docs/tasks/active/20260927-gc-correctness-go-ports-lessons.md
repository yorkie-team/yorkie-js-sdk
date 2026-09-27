# Lessons: port three GC correctness fixes from the Go SDK

**Created**: 2026-09-27

## Notes

- J6: `CRDTTreeNode.create(id, type, children)` does not set `parent` on the
  children; the converter and `deepcopy` do. A test that hand-builds a tree
  has to `append` so the root guard in `CRDTTree.getGCPairs` (skip the
  parentless root) sees real parents.
- J6: after an undo re-sets a removed tree, the running garbage count is one
  higher than a rebuild until the next collection. The orphaned tombstone
  tree still holds its own pair for the node that was already removed inside
  it; `unregisterRemovedElementPair` releases element charges but not the
  internal pairs. Go's `UnregisterRemovedElementPair` does the same, so this
  PR keeps parity and only asserts docSize == rebuild after collection. A fix
  belongs in both SDKs together.
