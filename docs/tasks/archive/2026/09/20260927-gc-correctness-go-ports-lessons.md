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
- J3: "gc targeting nodes made by deactivated client" raced the server.
  JS `deactivate` defaults to asynchronous, so c1's version vector row is
  dropped in the background; if c2 syncs first, minVV carries c2 at 0 and
  the barrier holds "b". CI (Mongo) saw 0; locally (memory backend) I saw 1
  every time, because the memory backend's server-side detach fails with
  "change not found" and never drops the row. I misread that as a
  deterministic difference and flipped the expectation to 1 -- CI then
  failed. Fix: `deactivate({ synchronous: true })`, as Go does, and assert
  Go's 0; 20/20 green against Mongo-backed servers (`latest` and `main`).
  Rule: when an expectation differs between SDKs, run it against the CI
  backend (Mongo) and repeat it before accepting the difference.
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

## Review panel, round 1 (512fd2d8)

- Blocking, root.ts:832 "retention becomes permanent when the successor's
  actor is missing from the min version vector": pushed back. The server's
  min (yorkie `GetMinVersionVector`) always folds in the requesting client's
  own vector, and a client holding the successor node has applied its
  author's change, so that actor is always present; `afterOrEqual`'s
  missing-actor rule (false, identical in Go) is never reached with a
  server vector. A stale row can hold the entry low, which is the same
  wait-for-every-attached-replica rule `removedAt` already follows. Tried to
  reproduce (Red) with a new integration case: the successor's author
  inserts, the remover deletes, the author detaches. Observed minVV after
  the detach still carries the author at 0 (the peer's stale row), the purge
  is held, and it drains on the next round once the peer catches up -- no
  Red. Kept as "successor barrier drains after the successor author
  detaches". No Go change needed.
- Blocking, gc.ts:59 "partial barrier, opt-in assertion-free fuzz":
  pushed back as by design. Go's `gc_rga_fuzz_test.go` is behind the
  `rgafuzz` build tag, CI only vets it, its GC-on test asserts zero and
  fails on purpose, and its op-mask sweep only logs. There is no ratchet to
  mirror. The partiality is recorded in both SDKs.
- Blocking, document.ts:857 "held-back tombstones count toward the size
  limit": pushed back. Go's `Document.Update` checks
  `MaxSizeLimit < cloneRoot.DocSize().Total()`, and `Total` is `Live + GC`,
  the same sum `totalDocSize` takes; Go ships the same barrier, so both
  clients reject the same update. Retention is bounded by lag (cost tests).
- Non-blocking, fixed: `hasGCBarrier` duck-type cast replaced by an
  optional `purgeBarrierAt?(child: GCChild)` on `GCParent` (and
  `purgeBarrierAt?(element)` on `CRDTContainer`); `RGATreeSplit` and
  `CRDTTree` now narrow with `instanceof`, as Go's type assertions do.
  Stale "only on snapshot load" comments on `getGCPairs` updated.
  CONTRIBUTING notes the Mongo backend for the synchronous-deactivate case.
- Left as known limitations: per-pass rescans and linear sibling scans
  (Go has the same shape), `registerGCPair` toggle non-idempotence (no
  caller double-registers), multi-pass loop and bypass branches without
  dedicated tests.
