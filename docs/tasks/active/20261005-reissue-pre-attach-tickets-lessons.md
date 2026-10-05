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

## Self review

Reviewer: `superpowers:requesting-code-review` (a general-purpose subagent
over `origin/main...HEAD`), not the CI lens panel.

- Round 1 (correctness, tests): blocked on a pre-attach Undo of a split Text
  whose content changed at attach (`xxef` -> `xef`), and on the design doc
  saying stale positions behave as under any `setActor`.
  - Fixed. The reviewer named the cause as the Text encoding having no split
    links in the protocol; it has `insPrevId` and both decoders read it. The
    JS encoder `toTextNodes` never wrote it, while Go's does. Writing it fixes
    the re-issue, every snapshot and every Text nested in a pushed value. A
    content-equality guard was tried first and dropped once the cause was
    found: it hid the loss instead of fixing it.
  - Added a seeded 300-history test; it catches the encoder bug at seed 152.
  - Fixed: the re-issue ran before `documentPollInterval` validation and
    took the claim on a rejected attach. Moved after validation, with a test.
  - Doc: positions taken before the attach throw after a re-issue; a lost
    response retried elsewhere duplicates content; `attach` throws (not
    rejects) on a re-issue failure, like the other pre-RPC checks.
  - Disputed: claims "not namespaced by apiKey or project". The stable actor
    is derived from (project, client key), so an actor already names one
    project. Only the session-id fallback against an old server lacks it,
    and a false hit there only falls back to the old behavior.
