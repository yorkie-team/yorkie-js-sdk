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

This started as a JS-only rule: choosing Go's behaviour would have kept two
JS clients diverging on a pair that converged before the port. Go has since
adopted the same check verbatim as §9.2 Fix 27 / Port specification rule
2(c) in yorkie#2070, so the two PRs should merge together; until both
release, a JS client and the server snapshot differ on that shape.

yorkie#2070 also added a nested scan (42 splits at levels 1-2 x 276 ranges).
Ported here, JS reproduces its counts exactly: 2810 rendered divergences on
`main`, 241 on this branch, and 152 of those 241 converged on `main` -- the
same 152 Go reports, left for the §9.5 rule that has to land in both SDKs.

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

- **Blocking as raised: the split-family guard (then JS-only).** The reviewer agrees
  the reasoning holds and traced the level-2 case the same way. Its concern is
  that the server runs Go, so JS and the server snapshot differ on that shape
  until yorkie adopts the same check. Not changed here: dropping the guard
  makes two JS clients diverge on a pair that converged before this PR, which
  is the worse failure, and the Go side cannot be fixed from this repository.
  Filed as the follow-up in the PR body instead; resolved by yorkie#2070,
  which ports the same check to Go.
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

## Review round 2

- **The declared-lineage walks were O(range x depth x chain) per node.**
  `endsInside`/`beginsInside` re-walked the declared parent's whole ancestry,
  and each ancestor's `insPrevID` chain, for every End token in a styled
  range -- peer-controlled pointers, so one style message bought that work on
  every replica. Nothing in the walks depends on the node being asked about,
  so `declaredLineageOf` now resolves them once per change into a set, with
  the one direction a set cannot answer memoized per node. Same answers: the
  scan counts are unchanged.
- **`mergedFrom` was trusted from the wire.** `declaredBoundaries` follows it
  to decide whether a delete propagates, and `dropSplitLinks` stripped only
  the split links. It now clears the merge stamps too, so operation content
  and Set/Add payloads lose them exactly as `reissueContentIDs` already did
  on the undo path.
- **The cyclic-link fixture only poisoned `insNextID`.** `poisonedTree` now
  carries an `insPrevID` cycle and a `mergedFrom` cycle as well, with cases
  whose positions are declared inside each.
- Disputed with evidence: the split-family guard being ahead of released Go
  (unchanged, see round 1 -- dropping it makes two JS clients diverge), and
  the 241 nested-scan divergences (§9.5, which has to land in both SDKs
  together; a JS-only rule is the very failure this port removes).

## CI round: the scans outran the CI test timeout

The four exhaustive scans failed on CI with `Test timed out in 5000ms` and
passed locally. `packages/sdk/vitest.config.ts` sets
`testTimeout: isCI ? 5000 : Infinity`, so no local run can surface this: a
scan that takes 20s is simply a slow green here and a red there.

The bodies are synchronous, so the cap never interrupted them. Each scan ran
to completion, its assertions passed, and vitest then failed it on elapsed
time -- the counts in the diagnosis (15s, 10s, 14s, 20s) are full-run
durations, not the point of a hang. Confirmed by re-running the file with
`CI=true`: 27 passed once the tests carry their own budget.

Fixed by giving the six scans an explicit `scanTimeout`, the idiom
`testTimeoutForPBT` already uses in `test/crdt_pbt/helper.ts` for the same
reason. The two split scans were at 3.7s and 2.8s -- under the cap, but with
no margin on a slower runner -- so they got it too rather than waiting to
flake.

Lesson for the next widened scan: a new test whose body loops over thousands
of cases needs its timeout decided when it is written. Check it with
`CI=true pnpm sdk exec vitest run <file>`, since `pnpm verify:fast` inherits
the `Infinity` local budget and will not.

## Round 3: the merge-stamp strip was itself a divergence

Three of the panel's findings pointed at the same change from round 2 --
`dropSplitLinks` widened to clear `mergedFrom`/`mergedAt`/`mergedInto` --
and they were right, for the reason this whole task exists.

What a decoder does with a wire field is a replicated contract. The server
decodes the same bytes to build its snapshots, so a strip only the JS side
performs leaves every JS replica holding a different tree than the server,
and the next snapshot hands the stamps back. Worse on the undo path:
`executeUndoRedo` calls `dropSplitLinksInElement` on a `deepcopy` taken from
the LIVE document, where the stamps are real lineage rather than something a
peer wrote -- so the widened strip erased merge history from restored
elements that kept their node identities.

Reverted to clearing only `insPrevID`/`insNextID`, which is what main does.
Forged merge chains stay bounded the way they always were, by the cycle
guards in `declaredBoundaries` and `resolveMergeTarget`; the fixture in
`tree_split_link_guard_test.ts` keeps its `mergedFrom` cycle cases, which now
prove the guards rather than the strip.

Lesson: "drop the field on the way in" is only a local hardening when the
field is local. For anything the server reads, the hardening has to be a
bound on the walk, not a change to the data.

## Round 3: malformed edit content decoded to a hole

`fromTreeNodesWhenEdit` pushed `fromTreeNodes(...)` unconditionally --
`treeNodes.push(treeNode!)` -- and that call returns `undefined` for an empty
content entry, so a one-field wire edit put an `undefined` in the contents
array for `edit` to dereference. `fromTreeNodes` then built its depth table
with `parent!.prepend`, a bare TypeError on any depth whose parent was never
written. Empty entries are now skipped and a depth miss (or a text node named
as a parent) raises `ErrInvalidArgument`, so the pack is rejected at the
converter boundary instead of failing part way through a tree the caller has
already started applying.
