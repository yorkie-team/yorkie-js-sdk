---
created: 2026-10-08
updated: 2026-10-08
tags: [tree, crdt, convergence, cross-implementation]
---

# Which Side of a Split Boundary an Insert Lands On

## Problem

Text inserted at exactly the position where a peer concurrently splits the
paragraph lands on the left of the new boundary on one replica and on the right
on the other (yorkie-js-sdk#1436). Three operations are enough; both replicas
hold `<doc><p>ab</p></doc>`:

```ts
d1.update((r) => r.t.edit(2, 2, { type: 'text', value: 'e' })); // "aeb"
d1.update((r) => r.t.edit(2, 2, undefined, 1));                 // split "a|eb"
d2.update((r) => r.t.edit(2, 2, undefined, 1));                 // split "a|b"
// d1: <doc><p>a</p><p></p><p>eb</p></doc>
// d2: <doc><p>a</p><p>e</p><p>b</p></doc>
```

The replica that applied the insert first resolves the split against a tree
where the text is already there. The replica that applied the split first has
the right half in the product, so the insert resolves at the end of the left
piece. Each is self-consistent; the two disagree.

Two of the rules in yorkie's position-resolution pipeline pull against each
other at this boundary. §7.3 (Boundary Insert Migration) keeps a concurrent
insert at a split boundary on the *left* of it. §7.8 orders same-boundary split
products newest ticket first. Where a concurrent product begins with inserts the
splitter never saw, both cannot hold.

### Goals

- All three minima in #1436 converge, in tree shape (node IDs) and in XML,
  whichever replica applies which change first.
- No regression in the existing split-ordering suites, which encode §7.5, §7.8
  and the split-sibling cascade.

### Non-Goals

- Changing where a *range* endpoint resolves. §7.5's
  `advancePastUnknownSplitSiblings` stays the only rule that moves range
  endpoints past split products; §9.4 style targets and delete ranges are
  untouched.
- Porting the rules to the Go tree, or making them the documented contract.
  That needs a maintainer and an issue against yorkie-team/yorkie — see
  [Cross-implementation contract](#cross-implementation-contract).

## Design

Both rules live in `packages/sdk/src/document/crdt/tree.ts` and are two views of
one claim: **when the right piece of a concurrent split begins with a run of
inserts the splitter did not know, the two boundaries are not the same
boundary**, so §7.8's ticket order does not decide between them — content order
does.

### Split applied second (`orderSameBoundarySplit`)

§7.8 walks the `insNextID` chain to order same-boundary products by ticket. When
the product sitting next begins with concurrent inserts, our boundary is not
that product's start: it is *inside* the product, past that run.
`boundaryInsertRunOf` counts the run — *text* children at the start of a node
created by a change outside the editor's version vector. Text split siblings
carry their original's ticket and so end the run by being known, and the first
element child ends it: that is the same set of children
`advanceIntoSplitProducts` crosses on the other side, and the two rules have to
agree on how long the run is.

Text-only is also the only GC-stable way to measure it. Telling an element
*insert* from an element *split product* needs `insPrevID`, and that field is
not stable: `CRDTTree.purge` relinks it onto the surviving neighbour and clears
it, and `TreeEditOperation.reissueContentIDs` drops it on an undo copy. A run
measured through it would be as long as each replica's collection schedule left
it, so two replicas would place the same split differently for no reason but GC
timing.

### Insert applied second (`advanceIntoSplitProducts`)

The step 04 RGA scan for the left sibling stops at the last child of the
resolved parent, but the sequence continues into a concurrent split product of
that parent. The scan continues there over a run of newer-ticket *text*
children — the same rule step 04 applies inside one node. Element children at
that boundary are already §7.8's business; crossing them made the two rules
disagree about where the boundary went and broke eight existing tests.

"The last child of the resolved parent" is measured in live content
(`atEndOfLiveContent`), not in `allChildren`. Step 04 stops at the older ticket
of a concurrently-removed node, so the anchor it resolves is the last *live*
child whenever such a tombstone trails the run — while the replica that applied
the insert before the split had the whole run in one node and no tombstone
standing between it and the boundary. Counting that tombstone as a right
neighbour would block here the advance that replica makes.

It is applied at the `editAndRestore` call site, to a **collapsed** range only,
not inside `findNodesAndSplitText`: that method also resolves style ranges
(§9.4) and delete ranges, and a range endpoint that walked into a product would
change which parents the traversal runs between, over nodes the editor never
saw.

### Cross-implementation contract

Where a same-boundary split lands is a **replicated convergence contract**: the
server and every SDK must pick the same node for the same change. Both rules
above change that pick, and today **only this SDK applies them**.

Measured against yorkie-team/yorkie at the time of writing:

- `pkg/document/crdt/tree.go` has `orderSameBoundarySplit`, and it orders
  same-boundary products by ticket with no boundary-insert run step.
- `docs/design/concurrent-merge-split.md` there documents that ticket ordering
  as the rule, and spells out no §7.3 reading that overrides it.
- `advancePastUnknownSplitSiblings` exists there too; there is no counterpart to
  `advanceIntoSplitProducts`.

So for a document edited by both a JS replica and a Go/server replica, these
rules **move** #1436's divergence rather than remove it: before them both sides
applied ticket order and agreed (on a position both now consider wrong); after
them they can place the same split differently. A JS-only fleet converges; a
mixed fleet regresses in this scenario. That is a trade a maintainer has to make
knowingly, and it is why the rules are a merge gate rather than a finished fix —
the gate and its two open items are tracked in
[the task todo](../tasks/active/20261008-insert-at-concurrent-split-boundary-todo.md).

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| A JS replica and a Go/server replica place the same split differently, so a mixed-SDK document diverges where it used to agree | Not mitigated in this SDK — it cannot be. The rules need the same port in yorkie-team/yorkie (new issue, not #1436) and a recorded maintainer decision before they ship; this document is the record a port works from |
| An `insNextID` that did not come from `splitElement` redirects a split onto an arbitrary element | `sharesSplitFamilyParent` keeps the walk inside one split family; `InsNextWalker` stops a chain that loops back on itself |
| Splitting a tombstoned sibling makes the product born tombstoned, which a replica that applied us first never does | `orderSameBoundarySplit` refuses a removed sibling and falls back to splitting `parent`, as that replica did |
| The split-position opinfo reports a boundary in the wrong node, silently | It is measured in the node the boundary came from (`target` when the redirect carried a non-zero offset, else `parent`); handing `toIndex`/`toPath` the other node returns index 0 without throwing, so the mistake would not surface |

### Design Decisions

| Decision | Reason |
|----------|--------|
| §7.3 yields to RGA content order beyond the first node the splitter knew | RGA order of content is what the replica that applied the insert first cannot be talked out of — it never had a boundary to migrate across |
| `advanceIntoSplitProducts` crosses text children only | Element children at that boundary are §7.8's, and crossing them makes the two rules fight; text-only leaves the existing split-order suites green |
| Applied to a collapsed range at the `editAndRestore` call site | A range endpoint moving into a product would widen or shorten what the edit deletes and merges, and would change the §9.4 target set |
| Shipped behind a merge gate instead of merged with the divergence noted | The regression lands on mixed-SDK fleets, who did not ask for the JS fix; only a maintainer can accept that |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Keep §7.8's ticket order and accept #1436 | Two JS replicas diverge permanently on three operations; the issue is a real data-loss-shaped bug |
| Resolve inside `findNodesAndSplitText` for every range | Style (§9.4) and delete ranges resolve through it, and their endpoints must not follow content across a boundary |
| Gate the new rules behind a flag | A flag over CRDT placement is itself a divergence: two replicas with different flag values disagree, and the flag value is not replicated |
| Port to Go first, then JS | Reasonable and still open — it is one of the two outcomes the maintainer decision chooses between |

## Tasks

- [20261008-insert-at-concurrent-split-boundary-todo.md](../tasks/active/20261008-insert-at-concurrent-split-boundary-todo.md)
