# Port the `@claude` agent pipeline from yorkie

**Created**: 2026-09-25

yorkie runs the full `@claude` command surface (yorkie #2020 → #2040): nine
agent workflows, the `scripts/agent` package, a six-lens review panel, and a
local enforcement layer (git hooks + Claude Code hooks installed from a
`$GIT_DIR` snapshot). This SDK has none of it. This task brings the same
pipeline here, in the same phase order yorkie used.

## Sources

The yorkie pipeline was itself ported from wafflebase, a pnpm/TypeScript
monorepo, and its Go-shaped parts were rewritten on the way. So:

- **Base: yorkie.** It carries this org's security adaptations that
  wafflebase does not have — the `yorkie-team-agent[bot]` trust list, the
  "App absent → decline" exits, job-level least privilege, the agent/report
  job split (#2034), the self-approval block, `pull-requests: write` for PR
  comments, the snapshot hook install.
- **Reference: wafflebase** for every pnpm-shaped part yorkie rewrote for Go
  (`CLASS_RULES`, `CI_DEFINING_PATHS`, `verify:fast` in fixer prompts, lens
  `appliesWhen` globs). Reverse yorkie's "Adaptations from upstream" table
  (`20260922-agent-implement-issue-to-pr-todo.md`) rather than copying
  wafflebase wholesale — wafflebase's copies predate the yorkie fixes.

Do not copy a fix from one side to the other unread: the two repos diverge on
the PR-comment 403 (wafflebase uses an App token, yorkie a job permission).

## Current state (2026-09-25)

| Item | yorkie | yorkie-js-sdk |
| --- | --- | --- |
| Agent workflows | 9 + `agent-scripts.yml` | none |
| `scripts/agent/` | npm package, own lockfile | none |
| `.claude/` | `self-review`, `maintainer-merge` | none (`CLAUDE.md` only) |
| Git hooks | `.githooks/` snapshot via `setup.sh` | Husky from worktree: `commit-msg`, lint-staged |
| Verify gate | `make verify` (lint + license + unit) | none aggregate; CLAUDE.md says `pnpm lint && pnpm sdk build && pnpm sdk test` |
| License check | `scripts/verify-license.mjs` in CI | none; prosemirror `src/*.ts` and some sdk files lack headers |
| CI workflow name | `CI` | `CI` (same — `workflow_run` target needs no rename) |
| `main` protection | 1 approval, `require_last_push_approval` | 1 approval, **no** last-push approval, **force pushes allowed** |
| App / secrets / vars / labels | all present | none |

## Decisions (2026-09-25, all four taken as proposed)

1. **Husky → `.githooks/` snapshot.** Husky ran hook bodies from the
   worktree. Replaced with `.githooks/` + `scripts/setup.sh` snapshot;
   `prepare` now only runs `setup.sh --check`.
2. **GitHub App.** Add this repo to the existing `yorkie-team-agent`
   installation; the bot login stays identical.
3. **Vendor `scripts/agent`** with a recorded source commit; extraction is a
   later task.
4. **Fixers run `pnpm verify:fast`**; integration stays in CI.

Design: `docs/design/agent-harness.md`.

## Phase 0 — local layer and verify gate (no GitHub-side setup)

- [x] Move the one server-dependent test out of `test/unit` so it runs
      server-free (`should publish snapshot event…` → `integration/snapshot_test.ts`)
- [x] `pnpm sdk test:unit`, `pnpm prosemirror test:unit`
- [x] Root `lint:check`, `verify:license`, `verify:fast` (measured ~30s)
- [x] Add missing Apache headers (58 files) as its own commit; then
      `scripts/verify-license.mjs` + test + CI step
- [x] `scripts/direct-run.mjs`; `verify-doc-links.mjs` adopts it
- [x] CI runs prosemirror tests (previously not run at all)
- [x] `.githooks/{commit-msg,pre-commit,pre-push,trusted-tree.sh}`,
      `scripts/setup.sh` snapshot install, Husky removed
- [x] `scripts/hooks/`: `install.mjs`, `session-prime.sh`,
      `guard-generated-files.sh` (`*_pb.ts`, `.proto` copies, ANTLR output)
- [x] `scripts/test/harness-hooks.test.mjs` (behavioral: scratch clones for
      setup, worktrees, pull/rebase, forks)
- [x] `.claude/commands/self-review.md` pointing at `verify:fast`
- [x] `CLAUDE.md` (verify gate, task workflow, stale `mcp` dropped),
      `CONTRIBUTING.md`, `scripts/README.md`
- [x] Design doc `docs/design/agent-harness.md`
- [x] `/self-review` over the branch: 3 rounds, round 3 clean (see lessons)
- [x] Open the Phase 0 PR (#1384); CI green, including the new licence and
      prosemirror steps
- [ ] Port the hook fixes back to yorkie: worktree common dir, `pull`
      reflog subjects, `rebase (finish)` after a fast-forward, `upstream/main`
      as a trusted base for forks, lowercase `fast-forward` from
      `cherry-pick --ff`, raw `%ae` instead of mailmapped `%aE`, `commit (amend)` /
      `commit (merge)` subjects

## Phase 1 — vendor the pipeline, enable the advisory verbs

**Scope change (2026-09-25).** The vendored `scripts/agent` suite pins
structural invariants across ALL nine agent workflows (App-token narrowing,
post-agent handoff, pinned Node, …): 35 of its tests fail with only the
Phase 1 workflows present. So this PR ports every workflow, as yorkie #2020
did, and phases are gated on the GitHub side instead: nothing runs without
`AGENT_PIPELINE_ENABLED`, every App-needing verb declines when the App is
absent, and `agent-implement` refuses without last-push approval on `main`.

Source: yorkie `33810d95` (#2056). #2056's Go lane runner (`.ci-reports/`)
is out of scope; `agent-iterate-ci` keeps its log-tail fallback here.

- [x] Vendor `scripts/agent/` (own npm lockfile; `.gitignore` exception for
      its `package-lock.json`); excluded from root ESLint, lint-staged and the
      licence scan as vendored code; source commit recorded in its README
- [x] Rewrite the repo-shaped parts: `CLASS_RULES`, `MECHANICAL_COVERAGE_NOTE`
      (+ its pinning test) read off this `ci.yml`, `CI_DEFINING_PATHS`,
      `lenses.json` `appliesWhen`, `mark-ready` text, `capture-meta` id,
      reviewer prompt naming the SDK
- [x] Port the nine `agent-*.yml` + `agent-scripts.yml`: `setup-go`/golangci →
      `setup-node` + `pnpm install --frozen-lockfile --ignore-scripts
      --ignore-pnpmfile` (pnpm 9, action pinned by SHA, no cache); fixer
      prompts run `pnpm verify:fast`, never the server suites; diff excludes
      `*_pb.ts` and the ANTLR output; `agent-iterate-ci` diagnoses from the
      failed-step log only
- [x] `npm test` in `scripts/agent` green (924/924); actionlint clean
- [ ] GitHub (user): secret `CLAUDE_CODE_OAUTH_TOKEN`, environment `agent`,
      variable `AGENT_PIPELINE_ENABLED=true` → `review` / `summarize` live
- [ ] Verify `@claude review` and `@claude summarize` on a same-repo PR and a
      fork PR

## Phase 2 — gating panel (`loop`, `rerun`, `agent-iterate-ci`)

- [ ] App per decision 2; secrets `AGENT_APP_ID` / `AGENT_APP_PRIVATE_KEY`
- [ ] Create the eight `agent:*` labels
- [ ] (workflows land in Phase 1; this phase is the GitHub-side enablement)
- [ ] Decide whether to add a `paths-ignore` to `ci.yml` so docs-only PRs skip
      the panel as on yorkie — `verify:doc-links` runs in `ci.yml` here, so it
      would need its own workflow first
- [ ] Run one real round on a small PR; record cost from `agent-metric`

## Phase 3 — PR fix and reply (`fix`, bare mention)

- [ ] `agent-fix.yml`, `agent-review-reply.yml` with the pnpm toolchain
- [ ] Confirm the fixer's `.github/workflows/` edits surface for a human

## Phase I — issue → PR (`fix` on an issue)

- [ ] `main` protection: `require_last_push_approval: true`; turn off
      `allow_force_pushes` (the workflow refuses otherwise — and force-push
      on `main` is a hole regardless)
- [ ] App `Administration: read`
- [ ] `agent-implement.yml`; `agent-task.yml` issue form so `design-fit`
      has a spec on human-opened work (open gap on yorkie too)
- [x] `npm-publish.yml` / `devtools-publish.yml`: refuse a release authored
      by `yorkie-team-agent[bot]`, as yorkie does (landed in Phase 1, because
      a vendored test demands it). No push-triggered workflow here inherits
      secrets, so yorkie's actor guard has no counterpart yet

## Out of scope

- `hunt` / `report-intake` / `spec-to-pr` / `eval` arms (not on yorkie either)
- A `verify-self` lane runner with `.harness-reports/` — wafflebase has one
  (`scripts/verify-self.mjs`, TS); worth a follow-up here since, unlike
  yorkie, it ports almost directly
- Rollout to dashboard / homepage

## Risks

| Risk | Mitigation |
| --- | --- |
| A workflow file GitHub refuses to load looks like "CI not done yet" | actionlint in `agent-scripts.yml` before enabling |
| Review rounds walk the surface instead of converging (~$8.6 / round) | cap at 3; a human decides when to stop |
| Three vendored copies drift | record the source commit; diff before each sync |
| `verify:fast` too slow → hooks get bypassed | measure first; keep `pre-commit` to lint-staged only |

## Review

(to fill in)
