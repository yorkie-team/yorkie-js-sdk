# Port the `@claude` agent pipeline from yorkie — lessons

**Created**: 2026-09-25

- yorkie's pipeline is a port of wafflebase, not an original. For a pnpm repo,
  the pnpm-shaped pieces come from wafflebase; the security adaptations come
  from yorkie. Neither copy alone is the right base.
- `test/unit` was not server-free: one test in `document_test.ts` synced two
  clients through `withTwoClientsAndDocuments`. Run the suite with no server
  before calling anything a "unit" gate — the directory name is not evidence.
- `crdt_pbt/` needs a server too (it syncs clients), so it stays out of
  `verify:fast` despite looking like a pure property suite.
- ProseMirror's tests were not in CI at all. Porting a "what CI already
  proves" list means reading `ci.yml`, not the package list.
- `pnpm schema test --run` fails: pnpm rejects the flag before vitest sees
  it. `pnpm schema exec vitest run` works.
- Existing clones had `core.hooksPath=.husky/_`. Removing Husky leaves that
  pointing at an ignored directory whose runner exits 0 when the hook file is
  gone — a silent loss of the commit-msg check. `prepare` running
  `setup.sh --check` is what surfaces it.

## Self-review log

- **Round 1** (correctness, tests; subagent reviewer, not the lens panel).
  Blocking: `setup.sh` in a worktree snapshotted into `.git/worktrees/<n>`
  while `core.hooksPath` is shared, so removing the worktree silently
  disabled every hook; the trust guard refused your own branch after
  `git pull --rebase` or a pull merge. Writing the Red tests surfaced a third:
  `rebase (finish)` after a fast-forward onto a fetched PR counted as "created".
  All three fixed with tests (a6b0cbfb). Also: CI lint now `lint:check`;
  `prepare` cannot fail install; the pre-commit comment no longer claims
  deletions are linted (lint-staged lints ACMR only).
  Not fixed: Windows without bash (prepare now falls through, hooks still
  need bash); `commit-msg` rejects git's default pull-merge message
  (pre-existing, unchanged from Husky).
- All three hook defects came verbatim from the server repository. A port
  inherits the source's bugs; the review of the copy is also a review of the
  original. Report them upstream rather than fixing only here.
- **Round 2** (design fit, blast radius). Blocking: a fork contributor who
  rebases onto `upstream/main` while their fork's `main` lags was refused on
  every commit and push — `origin/main` was the only trusted base. Fixed with
  a stale-fork test (e1fe10f3). Also: lint-staged now skips `examples/`, which
  CI's `eslint .` ignores but explicit paths do not (d777e91f); the ported
  comments were condensed — they narrated the server repo's revision history
  as if it had happened here; two tests that pinned source text were dropped.
  Not fixed: the new CI prosemirror step is unverified until the PR runs.
- Porting comments verbatim ports their history too. "An earlier revision of
  this file…" is false in a file that has one revision. Keep the why, drop
  the story.
- **Round 3** (security, docs). No blocking findings; the loop ends here.
  Fixed anyway, with Red tests, because each was a way around the trust
  guard: `cherry-pick --ff` logs a lowercase `fast-forward` against the
  foreign OID and counted as "created"; `%aE` applied the branch's own
  `.mailmap` to the author check. Also: setup.sh counts untracked hook
  sources; the lint-staged `examples/` filter works on repo-relative paths;
  docs now say setup.sh's refusal guards against accident only, and describe
  the two reflogs and both trusted bases.
- Every round found something real, and the rounds did not converge — each
  looked from a different side. Six of the defects were in the server
  repository's original; see the port-back item in the todo.
- **CodeRabbit on #1384**: 8 findings, all accepted. The one that mattered —
  `commit (amend):` never matched because awk split the qualifier into `$3`,
  so your own amend was refused — survived three self-review rounds. Tests
  used only plain `commit`; every reflog verb form the header claims to
  accept needs its own case. Also: `.sh` was outside the licence scan while
  the docs said "every source file under scripts/".

