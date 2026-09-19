# A split reports no index growth to undo/redo reconciliation

**Created**: 2026-09-19

Mirrors yorkie-team/yorkie#1999 and its fix. Found in the Go SDK first; all
four parts reproduce here, because the two tree implementations are ports of
each other. The case was already recorded here as a skipped test.

## Problem

Undoing a split is a boundary deletion addressed by integer indices, and
`applyChanges` reconciles those indices against every remote edit that lands
while the reverse waits on the history stack. A split reports no inserted
content — it opens boundaries instead of adding nodes — and no removed range,
so it reached `reconcileOperation` as a zero-width, zero-growth edit and every
stacked entry to the right of it stayed put.

```
<doc><p><span>abcde</span></p></doc>

d1: editByPath([0,0,1], [0,0,1], undefined, 1)   // split after `a`
d2: editByPath([0,0,4], [0,0,4], undefined, 1)   // split before `e`
settled: <doc><p><span>a</span><span>bcd</span><span>e</span></p></doc>

d2.history.undo()
want: <doc><p><span>a</span><span>bcde</span></p></doc>
got:  <doc><p><span>a</span><span>b</span><span>e</span></p></doc>
```

d1's split opened two tokens to the left of the range d2's reverse addresses,
so that range should have shifted by two. Left where it was, it names `c` and
`d` in the settled tree and deletes them. Both replicas converge on the loss,
so nothing surfaces it to either application.

Three more defects sit underneath it:

- `splitElement` adds the new element's padded size to its ancestors'
  `visibleSize` unconditionally, so a piece born tombstoned lengthens live
  ancestors that can never drain it again — that assignment never passes
  through removal, which holds the same invariant from the other side. Latent
  until something reads the cached size for correctness, which reporting the
  growth makes it.
- §7.4 Empty Sibling Re-Parenting moves the split with `detachChild` plus
  `insertBefore`, neither of which is tombstone-aware. The inflation above was
  cancelling the source side of that by accident.
- `toSplitReverseOperation` sizes its own reverse as `2 * splitLevel`, which is
  only what the split asked for. The loop stops when it runs out of ancestors,
  so on a tree with less depth the reverse covers tokens the split never
  opened:

  ```
  <doc><p>ABCD</p><p>0123456789</p></doc>
  editByPath([0,2], [0,2], undefined, 3)   // only one level is splittable
    -> <doc><p>AB</p><p>CD</p><p>0123456789</p></doc>   (correct)
  undo()
    want: <doc><p>ABCD</p><p>0123456789</p></doc>
    got:  <doc><p>AB0123456789</p></doc>                 `CD` gone
  ```

  No concurrency involved — a single local edit.

## Tasks

- [x] Report the growth: `edit` returns the change in `getSize()` across the
      split phase, and `getContentSize` sums it with the inserted content.
      Measured off the tree rather than computed as `2 * splitLevel`, so a
      split with no visible effect reports the zero growth it produced.
- [x] Guard `splitElement`'s ancestor update on the clone not being a
      tombstone.
- [x] Move the §7.4 split through a new `moveChildBefore`, which carries the
      semantics `moveChild` already documents. `moveChild` and it now share one
      detach/attach pair: restating the tombstone rule per call site is how the
      two size dimensions drifted apart in the first place.
- [x] Size the split's own reverse from the same measurement. A split that
      opened nothing now produces no reverse at all, rather than a range the
      `reverseToIdx > tree.getSize()` guard only sometimes caught.
- [x] Restore `KNOWN: undo one of two concurrent splits of the same node` in
      `test/integration/history_tree_concurrent_test.ts`, and cover the
      over-deep split in `history_tree_split_test.ts`.

## Non-Goals

`detachChild` and `insertBefore` now have no callers left. Both are kept: the
Go index tree still exposes them, and the two are maintained as ports of each
other.

## See Also

- `docs/tasks/active/20260919-tree-size-ledger-todo.md` — the size-side mirror,
  from the same review
