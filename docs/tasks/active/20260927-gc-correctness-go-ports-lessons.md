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
- J3: JS `Client.deactivate` defaults to `synchronous: false`; Go's is
  synchronous. So in "gc targeting nodes made by deactivated client" the
  deactivated client's row is still on file when the peer syncs, the min
  version vector carries the peer at 0, and the barrier holds one tombstone.
  Go passes the same test with 0 against the same server (checked by running
  Go's `TestGarbageCollection` and the JS suite against a server built from
  yorkie `origin/main`). The JS expectation is annotated, not the option.
- J3: vitest swallows `console.log` in this repo's config, so the fuzz
  harness writes its report to `RGA_FUZZ_OUT` when set.
- J3: the JS fuzz uses its own PRNG, so seed counts do not match Go's. The
  shape does: GC-off control clean, every GC-on category improves, none
  regress, and it is not zero -- the same partiality Go records.
- A JSON proxy's `toJSON` does not work outside `update` for arrays; read
  `getRootObject().get('arr').toJSON()` in tests instead.

## Self-review

- Round 1 (full branch diff). One non-blocking finding, fixed:
  `CRDTTree.purgeBarrierAt` read `allChildren`, which copies the child
  array once per stable tombstone per pass; it now reads `_children` in
  place. Checked and kept: no other caller registers `getGCPairs` output, so
  booking in `registerElement` cannot double-register and trip the
  `registerGCPair` toggle; every `registerElement` route (local proxies,
  Set/Add/ArraySet execute, constructor) either brings fresh content or a
  copy with new GC parents; the collection loop terminates because a repeat
  requires at least one purge; the `RGATreeSplit` barrier reads the same
  ticket (`getCreatedAt` of `next`) its `findNodeWithSplit` skip compares.
- Round 2: no blocking findings. Stopped.
