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
`3bf1bb2fe1ce3e493222e9f04b139794a8370d21`.

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
- [ ] Resolve the one failing harness test: `git-env.test.mjs` walks all of
      `scripts/` and refuses this repository's own `scripts/test` git
      fixtures, which scrub their environment without the harness's helper.
      Needs an upstream change (walk the package only), then a re-sync
- [ ] Report the other upstream findings: substring match on
      `fixGuard.counterpartRepo`; the hook sentence in the fixer prompts and
      the guide hook under `core.hooksPath`; the code span around a URL
      reference; per-repository files that no longer start `agent-scripts.yml`
- [ ] Open the PR; merge with the pipeline paused and drained
- [ ] Watch the first live run of each arm: the toolchain action on a runner
      (`pnpm/action-setup`, `GITHUB_ACTION_PATH` from `.trusted-toolchain`),
      a fix round under the scope guard, one sweep
