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
# yorkie commit it came from in tree/SOURCE. With --check, fails unless the
# commit named in tree/SOURCE is on yorkie's main, and fails if tree/ has
# drifted from that commit.
#
#   bash packages/sdk/test/conformance/sync.sh <path-to-yorkie-checkout>
#   bash packages/sdk/test/conformance/sync.sh --check
#
# --check asks the GitHub API whether SOURCE is on main, sending
# GITHUB_TOKEN (or GH_TOKEN) as a bearer token when one is set. For local
# testing, YORKIE_REMOTE names another repository (a URL or a path) to
# fetch SOURCE from; it skips the main check, so it is refused under CI.

set -euo pipefail

usage() {
  echo "usage: $0 <path-to-yorkie-checkout> | --check" >&2
  exit 2
}

[ $# -eq 1 ] || usage

dst="$(cd "$(dirname "$0")" && pwd)/tree"
repo="yorkie-team/yorkie"

# on_main fails unless yorkie commit $1 is on main, by GitHub's compare of
# $1...main: `ahead` or `identical` means main contains $1. A fetch by SHA
# proves nothing on its own, because GitHub serves any commit in the fork
# network, including one pushed to a fork or an unmerged pull request; for
# such a commit the compare says `diverged` or `behind`.
on_main() {
  local sha="$1" body="$2" token code status
  token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  # The token goes in through a curl config on stdin, never argv.
  if ! code="$(
    if [ -n "$token" ]; then
      printf 'header = "Authorization: Bearer %s"\n' "$token"
    fi | curl -sS -K - -o "$body" -w '%{http_code}' \
      -H 'Accept: application/vnd.github+json' \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      "https://api.github.com/repos/$repo/compare/$sha...main?per_page=1"
  )"; then
    echo "error: cannot reach the GitHub API to check yorkie $sha" >&2
    return 1
  fi
  if [ "$code" != 200 ]; then
    echo "error: the GitHub API answered $code comparing yorkie $sha with" \
      "main; it is not a commit of $repo, or the API refused the request" >&2
    return 1
  fi
  status="$(node -e '
    const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(b.status));
  ' "$body")"
  case "$status" in
    ahead | identical) return 0 ;;
  esac
  echo "error: yorkie $sha is not on main of $repo (compare status" \
    "'$status'); re-sync from a commit that is merged there" >&2
  return 1
}

if [ "$1" = "--check" ]; then
  source_sha="$(cat "$dst/SOURCE")"
  if ! [[ "$source_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "error: tree/SOURCE is '$source_sha', not a clean yorkie commit;" \
      "re-sync from a committed yorkie checkout" >&2
    exit 1
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  if [ -n "${YORKIE_REMOTE:-}" ]; then
    if [ -n "${CI:-}" ]; then
      echo "error: YORKIE_REMOTE is for local testing and skips the check" \
        "that SOURCE is on yorkie's main; unset it in CI" >&2
      exit 1
    fi
    remote="$YORKIE_REMOTE"
    echo "warning: YORKIE_REMOTE is set; NOT checking that yorkie" \
      "$source_sha is on main, only that tree/ matches it in $remote" >&2
  else
    remote="https://github.com/$repo"
    on_main "$source_sha" "$tmp/compare.json" || exit 1
  fi

  git -C "$tmp" init -q
  git -C "$tmp" remote add origin "$remote"
  if ! git -C "$tmp" fetch -q --depth 1 origin "$source_sha"; then
    echo "error: cannot fetch yorkie $source_sha from $remote" >&2
    exit 1
  fi
  git -C "$tmp" checkout -q FETCH_HEAD -- test/conformance/tree

  if ! diff -r -x SOURCE "$tmp/test/conformance/tree" "$dst"; then
    echo "error: tree/ differs from yorkie $source_sha; run sync.sh" >&2
    exit 1
  fi
  if [ -n "${YORKIE_REMOTE:-}" ]; then
    echo "tree/ matches yorkie $source_sha in $remote (main not checked)"
  else
    echo "tree/ matches yorkie $source_sha, on main of $repo"
  fi
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
