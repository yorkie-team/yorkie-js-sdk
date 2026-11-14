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
`d80074a42ddf3339152e7fdf3bcdf480bc168de9`, a commit on its `main`.

[`upstream.json`](upstream.json) is the record: the repository, that commit
and the digest of `scripts/agent/MANIFEST.sha256`. The line above is for a
reader; the checks read the file. `sync.mjs` writes it, and nothing else
should.

Four things keep the copy honest, and `scripts/agent/README.md` ("Adopting
and syncing") describes each:

- `npm test` fails when a shared file differs from the manifest, and when
  the manifest's digest is not the recorded one
  (`node scripts/agent/manifest.mjs verify` is the first half alone).
- `npm run check:upstream`, which `agent-scripts.yml` runs on change and
  weekly, asks GitHub that the recorded commit is on yorkie's `main` and that
  the manifest there is the recorded one.
- `repo.test.mjs` pins that the record names `yorkie-team/yorkie`. Without
  it, a record edited to claim this repository is where the shared half is
  written would pass the two above.
- `agent-upstream-notify.yml`, weekly and on dispatch, keeps one issue open
  (title starting `[agent:harness-sync]`) while yorkie's `main` has a newer
  shared half, and closes it after a sync. It only notifies; a person syncs.

The root `.gitattributes` marks the shared files `-text`, because the
manifest is over bytes and a checkout that converts line endings would read
every one of them as edited. `repo.test.mjs` pins those lines.

Comments in the shared files that cite `docs/design/agent-command-verbs.md`
or other design documents by path mean the server repository's documents;
they are not copied here. Where a message links to that one, it is by URL
(`docs.commandVerbsRef`). This repository's own design record for running
the harness is [`docs/design/agent-harness.md`](../../docs/design/agent-harness.md).

## What is this repository's

| File | What it is |
|---|---|
| `config.json` | Every repository-specific value: the CI-defining paths, the file-class rules, the lens source globs, the generated files left out of a reviewed diff, the sentences the fixer prompts are completed with, the test rules (`vitest`), the commit-message sentence, the fix guard's replicated-rule paths and counterpart repositories (one: the server) |
| `coverage-note.md` | What `ci.yml`'s lanes prove and do not, told to every lens |
| `repo.test.mjs` | Grades the two files above, and the toolchain action, against this repository (`npm run test:repo` in `scripts/agent`). The reason each configured entry exists is written there, beside the assertion that pins it |
| `upstream.json` | Which repository and commit the shared half was copied from, and the manifest digest. Written by `sync.mjs` |
| `repo.snapshot.json` | Every exported value and rendered prompt, recorded. A change to a gate, a prompt or a comment shows its before and after in this file's diff |
| `../actions/agent-toolchain/action.yml` | One step, no other action. ON THE RUNNER it fetches pnpm — one fixed tarball from the npm registry, checked against a pinned hash, unpacked under the runner's temp directory and put on the PATH of later steps through a launcher — records what must not change, starts a container, and compares afterwards. It never runs pnpm, never changes directory into the workspace and never writes there. THE CONTAINER (image pinned by digest) has the workspace as its only writable mount; `.git` and any `.trusted-*` checkout are covered by an empty read-only directory, `main`'s `.npmrc` stands read-only over the root one, nothing else of the runner is mounted and no environment is passed in. Without Docker the step fails. Audited against pnpm 9 only |
| `../actions/agent-toolchain/entry.sh` | What the container runs: the check of the branch's files, `pnpm install` (lockfile-exact, no lifecycle scripts, no pnpmfile), the check of the result. Everything that reads or changes a file of the branch is here, not on the runner |
| `../actions/agent-toolchain/check-install-inputs.mjs` | The allow-list (in the container) and the tripwire (on the runner). `before` refuses a tree that is not of the shape this repository's own has: no `node_modules`, no `.npmrc` but the root's, no `.git` below the root, no symbolic link that leaves the workspace; `pnpm-lock.yaml` and `pnpm-workspace.yaml` read strictly (only the plain style pnpm writes); every locked package a registry package with an integrity hash (one exception, the `@buf` package, by its address on that scope's registry); every specifier a registry range or `workspace:`; every name plain; no manifest key beyond a fixed list. `snapshot` and `after` record `.git`, the runner's temp directory, the directories around the workspace and the package-manager settings in the runner's home, compare them, and walk the workspace for a link that leads out of its own files |
| `../actions/agent-toolchain/npmrc` | A copy of the root `.npmrc`, mounted read-only over the root `.npmrc` inside the container, so the install reads `main`'s settings and the branch's file is never read or moved. An agent job checks out only the action's directory from `main`, so the copy has to sit beside the action. Two tests fail when the two differ: `scripts/test/agent-toolchain-npmrc.test.mjs`, which `ci.yml` runs on every pull request, and `repo.test.mjs` |

### What the toolchain action relies on

It bounds what the install can do; it does not stand alone. It assumes:

- Docker's mount namespace and the kernel under it hold. A container escape
  is outside what this defends.
- The two things it fetches are what they were when pinned: the pnpm tarball,
  by sha512, and the container image, by digest.
- `PATH`, and the `node` on it, are what the job's earlier trusted steps set:
  nothing of the branch has influenced them before this step.
- No trusted step between this one and the agent follows a path in the
  workspace or runs a program from it. The action checks that no link leads
  out of the workspace's own files; it cannot check what a later step does.
- Everything after the agent starts is untrusted, whatever this step did.
- The container's network is open (`--network bridge`): the install needs
  the registry, and nothing restricts where else it can connect. It holds no
  credential.

If the step fails after it has written its `$GITHUB_PATH` line, the line
names a directory the step then removed. The job has failed by then, so no
later step uses it.

A symbolic link is judged three ways, in the container before the install
and on the runner after it, whether the checkout had it or the install made
it, and each way refuses on its own:

- by its text: it must stay, lexically, among the workspace's own files, and
  may not pass through `/proc`, `/dev` or `/sys`;
- by where it resolves, as the kernel resolves it (`realpathSync.native`):
  each component followed in turn, a `..` taken from wherever the components
  before it led, never settled as text first;
- by every link its target passes through: the target is walked one
  component at a time without following anything, a component that is itself
  a link is walked the same way by its own text, and no step may leave the
  workspace's own files, even to come back. Before the install a component
  that does not exist or cannot be examined is a refusal; after it, what
  follows a missing component is read as plain names and may not climb.

The paths the checks are given (the workspace root, the runner's temp
directory, the directory left out of its record) and what the install left
in `node_modules` are resolved the same way. This repository tracks no
symbolic link (`repo.test.mjs` pins that), so one added on purpose is a
change to make there too.

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

1. Have a checkout of yorkie on its `main`, fetched (`git fetch origin`).
   `sync.mjs` refuses a source whose `HEAD` is not on `origin/main`: the
   commit it records is looked up there by `check:upstream`, which fails for
   one that was never merged.
2. From this repository's root, with nothing modified, staged or untracked
   under `scripts/agent` or among the `agent-*.yml` workflows:

   ```sh
   node scripts/agent/sync.mjs --from ../yorkie
   ```

   It writes every shared file, deletes the ones upstream no longer has,
   writes `upstream.json`, and prints what is left to a person. Do not copy
   by hand, do not merge by hand and do not edit the shared files afterwards:
   a difference from upstream in those paths is a bug here, and `npm test`
   fails on it. Something this repository needs that the shared half cannot
   express goes upstream first.
3. It never touches this directory's other files or
   `.github/actions/agent-toolchain/`. If the new commit added, renamed or
   removed a configuration key, it prints each one, with the new spelling
   where a key was renamed: update `config.json` to match
   `scripts/agent/README.md`, and set a new optional key to what this
   repository's prompts said before, so a rendered prompt loses nothing.
4. Stage first — the suite compares the manifest with what git tracks, so it
   fails on a file that was copied and not yet added:

   ```sh
   git add scripts/agent .github/workflows .github/agent-harness
   ```

   Then, in `scripts/agent`: `npm ci --ignore-scripts`, `npm test`,
   `npm run test:repo` and `npm run check:upstream`. A failure in
   `repo.snapshot.json` is a prompt or a gate that changed: read the
   difference, then record it, and list each changed sentence in the commit.
5. Re-read how the agent jobs call the toolchain action (the steps around
   `agent-toolchain` in the five `agent-*.yml` that use it) against "What the
   toolchain action relies on" above. The shared workflows can move a step;
   the action is this repository's and is not synced.
6. actionlint from the REPOSITORY ROOT, so the mount includes
   `.github/workflows/`:

   ```sh
   docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -shellcheck= -pyflakes=
   ```

7. Record the new source commit in "Source" above.

## When this repository changes

- A new lane in `ci.yml`, or one removed: `coverage-note.md`, and the
  assertions about it in `repo.test.mjs`.
- A new file that decides what CI does (a tool config, a script a workflow
  runs): `ci.definingPaths` and usually `review.classRules.policy`.
- A new package: nothing, while it lives under `packages/`.
- A new directory whose rules the Go server must apply identically:
  `fixGuard.replicatedRuleGlobs`, with the reason beside the pin in
  `repo.test.mjs`.
- A manifest key no `package.json` here uses yet (`directories`, `man`,
  `workspaces`, `packageManager`, …): the agent install refuses it. Add it
  to the list in `check-install-inputs.mjs` once you know what an install
  does with it.
- A dependency that is not a plain registry package (a git or URL
  dependency, a local tarball, a patch, a `pnpm` setting in a manifest): the
  agent install refuses it, by design. Allowing one is a change to
  `check-install-inputs.mjs` and its tests, reviewed as policy — decide what
  that fetcher can be made to do first.
- The root `.npmrc`: copy it to `../actions/agent-toolchain/npmrc` in the
  same change. `pnpm test:scripts` fails until it is.
- The pnpm version: `PNPM_VERSION` and `PNPM_INTEGRITY` in the action change
  together — the hash is the registry's `dist.integrity` for that version —
  and `repo.test.mjs` pins the pair. A new MAJOR is not just a number: the
  action was audited against pnpm 9, and a later major reads settings from
  files a branch controls. Re-audit `entry.sh` and the checker first.
- A root `.npmrc` must exist: the container mounts `main`'s over it. A
  `.npmrc` anywhere else in the tree is refused.

`agent-scripts.yml` runs both suites on a change to the harness, this
directory or `.github/actions/`, and weekly. So a change to one of the other
files above that makes this directory wrong — a lane removed from `ci.yml`,
a script a prompt names renamed — is found within a week, not on the pull
request that makes it. The `.npmrc` copy is the exception: `ci.yml` checks
it on every pull request.
