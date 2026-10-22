# Lessons — Redo after GC must keep the re-inserted text's attributes

## What the bug taught

A span set that is only ever *re-tombstoned* hides an incomplete payload.
`retombstoneSpans` was built for the undo direction, where only the identity
(createdAt + offset range) is read, so an empty attribute map passed every
test. The redo reuses the same span as restore content, and there the value
matters — but only on a replica that purged the node, because an
un-tombstone path reads the surviving node, not the span. Two independent
conditions had to line up for the divergence to show.

Rule of thumb: a payload that is sometimes identity-only and sometimes
content-bearing has to be built for the content-bearing case.

## Review rounds

### Round 1 (review panel on the PR)

Three findings, all downstream of the span payload the first commit filled in:

- **The wire drops what the span value carries.** `RestoreSpan.attributes` is
  `map<string, string>` in the proto — no per-attribute timestamp — so the
  decoder has to invent one. It used the reverse operation's `executedAt`,
  which no replica that produced the span ever used. Fixed by stamping the
  span's own `createdAt`: for a run the insertion itself styled, that ticket
  *is* the `updatedAt` the producer holds, because `CRDTText.edit` stamps the
  attributes with the same ticket that becomes the node's id.
- **The decoder trusted the span.** `fromPbTreeRestoreSpan` validates tree
  spans; the text one validated nothing, so a blank `created_at` or an
  interval that does not match `content` only failed deep inside the restore
  path, on every peer that applied the pack. Same boundary check now.
- **The snapshot was insert-time only.** A style applied to the run after the
  insert was missing from the span, so a purged replica recreated the run
  unstyled while a replica that un-tombstones kept the style. The undo now
  re-snapshots the spans it is about to re-tombstone against the live content
  (`RGATreeSplit.refreshSpans`), so the redo's restore payload is current as
  of the undo rather than as of the insert.

Residual, recorded rather than fixed: attributes applied to a run *between*
the undo and the redo still cannot reach a purged replica, and for a span
whose attributes were set long after its insertion the wire cannot carry the
real `updatedAt` at all. Both need a per-attribute timestamp in the proto
(`yorkie-team/yorkie`), which this repo does not own.

Rule of thumb from this round: when a payload crosses the wire, check what
the *proto* carries, not what the in-memory type carries. The two diverged
here by exactly one timestamp, and that is enough to diverge two replicas.

## Panel round: the refreshed span was richer than the wire

The previous round's lesson ("check what the proto carries") was written and
then not applied to the very code it describes. `refreshSpans` copied the live
piece's value with `substring`, which deep-copies the whole RHT — every
attribute's real `updatedAt`, every attribute tombstone. `RestoreSpan` carries
neither: it is a bare `map<string, string>`, and `toPbSpan` reads it through
`RHT.toObject`, which skips removed nodes. So the producing replica kept the
rich copy, shipped the flat one, and the two rebuilt a purged node with
different RHTs and different GC ledgers — the exact divergence the refresh was
added to close, reintroduced one layer down.

The fix is a separate operation rather than a flag on `substring`:
`CRDTTextValue.toRestoreSnapshot` builds a span-shaped value (live attributes
only, each stamped with the span's `createdAt`) — the same shape `fromPbSpan`
reconstructs. `substring` keeps meaning "a split piece", which must stay rich.
`restore_converter_test.ts` now pins that a snapshot survives the wire with an
identical RHT, tickets included.

Rule of thumb: a value that crosses the wire and a value that lives in the
tree are two types wearing one class. When you copy one into the other, say
which one you are making.
