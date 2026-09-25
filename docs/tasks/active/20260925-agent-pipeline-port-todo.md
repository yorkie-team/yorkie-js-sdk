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
- [x] `scripts/test/harness-hooks.test.mjs` (25 cases)
- [x] `.claude/commands/self-review.md` pointing at `verify:fast`
- [x] `CLAUDE.md` (verify gate, task workflow, stale `mcp` dropped),
      `CONTRIBUTING.md`, `scripts/README.md`
- [x] Design doc `docs/design/agent-harness.md`
- [ ] `/self-review` over the branch, then open the Phase 0 PR

## Phase 1 — advisory verbs (`review`, `summarize`)

- [ ] Vendor `scripts/agent/` from yorkie at a named commit; `npm test` green
- [ ] Rewrite the repo-shaped parts:
  - [ ] `review-panel.mjs` `CLASS_RULES` for `packages/*`, `examples/**`,
        `docs/design/**`, generated `*_pb.ts`; reviewer prompt names the SDK
  - [ ] `MECHANICAL_COVERAGE_NOTE` read off this repo's `ci.yml` (eslint,
        tsc build, vitest + integration against docker server, bench,
        react/schema/devtools builds, license, doc-links) and its pinning test
  - [ ] `checks.mjs` `CI_DEFINING_PATHS` (pnpm workspace manifests, lockfile,
        `docker/**`, eslint/vitest/tsconfig, hooks, `scripts/*.mjs`)
  - [ ] `lenses.json` `appliesWhen` globs for `packages/**`, `scripts/**`
  - [ ] `mark-ready.mjs` hand-off text, `capture-meta` schema id
- [ ] `agent-summarize.yml`, `agent-review-on-demand.yml` (exclude `*_pb.ts`
      from the diff), `agent-scripts.yml` with actionlint
- [ ] GitHub: secret `CLAUDE_CODE_OAUTH_TOKEN`, environment `agent`,
      variable `AGENT_PIPELINE_ENABLED=true`
- [ ] Verify on a same-repo PR **and a fork PR** (the fork 403 is still
      unverified on yorkie)

## Phase 2 — gating panel (`loop`, `rerun`, `agent-iterate-ci`)

- [ ] App per decision 2; secrets `AGENT_APP_ID` / `AGENT_APP_PRIVATE_KEY`
- [ ] Create the eight `agent:*` labels
- [ ] `agent-loop.yml`, `agent-rerun.yml`, `agent-review-panel.yml`,
      `agent-iterate-ci.yml`; swap `setup-go`/golangci for `setup-node` +
      pnpm; fixer prompts use `pnpm verify:fast`
- [ ] Check `ci.yml` paths-ignore so docs-only PRs skip the panel like yorkie
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
- [ ] `npm-publish.yml` / `devtools-publish.yml`: refuse
      `yorkie-team-agent[bot]` as actor or release author, as yorkie does

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
