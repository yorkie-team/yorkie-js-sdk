# Make docSize agree with a rebuild (issue #1383, part 3)

**Created**: 2026-09-26

Mirrors yorkie#2037 (`1bae6d8`). Issue #1383 lists four server commits to
mirror; this task takes part 3 only, the docSize accounting. Parts 1, 2 and 4
(merge-delete span, style reached set, merge lineage) are left for follow-ups —
each is a convergence-level change in `tree.ts` and does not fit in one pass.

## Problem

The running `docSize` must equal what a rebuild of the same document from its
operations would compute. Two accounting holes break that equality:

1. **Attribute tombstones are charged for their value.** A removed attribute
   still charges its value's bytes forever, where a rebuild of the same
   document does not, so the two disagree by the dropped value on every
   `removeStyle`.
2. **`movedAt` is never charged.** `RGATreeList.moveAfter` stamps `movedAt` and
   `CRDTElement.getMetaUsage` counts it, but no diff is reported to the root, so
   `docSize.live` is short one `TimeTicketSize` per first-moved element. A
   rebuild sums `getDataSize()` and sees the ticket.

## Plan

- [x] `rht.ts`: `getDataSize` stops charging a removed node's value; `remove`
      returns `{ gcNodes, valueDropped }`. What a tombstone stores and
      serializes is untouched, so nothing changes on the wire.
- [x] `text.ts` / `tree.ts` `removeStyle`: subtract `valueDropped` from
      `size.live`, or from `size.gc` when the holding node is itself a
      tombstone (its gc charge included the value).
- [x] `rga_tree_list.ts` `moveAfter`: report the first-stamp diff alongside the
      dead position node.
- [x] `root.ts`: `accMovedElement(element, diff)` charges `live`, or `gc` when
      the element is already a tombstone.
- [x] Call it from `move_operation.ts` and the `json/array.ts` move helpers.
- [x] Unit tests for the `docsize_rebuild_drift` cases: concurrent move+remove
      and set+removeStyle, in both delivery orders.

## Verification

`pnpm verify:fast`. The integration suites need a Yorkie server this run does
not stand up; CI runs them on the PR.
