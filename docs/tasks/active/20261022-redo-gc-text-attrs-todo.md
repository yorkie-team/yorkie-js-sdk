# Redo after GC must keep the re-inserted text's attributes

**Created**: 2026-10-22
Tracked as #1497

## Problem

`EditOperation.toReverseOperation` records the run the edit inserted as
`retombstoneSpans`, with a `CRDTTextValue` built from `this.content` alone
(`packages/sdk/src/document/operation/edit_operation.ts:274-285`). The
attributes the edit applied are dropped.

The undo ('restore' mode) only re-tombstones that span, so the missing
attributes are invisible there. The redo flips the mode, and the same span
becomes the content to restore. A replica that still holds the tombstone
un-tombstones the original node, attributes intact; a replica that has
garbage-collected it recreates the node from the span — without attributes.
The two replicas diverge.

## Plan

- [x] Carry the edit's attributes on the inserted span's `CRDTTextValue`,
      stamped with the edit's own `executedAt` — which is also the span's
      `createdAt` — so the recreated node's RHT matches what `CRDTText.edit`
      built originally.
- [x] Re-snapshot the spans against live content when the reverse op is built
      (`RGATreeSplit.refreshSpans`), so a style applied to the run after the
      reversed edit is in the span too.
- [x] Unit test: insert with an attribute, undo, GC on one replica only,
      redo, sync — both replicas hold the attribute.
- [x] `pnpm verify:fast`.

## Notes

The wire format already carries per-span attributes
(`RestoreSpan.attributes` in `resources.proto`, encoded by `toPbSpan` and
decoded by `fromPbSpan` in `packages/sdk/src/api/converter.ts`), so no proto
change is needed — only the producer was leaving the map empty.

`RestoreSpan.attributes` is a bare `map<string, string>`, so a span value may
hold **only** what that can express: live attributes, each stamped with the
span's own `createdAt`. `refreshSpans` flattens through
`CRDTTextValue.toRestoreSnapshot` for this; `fromPbSpan` reconstructs the same
shape on decode. `createdAt` is the only derivation that matches the producer:
an attribute the insertion itself applied is stamped with the edit's ticket,
which is also the id of the node it inserted, whereas the operation's
`executedAt` on the wire is the *reverse* op's own, strictly later ticket.

## Out of scope

- Cross-checking the Go decoder (yorkie-team/yorkie#2273) for the same
  `createdAt` derivation — this repo cannot read it; tracked on the PR.
- The `restoreSpans` a delete captures (`RGATreeSplit.edit`'s `removedSpans`)
  still copy the live value wholesale, tombstoned attributes included, which
  `style_tombstone_test.ts` pins deliberately. That path predates this task
  and has the same wire/local asymmetry; flattening it is a separate change.
