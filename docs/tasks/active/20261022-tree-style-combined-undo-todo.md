# Tree style with both halves must round-trip and apply as one

**Created**: 2026-10-22
Tracked as #1498

## Problem

The reverse of a `tree.style()` that both overwrote existing attributes and
added new ones is a single `TreeStyleOperation` carrying both `attributes`
(the overwritten keys' previous values) and `attributesToRemove` (the added
keys). Three places treat that shape as if only one half existed:

- `toOperation` (`packages/sdk/src/api/converter.ts`) encodes
  `attributesToRemove` when non-empty and drops `attributes` from the wire.
- `fromOperation` (same file) reads `attributesToRemove` when non-empty and
  ignores `attributes`.
- `TreeStyleOperation.execute` is an if/else that runs only the set half
  when `attributes` is non-empty.

So an undoing client applies the set half locally while its peers receive and
apply only the removal half, and the replicas diverge permanently. The Go SDK
encodes both fields, so a JS peer decoding a Go combined style loses the set
half too.

`StyleOperation` (Text) already does the right thing: it runs the removal half
then the set half, and builds a combined reverse op.

## Plan

- [x] `TreeStyleOperation.execute`: run `removeStyle` then `style` when both
      halves are present, accumulating pairs, sizes, changes and the reverse
      op's fields across the two — mirroring `StyleOperation.execute`.
- [x] `toOperation`: always write both `attributes` and `attributesToRemove`.
- [x] `fromOperation`: always read both, constructing the operation through the
      full constructor.
- [x] Unit test: a combined `TreeStyleOperation` survives
      `toOperation`/`fromOperation` with both halves intact.
- [x] Unit test: executing a combined operation sets the overwritten keys and
      removes the added ones in one pass, and the undo of a combined style
      leaves the same attributes an applying peer would compute.
- [x] `pnpm verify:fast`.

## Out of scope

- The identical if/else in `toOperation`/`fromOperation` for Text's
  `StyleOperation` (`converter.ts:569`). `StyleOperation.execute` already
  applies both halves, so the wire drop is a separate defect with a separate
  blast radius; it is not what #1498 reports.
- Server-side handling of the combined shape (yorkie-team/yorkie).
