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
- Round 2 (design fit, blast radius): blocked on a regression. Under an
  explicit client key, a pre-attach document re-issued after a reload took
  the tickets the first session's first edits carry (`1:A:1`), and the server
  dropped that session's element; `main` kept both. Reproduced in a unit
  probe and against the server.
  - Fixed: only a generated key re-issues; claims went back to per-Client as
    in Go. The user re-decided this: the earlier "same as Go, document it"
    choice rested on my claim that the collision was narrower than before,
    which was wrong for this case.
  - Fixed: `SetActorOptions` is `@internal`; the doc states the decoder
    invariant and why pushes satisfy it; the failed-attach section covers the
    session lock and store paths.
  - Not done: moving `reissueTextValue` before `fromOperation` (style only),
    and a shared `wire` helper (the integration test has none to share).

## Lesson

- When the user picks between options I framed, the framing is part of the
  decision. "Narrower than before" was a claim about collision classes I had
  not checked against the actor's own post-attach tickets. Reproduce a
  claimed trade-off before offering it as one.
