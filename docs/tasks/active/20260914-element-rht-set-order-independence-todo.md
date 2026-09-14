# Decoding a snapshot drops a key depending on member order

**Created**: 2026-09-14

Server-side counterpart: the matching `yorkie` branch
(`docs/tasks/active/20260914-nondeterministic-snapshot-member-order-todo.md`).
The server emitted an object's members in a randomized order; this SDK
decoded that order into different objects. Both halves are needed — the
ordering change alone would only freeze which of the two answers you get.

## Problem

`ElementRHT.set` anchored its two decisions on different tickets:

```ts
const node = this.nodeMapByKey.get(key);
if (!!node && !node.isRemoved() && node.remove(executedAt)) {  // gates on createdAt
  removed = node.getValue();
}
…
if (!node || executedAt.after(node.getValue().getPositionedAt())) {  // gates on positionedAt
```

`CRDTElement.remove` gates on the element's raw `createdAt`. So for an
occupant with `createdAt < executedAt < positionedAt` the two disagree: the
eviction fires and tombstones the occupant, and then the winner check decides
the incoming value must *not* replace it. The occupant stays linked under the
key but is now removed, the incoming value is never registered as removed
either, and `get(key)` reports the key as **absent** although no operation
ever removed it.

`createdAt < positionedAt` is exactly what an undo/redo restore leaves: the
reverse of a `Set` re-places the original element — original `createdAt` —
under a fresh `executedAt`. Before undo/redo existed, `movedAt` always
equalled `createdAt` and the window could not be reached.

`converter.fromObject` replays every decoded member through
`rht.set(key, value, value.getPositionedAt())` in wire order, so the defect
surfaces on the snapshot restore path: whether the key survives depends on
whether the tombstone or the live member happens to come first.

Concretely, a document that is `{"frame":"v1"}` after `set; set; undo`
decodes from its own snapshot as `{}` in one of the two member orders.

Observed in production as a shape that rendered on some page loads and not
others: 12 attaches to one unchanged document, 3 clean.

## Fix

Move the eviction inside the winner branch, so both decisions read the
occupant's `positionedAt`. This mirrors `ElementRHT.SetWithExecutedAt` in
`yorkie/pkg/document/crdt/element_rht.go`, which already anchors both on
`PositionedAt` and is order-independent for every permutation
(`TestSnapshotDecodeIsOrderIndependent`).

## Tasks

- [x] `test/unit/document/crdt/element_rht_order_test.ts`, two layers:
  - `ElementRHT.set` directly — both arrival orders of a live member and a
    tombstone must resolve the key the same way, and neither may tombstone
    the member that goes on to win.
  - Through the decoder — build a real `Document`, `set; set; undo`
    (and a `redo` variant), encode with `converter.objectToBytes`, enumerate
    **every** permutation of the protobuf members, and assert each decodes to
    the same object. This is the production path; it failed with `{}`.
- [x] Anchor the eviction on `positionedAt` in `ElementRHT.set`.
- [x] Unit suite: 44 files, 416 passed.
- [x] `eslint --max-warnings=0` on the changed files.
- [x] Integration suite against a local `yorkie:latest`: 34 of 35 files
      pass, 2578 tests. The one failure is `webhook_test.ts` (9 tests), which
      binds a local HTTP server the Yorkie container has to call back into;
      it fails identically on `origin/main` in the same environment, so it is
      the ad-hoc `docker run` missing the compose file's
      `extra_hosts: host.docker.internal`, not this change.

## Verified end to end

Against a real `yorkieteam/yorkie:latest` server, with the project created
at `--snapshot-threshold 1 --snapshot-interval 1` so the decode path is
actually exercised (with a handful of changes the server sends the change
history instead, and applying operations in causal order never reaches it).
A writer client does `set; set; undo` and syncs; then 12 independent clients
attach and read the key back.

| server | SDK | reads that saw the key |
| --- | --- | --- |
| `yorkie:latest` | 0.7.21 as published | 6/12, 11/12, 0/12 |
| `yorkie:latest` | this branch | 12/12 x5 |
| the matching `yorkie` branch | 0.7.21 as published | 12/12 x3 |

Row 1 is the reported symptom — three fresh documents, identical writes, the
key present on some reads and absent on others. Row 2 is this fix standing
alone against an unchanged server, which is what matters: a deployed client
cannot choose its server's version.

## Notes

- The `removed` element this method returns feeds
  `RegisterRemovedElementPair` for GC. It is now returned only when the
  incoming value actually wins, which is the case where the occupant really
  was superseded. Previously a losing write could report an eviction that the
  object did not actually perform.
- `docs/tasks/active/20260816-remote-redo-replica-divergence-todo.md` (in the
  `yorkie` repo) records the redo/GC half of this family. Same precondition —
  a key holding a tombstone beside an undo-restored live member — different
  reach, and not addressed here.
