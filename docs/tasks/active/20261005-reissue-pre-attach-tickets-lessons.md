# Lessons: Re-issue pre-attach tickets

**Created**: 2026-10-05

## Porting notes

- JS has no `InternalDocument` split, no `OpSource.Replay`, and no
  `absorbedRemote`. `applyChanges` also replays local changes
  (`applySnapshot`, `restoreAppendedChanges`), so the absorbed flag goes on
  the remote paths, not on `applyChanges`.
- The JS actor is the `StableActorID`, while Go attaches under the
  per-session client id. The Go design's "same key, new process" gap is the
  normal case in JS.

## Tooling

- `pnpm lint` through the RTK hook printed a summary and did not apply the
  fixes; `lint:check` still failed. Run `rtk proxy pnpm lint` (and
  `rtk proxy pnpm verify:fast`) to get the real command and exit code.
- `verify:fast` runs `tsc` over the tests; vitest does not. A test that
  passes can still break the build (`Document<Indexable>` roots, the old
  two-argument `Counter`).

## Design

- `converter` is re-exported from the package entry, so helpers the re-issue
  needs are named module exports rather than new members of `converter`.
- Without a test that can reach it, Go's map re-keying would be dead code
  here, and it renames attribute keys that read like an actor. Dropped.
