# Tree style with both halves must survive the wire

**Created**: 2026-10-22
Tracked as #1498

## Problem

The reverse of a `tree.style()` that both overwrote existing attributes and
added new ones is a single `TreeStyleOperation` carrying both `attributes`
(the overwritten keys' previous values) and `attributesToRemove` (the added
keys). `toOperation` and `fromOperation` (`packages/sdk/src/api/converter.ts`)
keep only `attributesToRemove` when it is non-empty, so the undoing client
applies the set half while the server and peers apply the remove half, and
the replicas diverge for good.

## Scope

Wire only, matching Go's `toTreeStyle`/`fromTreeStyle`, which encode and
decode both fields.

- [x] `toOperation`: always write both fields.
- [x] `fromOperation`: always read both, through the full constructor.
- [x] Unit test: undo of a combined style yields the same tree on the undoing
      client and on a peer fed through the converter, and that tree is Go's
      (`<p b="x">`, style `{b:'y', c:'z'}`, undo -> `<p b="x" c="z">` on both;
      checked with a scratch Go test on yorkie main).
- [x] Unit test: the combined reverse keeps both fields across the round trip.

## Intentionally unchanged

`TreeStyleOperation.execute` stays an if/else that runs only the
`attributes` half when it is non-empty, exactly like Go's `TreeStyle.Execute`.
So `c` survives the undo on every replica. Making execute apply both halves
changes what replicas compute and needs a cross-SDK change (Go and JS
together, see yorkie
`docs/tasks/active/20260816-tree-style-combined-reverse-dropped-todo.md`),
not a JS-only one. Reverse building is also unchanged.

## Out of scope

- The same one-field encoding for Text's `StyleOperation` in `converter.ts`.
- The CI MongoDB change, which moved to #1505.
