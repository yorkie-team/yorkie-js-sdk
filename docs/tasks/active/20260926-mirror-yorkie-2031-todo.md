# Mirror yorkie#2031: mid-surrogate-pair splits and four related gaps

**Created**: 2026-09-26

Issue: #1378. The root fix of [yorkie#2031] (rune → UTF-16 lengths) does not
apply here — JS strings are already UTF-16 — but five places answer the same
question differently from the server after that PR.

## Items

- [ ] 1. Move a mid-surrogate-pair split forward, at the three split sites:
  - `util/index_tree.ts` `splitText`
  - `crdt/rga_tree_split.ts` `splitNode` (align before deriving the node ID)
  - `crdt/text.ts` `CRDTTextValue` (expose the aligned offset to `splitNode`)
- [ ] 2. Concurrent-boundary placement must not read `isRemoved`, which is
  mutable and delivery-order dependent: `emptyRunReachesActor` keeps counting
  `allChildren`, and `orderSameBoundarySplit` drops its tombstone fallback, so
  the two paths resolve one boundary the same way on every replica
  (`crdt/tree.ts`).
- [ ] 3. `leftAnchorID` must not anchor an empty text node at offset `-1`:
  return `sibling.id` when `value.length === 0`.
- [ ] 4. `applyChange` and `executeUndoRedo` must drop the clone when a change
  fails partway, the way `Document.update` already does.
- [ ] 5. A failed local change must still be recorded: `Change.execute` hands
  back the operations that ran, and `Document.update` pushes a change carrying
  that prefix and advances `changeID` before rethrowing.

## Notes

- Alignment is forward (to the end of the pair), not back: an edit resolves the
  same anchor twice and only the forward boundary leaves the second resolution
  on the boundary the first one created.
- No architecture change, so no `docs/design/` update: the five items change
  how existing split/failure paths behave, not the design they implement.

## Verify

- `pnpm verify:fast`
- `pnpm sdk exec vitest run test/unit/document/surrogate_split_test.ts`
- Integration suites are not run here (no server in the agent run).

[yorkie#2031]: https://github.com/yorkie-team/yorkie/pull/2031
