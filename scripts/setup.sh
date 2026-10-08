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
