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
2. **Insert applied second** (`findNodesAndSplitText`, step 04). The RGA scan
   for the left sibling stops at the last child of the resolved parent, but
   the sequence continues into a concurrent split product of that parent.
   Continue the scan there over a run of newer-ticket *text* children, the
   same rule step 04 applies inside one node. Element children are left to
   §7.8, which already orders them.

## Acceptance criteria

- [x] All three minima in #1436 converge, in tree shape (node IDs) and XML.
- [x] Convergence holds whichever replica applies which change first.
- [x] No regression in the existing unit suites, in particular
      `tree_split_order_test.ts` and `tree_split_sibling_cascade_test.ts`.
- [x] `pnpm verify:fast` green.

## Out of scope

- The Go SDK and the server carry the same code and presumably diverge the
  same way; not measured, not changed here.
- The fuzz harness behind the issue is not in this repo.
