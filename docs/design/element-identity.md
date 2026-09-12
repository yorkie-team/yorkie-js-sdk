---
created: 2026-09-12
updated: 2026-09-12
tags: [crdt, gc, undo-redo, identity]
---

# One Live Element per createdAt

## Problem

`CRDTRoot` indexes the whole document by creation ticket:

- `elementPairMapByCreatedAt` — how every operation finds its target, and how
  garbage collection finds an element's parent so it can purge it.
- `gcElementSetByCreatedAt` — the tombstones waiting to be collected.
- `sizeInGC` — which side of `docSize` an element's size is charged to.

All three assume one live element per `createdAt`, and nothing enforces it.
`registerElement` is an unconditional `Map.set`, so a second element under the
same id silently replaces the first.

Undo produces exactly that. The reverse of an array removal is
`AddOperation(value.deepcopy())`, and `deepcopy` keeps the `createdAt` of every
descendant. The removed original is still in the tree as a tombstone until the
minimum synced version vector passes over it, so executing the reverse puts a
second live node under each of those ids.

From there, `garbageCollect` eventually meets a member of the gc set it cannot
resolve, dereferences it unguarded, and throws — inside `applyChangePack`,
which is where every sync applies the server's change pack. The same pass
throws again on the next sync, so the client never syncs that document again
([#1340]). The same state is what surfaced as `'ownKeys' on proxy: trap
returned duplicate entries`.

Two other paths reach the same unresolvable state without any undo:

- `ArraySetOperation` registered its value with no parent, so the pair resolves
  and `purge` has nothing to call.
- `SetOperation` cleared a colliding registration only when the source was
  `OpSource.UndoRedo`, so every replica except the one that performed the undo
  kept a gc set member that resolves to the restored — live — element and can
  therefore never be collected.

### Goals

- A client that meets a document in this state keeps syncing.
- Close the paths that create it without going through undo.
- Do not change the wire format, and do not change what undo restores.

### Non-Goals

- **The root cause.** Undo of a removal is still expressed as re-insertion of a
  copy, so two live elements can still end up under one `createdAt`. Fixing
  that is [Identity-Preserving Revive](#see-also), which needs a replicated
  liveness register and a restore mode on the wire — protobuf plus a
  coordinated release across the Go and JS SDKs.
- Repairing documents already written with duplicated ids. The guard keeps such
  a document usable; it does not clean it. Server-side compaction is the
  supported remediation.

## Design

### Tolerate a member that cannot be resolved

`garbageCollect` and `getGarbageElementSetSize` guard the lookup the way
`getGCElementPairs` beside them already did, and `garbageCollect` also checks
that the pair has a parent to purge through.

The member is **skipped, not dropped**. The element is still in the document
and its size is still charged to `docSize.gc`, which only `deregisterElement`
releases. Forgetting the member would leave that charge counted against the
size limit with nothing left reporting it as garbage — `getGarbageLen` would
say zero while `docSize.gc` said otherwise.

### Register what an array assignment installs, and what it displaces

`ArraySetOperation.execute` now passes the parent, and registers the element
the assignment displaced. The `TODO` it carried claimed the two could not be
told apart because they share a `createdAt`; they do not, and that stopped
being true when array set became insert-then-remove rather than an in-place
swap.

`json/array.ts` performs the same assignment against the clone the updater is
given, and dropped the displaced element too, so the clone's accounting drifted
from the document the operation is replayed on. `json/object.ts` already
registered the value it replaces.

### Retire a reused identity wherever the operation is applied — and only that

Whether a `Set` is restoring an element under an already-registered `createdAt`
is a property of the tree, not of who is applying the operation. The undo is
generated on one replica and executed on all of them — peers apply it with
`OpSource.Remote`, and the Go server replays it to build a snapshot — so the
retirement is no longer gated on the source.

What it retires is one entry. `deregisterElement` was the wrong instrument: it
walks the tombstone's descendants, and the tombstone's descendant set can be a
strict superset of the restored copy's, because a peer may have added a member
into the container after the undoing replica took the copy its reverse carries.
Those extra members lose their `elementPairMapByCreatedAt` entries with nothing
to put them back, and the next change addressed at one of them throws `fail to
find` inside `applyChangePack` — the same permanent desync as [#1340], reached
on a replica that never performed an undo.

`unregisterRemovedElementPair` drops the one `gcElementSetByCreatedAt` member
that collection would have resolved onto live data, releases the charge the
orphaned subtree holds, and leaves the identity index alone.

### Delete index entries by identity, not by key

The general statement of the same defect. `deregisterElement` deleted
`elementPairMapByCreatedAt[createdAt]` outright, and an undone array assignment
restores descendants under their original `createdAt`s — only the top level is
re-ticketed — so collecting the tombstone deleted entries that answer for live
elements. The deletes now fire only when the slot still holds the element being
retired.

`sizeInGC` records which element a charge is held for, so a size can no longer
be taken out of `docSize.live` that live was not holding. `ElementRHT.purge` and
`RGATreeList.purge` get the matching guard; neither is reachable under this
ordering today, and they are what keeps the identity work from having to be
rediscovered when revive lands.

### Risks and Mitigation

| Risk                                                        | Mitigation                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The guard hides a future occurrence instead of surfacing it | The invariant is pinned directly by `test/unit/document/gc_containment_test.ts`, which fails on duplication rather than on the crash it eventually causes |
| Registering the displaced element changes collection counts | Measured: content is unchanged at every step, and the counts an existing test asserted were the leak rather than a property                               |
| The ungated retirement fires where it did not before | An ordinary set carries a freshly issued `createdAt`, so the worklist lookup misses. It hits under duplicate application, which the checkpoint does not rule out (see below) — and there retiring one entry is the safe direction, unlike the subtree deregister this replaced |
| An identity guard silently skips a delete that should have happened | The element that owns the slot clears it when its own turn comes, so nothing is stranded that was reachable. What is deliberately retained is the abandoned tombstone's registration — memory, not `docSize`, and it is what keeps the change log replayable |

The checkpoint prevents a change being *stored* twice, not applied twice.
`pushPack` skips a change whose `clientSeq` the checkpoint already covers, but
it filters the list it stores — `reqPack.Changes` is left intact, and
`pullSnapshot` applies that raw list on a document built for a `serverSeq` that
already includes them. A pack retried after a lost response therefore replays
its own changes, and `applyChanges` has no version-vector deduplication. That is
a defect in its own right, filed in the Go repository as
`20260911-duplicate-change-application-not-idempotent-todo.md`; it is not
introduced or worsened here.

### Design Decisions

| Decision                                     | Reason                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Skip rather than drop an unresolvable member | Dropping releases nothing and leaves the charge unreported                                     |
| Fix the local path as well as the operation  | The clone is what the updater sees and what the size limit is checked against                  |
| Ship with the Go change, not before it       | Both SDKs gate the same retirement; one-sided, the SDKs disagree about what a peer's undo does |
| Retire one worklist entry, not the subtree   | The subtree is not the unit that went stale. Deregistering it evicts members the restored copy never carried, and a change addressed at one of them then throws — on the server's replay too, which makes the stored change log unreplayable |
| Keep the abandoned tombstone registered      | Its registration is what the peer's later change resolves through. Retaining it costs memory and nothing in `docSize`, which `release` settles at retirement time |

## Alternatives Considered

| Alternative                                                       | Why not                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep re-identification: give the whole restored subtree fresh ids | Prototyped and measured. It removes the duplication, but a restored element becomes a _new_ element, so every operation stacked against the old one stops applying: reconciling the descendants makes the two ends of one operation name different objects and it throws, and not reconciling them makes the undo a silent no-op. No arrangement satisfies both |
| Guard `garbageCollect` only, as the issue suggested               | Stops the crash and leaves everything else: the duplicate state, the array-set routes, and the peer-side leak                                                                                                                                                                                                                                                   |
| Assert the invariant in `registerElement` and throw               | Turns a silent corruption into a crash for documents already in the wild — the opposite of what the guard is for                                                                                                                                                                                                                                                |

## See Also

- [One Node per CRDTTreeNodeID](tree-node-id-identity.md) — the same invariant
  for tree nodes, and the restore-mode precedent this SDK already carries
- yorkie#1978 — the Go counterpart, where the same `Set` gate loses the member
  outright rather than leaking it

[#1340]: https://github.com/yorkie-team/yorkie-js-sdk/issues/1340
