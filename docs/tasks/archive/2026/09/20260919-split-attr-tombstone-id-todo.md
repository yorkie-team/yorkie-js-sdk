# A split copies an attribute tombstone under the same id

**Created**: 2026-09-19

Mirrored from yorkie-team/yorkie#2002. The Go change is yorkie#2005.

This task covers the **Tree** half only, matching yorkie#2005 after its second
review round narrowed the same way. The Text half is deferred; see Non-Goals.

## Problem

Splitting a node that carries a **removed attribute** leaves the live document
and a root rebuilt from it disagreeing about garbage, and neither can collect
the copy.

Three defects, the first two shared with the Go SDK and the third this SDK's
alone:

1. **The copy is never registered.** `splitElement` deep-copies the node's
   `RHT` into the new element — tombstones included — and no GC pair is
   created for the copies. `CRDTTextValue`'s split does the same.
2. **The copy shares the original's id.** `RHT.deepcopy` preserves `updatedAt`
   and `key`, which are exactly what `RHTNode.toIDString` is made of. A root
   rebuilt from the content registers both and `registerGCPair` reads the
   second as an un-registration, so the two cancel.
3. **A text split orphans the left value's registrations.**
   `RGATreeSplit.splitValue` replaced `this.value` with a *new*
   `CRDTTextValue` (`value.substring(0, offset)`) rather than shortening the
   existing one. Any pair registered before the split named the object that
   was just discarded, so purging it deleted a tombstone from an orphan and
   left the real one in the list. Go splits in place and does not have this.

Copying the tombstone is not itself the bug: the copy has to reject the same
stale styles the original does, or two replicas that apply the split and a
concurrent style in different orders end with different attributes on the two
halves and never reconverge.

## Measurement

`<doc><p><span>abcdefghij</span></p></doc>`, style `color: red` then remove it:

| state | live gc / count | rebuilt gc / count |
|---|---|---|
| before the split | `{20 24}` / 1 | `{20 24}` / 1 |
| after `editByPath([0,0,1], [0,0,1], undefined, 1)` | `{20 24}` / 1 | `{20 24}` / 0 |
| after `garbageCollect` | purges 1 | 1 tombstone left |

Text, reached by undoing a `setStyle` that introduced the key (the reverse
operation's `attributesToRemove` is the only route that tombstones a text
attribute today), then `edit(5, 5, 'X')`:

| state | live gc / count | rebuilt gc / count |
|---|---|---|
| before the split | `{8 24}` / 1 | `{8 24}` / 1 |
| after the split | `{8 24}` / 1 | `{8 24}` / 0 |
| after `garbageCollect` | purges 1 | 1 tombstone left |

Measured on `main` at f31692a46. The `data` figures are larger than Go's for
the same attribute because this SDK sizes attribute values JSON-encoded —
yorkie#2003, unrelated.

## Tasks

- [x] Key `gcPairMap` on (parent, child) rather than the child's `toIDString`
      alone. A `WeakMap<GCParent, number>` on the root numbers the parents it
      has seen; no GC parent carries an identifier of its own, and a key never
      has to mean anything outside the root that made it.
- [x] Register the tombstones an element split copies, from
      `CRDTTreeNode.split`, through the tree's pending-pair buffer. The pairs
      carry `gcOnlySize`, the same routing `getGCPairs` already uses for the
      tombstones a snapshot rebuild finds — `getDataSize` skips removed
      attributes, so they were never in `docSize.live`.
- [x] Register the tombstones a text split copies. Was **deferred behind
      yorkie#2007**, with the Go side. Registering them puts a second claim on
      bytes the owning node's `getDataSize` already counts, and collection
      subtracts the node's size read at collection time — so purging the
      attribute first leaves the difference stranded in `docSize.gc` with
      `getGarbageLen()` at zero. `Map` iterates in insertion order and the
      attribute is always registered first, so unlike Go this is not a coin
      flip: it is every time. Measured `{data:0,meta:0}` on `main` against
      `{data:8,meta:24}` with the registration.

      Two ways of reconciling the ledger were tried in Go and both failed on
      opposite cases; the root cause is `CRDTTextValue.getDataSize` counting
      removed attributes while `CRDTTreeNode.getDataSize` does not.

      Landed in #1365 together with the fix for the blocker itself:
      `CRDTTextValue.getDataSize` now skips removed attributes
      (`packages/sdk/src/document/crdt/text.ts`), and `splitNode` pushes a
      `pendingGCPairs` entry per copied tombstone with `gcOnlySize`
      (`packages/sdk/src/document/crdt/rga_tree_split.ts`).
- [x] Make `splitValue` shorten the left value in place instead of replacing
      it, so registrations that name it stay valid. Was **deferred with the
      Text half** — it repairs a real, JS-only, pre-existing defect (a split
      orphans every GC pair registered against the left value, so the
      tombstone `removeStyle` registered can never be purged), but it is
      purely a text fix and belonged with the rest of them.

      Landed in #1365: `splitValue` now truncates the left value in place
      (`packages/sdk/src/document/crdt/rga_tree_split.ts`), with `truncate`
      added to the value interface and implemented on `CRDTTextValue`.
- [x] Tests in `packages/sdk/test/unit/document/gc_attr_split_test.ts`: the
      tree case, a split of a split, a later `styleByPath` that revives the
      key on both halves, and a two-replica exchange. All four fail on
      `main`.

## Non-Goals

**The Text half.** `CRDTTextValue`'s split copies attribute tombstones exactly
as `splitElement` does and they collide the same way, so the defect is real
here too. Registering them is not a repair on its own: it lands on a ledger
that already double-counts those bytes. Deferred with yorkie#2007, and with
the `splitValue` identity fix, which is text-only.

**The text attribute ledger.** `CRDTTextValue.getDataSize` counts removed
attributes and `CRDTTreeNode.getDataSize` does not, so a text attribute
tombstone is charged to `docSize.live` and to `docSize.gc` at the same time,
and purging it subtracts only from gc — stranding its size in live. Both are
on `main` and neither is caused by this change. This is why the text
registration uses `gcOnlySize` despite the copy having been charged to live:
the original it was copied from is carried in live too, so charging both the
same way is what keeps the live and rebuilt documents equal. Tracked as
yorkie#2007; the same asymmetry exists in Go.

**The snapshot converter.** `toTextNodes` does not carry `isRemoved` for text
node attributes, so a tombstoned text attribute does not survive a snapshot at
all — it comes back as a live attribute. Present in both SDKs, and worse than
an accounting bug: a client that joins from a snapshot sees formatting a
client that replayed the changes does not. Tracked as yorkie#2006. It is why the
tests here rebuild in memory (`new CRDTRoot(root.deepcopy())`) rather than
through the converter.

## See Also

- `docs/tasks/active/20260919-tree-size-ledger-todo.md` — the size-ledger
  mirror where this was first recorded as out of scope
