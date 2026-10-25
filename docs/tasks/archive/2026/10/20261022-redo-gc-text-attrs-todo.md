# Redo after GC must keep the re-inserted text's attributes

**Created**: 2026-10-22
Tracked as #1497. Mirrors yorkie-team/yorkie#2277.

## Problem

The reverse of a Text insert recorded the inserted run as a retombstone span
with content but no attributes. The redo flips the restore mode, so that span
becomes the content to restore: a replica that still held the tombstone
revived the original node with its attributes, while one that had collected
it recreated bare text. A style applied to the run after the insert was
missing from the span as well.

## Scope

Go parity with yorkie#2277 only. Anything JS-only is out.

- [x] `toReverseOperation`: carry the edit's attributes on the inserted span
      (Go `edit.go` `toReverseOperation`).
- [x] Re-snapshot the spans an undo/redo re-tombstones against the live
      content, only when the reverse is kept (Go `refreshSpanAttributes`).
- [x] Validate decoded text restore spans like Go `fromRestoreSpans`.
- [x] Tests mirroring Go `text_redo_attrs_test.go`.

## Out of scope

- Stamping decoded span attributes with the span's `createdAt`, and flattening
  locally captured spans: Go stamps recreated attributes with the restore's
  `executedAt` (`Text.Restore`), so both were reverted.
- Go merges neighbouring refreshed parts with equal attributes; JS keeps one
  span per piece.
- CI MongoDB startup fixes: moved to #1505.