## Phase 1 — porting the workflows and the repo-shaped parts

- A vendored guard that starts with `if (!/actions\/setup-go/.test(wf))
  continue;` goes vacuous the moment the toolchain is swapped: green, and
  pinning nothing. After a toolchain swap, grep the tests for the old
  toolchain's names, not just the failures, and rewrite each guard for the new
  shape with a non-vacuity count.
- Several tests passed against yorkie's content from day one because they
  read the vendored constant, not the repository (the coverage-note test
  checked that the note mentioned golangci-lint). A pinning test is only worth
  porting if it reads its facts off this tree: eslint config, ci.yml steps,
  the compose file, codecov.yml.
- The pnpm form of "never run `make tools` with a token in `.git/config`" is
  not just `--ignore-scripts`: pnpm executes a `.pnpmfile.cjs` with scripts
  off, and `pnpm/action-setup` without `version:` reads the branch's
  `packageManager`. Hence `--ignore-pnpmfile` and a version in the workflow.
  Verified `verify:fast` passes on a fresh worktree installed exactly so.
- A rationale does not port with its code. yorkie excludes generated `*.pb.go`
  from the review diff because a CI lane regenerates and diffs it; nothing
  here does, so the same exclude hides a hand edit. Kept (per the plan), but
  the comments and the coverage note now say so.
- `yml.slice(yml.indexOf("\non:"), yml.indexOf("\nenv:"))` ran to the end of
  a file with no `env:` block. Slice to the next top-level key.
- Mutation-checking the guards with `git checkout -- .` also reverted an
  uncommitted edit to this todo that predated the work. Restored from a saved
  `git diff`. Revert mutations by path, or stash first.
- **Phase 1 self-review, round 1** (security). Blocking: `--ignore-scripts`
  and `--ignore-pnpmfile` do not reach PATH settings, so a branch `.npmrc`
  with `modules-dir=../..` wrote a branch package over the runner's `node`
  before the agent ran. Fixed by installing with main's `.npmrc` and pinning
  location settings on the CLI (c78bec6c); verified against the reviewer's
  reproduction. Porting a "don't run the branch's build" rule from Go to pnpm
  is not a flag swap: `go install pkg@ver` reads no branch config, while a
  package manager reads several files the branch owns.
- `git checkout <file>` after a mutation check discarded an uncommitted fix
  in the same file — the second time in this task. Commit (or stash) before
  mutation-testing, and restore mutations from a copy, never from HEAD.
- **Phase 1 self-review, round 2** (correctness, design fit): no blocking
  findings; loop ends. Fixed anyway: decline replies linked a design doc that
  exists only in yorkie (now an absolute URL); the vendoring README's
  adaptation table missed the lens and `.npmrc` changes a sync would revert.
- **First live run (#1388).** `review` worked ($1.41, 5 min) and its security
  lens found a real hole: any PR author, i.e. anyone on a public repo, could
  trigger a model run whose environment holds the Claude OAuth token, and the
  Read tool reaches /proc/self/environ (verified locally: a bare `Read` rule
  reads outside cwd; `Read(//etc/**)` in `disallowedTools` blocks it). Now
  write-access only, and /proc and /sys are denied. `summarize` had never run
  on yorkie at all: `claude-code-action` without `github_token` fails on OIDC.
  A verb nobody has watched run end to end is not "working" — the comment
  saying it did was the pipeline's own text.
- `gh secret list -R <repo>` lists repository secrets only. The Claude token
  lives at the org level, so it looked missing; the repo's view of org
  secrets is `gh api repos/<repo>/actions/organization-secrets`.
- `summarize` failed twice after "the fix": first OIDC (no `github_token`),
  then `git fetch origin main` (no checkout). `issue_comment` workflows run
  from `main`, so each attempt costs a merge. Reading the pinned action's
  source for every fatal step before the first fix would have saved one.
- A `git rebase` that stopped on a conflict left the next scripted commit
  landing on a detached HEAD with conflict markers. Check the rebase exit
  status before chaining anything after it.
