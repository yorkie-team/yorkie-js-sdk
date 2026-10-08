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

## Blocks merge: the rule has to land in yorkie too

Not an "out of scope" item — a merge gate, and it needs a maintainer, not
this branch.

Where a same-boundary split lands is a **replicated convergence contract**:
the server and every SDK have to pick the same node for the same change.
Step 1 of the approach changes that pick in JS only. Until the same rule
lands in yorkie-team/yorkie, a JS replica and a Go/server replica can place
the same split differently — which is the #1436 divergence moved, not
removed, for a mixed-SDK document. The JS-only fix converges a JS-only
fleet and is a regression for a mixed one, so shipping it is a trade a
maintainer has to make knowingly.

- [ ] Issue filed against yorkie-team/yorkie porting
      `orderSameBoundarySplit`'s boundary-insert-run rule (and
      `boundaryInsertRunOf`) to the Go tree, and the rule written into
      `docs/design/concurrent-merge-split.md` there — it is a §7.3 reading
      that document does not spell out today.
- [ ] Maintainer decision recorded on the PR: merge JS-first with the port
      tracked, or hold this branch until the Go side is ready.

`boundaryInsertRunOf` carries a `NOTE(cross-implementation)` pointing here.

## Out of scope

- Measuring the Go SDK and the server: they carry the same code and
  presumably diverge the same way, but that is not verified here.
- The fuzz harness behind the issue is not in this repo.
