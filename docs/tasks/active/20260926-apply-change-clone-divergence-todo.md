# Keep clone and root in step when a change fails (issue #1366)

**Created**: 2026-09-26

## Problem

`Document` runs every change against both `this.clone` and `this.root`, and
`Change.execute` does not roll back. If the root pass throws partway, the two
copies are left holding different states. `getRoot()` reads the clone, while
`toJSON`, snapshots and remote-change application read the root, so every
later local edit is computed against a document no other replica has.

#1394 closed this for `applyChange` and `executeUndoRedo`. The remaining call
site is the root pass at the end of `update()`: the updater has already
applied the whole change to the clone through the proxy.

## Plan

- [x] `update()`: wrap `change.execute(this.root, ...)` and drop the clone
  (`this.clone = undefined`) before rethrowing, the way the updater-failure,
  schema and size-limit paths already do.
- [x] `clone_reset_test.ts`: a local change whose root pass throws. Fails on
  `main`, passes here.

## Out of scope

- Recording the part of a failed change that did land (queueing a truncated
  change, advancing `changeID`, repairing history). Go's `Change.Execute`
  returns an empty result on error and `Update` records nothing, so this is a
  new contract for both SDKs and needs its own design issue.
- The checkpoint-advance question in the issue's last paragraph
  (`applyChangePack` forwards after `applyChanges`): its own issue.

## Verification

- `pnpm verify:fast`
- `pnpm sdk exec vitest run test/unit/document/clone_reset_test.ts`
