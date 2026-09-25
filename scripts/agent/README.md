# scripts/agent

The Node package behind the `@claude` command surface: the review panel,
its gates, the fix and CI-fix arms, and the reporting around them. The
workflows that run it are `.github/workflows/agent-*.yml`; the design is
`docs/design/agent-harness.md`.

It is a standalone npm package with its own lockfile, outside the pnpm
workspace, and it is excluded from the root ESLint, lint-staged and the
licence scan.

## Source

Vendored from [yorkie-team/yorkie](https://github.com/yorkie-team/yorkie) at
`33810d95` (#2056), together with the nine `agent-*.yml` workflows and
`agent-scripts.yml`. The first commits carrying each are unchanged copies,
so `git diff` against them shows only the adaptations below.

Comments in these files that cite `docs/design/agent-command-verbs.md` or
other design documents mean the server repository's documents; they are not
copied here.

## Adapted here

The parts that carry a repository's shape were rewritten for this pnpm
monorepo. Everything else is as vendored.

| File | Adaptation |
|---|---|
| `review-panel.mjs` | `CLASS_RULES` for this layout; `MECHANICAL_COVERAGE_NOTE` read off this `ci.yml`; the lens prompt names yorkie-js-sdk |
| `lenses/lenses.json` | `appliesWhen` scoped to `packages/**` and `scripts/**` |
| `lenses/design-fit.md` | Shared primitives named as `packages/sdk/src/…`, not yorkie's `pkg/` |
| `branch-protection.mjs` | The decline message links yorkie's design doc by URL |
| `checks.mjs` | `CI_DEFINING_PATHS`: manifests, lockfile, tool configs, `docker/**`, `scripts/*.mjs`, the hook layer |
| `mark-ready.mjs` | Gate label, hand-off comment and comments describe this CI |
| `capture-meta.mjs` | Schema id `yorkie-js-sdk/stage-capture-meta@1` |
| `redact.mjs`, `package.json` | Comments and description only |
| `checks.test.mjs`, `review-panel.test.mjs`, `mark-ready.test.mjs`, `review-scope.test.mjs`, `capture-meta.test.mjs` | Tests that pin the adaptations above, re-derived for this repository |
| `agent-fix.yml`, `agent-review-panel.yml`, `agent-review-reply.yml`, `agent-iterate-ci.yml`, `agent-implement.yml` | Go and golangci-lint setup replaced by pnpm (`--frozen-lockfile --ignore-scripts --ignore-pnpmfile`, the branch's `.npmrc` set aside for main's, `--config.*` location pins, no cache); prompts run `pnpm verify:fast` and never the integration suites |
| `agent-review-panel.yml`, `agent-review-on-demand.yml` | Diff excludes: `*_pb.ts` and the ANTLR output |
| `agent-iterate-ci.yml` | Diagnoses from the failed-step log only: this `ci.yml` has no lane reports |
| `agent-fix.yml`, `agent-loop.yml`, `agent-scripts.yml` | Comments describe this `ci.yml`; decline messages (with `agent-rerun.yml`) link yorkie's design doc by URL |
| `npm-publish.yml`, `devtools-publish.yml` | Refuse a release authored by `yorkie-team-agent[bot]`, as yorkie's `docker-publish.yml` does |

`agent-summarize.yml` is unchanged.

## Syncing from yorkie

1. Pick the yorkie commit to sync to, and diff it against `33810d95` (or the
   commit recorded above, if a later sync changed it) for `scripts/agent/`
   and `.github/workflows/agent-*.yml`.
2. Apply that diff here. Where it touches a file in the table above, re-apply
   the adaptation by hand rather than taking yorkie's side: a Go path, a
   `make` target or a MongoDB-only claim is a bug here.
3. Re-read `MECHANICAL_COVERAGE_NOTE` and `CI_DEFINING_PATHS` against this
   repository's `ci.yml` as it is at the time of the sync.
4. `npm ci --ignore-scripts && npm test` here, then actionlint from the
   REPOSITORY ROOT, so the mount includes `.github/workflows/`:

   ```sh
   docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -shellcheck= -pyflakes=
   ```

5. Record the new source commit in this file.
