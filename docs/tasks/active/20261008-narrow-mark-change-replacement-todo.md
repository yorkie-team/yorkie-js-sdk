# Narrow a mark change to the inline run it touched

**Created**: 2026-10-08
Tracked as #1438

## Problem

`syncToYorkie` stores a ProseMirror mark as a wrapper element
(`<strong>…</strong>`), so a mark change alters the block's structure.
`sameStructure` rejects it, split/merge detection does not claim it, and it
falls through to **full block replacement**: the whole block is deleted and a
freshly serialized copy is inserted. Every text node in the block dies with it,
so anything a peer typed into that block concurrently lands in a removed node
and disappears. The replicas still converge, so nothing reports a divergence.

## Approach

Direction 1 from the issue: narrow the replacement to the children that
actually changed, instead of the whole block.

Between the old and the new serialization of the single changed block, take the
common prefix and common suffix of *children* (`yorkieNodesEqual`) and replace
only the span between them. The untouched children — and any text a peer typed
into them — are never deleted.

Two guards:

- **Homogeneity.** `IndexTree.hasTextChild()` indexes a node by whether *every*
  child is text, and `pmToYorkie` already wraps bare text in `<span>` when a
  block mixes marked and unmarked runs. A narrowed edit must not leave a parent
  holding both text and element children, so decline when the surviving child
  list would be mixed.
- **Nothing kept.** When the common prefix and suffix are both empty the
  narrowed edit replaces the entire child list, which is no less destructive
  than what the fallback already does. Decline and leave the existing path
  alone, so no currently-passing behaviour moves.

The indices come from the tree's own JSON, so also require that the stored
block still equals the old serialization before trusting the offsets.

## Scope

In scope:

- [x] `tryNarrowedBlockReplace` in `packages/prosemirror/src/diff.ts`
- [x] Call it from `syncToYorkie` after split/merge detection, before the
      full-block fallback
- [x] Unit tests in `packages/prosemirror/test/unit/diff_test.ts`
- [x] Integration tests in
      `packages/prosemirror/test/integration/mark_concurrency_test.ts`

Out of scope — needs a maintainer decision, see the lessons file:

- Direction 2 from the issue (every text run in an inline element, marks as
  that element's attributes). It is the only one of the two that also saves
  typing *inside* the run whose mark changed, but it changes the stored tree
  format for every existing document. **Both reproductions #1438 lists as
  failing need it**: each starts from a paragraph whose only child is a text
  node, and `IndexTree` indexes an element by whether every child is text, so
  the text node cannot survive beside the mark wrappers the change adds.
  Narrowing therefore declines and the fallback deletes the run. The two cases
  are in `mark_concurrency_test.ts` as `it.fails`, asserting the outcome the
  issue asks for, so the gap stays visible. File as a follow-up issue before
  merge.

## Verification

- [x] `pnpm verify:fast`
- [ ] `pnpm prosemirror test` — the integration suites need a running Yorkie
      server, which the autonomous run had no way to stand up. Left to CI.
