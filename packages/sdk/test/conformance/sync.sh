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
# yorkie commit it came from in tree/SOURCE.
#
#   bash packages/sdk/test/conformance/sync.sh <path-to-yorkie-checkout>

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <path-to-yorkie-checkout>" >&2
  exit 2
fi

src="$1/test/conformance/tree"
dst="$(cd "$(dirname "$0")" && pwd)/tree"

if [ ! -d "$src" ]; then
  echo "error: $src does not exist" >&2
  exit 1
fi

commit="$(git -C "$1" rev-parse HEAD)"
dirty=""
if [ -n "$(git -C "$1" status --porcelain -- test/conformance/tree)" ]; then
  dirty="-dirty"
  echo "warning: $src has uncommitted changes" >&2
fi

rm -rf "$dst"
mkdir -p "$dst"
cp -R "$src/." "$dst/"
mkdir -p "$dst/corpus" "$dst/parity"
echo "${commit}${dirty}" > "$dst/SOURCE"
echo "synced $src -> $dst at yorkie ${commit}${dirty}"
