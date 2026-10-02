# Mirror yorkie#2035: client-side gaps around the tree split fix

**Created**: 2026-09-26

Issue: #1378. The issue was written against [yorkie#2031], which was closed
unmerged; the server fix that landed is [yorkie#2035]. This task is rescoped
to what matches Go `main` or is a local-only safety net.

## Items

- [x] 3. `leftAnchorID` must not anchor an empty text node at offset `-1`:
  return `sibling.id` when `value.length === 0`.
- [x] 4. `applyChange` and `executeUndoRedo` must drop the clone when a change
  fails partway, the way `Document.update` already does.

## Dropped

- 1. Forward alignment of a mid-surrogate-pair split. Go `main` splits at the
  raw offset (`TreeNode.SplitText`, `TextValue.Split`), so aligning only here
  would give JS and the server different node IDs for the same operation.
  Needs to land in Go first, with a mixed-version rollout plan.
- 2. Tombstone-insensitive boundary placement. Go `main` counts
  `Children(true)` in `emptyRunReachesActor` and keeps the `IsRemoved()` break
  in `orderSameBoundarySplit`; the JS code already matched it.
- 5. Recording a partially failed change. Go's `Change.Execute` returns an
  empty result on error and `Update` records nothing, so this is a new
  contract for both SDKs, not a mirror. Track it as a separate design issue.

## Verify

- `pnpm verify:fast`
- `test/unit/document/clone_reset_test.ts`: fails on the merge base, passes
  here.

[yorkie#2031]: https://github.com/yorkie-team/yorkie/pull/2031
[yorkie#2035]: https://github.com/yorkie-team/yorkie/pull/2035
