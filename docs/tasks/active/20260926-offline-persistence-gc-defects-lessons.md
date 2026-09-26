**Created**: 2026-09-26

# Lessons — three defects in offline-persistence repair and GC accounting

## What the three had in common

Nothing mechanically — they are three unrelated bugs that happened to be found
in one porting pass. What they do share is a shape: each is a piece of state
that is *correct at the moment it is written* and wrong afterwards because
nothing owns its retirement.

- The re-restore is right to undo the header; it is wrong to undo the counter,
  because the counter is the one part of the header the server has already
  consumed. Undoing a decision is not the same as undoing its side effects.
- `release`'s zero record is right while the tombstone is addressable and
  garbage the moment it is not — but a `Map` keyed by object identity cannot
  tell, because holding the key is what keeps the element alive. The lifetime
  wanted was "as long as the element", which is what `WeakMap` spells.
- `ElementRHT.set` marks the LWW loser removed so `ownKeys` skips it. That is a
  no-op for a loser that is already removed — except `CRDTElement.remove`
  accepts any later ticket, so the no-op is a mutation.

## Notes

**A zero `sizeInGC` record is a marker, not a measurement.** `moveSizeToGC` and
`accMovedElement` both branch on it, so it cannot simply be deleted at release
time — a peer that has not seen the restore can still remove something inside
the orphaned subtree. `WeakMap` keeps the marker for exactly the window in which
it can be consulted and no longer, without either side having to know about the
other.

**The counter and the checkpoint are different positions.** The
log-discontinuity repair already computes `headerWatermark` as
`max(ackedWatermark, meta counter)` — precisely because the two diverge when an
edit is minted while a sync is in flight. That the same value is what the repair
must preserve is not a coincidence: it is the highest `clientSeq` the server
could possibly have seen.

**A cross-SDK fix is only half-landed here.** The reporter deliberately did not
fix these in `yorkie-ios-sdk`, and `ElementRHT.set` in particular mirrors
`yorkie/pkg/document/crdt/element_rht.go`. Defect 3's guard makes the JS side
disagree with Go until Go takes the same guard. The disagreement is only
reachable on a snapshot decode of an object holding a tombstone that sorts after
a restored occupant, and the JS side is the one that matches the invariant
(`removedAt` is the ticket of the removal that happened), so shipping first is
the right direction — but it needs the Go and Swift ports behind it.
