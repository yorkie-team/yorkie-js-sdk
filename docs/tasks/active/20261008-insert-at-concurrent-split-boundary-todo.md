# Text inserted at a concurrent split boundary lands on both sides

**Created**: 2026-10-08
Tracked as #1436

## Problem

Text inserted at the very position where a peer concurrently splits the
paragraph lands on the left of the new boundary on one replica and on the
right on the other. Three operations are enough; both replicas hold
`<doc><p>ab</p></doc>`.

```ts
d1.update((r) => r.t.edit(2, 2, { type: 'text', value: 'e' })); // "aeb"
d1.update((r) => r.t.edit(2, 2, undefined, 1));                 // split "a|eb"
d2.update((r) => r.t.edit(2, 2, undefined, 1));                 // split "a|b"
// d1: <doc><p>a</p><p></p><p>eb</p></doc>
// d2: <doc><p>a</p><p>e</p><p>b</p></doc>
```

The replica that applied the insert first has the text inside the paragraph
when the split arrives, so the split's position resolves against a tree where
the text is already there. The replica that applied the split first has the
right half in the product, so the insert resolves at the end of the left
piece. Each is self-consistent; the two disagree.

## Approach

Two sides of the same boundary, both in `packages/sdk/src/document/crdt/tree.ts`.

1. **Split applied second** (`orderSameBoundarySplit`). §7.8 orders
   same-boundary split products newest ticket first. When the concurrent
   product sitting next begins with inserts the splitter did not know, the
   two boundaries do not coincide after all: §7.3 keeps such an insert on
   the left of a split boundary, so our boundary is *inside* that product,
   past the run of concurrent inserts. Split it there instead of ordering by
   ticket.
2. **Insert applied second** (`advanceIntoSplitProducts`). The step 04 RGA
   scan for the left sibling stops at the last child of the resolved parent,
   but the sequence continues into a concurrent split product of that parent.
   Continue the scan there over a run of newer-ticket *text* children, the
   same rule step 04 applies inside one node. Element children are left to
   §7.8, which already orders them.

   Applied at the `editAndRestore` call site, to a **collapsed** range only,
   rather than inside `findNodesAndSplitText`. That method also resolves
   style ranges (`styleTargets`, §9.4) and delete ranges, and a *range*
   endpoint that walked into a split product would change which parents the
   traversal runs between -- the §9.4 target set and the Phase 3 narrowing
   both read them -- over nodes the editor never saw. §7.5's
   `advancePastUnknownSplitSiblings` stays the only rule that moves range
   endpoints past split products.

## Acceptance criteria

- [x] All three minima in #1436 converge, in tree shape (node IDs) and XML.
- [x] Convergence holds whichever replica applies which change first.
- [x] No regression in the existing unit suites, in particular
      `tree_split_order_test.ts` and `tree_split_sibling_cascade_test.ts`.
- [x] `pnpm verify:fast` green.
- [x] Placement does not depend on delivery order or on which tombstones a
      replica holds (see below).

## Order independence and remaining divergences (2026-10-10)

A review of the branch found the rules sensitive to delivery order, and an
external fuzz of #1436's criterion (5000 seeds, two replicas, one change
delivered at a time) showed the branch head regressing against `main` (1150
divergent runs against 1068). Three refinements, each with a test that fails
on the previous head:

- [x] `atEndOfLiveContent` counts a trailing child as gone only when the
      inserting change knew of its removal (`ticketKnown`), not when it is a
      local tombstone — scenario (a), both delivery orders.
- [x] Both sides of a boundary measure the end of a node and the run the same
      way: `liveContentEndsAt` backs `orderSameBoundarySplit`'s entry and
      `adjacent` gates as well as `atEndOfLiveContent`, and both run scans
      step over a tombstone the change knew about instead of ending on it.
- [x] `orderSameBoundarySplit` redirects only into a product adjacent to the
      boundary — two start splits against a typist's insert and split, four
      delivery orders.
- [~] `boundaryInsertRunOf` and `advanceIntoSplitProducts` cross only
      children older than the split product (`movedBySplit`) — **rejected**.
      It makes Enter-then-type converge but regresses seeds 69, 502 and 3768,
      3768 against `main`, so it is not in the code. Enter-then-type is an
      `it.fails`; which way the run should read post-split text is open.
- [x] Remaining divergences recorded as four `it.fails` tests (seeds 101, 235,
      193, 24), each confirmed to diverge on this branch; seeds 69, 502 and
      3768 converge and are kept as passing regression guards. No case that
      converged before this branch diverges on it.
- [x] Design doc: the refinements, the rejected one, and a Remaining
      divergences section with the fuzz numbers.

Result: 806 divergent runs (bucket A 388) on this branch, 407 (A 398) with
#1435 — measured with `movedBySplit` still in, so an upper bound. The PR is a partial fix for #1436 and should reference it rather than
close it; the remaining cases need a further change, likely in §7.8's
same-boundary split ordering, and #1435 for the split-only ones.

- [ ] Remaining #1436 cases fixed and the `it.fails` tests flipped to `it`
      (follow-up, not this PR).
- [ ] Decide how the boundary run should read text typed into a split product
      after the split (Enter-then-type vs seeds 69/502/3768); both readings
      lose a case today (follow-up, not this PR).

## Blocks merge: the rule has to land in yorkie too

Not an "out of scope" item — a merge gate, and it needs a maintainer, not
this branch.

Where a same-boundary split lands is a **replicated convergence contract**:
the server and every SDK have to pick the same node for the same change.
Both steps of the approach change that pick in JS only. Until the same
rules land in yorkie-team/yorkie, a JS replica and a Go/server replica can
place the same split differently — which is the #1436 divergence moved, not
removed, for a mixed-SDK document: before these rules both sides applied
ticket order and *agreed*, on a position both now consider wrong. The
JS-only fix converges a JS-only fleet and is a regression for a mixed one,
so shipping it is a trade a maintainer has to make knowingly.

Neither item below is something this branch can close — one is an issue on
another repository, the other is a decision. They are recorded here and in
the design doc so the next reader does not have to rediscover them. The
review panel raised the same gate as a blocking finding on the PR; it stays
open, because closing it is the maintainer's call and not a code change.

- [ ] Issue filed against yorkie-team/yorkie porting
      `orderSameBoundarySplit`'s boundary-insert-run rule (with
      `boundaryInsertRunOf`) and `advanceIntoSplitProducts` to the Go tree,
      and the rules written into `docs/design/concurrent-merge-split.md`
      there — it is a §7.3 reading that document does not spell out today.
- [ ] Maintainer decision recorded on the PR: merge JS-first with the port
      tracked, or hold this branch until the Go side is ready.

The deviation itself is documented in
[docs/design/split-boundary-insert-side.md](../../design/split-boundary-insert-side.md),
not only here, so it survives this task's archival: it carries the measured
state of the Go side, what a port has to cover, and the risk table.
`boundaryInsertRunOf` carries a `NOTE(cross-implementation)` pointing at
that document.

## Out of scope

- Running the Go SDK and the server against the three minima. Their *code*
  was read for the design doc — `pkg/document/crdt/tree.go` has
  `orderSameBoundarySplit` ordering by ticket with no boundary-insert run,
  and no counterpart to `advanceIntoSplitProducts` — but no Go replica was
  executed here.
- The fuzz harness behind the issue is not in this repo.
