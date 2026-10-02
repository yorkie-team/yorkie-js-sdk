# Lessons: a further split after concurrent same-boundary splits

- **The insNextID chain is a split lineage, not a boundary.** Every piece
  cut off one element sits in one chain, whatever offset it was cut at. A
  walk that means "the same boundary" has to find where that boundary ends
  in the chain; the node holding the children is the marker, because
  `splitElement` moves everything right of the cut into the product.
- **Fuzz with one operation kind at a time.** The mixed fuzz kept diverging
  after the fix and looked like a partial result; splits-only went to zero
  and inserts-only was already zero, which isolated the remaining failures
  as the insert-at-split-point family and kept this change scoped.
- **Delta-debug to three operations before reasoning.** The 24-step traces
  were unreadable; the minima each trace by hand in a few lines.
- **A `git diff` run from a package directory with a repo-relative path
  writes an empty patch.** `git checkout` then discards the change for real.
  Diff from the repository root, and check the patch is non-empty before
  checking anything out.
