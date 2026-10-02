# A further split after concurrent same-boundary splits lands on different sides

**Created**: 2026-10-02

Tracked as #1433. Follow-up to #1375 (#1373), which ordered concurrent
splits of one boundary by ticket. The server-side `orderSameBoundarySplit`
in yorkie-team/yorkie has the same walk and needs the same change; a
snapshot built by an unpatched server would otherwise flip a patched client
(see the lessons of `20260923-same-boundary-split-order`).

## Problem

```ts
// both hold <doc><p>ab</p></doc>; actor 1 < actor 2
d1.update((r) => r.t.edit(2, 2, undefined, 1)); // split "a|b"
d2.update((r) => r.t.edit(2, 2, undefined, 1)); // split "a|b", concurrently
d2.update((r) => r.t.edit(5, 5, undefined, 1)); // then split at the end of its "b"
// exchange
d1: <doc><p>a</p><p></p><p>b</p><p></p></doc>
d2: <doc><p>a</p><p>b</p><p></p><p></p></doc>
```

`orderSameBoundarySplit` (§7.8) resolves a split at the end of a node by
walking the insNextID chain over unknown, newer split siblings and splitting
the last of them at offset 0, so that the product takes the right half and
the products sit newest-first. On d2 the chain is `P → p3[b] → p4[]`: p3 is
d2's same-boundary product holding the right half, p4 is d2's follow-up
split *of p3 at the end of "b"*. The walk went on to p4 and split it, so
d1's product landed after p4. On d1 the follow-up split resolves by position
(its left sibling is "b", which lives in d1's product there), so p4 lands
after d1's product. Each side is self-consistent; they disagree.

## Plan

- [x] Failing tests without a server, packs through protobuf, in
      `test/unit/document/tree_split_order_test.ts`: the three scripts from
      the issue, the follow-up split at offset 0, four delta-debugged minima
      of a split-only fuzz over `<p>abcdef</p>`, and a third replica in both
      arrival orders.
- [x] End the §7.8 walk at the first sibling that holds a child the
      editor's version vector knows (`holdsKnownChild`). The same-boundary
      products form a run of empty nodes ending at the one holding the right
      half (#1375 puts every newer product in front of it); anything after
      that node in the chain was split off *it* at a later boundary, which
      the other replica resolves by position after the right half. A known
      child was in the parent when the concurrent split moved it, so it marks
      the right half; an unknown one may have been typed into an empty
      product afterwards, and a split after it is still a same-boundary
      split. Tombstones count, as `splitElement` partitions `allChildren`.

## Verification

- [x] New cases: 6 of the 12 two-replica cases and the three-replica case
      fail on `main`, all pass here; the 20 existing cases in the file keep
      their results (4 `KNOWN` skips untouched). Three of the passing ones
      pin the typed-into-the-product shape review round 1 found.
- [x] `pnpm sdk test:unit`: 722 pass; the only failures are the offline
      persistence lock tests (`offline_persist_sync_test.ts`,
      `persist_disabled_test.ts`), all with "already open in another tab
      under offline persistence" (`navigator.locks` under Node 24). They fail
      the same way on unmodified `main` in this checkout.
- [x] `pnpm verify:fast`: every gate green except the `sdk test:unit` step,
      which fails only in that pre-existing file; the prosemirror, react,
      devtools and schema suites run separately pass (266 / 54 / 20 / 40).
- [ ] `pnpm sdk test` against a server carrying the Go mirror.

## Measured

Two-replica fuzz, 24 random steps, changes delivered one at a time in random
interleavings, trees compared by node ID (scratch scripts, not in the suite):

| Mix | main | this branch |
|---|---|---|
| paragraph splits only, `<p>abcdef</p>`, 300 runs | 74 diverge | 0 |
| inserts + splits, `<p>ab</p>`, 500 runs | 69 diverge | 42 |
| inserts only, 500 runs | 0 | 0 |

## Out of scope

- What remains in the mixed fuzz is a different family: text inserted at
  the very position of a concurrent split lands on the left of the boundary
  on one replica and on the right on the other. Three-operation minima:
  `d2.ins(2,'r'); d1.ins(2,'u'); d2.split(2)`,
  `d1.ins(1,'s'); d2.split(1); d1.split(1)`,
  `d1.ins(2,'e'); d1.split(2); d2.split(2)` over `<p>ab</p>`. #1375 listed
  it as not covered; it has no issue of its own yet.
- yorkie-team/yorkie#2077 (the `KNOWN` skips in the same file) and #1408:
  different mechanisms, unchanged by this fix.
