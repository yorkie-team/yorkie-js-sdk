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
      stamped with the edit's own `executedAt` so the recreated node's RHT
      matches what `CRDTText.edit` built originally.
- [x] Unit test: insert with an attribute, undo, GC on one replica only,
      redo, sync — both replicas hold the attribute.
- [x] `pnpm verify:fast`.

## Notes

The wire format already carries per-span attributes
(`RestoreSpan.attributes` in `resources.proto`, encoded by `toPbSpan` and
decoded by `fromPbSpan` in `packages/sdk/src/api/converter.ts`), so no proto
change is needed — only the producer was leaving the map empty.

## Out of scope

- Attributes applied by a later `Style` op are not part of the insert span's
  snapshot; this task restores only the attributes the edit itself applied,
  matching the Go fix in yorkie-team/yorkie#2273.
