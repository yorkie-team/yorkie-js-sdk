# Lessons — docSize rebuild drift (issue #1383, part 3)

**Created**: 2026-09-26

## Scope call

Issue #1383 bundles four independent server ports. Two of them (merge-delete
span, style reached set) are convergence changes that rewrite whole blocks of
`crdt/tree.ts` and need the Go acceptance vectors to port faithfully. Taking
all four in one pass would have produced a diff nobody could review as one
thing, so this branch delivers part 3 — the self-contained docSize accounting —
and says so in the PR body rather than quietly widening or half-doing the rest.

## Where the bytes actually sit

The hard part of the attribute-tombstone change is not dropping the value, it
is knowing which side of the ledger was holding it. Three cases, and they are
the same three `attrGCPair` already documents:

- live attr on a live node — the value is in `docSize.live`, so `live` pays.
- live attr on a REMOVED node — the container skips a removed node, so the
  value was never in `live`; it is inside the gc charge taken when the node was
  removed, so `gc` pays.
- attr that was already a tombstone — its value was not being charged before
  the removal either, so there is nothing to drop and `valueDropped` is zero.

Getting this wrong is not a rounding error: `removeStyle` in a rich-text editor
is a loop a user runs hundreds of times, so a per-call bias walks `docSize`
away without bound and eventually disables the document size limit entirely.

## `moveAfter` return shape

`moveAfter` already returned the dead position node. Adding the charge as a
second return value would have made every call site destructure a tuple whose
elements mean unrelated things, so it returns a named struct instead. The
first-stamp test is `getMovedAt()` read *before* the stamp: a second move of
the same element re-stamps a ticket that is already charged, and charging it
again is the same unbounded drift in the other direction.

## Not verified here

The integration suites (`pnpm sdk test`) need a running Yorkie server and
MongoDB, which this run does not stand up. Only `pnpm verify:fast` — lint,
licence headers, doc links, build, unit suites — was run locally.

## Review round 1

Two findings fixed, one disputed.

**`fromTree` dropped `movedAt` and `removedAt`.** `toTree` writes both and
`CRDTElement.getMetaUsage` charges both, but `fromTree` restored neither —
alone among the six `from*` element decoders. A tree that had been moved or
removed therefore came back from a snapshot one ticket per stamp lighter than
it went in, which is the same rebuild disagreement this task is closing, just
on the decode side. Fixed by restoring both, as its five siblings do.

**No collection ran after a move charged to gc.** `accMovedElement` tops up
the element's `sizeInGC` entry as well as `docSize.gc`, and only a collection
can witness the top-up: nothing else reads `sizeInGC`. Dropping the top-up
line and rerunning the new test leaves `d2`'s `gc.meta` at 24 after a full
collect instead of 0, so the case is genuinely load-bearing rather than
decorative.

**Disputed: tombstone values serialized as `''`.** The claim is that shipping
an empty value for a removed attribute makes cross-SDK accounting diverge. The
server does exactly the same thing — `RHT.Remove` mints the tombstone with
`""` and `SetInternal` forces `""` at the decode boundary, with a comment
naming that boundary as the defence against peers that still send a value.
This SDK's `fromRHT` routes every incoming attribute through `setInternal`, so
the wire value of a tombstone is unreachable on either side. Rebuttal filed.

## Review round 2

**Tombstone values serialized as `''`, re-raised.** Rather than defend the
wire change a second time, the branch stops making one. The drift was never
about what a tombstone *stores*, only about what it is *charged*: moving the
exclusion into `RHTNode.getDataSize` (`this._isRemoved ? 0 : valueSize(...)`)
gives byte-identical `docSize` numbers to the `''` approach while leaving
`remove`, `setInternal`, `deepcopy` and `toRHT` storing and serializing
exactly what `main` did. It is also the stronger of the two: under the `''`
approach a peer that ships a value on a tombstone was defused only because
`setInternal` scrubbed it, whereas now such a value cannot be charged no
matter which door it comes in. The rebuttal is withdrawn — not because the
reasoning behind it was wrong, but because a fix that needs no cross-SDK
argument at all is worth more than winning one.
