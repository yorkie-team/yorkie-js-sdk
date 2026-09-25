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

  # Skip if uncompleted checkboxes remain
  if grep -q '\- \[ \]' "$todo"; then
    continue
  fi

  # Parse Created date
  created_line=$(grep -m1 '^\*\*Created\*\*:' "$todo" || true)
  if [ -z "$created_line" ]; then
    echo "Warning: no **Created** line in $(basename "$todo"), skipping" >&2
    continue
  fi

  date_str=$(echo "$created_line" | sed 's/.*: *//')
  year=$(echo "$date_str" | cut -d'-' -f1)
  month=$(echo "$date_str" | cut -d'-' -f2)

  if [ -z "$year" ] || [ -z "$month" ]; then
    echo "Warning: cannot parse date from $(basename "$todo"), skipping" >&2
    continue
  fi

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
