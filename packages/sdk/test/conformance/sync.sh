#!/usr/bin/env bash
#
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

# Copies yorkie's test/conformance/tree/ into this directory and records the
# yorkie commit it came from in tree/SOURCE. With --check, fetches yorkie's
# main from GitHub, fails unless the commit named in tree/SOURCE is on it,
# and fails if tree/ has drifted from that commit.
#
#   bash packages/sdk/test/conformance/sync.sh <path-to-yorkie-checkout>
#   bash packages/sdk/test/conformance/sync.sh --check

set -euo pipefail

usage() {
  echo "usage: $0 <path-to-yorkie-checkout> | --check" >&2
  exit 2
}

[ $# -eq 1 ] || usage

dst="$(cd "$(dirname "$0")" && pwd)/tree"
remote="${YORKIE_REMOTE:-https://github.com/yorkie-team/yorkie}"

if [ "$1" = "--check" ]; then
  source_sha="$(cat "$dst/SOURCE")"
  if ! [[ "$source_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "error: tree/SOURCE is '$source_sha', not a clean yorkie commit;" \
      "re-sync from a committed yorkie checkout" >&2
    exit 1
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  git -C "$tmp" init -q
  git -C "$tmp" remote add origin "$remote"
  # main, not the SHA: a fetch by SHA resolves any commit in the GitHub fork
  # network, so it would accept fixtures copied from a fork or an unmerged
  # pull request. Fetching the branch and holding SOURCE to its history is
  # what makes "matches yorkie" mean "is on yorkie's main". --filter keeps
  # the history cheap; the blobs the checkout below needs come on demand
  # from the promisor remote this fetch configures.
  if ! git -C "$tmp" fetch -q --filter=blob:none origin main; then
    echo "error: cannot fetch main from $remote" >&2
    exit 1
  fi
  if ! git -C "$tmp" merge-base --is-ancestor "$source_sha" FETCH_HEAD 2>/dev/null; then
    echo "error: yorkie $source_sha is not on main of $remote;" \
      "re-sync from a commit that is merged there" >&2
    exit 1
  fi
  git -C "$tmp" checkout -q "$source_sha" -- test/conformance/tree

  if ! diff -r -x SOURCE "$tmp/test/conformance/tree" "$dst"; then
    echo "error: tree/ differs from yorkie $source_sha; run sync.sh" >&2
    exit 1
  fi
  echo "tree/ matches yorkie $source_sha, on main of $remote"
  exit 0
fi

src="$1/test/conformance/tree"
if [ ! -d "$src" ]; then
  echo "error: $src does not exist" >&2
  exit 1
fi

commit="$(git -C "$1" rev-parse HEAD)"
dirty=""
if [ -n "$(git -C "$1" status --porcelain -- test/conformance)" ]; then
  dirty="-dirty"
  echo "warning: $1/test/conformance has uncommitted changes" >&2
fi
if ! git -C "$1" merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
  echo "warning: yorkie $commit is not in origin/main;" \
    "re-sync once it is merged, or sync.sh --check will fail" >&2
fi

rm -rf "$dst"
mkdir -p "$dst"
cp -R "$src/." "$dst/"
mkdir -p "$dst/corpus" "$dst/parity"
echo "${commit}${dirty}" > "$dst/SOURCE"
echo "synced $src -> $dst at yorkie ${commit}${dirty}"
