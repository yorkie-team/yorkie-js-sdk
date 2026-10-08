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

# Install this clone's git hooks and Claude Code hooks.
# docs/design/agent-harness.md has the full argument; the short form is in
# the comments below.

# Relative on purpose: git resolves a relative `core.hooksPath` against the
# top of whichever worktree runs the hook, so one setting in the shared config
# serves every worktree, each running its own checkout's `.githooks/`. A hook
# change therefore applies on the next commit, with no re-install.
HOOKS_PATH=.githooks

# `--check` is what `pnpm install` runs (the root `prepare` script). It changes
# nothing and only reports missing hooks, so an install in CI or in a scratch
# worktree never rewrites the clone's config behind its owner's back.
if [ "${1:-}" = "--check" ]; then
  git rev-parse --git-dir >/dev/null 2>&1 || exit 0
  if [ "$(git config --get core.hooksPath || true)" != "$HOOKS_PATH" ]; then
    echo "Git hooks are not installed for this clone. Run: bash scripts/setup.sh" >&2
  fi
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)

git config core.hooksPath "$HOOKS_PATH"
# Earlier versions copied the hooks into `$GIT_DIR/githooks` and pointed
# `core.hooksPath` there. Nothing reads that copy any more.
rm -rf "$GIT_COMMON/githooks"
echo "Git hooks now run from .githooks/ (core.hooksPath=$HOOKS_PATH)"

# THE RE-RUN WOULD PERSIST A BRANCH'S HOOKS. Run inside a checkout of somebody's
# pull request, the install below would make that branch's `scripts/hooks/*.sh`
# the clone's checkout-proof Claude Code hooks. So compare what the install
# runs and copies against the default branch and refuse when it differs. The
# escape hatch is an environment variable rather than a prompt, because this
# script is also run non-interactively.
#
# This guards against ACCIDENT only. A malicious branch's setup.sh can simply
# leave the check out, and running that file is already running the branch's
# code. Run setup on `main`.
#
# `:(glob)scripts/*.mjs` because `install.mjs` imports `../direct-run.mjs`;
# `:(glob)` keeps `*` from spanning `/` into `scripts/agent/**`.
HOOK_SOURCES=(scripts/hooks scripts/setup.sh ':(glob)scripts/*.mjs')

# `upstream/main` first: in a fork, `origin/main` is the fork's and may lag.
UPSTREAM_REF=""
for ref in refs/remotes/upstream/main refs/remotes/origin/main refs/remotes/origin/HEAD; do
  if git -C "$REPO_ROOT" rev-parse --verify --quiet "$ref" >/dev/null; then
    UPSTREAM_REF="$ref"
    break
  fi
done

if [ -z "$UPSTREAM_REF" ]; then
  echo "setup: no origin/main to compare the Claude Code hook sources against;" >&2
  echo "       installing this worktree's copies as-is." >&2
elif ! git -C "$REPO_ROOT" diff --quiet "$UPSTREAM_REF" -- "${HOOK_SOURCES[@]}"; then
  if [ "${YORKIE_ALLOW_LOCAL_HOOKS:-}" != "1" ]; then
    echo "setup: this worktree's Claude Code hook sources differ from ${UPSTREAM_REF#refs/remotes/}:" >&2
    git -C "$REPO_ROOT" diff --stat "$UPSTREAM_REF" -- "${HOOK_SOURCES[@]}" >&2
    echo >&2
    echo "       Installing would snapshot THESE copies into \$GIT_DIR, where no later" >&2
    echo "       checkout can replace them. If this is a branch you are reviewing rather" >&2
    echo "       than one you wrote, that is not what you want. The git hooks above are" >&2
    echo "       already enabled." >&2
    echo "       Re-run on the default branch, or, if you meant it:" >&2
    echo "         YORKIE_ALLOW_LOCAL_HOOKS=1 bash scripts/setup.sh" >&2
    exit 1
  fi
  echo "setup: Claude Code hook sources differ from ${UPSTREAM_REF#refs/remotes/};" >&2
  echo "       installing them anyway because YORKIE_ALLOW_LOCAL_HOOKS=1." >&2
fi

# Claude Code hooks: snapshotted into `$GIT_DIR/agent-hooks` and wired in the
# gitignored `.claude/settings.local.json`, never a tracked settings file —
# Claude Code runs what that names on opening a session, before any git
# command you chose to run (install.mjs has the argument). A missing node must
# still leave the git hooks installed, so this reports and moves on.
if command -v node >/dev/null 2>&1; then
  node "$REPO_ROOT/scripts/hooks/install.mjs"
else
  echo "node not found; skipping Claude Code hook install (scripts/hooks/install.mjs)" >&2
fi
