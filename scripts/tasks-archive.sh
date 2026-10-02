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

TASKS_DIR="${1:-docs/tasks}"
ACTIVE_DIR="$TASKS_DIR/active"
ARCHIVE_DIR="$TASKS_DIR/archive"

if [ ! -d "$ACTIVE_DIR" ]; then
  echo "Error: $ACTIVE_DIR does not exist" >&2
  exit 1
fi

archived=0

for todo in "$ACTIVE_DIR"/*-todo.md; do
  [ -f "$todo" ] || continue

  # Skip if uncompleted checkboxes remain. Anchored to the start of a line,
  # so a `- [ ]` quoted inside a sentence or a fenced example is prose, not an
  # open box. `hasOpenBoxes` in scripts/tasks-check.mjs applies the same rule:
  # the two must agree, or that check flags a todo this script will not move.
  if grep -qE '^[[:space:]]*- \[ \]' "$todo"; then
    continue
  fi

  # Parse Created date
  created_line=$(grep -m1 '^\*\*Created\*\*:' "$todo" || true)
  if [ -z "$created_line" ]; then
    echo "Warning: no **Created** line in $(basename "$todo"), skipping" >&2
    continue
  fi

  # The destination is built from a line INSIDE the todo, and a todo is
  # branch-authored content — a maintainer archiving a pull request's checkout
  # runs this script over data they did not write. So match the two fields as
  # digits and build the path out of the MATCH, never out of the line: a
  # `**Created**: ../../../../tmp/x` would otherwise pick the `mkdir -p` and
  # `git mv` target. `#*:` stops at the FIRST colon, so nothing after the date
  # is reachable either.
  date_str=${created_line#*:}
  if [[ ! $date_str =~ ^[[:space:]]*([0-9]{4})-([0-9]{2})([^0-9]|$) ]]; then
    echo "Warning: cannot parse date from $(basename "$todo"), skipping" >&2
    continue
  fi
  year="${BASH_REMATCH[1]}"
  month="${BASH_REMATCH[2]}"

  dest="$ARCHIVE_DIR/$year/$month"
  mkdir -p "$dest"

  # Move todo file
  slug=$(basename "$todo" -todo.md)
  git mv "$todo" "$dest/"
  archived=$((archived + 1))

  # Move matching lessons file if it exists
  lessons="$ACTIVE_DIR/${slug}-lessons.md"
  if [ -f "$lessons" ]; then
    git mv "$lessons" "$dest/"
  fi

  echo "Archived: $slug → $dest/"
done

if [ "$archived" -eq 0 ]; then
  echo "No completed tasks to archive."
else
  echo "Archived $archived task(s)."
fi
