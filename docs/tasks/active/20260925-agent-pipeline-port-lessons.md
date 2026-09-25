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
