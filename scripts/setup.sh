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

# Earlier versions copied the hooks into `$GIT_COMMON/githooks` and pointed
# `core.hooksPath` there. A clone still pointed at that copy keeps running the
# old hooks, trusted-tree guard included, until this script runs again.
#
# The physical path `core.hooksPath` names, or nothing when it is unset or
# names no directory. Relative values resolve against the worktree top, as git
# resolves them.
configured_hooks_dir() {
  local p
  p=$(git config --path --get core.hooksPath 2>/dev/null) || return 0
  case "$p" in
    /*) ;;
    *) p="$(git rev-parse --show-toplevel)/$p" ;;
  esac
  [ -d "$p" ] && (cd "$p" && pwd -P)
  return 0
}

# Only a clone set up by the snapshot install points at this exact directory;
# anything else under that name is somebody's own and is left alone.
is_legacy_snapshot() {
  [ -n "$1" ] && [ "$1" = "$2" ]
}

# `--check` is what `pnpm install` runs (the root `prepare` script). It changes
# nothing and only reports, so an install in CI or in a scratch worktree never
# rewrites the clone's config behind its owner's back. It never fails.
if [ "${1:-}" = "--check" ]; then
  GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
  GIT_COMMON=$(cd "$GIT_COMMON" && pwd -P) || exit 0
  if is_legacy_snapshot "$(configured_hooks_dir)" "$GIT_COMMON/githooks"; then
    echo "Git hooks run from the old copy in $GIT_COMMON/githooks, which still" >&2
    echo "enforces the trusted-tree guard. Run: bash scripts/setup.sh" >&2
  elif [ "$(git config --get core.hooksPath || true)" != "$HOOKS_PATH" ]; then
    echo "Git hooks are not installed for this clone. Run: bash scripts/setup.sh" >&2
  fi
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
LEGACY_SNAPSHOT="$GIT_COMMON/githooks"

# Read before it is overwritten: whether the old copy may be deleted depends on
# where `core.hooksPath` pointed when this run started.
OLD_HOOKS_DIR=$(configured_hooks_dir)
REMOVE_LEGACY=""
if is_legacy_snapshot "$OLD_HOOKS_DIR" "$LEGACY_SNAPSHOT"; then
  REMOVE_LEGACY=1
fi

git config core.hooksPath "$HOOKS_PATH"
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
    if [ -n "$REMOVE_LEGACY" ]; then
      echo "       The old hook copy in $LEGACY_SNAPSHOT is unused now and was left" >&2
      echo "       in place; remove it with: rm -rf '$LEGACY_SNAPSHOT'" >&2
    fi
    exit 1
  fi
  echo "setup: Claude Code hook sources differ from ${UPSTREAM_REF#refs/remotes/};" >&2
  echo "       installing them anyway because YORKIE_ALLOW_LOCAL_HOOKS=1." >&2
fi

# Past the refusal, so a refused run deletes nothing.
if [ -n "$REMOVE_LEGACY" ]; then
  rm -rf "$LEGACY_SNAPSHOT"
  echo "Removed the old hook copy in $LEGACY_SNAPSHOT"
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
