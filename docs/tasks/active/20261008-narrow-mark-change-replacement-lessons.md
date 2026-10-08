# Lessons: narrow a mark change to the inline run it touched

Tracked as #1438

## The homogeneity constraint decides how much of the issue is fixable

The issue offers two directions and asks which is preferred. Reading
`pmToYorkie` changes the arithmetic of direction 1:

> Yorkie constraint: a parent's children must be ALL text or ALL element.
> When marks produce inline wrapper elements (strong, em, etc.) alongside bare
> text nodes, we wrap bare text in `<span>` to make children homogeneous.

`IndexTree.hasTextChild()` is `children.every(isText)`, so a parent holding both
kinds is not a shape this binding may create.

That means the issue's own repro case 2 — bolding `bc` inside an unmarked
`<p>abcdef</p>` — cannot be narrowed at all. The old block's children are a
single bare text node; the new block's children are
`[<span>a</span>, <strong>bc</strong>, <span>def</span>]`. There is no common
prefix or suffix of *children*, and the text node cannot survive as a sibling of
the new wrappers. The whole child list has to be rewritten either way.

So direction 1 helps exactly when the block already has element children — a run
whose mark changes among other runs that keep theirs. That is a real case
(re-marking, unbolding, link edits in a mixed paragraph) but it is not the
repro in the issue, and the issue's three tests are unchanged by this PR. That
is stated in the PR body rather than papered over.

## Why not direction 2 here

Direction 2 (every text run in an inline element, marks as that element's
attributes) is the one that also saves typing *inside* the changed run: the mark
change becomes `tree.style` on existing elements plus split edits at run
boundaries, and no text node is ever deleted. It also changes the stored format
for every existing document — `pmToYorkie`, `yorkieToPM`, every expected XML in
the test suite, and the on-disk shape of documents already in production. That
is a maintainer's call about data at rest, not something to decide inside an
autonomous run, so it is left for the issue to settle.

## Review rounds

`/self-review` was not run: this run is granted no tool that can dispatch the
reviewer subagent. Review is left to CI, `@claude review`, and a human.

## Panel round 1

Three blocking findings, all acted on in one pass:

- **The narrowed path ignored the block node itself.** It diffed only
  `children`, so a transaction that retyped the block *and* touched a child —
  a heading input rule is the everyday case — emitted a children-only edit and
  dropped the block half for good, diverging the CRDT from the PM doc with no
  later edit able to notice. `tryNarrowedBlockReplace` now compares `type` and
  `attributes` first and declines, which is a fallback to full block
  replacement, not a loss.
- **The staleness guard had no test.** The guard is what stands between a
  stored tree that no longer matches the old serialization and an edit over
  the wrong range, so it earns a test that drives it false:
  `should decline the narrowed replacement on a stale block`, in the suite
  built for exactly that shape. Removing the guard makes it fail.
- **Neither of the issue's two reproductions is fixed.** Correct, and not
  fixable from direction 1 — see the todo's "Out of scope". Both now live in
  `mark_concurrency_test.ts` as `it.fails`, asserting the outcome the issue
  asks for rather than the lossy one, so direction 2 landing will flip them
  green and the gap cannot be read as covered in the meantime.
