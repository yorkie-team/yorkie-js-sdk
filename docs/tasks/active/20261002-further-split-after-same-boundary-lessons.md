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
- **"Holds children" is not "holds the right half".** The first version
  stopped the §7.8 walk at any non-empty sibling. Review found the hole:
  text typed into an empty same-boundary product makes it non-empty too,
  and a split after that text is still a same-boundary split. A child the
  editor's version vector knows is the marker that survives both cases.

## Review rounds (harness `/code-review`, not the `@claude` lens panel)

- Round 1 (correctness, tests): one medium finding -- the stop condition
  mistook typed-in text for the right half; `<p>a</p>` / `<p>ab</p>`, both
  split at the end, the newer actor types `x` into its product and splits
  after it, converged on `main` and diverged here. Fixed: the walk now stops
  at the first sibling holding a child within the editor's version vector
  (`holdsKnownChild`); the reviewer's two scripts and a mixed one are in the
  suite.
- Round 2 (design fit, blast radius): no blocking findings; loop ended.
  The reviewer's differential fuzz (1500 seeds, two mixes) found no seed
  that converges on `main` and diverges here, and 84 split-only seeds that
  flip the other way. It reported one pre-existing §7.8 gap outside this
  change -- a same-boundary split whose right half was deleted before the
  concurrent split arrives (`<p>ab</p>`: d2 splits a|b and deletes "b", d1
  splits a|b) -- as diverging by node ID on `main` and here alike. My probe
  shows identical XML on both sides for both versions; the node-ID shape was
  not re-checked. Listed as out of scope in the todo.

## `@claude` lens panel

- Blast radius, round 1: one major finding, and a correct one -- this
  branch changes a replicated convergence rule on the JS side only, while
  integration CI still pins an unpatched `yorkieteam/yorkie:latest`. It is
  the same hazard the todo's rollout gate already describes, raised as a
  merge blocker rather than as a note. Nothing in this repository can close
  it: the remedy is a change to `orderSameBoundarySplit` in
  yorkie-team/yorkie, which needs a maintainer with access there. Recorded
  as two unchecked boxes under Verification and as a standstill rebuttal,
  so the blocker stays tracked rather than argued away. **Do not merge this
  branch on a green CI alone** -- CI exercises a server without the mirror,
  so green here means the gate is still open, not that it is satisfied.
