# DocSize: count a removed container's descendants in the GC total

**Created**: 2026-08-17

Mirror of `yorkie-team/yorkie#1934`. The bug reproduces here byte-for-byte,
so this is a port of that fix rather than an independent investigation.

## Problem

`CRDTRoot` kept three size-accounting sites that were individually plausible
and jointly inconsistent:

- `registerElement` (`crdt/root.ts`) books a container **and every
  descendant** into `docSize.live`.
- `deregisterElement` subtracted **both** from `docSize.gc`.
- `registerRemovedElement` moved **only the container itself**.

So deleting a non-empty object stranded every descendant's cost in `live` and
pushed `gc` below zero once the tombstone was collected. Measured before the
fix, after a full add-then-remove-then-collect cycle:

| scenario | `gc` after collection |
|---|---|
| object with one member | `{data: -2, meta: -48}` |
| array with one element | `{data: -2, meta: -24}` |
| nested object | `{data: -2, meta: -96}` |
| text | `{data: 0, meta: 0}` (correct) |

These are identical to the Go SDK's pre-fix figures. `Text` and `Tree` were
never affected: they are leaf `CRDTElement`s whose `getDataSize()` already
covers their whole structure, unlike `CRDTContainer`.

`Document.update` gates the document size limit on `totalDocSize` of the
clone's `DocSize` (`document.ts:708`), so a negative `gc` silently discounts a
document below its real cost.

Three further routes reach the same corruption:

1. A concurrent remove reports the same element as removed again whenever its
   ticket wins the LWW comparison, and the size moves into `gc` twice.
2. A member removed remotely inside an already-removed container is booked by
   both its container's removal and its own.
3. A remote `Set` landing inside a container this replica already tombstoned
   is booked into `live` and later subtracted from `gc`, which never held it.

## The fix

Ported from the Go change: state the rule the three sites collectively
maintain, and hold each site to it.

> Every registered element's `getDataSize()` is counted in exactly one of
> `docSize.live` or `docSize.gc`, and `CRDTRoot.sizeInGC` records which — and,
> for gc, the exact amount charged.

- `moveSizeToGC` is the only way a size enters `gc`, and it is idempotent.
  That covers (1) and (2).
- `registerRemovedElement` applies it to the element and, for a
  `CRDTContainer`, to every descendant.
- `deregisterElement` subtracts from `gc` only what `sizeInGC` says was
  charged, and from `live` anything not listed there. That covers (3), which
  no descendant walk can reach — the element does not exist when the walk runs.

`sizeInGC` stores the charged `DataSize` rather than a flag because
`getDataSize()` is **not stable over an element's lifetime**: it grows by one
ticket the moment `removedAt` is set, which can happen *after* the size moved.

`gcElementSetByCreatedAt` is left alone. It is the registry of removed
elements that drives `garbageCollect`, `getGarbageElementSetSize` and
`getGCElementPairs` — the equivalent of Go's `gcElementPairMap`, not of
`sizeInGC`.

`set_operation.ts` is corrected to deregister the element actually registered
under that `createdAt` rather than the incoming deep copy, matching the Go
change. The two differ whenever the tombstone moved on after the reverse
captured its copy.

## Tasks

- [x] Add `CRDTRoot.sizeInGC` and `moveSizeToGC`; rework
      `registerRemovedElement` and `deregisterElement` around the invariant
- [x] Fix `set_operation.ts` to deregister the registered element
- [x] Port the six regression tests from the Go PR into
      `test/unit/document/document_size_test.ts`, with the two-replica
      `crossSync`/`newReplicas` helpers the concurrent cases need
- [x] Verify all six fail without the source change and pass with it, and that
      the ten pre-existing `Document Size` tests are unaffected
- [x] `npx tsc --noEmit`, `pnpm sdk build`, full unit suite (342 passed)

## Not fixed here

The `CRDTRoot` constructor seeds `live` from an already-tombstoned element's
post-removal size and then refunds a ticket that `live` did hold,
over-crediting `live.meta` by one `TimeTicketSize` per uncollected tombstone.
It is pre-existing and unchanged by this port. Tracked on the Go side as
`docs/tasks/active/20260817-docsize-snapshot-rebuild-drift-todo.md` in
`yorkie-team/yorkie`, which lists the JS mirror as one of its tasks.

## See Also

- [[20260817-docsize-container-gc-symmetry-lessons]] — lessons from the port
