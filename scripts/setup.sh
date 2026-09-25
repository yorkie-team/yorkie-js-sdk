#!/usr/bin/env bash

# Copyright 2026 The Yorkie Authors. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

# Install this clone's git hooks and Claude Code hooks from a snapshot.
# docs/design/agent-harness.md has the full argument; the short form is in
# the comments below.

# `--check` is what `pnpm install` runs (the root `prepare` script). It changes
# nothing and only reports missing hooks: installing from `prepare` would
# snapshot whatever branch happens to be checked out.
if [ "${1:-}" = "--check" ]; then
  GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
  GIT_COMMON=$(cd "$GIT_COMMON" && pwd -P) || exit 0
  if [ "$(git config --get core.hooksPath || true)" != "$GIT_COMMON/githooks" ]; then
    echo "Git hooks are not installed for this clone. Run: bash scripts/setup.sh" >&2
  fi
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
# The COMMON git dir, not `--absolute-git-dir`: in a linked worktree the latter
# is `.git/worktrees/<name>`, while `core.hooksPath` is shared config. A
# snapshot there dies with the worktree, and git then runs no hooks at all.
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)

# Re-running this inside a checkout of somebody's pull request would make that
# branch's hooks the clone's permanent ones. So compare what this script
# installs and runs against the default branch, and refuse when it differs.
# This guards against ACCIDENT only: a malicious branch's setup.sh can simply
# leave the check out. Run setup on `main`.
# The glob covers `scripts/*.mjs` because `install.mjs` imports
# `../direct-run.mjs`; `:(glob)` keeps `*` from spanning `/`.
HOOK_SOURCES=(.githooks scripts/hooks scripts/setup.sh ':(glob)scripts/*.mjs')

# `upstream/main` first: in a fork, `origin/main` is the fork's and may lag.
UPSTREAM_REF=""
for ref in refs/remotes/upstream/main refs/remotes/origin/main refs/remotes/origin/HEAD; do
  if git -C "$REPO_ROOT" rev-parse --verify --quiet "$ref" >/dev/null; then
    UPSTREAM_REF="$ref"
    break
  fi
done

if [ -z "$UPSTREAM_REF" ]; then
  echo "setup: no origin/main to compare the hook sources against; installing this" >&2
  echo "       worktree's copies as-is." >&2
elif ! git -C "$REPO_ROOT" diff --quiet "$UPSTREAM_REF" -- "${HOOK_SOURCES[@]}" ||
  # `git diff` ignores untracked files, but `cp .githooks/*` copies them.
  [ -n "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard -- "${HOOK_SOURCES[@]}")" ]; then
  if [ "${YORKIE_ALLOW_LOCAL_HOOKS:-}" != "1" ]; then
    echo "setup: this worktree's hook sources differ from ${UPSTREAM_REF#refs/remotes/}:" >&2
    git -C "$REPO_ROOT" diff --stat "$UPSTREAM_REF" -- "${HOOK_SOURCES[@]}" >&2
    echo >&2
    echo "       Installing would snapshot THESE copies into \$GIT_DIR, where no later" >&2
    echo "       checkout can replace them. If this is a branch you are reviewing rather" >&2
    echo "       than one you wrote, that is not what you want." >&2
    echo "       Re-run on the default branch, or, if you meant it:" >&2
    echo "         YORKIE_ALLOW_LOCAL_HOOKS=1 bash scripts/setup.sh" >&2
    exit 1
  fi
  echo "setup: hook sources differ from ${UPSTREAM_REF#refs/remotes/}; installing them" >&2
  echo "       anyway because YORKIE_ALLOW_LOCAL_HOOKS=1." >&2
fi

# Snapshot, not a pointer at the tracked `.githooks/` (which is what Husky did
# with `.husky/`): a hook read from the worktree is branch-controlled code, so
# checking out a pull request and committing would run whatever it says. The
# snapshot pins which hook runs; `.githooks/trusted-tree.sh` covers what it
# runs. Wiped first so a hook deleted upstream stops running here too.
HOOKS_SNAPSHOT="$GIT_COMMON/githooks"
rm -rf "$HOOKS_SNAPSHOT"
mkdir -p "$HOOKS_SNAPSHOT"
cp "$REPO_ROOT/.githooks/"* "$HOOKS_SNAPSHOT/"
chmod +x "$HOOKS_SNAPSHOT/"*

git config core.hooksPath "$HOOKS_SNAPSHOT"
echo "Git hooks installed from .githooks/ into $HOOKS_SNAPSHOT"

# Claude Code hooks: snapshotted the same way and wired in the gitignored
# `.claude/settings.local.json`, never a tracked settings file — Claude Code
# runs what that names straight out of a checkout. A missing node must still
# leave the git hooks installed, so this reports and moves on.
if command -v node >/dev/null 2>&1; then
  node "$REPO_ROOT/scripts/hooks/install.mjs"
else
  echo "node not found; skipping Claude Code hook install (scripts/hooks/install.mjs)" >&2
fi
