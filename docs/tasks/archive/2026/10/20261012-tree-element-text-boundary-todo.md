# Resolve the index before a text that follows an element

**Created**: 2026-10-12
Fixes #1481. JS half of yorkie-team/yorkie#2079.

## Problem

`CRDTTreePos.fromTreePos` anchored a text reached at offset 0 on the text
itself unless it was the parent's first visible child. A left sibling means
"after it", so in `<p><b>hello</b> world</p>` index 8 inserted after
` world`, and `edit(8, 14)` deleted nothing.

## Fix

A text at offset 0 anchors on its previous visible sibling, or on the parent
when it is the first visible child (`node.prevSibling ?? node.parent`). That
sibling is always an element: `findTreePos` resolves a boundary between two
texts to the end of the left one.

- Only local index conversion changes. Remote replicas apply the position
  as-is, so convergence and the wire format are unchanged.
- Same rule as Go `toTreePos`; the position goes on the wire, so the SDKs
  must agree. The rule is documented in yorkie's `docs/design/tree.md`.

## Checklist

- [x] Change `fromTreePos`
- [x] Port the crdt-level cases from yorkie's `tree_find_pos_test.go`
- [x] Port the two-replica cases (concurrent split, remove, same-boundary
      insert) from `tree_element_text_boundary_test.go`
- [x] Red on main (12 of 14 fail), green with the fix
- [x] `pnpm verify:fast`
