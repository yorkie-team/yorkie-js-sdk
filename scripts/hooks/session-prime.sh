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

# Claude Code SessionStart hook: state the workflow up front.
#
# CLAUDE.md carries this already. Putting the load-bearing half in context at
# session start is more reliable than relying on the file being read that far —
# and the first step is the one most often skipped, because it happens before
# any code.
#
# Non-blocking by construction: prints and exits 0.
#
# LOCAL SESSIONS ONLY. This is the multi-commit workflow a person (or an
# interactive agent) follows: plan a task doc, self-review, archive before
# merge. A CI fix job has its own prompt telling it to fix the findings it was
# given and nothing else; handing it this instead would push it to write task
# documents it was not asked for. Whether `claude-code-action` would load a
# branch's hook wiring at all is unsettled, and refusing here settles it.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  exit 0
fi

cat <<'MSG'
=== WORKFLOW REQUIREMENTS ===
A condensation of CLAUDE.md, not a second numbering of it — read that file
for the steps in order and for everything left out here.

- Plan first. Write docs/tasks/active/YYYYMMDD-<slug>-todo.md BEFORE code.
  Architecture changes also update docs/design/.
- Branch from main. `pnpm verify:fast` (lint, licence headers, doc links,
  build, unit tests) green per commit. The hooks check part of it for you:
  lint-staged on commit, the full `verify:fast` on push. Integration tests
  need a server: see CLAUDE.md.
- Commit subject <=70 chars, verb-first, no type prefix; blank line 2;
  body wrapped at 80.
- Self review with /self-review before opening the PR: max 3 rounds, stop at
  the first round with no blocking findings. Log rounds in *-lessons.md.
- Before merge: `bash scripts/tasks-archive.sh && bash scripts/tasks-index.sh`.
- Never hand-edit src/api/yorkie/v1/*_pb.ts or packages/schema/antlr/*.ts —
  regenerate them. The .proto source of truth is yorkie-team/yorkie.
MSG
