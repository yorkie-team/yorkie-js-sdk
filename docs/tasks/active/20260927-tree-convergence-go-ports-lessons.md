# Lessons: port three tree convergence fixes from Go

**Created**: 2026-09-27

## Go's scan numbers are the port's acceptance test

yorkie#2038 pins absolute counts for its exhaustive scans over
`<r><p>ab</p><p>cd</p><p>ef</p></r>`: split x style 1001 pairs, 759 styled
pairs, 1862 styled nodes; merge x style 7098 pairs, 4254 / 6302, at most 1292
tombstone-only. Before the port, the JS scans reported 135 and 297 rendered
divergences, the exact "before" numbers Go recorded. After it they match Go's
"after" numbers on every count, tombstone-only included (1292 exactly). Two
implementations agreeing on those counts over 8099 pairs is much stronger
evidence of an identical reached set than any handful of goldens.

## Go's own scans missed a level-2 split

The integration suite's `concurrently-split-edit-test (splitLevel>=2)`,
`A -> B`, split-2 x style and x remove-style, went red after a faithful port.
Replayed server-free on Go (a scratch worktree of yorkie `origin/main`), the
same pair diverges there too: Go main styles `ab`, `cd` and `efgh` in one order
and only `efgh` in the other. At `ac88215d^` both orders agreed. Go's scans
split one level of a flat tree, and its `test/complex` lane only runs behind a
path filter, so nothing flagged it.

The cause is the split-family branch. A level-2 split carries the right half
of `<p>abcd</p>` into a new parent; the style's range began right after
`<p>abcd</p>`, and because `advancePastUnknownSplitSiblings` stops at a parent
change, the traversal now passes that half's End token. The branch reads an
End token as "the range ran past this element's end", but an element is
reached through its End token alone only when the range began inside it
(§9.6's own reasoning). Requiring `beginsInside(family[0], declaredFromParent)`
closes it and changes none of Go's scan counts.

That makes this one JS-only rule. Choosing Go's behaviour would have kept two
JS clients diverging on a pair that converged before the port. It needs a
mirror fix in Go; until then a JS client and the server snapshot differ for
that shape (they already differed there before this PR, in the other
direction).

## Smaller behaviour differences, all toward Go

- The §9.1 End-token guard now treats an empty version vector as local, as
  Go's `len(vv) == 0` does. JS used to test `versionVector !== undefined`.
- `removeStyle` emitted one `RemoveStyle` change per token visit, so a fully
  covered element produced two. `styleTargets` deduplicates, so it is one per
  node now. A split sibling a style reaches reports a change only while live,
  like every other target.
- `styleByPath`/`removeStyleByPath` reject a backwards range, as the index
  forms always have.

## Not ported

Go's issue mentions a 300-seed randomised sweep; it is not in Go's committed
tests, so there is nothing to mirror. The integration suite's split x edit
matrix is what caught the level-2 case above.

## Integration run

A local `yorkieteam/yorkie:latest` came up through
`docker/docker-compose.yml`, so `pnpm sdk test` ran in full.

## Review round 1

An independent pass compared every ported function with Go's line by line
and found them equivalent, including `declaredParentOf` against
`ToTreeNodes` and an undefined version vector against `len(vv) == 0`.

- **Blocking as raised: the JS-only split-family guard.** The reviewer agrees
  the reasoning holds and traced the level-2 case the same way. Its concern is
  that the server runs Go, so JS and the server snapshot differ on that shape
  until yorkie adopts the same check. Not changed here: dropping the guard
  makes two JS clients diverge on a pair that converged before this PR, which
  is the worse failure, and the Go side cannot be fixed from this repository.
  Filed as the follow-up in the PR body instead.
- `styleTargets` said its result is in document order; boundary elements are
  appended after the traversal (as in Go). Comment corrected.
- No test redid a split reverse. The multi-op undo case now also redoes and
  undoes again, checking for duplicate ids after each step.
- Event differences (one `RemoveStyle` per node, no events for removed split
  siblings) and the `styleByPath` backwards-range rejection: already listed
  above; the PR body calls them out.
- An empty attribute list still walks the range and emits empty
  `RemoveStyle` events, unlike Go's early return. That predates this PR and
  does not change CRDT state, so it is left alone.

No blocking findings remain after round 1 (the one raised is disputed above
with evidence), so the review stops here.
