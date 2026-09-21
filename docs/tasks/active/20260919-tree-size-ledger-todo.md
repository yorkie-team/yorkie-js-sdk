# Tree edits charge live for sizes it was not holding

**Created**: 2026-09-19

Mirrors yorkie-team/yorkie#1998 and its fix. Found in the Go SDK first; every
part of it reproduces here, because the two tree implementations are ports of
each other.

## Problem

Two places move `docSize.live` by an amount it never held, both in the tree,
and both reachable from what a rich-text editor does continuously.

### The element a split creates

`CRDTTree.edit`'s split phase discards the tuple `split` returns:

```ts
parent.split(this, left !== parent ? parent.findOffset(left, true) + 1 : 0, ...);
```

`splitElement` computes that diff correctly — one `TimeTicketSize` for the
element it mints, plus its attributes — and every other `split` caller
propagates it. The split phase was the only site dropping it, so `live` never
carried the elements a split creates.

A split and the merge that undoes it then did not cancel out. The merge
tombstones the split-born element and books its size out of `live`, which is
right for a node `live` was holding and which it never was. Seeding
`<doc><p><span>abcdefghij</span></p></doc>` and cycling
`editByPath([0,0,1], [0,0,1], undefined, 1)` with
`editByPath([0,0,1], [0,1,0])`, `live.meta` walks down one ticket per cycle
without bound, reaching `-2208` after 100 — and that is the number the
document size limit reads.

`findNodesAndSplitText` has the same shape latent: it assigns its own split's
diff rather than accumulating it. Sound today, since the variable is provably
empty at that point, but it is the same trap.

### Attribute tombstones

`RHT.remove` mints a tombstone even for a key the element never carried —
deliberately, so a remove that arrives before its set still wins — and
supersedes an existing tombstone when the same key is removed twice. Neither
replaces a live value, yet the pair built for it debited `live`. On
`<doc><p>abc</p></doc>` with `live` starting at `{data: 6, meta: 144}`:

| edit | live after |
|---|---|
| `removeStyleByPath` of a key never set | `{data: -12, meta: 120}` |
| `removeStyleByPath` of the same key twice | `{data: -14, meta: 120}` |

A negative `live` means the document size limit has stopped applying.

## Tasks

- [x] Accumulate the split phase's diff into `edit`'s, and make
      `findNodesAndSplitText` accumulate rather than assign.
- [x] Route attribute tombstones with no live predecessor through
      `gcOnlySize`, which `getGCPairs` already uses for exactly this reason on
      the snapshot-rebuild path. The gc ledger was already right; only the
      `live` side moves.
- [x] Un-skip `KNOWN: split and merge cycles drive the live size negative`,
      correcting its expectation: the steady state is `{data: 20, meta: 192}`,
      not the pre-split `{data: 20, meta: 168}`. The merge rejoins the element
      but leaves the text as two nodes, so one extra live text node persists —
      live, not garbage, so gc never reclaims it. That charge is permanent and
      correct: one ticket per text node ever split, not a per-cycle drift.

## Non-Goals

Toggling a style key was already correct here and is only pinned, not changed:
the restyle credits `live` for the node it revives, which cancels the debit.
The Go SDK drifted on that case and needed the repair; this one did not.

Two differences from Go surfaced while measuring, both pre-existing and
neither this task's to settle:

- A superseded attribute tombstone adds its size to `gc` but is not the node
  left registered for collection, so a toggle run between GC passes strands
  size that no later pass reclaims: after 200 cycles `getGarbageLen()` is 0
  while `gc` reports `{data: 4000, meta: 4800}` on a document whose content is
  6 bytes. It does not reach `maxSizeLimit`, which reads the clone's ledger
  rather than the root's. Tracked as yorkie-team/yorkie-js-sdk#1361.
- Attribute values are stored JSON-encoded here and raw in Go, so the same
  document styled from the two SDKs reports different sizes for the same
  attribute (`bold="true"` costs 20 bytes of data here, 16 there). That
  matters because the size limit is enforced client-side in both. Tracked as
  yorkie-team/yorkie#2003.

## See Also

- `docs/tasks/active/20260919-split-index-ledger-todo.md` — the index-side
  mirror, from the same review
