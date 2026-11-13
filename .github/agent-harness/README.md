# .github/agent-harness

This repository's half of the agent harness: everything the `@claude` command
surface needs to know about yorkie-js-sdk. The other half — `scripts/agent/**`
and every `.github/workflows/agent-*.yml` — is the same bytes in every
repository that runs the harness, and is documented in
[`scripts/agent/README.md`](../../scripts/agent/README.md), which is also where
every configuration key, the prompt frames, the glob dialect and the toolchain
action's contract are specified.

## Source

The shared half is copied from
[yorkie-team/yorkie](https://github.com/yorkie-team/yorkie) at
`7c0708994ad5e17dbfd65acd2561a9339a782c19`.

Comments in the shared files that cite `docs/design/agent-command-verbs.md`
or other design documents by path mean the server repository's documents;
they are not copied here. Where a message links to that one, it is by URL
(`docs.commandVerbsRef`). This repository's own design record for running
the harness is [`docs/design/agent-harness.md`](../../docs/design/agent-harness.md).

## What is this repository's

| File | What it is |
|---|---|
| `config.json` | Every repository-specific value: the CI-defining paths, the file-class rules, the lens source globs, the generated files left out of a reviewed diff, the sentences the fixer prompts are completed with, the test rules (`vitest`), the commit-message sentence, the fix guard's replicated-rule paths and counterpart repository |
| `coverage-note.md` | What `ci.yml`'s lanes prove and do not, told to every lens |
| `repo.test.mjs` | Grades the two files above, and the toolchain action, against this repository (`npm run test:repo` in `scripts/agent`). The reason each configured entry exists is written there, beside the assertion that pins it |
| `repo.snapshot.json` | Every exported value and rendered prompt, recorded. A change to a gate, a prompt or a comment shows its before and after in this file's diff |
| `../actions/agent-toolchain/action.yml` | pnpm (pinned by commit, major 9) and a lockfile-exact install with lifecycle scripts and pnpmfiles off, the branch's `.npmrc` set aside, and no cache. The install stays inside the workspace: before it runs, the step refuses a tree with a `node_modules` already in it, a symbolic link that resolves outside, or a workspace file or lockfile that names a project outside the root, and it checks again afterwards. Audited against pnpm 9 only |
| `../actions/agent-toolchain/npmrc` | A copy of the root `.npmrc`. An agent job checks out only the action's directory from `main`, so the trusted `.npmrc` the install uses has to sit beside the action. Two tests fail when the two differ: `scripts/test/agent-toolchain-npmrc.test.mjs`, which `ci.yml` runs on every pull request, and `repo.test.mjs` |

Outside the harness, and kept across a sync: `npm-publish.yml` and
`devtools-publish.yml` refuse a release authored by `yorkie-team-agent[bot]`
(`repo.test.mjs` pins it).

Where upstream's text assumes something this repository does not have:

- There is no `.github/CODEOWNERS` here. `scripts/agent/README.md` says
  workflow files are "CODEOWNER-ed, so every edit to one still needs a human
  reviewer". What holds here is the other half: a pull request that touches a
  CI-defining path is never promoted automatically, so a person reviews it.
- This repository's git hooks (`.githooks/`, set up by `scripts/setup.sh`)
  do not run in a fix job: the harness points `core.hooksPath` at its own
  scope hook there. `fixer.commitNote` therefore states the commit-message
  convention without saying a hook checks it.

`repo.test.mjs` follows this repository's ESLint and Prettier rules and is
checked by the root lint. `scripts/agent/**` follows the server repository's
style and is excluded from the root ESLint, lint-staged and the licence scan.

## Syncing from yorkie

1. Pick the yorkie commit to sync to.
2. Overwrite `scripts/agent/**` and `.github/workflows/agent-*.yml` with that
   commit's tracked files, and delete any the commit no longer has. Do not
   merge by hand and do not edit either afterwards: a difference from upstream
   in those paths is a bug here. Something this repository needs that the
   shared half cannot express goes upstream first.
3. Keep this directory and `.github/actions/agent-toolchain/`. If the new
   commit added, renamed or removed a configuration key, `config.mjs` says so
   on load: update `config.json` to match `scripts/agent/README.md`.
4. In `scripts/agent`: `npm ci --ignore-scripts`, `npm test` and
   `npm run test:repo`. A failure in `repo.snapshot.json` is a prompt or a
   gate that changed: read the difference, then record it.
5. actionlint from the REPOSITORY ROOT, so the mount includes
   `.github/workflows/`:

   ```sh
   docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -shellcheck= -pyflakes=
   ```

6. Record the new source commit in this file.

## When this repository changes

- A new lane in `ci.yml`, or one removed: `coverage-note.md`, and the
  assertions about it in `repo.test.mjs`.
- A new file that decides what CI does (a tool config, a script a workflow
  runs): `ci.definingPaths` and usually `review.classRules.policy`.
- A new package: nothing, while it lives under `packages/`.
- A new directory whose rules the Go server must apply identically:
  `fixGuard.replicatedRuleGlobs`, with the reason beside the pin in
  `repo.test.mjs`.
- The root `.npmrc`: copy it to `../actions/agent-toolchain/npmrc` in the
  same change. `pnpm test:scripts` fails until it is.
- The pnpm major in `ci.yml`: not simply the same number in the toolchain
  action. The action's install step was audited against pnpm 9; a later major
  reads settings from files a branch controls. Re-audit the step first, then
  move the number and the assertion in `repo.test.mjs` that pins it.

`agent-scripts.yml` runs both suites on a change to the harness, this
directory or `.github/actions/`, and weekly. So a change to one of the other
files above that makes this directory wrong — a lane removed from `ci.yml`,
a script a prompt names renamed — is found within a week, not on the pull
request that makes it. The `.npmrc` copy is the exception: `ci.yml` checks
it on every pull request.
