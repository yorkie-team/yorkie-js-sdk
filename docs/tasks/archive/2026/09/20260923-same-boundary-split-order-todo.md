# Concurrent splits of one boundary sit in arrival order

**Created**: 2026-09-23

Tracked as #1373. Mirror of the server-side change in yorkie-team/yorkie.

## Problem

`splitElement` inserts its product directly after the node it splits:

```ts
const clone = this.cloneElement(issueTimeTicket);
this.parent!.insertAfterInternal(clone, this as any);
```

Two replicas splitting the same node at the same boundary each apply their
own split first, so the products sit in arrival order:

```
<doc><p><span>abcde</span></p></doc>, both: splitByPath([0, 1])

XML, both:  <doc><p><span>abcde</span></p><p></p><p></p></doc>
children:   d1 = [p, split(d2), split(d1)]
            d2 = [p, split(d1), split(d2)]
```

XML and `toSortedJSON` match, so the existing concurrency tests pass over it.
What follows does not:

- a range delete over the root — what an editor sends when it replaces the
  document — leaves `<p></p>` on one replica for good;
- the empty span between two halves of a concurrently split span is a
  different node on each replica, so it shows different attributes.

Before #1358 `splitByPath` copied content instead, so this only reached
`editByPath` with a `splitLevel`. Since #1358 every paragraph split takes this
path. Measured in an editor on 0.7.23: its concurrency scenarios went from
23 passing to 2, every later one failing on the first document replace.

## Plan

- [x] Failing test without a server, packs through protobuf
      (`test/unit/document/tree_split_order_test.ts`): paragraph split, span
      split, span + paragraph in one edit and in two, at the end of the text;
      two replicas then a range delete, three replicas in different arrival
      orders; the empty node's attributes. 11 fail on main.
- [x] `orderSameBoundarySplit`: order the products by ticket, newest first
      (§7.8 in the server's design doc).
- [x] `advancePastUnknownSplitSiblings` (§7.5): stop in front of a run of
      empty unknown split siblings that ends at the current actor's own
      product.

## Review

- New test: 11 fail on main, 11 pass. Same cases, same results in Go.
- SDK suite against the patched server: 3170 passed, 11 skipped.
- End to end, patched SDK + patched server: a late joiner that receives a
  snapshot agrees with the live replicas in both arrival orders. Patched SDK
  against an unpatched server does not — the snapshot flips the receivers —
  so the two have to ship together.
- In the editor: 23 passing / 3 known / 0 failing, and all three known cases
  now converge with only an empty node left; a 6-browser table test 4/4.
