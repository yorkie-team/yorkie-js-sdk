# Move the agent harness onto the shared copy and a repository config

**Created**: 2026-11-14

The agent harness (`scripts/agent/**` and `.github/workflows/agent-*.yml`)
was vendored from yorkie at `33810d95` and adapted by hand: class rules, the
coverage note, CI-defining paths, lens scopes, prompts and the pnpm setup were
rewritten in place, and a sync meant re-applying each by hand. yorkie has
since made the harness repository-agnostic (yorkie#2352, yorkie#2353):
everything a repository owns lives in `.github/agent-harness/` and one
composite action.

This task replaces the adapted copy with the shared one, byte for byte, and
expresses this repository's values as configuration.

Depends on yorkie#2352 and yorkie#2353. Source commit:
`7c0708994ad5e17dbfd65acd2561a9339a782c19`.

## Plan

1. Record what the adapted copy exports, decides and says, before touching it.
2. Overwrite `scripts/agent/**` and the `agent-*.yml` workflows with the
   source commit's files.
3. Write `.github/agent-harness/config.json` and `coverage-note.md` from the
   recorded values; write the toolchain action from the inline install block.
4. Write `repo.test.mjs`: what the adapted tests pinned, the action's flags
   and pins, and the recording as a change detector.
5. Compare before and after, and classify every difference.
6. Update the design record and the directory READMEs.

## Checklist

- [x] Audit every hunk where the adapted copy differed from the source, and
      every "originated here" item, before overwriting
- [x] Record the before state (`.github/agent-harness/repo.snapshot.json`,
      first commit)
- [x] Overwrite the shared half; `cmp` every file against the source commit
      (122 files, 0 differing)
- [x] `config.json`, `coverage-note.md` derived from the recording, not typed
- [x] `.github/actions/agent-toolchain` with main's `.npmrc` copied beside it
- [x] `repo.test.mjs` (30 tests), each new guard checked by breaking what it
      guards (18 mutations, all caught)
- [x] Before/after comparison over 1166 paths and six prompts
- [x] `pnpm verify:fast` green; actionlint finds nothing new
- [x] `docs/design/agent-harness.md`, `scripts/README.md`,
      `.github/agent-harness/README.md`
- [x] Report the upstream findings and re-sync once fixed (7c070899): the
      package's tests no longer grade `scripts/test`; the counterpart is
      matched as a repository reference; the scope hook is installed where
      git runs it and the prompts make no claim about this repository's
      hooks; a URL reference stays a link. Core suite: 1128 of 1128
- [x] Keep the agent install inside the workspace: the toolchain action
      refuses a tree that could lead it outside, before and after the
      install; the refusals are run for real in `repo.test.mjs`
- [x] Compare the `.npmrc` copy on every pull request
      (`scripts/test/agent-toolchain-npmrc.test.mjs`)
- [x] Decide which directories hold replicated rules (`document/crdt`,
      `document/time`), with the reasoning beside the pin
- [x] Allow-list what the install is told: registry packages by integrity
      hash, registry or `workspace:` specifiers, a strict reader for the
      lockfile and the workspace file, a scrubbed environment for pnpm
- [x] Contain the install: a container whose only writable mount is the
      workspace, `.git` and trusted checkouts covered; manifests on an
      allow-list of keys; a before/after record as the tripwire
- [x] Take the runner out of it: pnpm from a hash-pinned tarball instead of
      a setup action, `main`'s `.npmrc` mounted rather than swapped, the
      checks of the branch's files inside the container, a wider tripwire
- [ ] Re-audit the install step before any move off pnpm 9
- [ ] Open the PR; merge with the pipeline paused and drained
- [ ] Watch the first live run of each arm: the toolchain action on a runner
      (`pnpm/action-setup`, `github.action_path` from `.trusted-toolchain`),
      a fix round under the scope guard, one sweep
