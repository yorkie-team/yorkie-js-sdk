/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Report task records that should have left `docs/tasks/active/`.
//
// CLAUDE.md step 5 says a task is archived before its PR merges. The step
// kept being skipped: on 2026-10-02 twelve finished tasks sat in active/,
// and the "Open:" notes their authors left in them -- defects they chose not
// to fix in that branch -- went nowhere, because nobody reads a finished
// todo. This script makes the state visible where the decision is made.
//
// TWO QUESTIONS, one per source of truth:
//
// 1. "Is this PR about to merge a finished task without archiving it?"
//    Read from the diff: an active todo this branch adds or edits, whose
//    boxes are all ticked, is one the branch finished and did not move.
//    Needs only git.
//
// 2. "Is anything in active/ already finished?" Read from GitHub: an active
//    todo whose tracked issue is closed, or whose PR merged, is stale
//    whatever its boxes say. Needs `gh` and network, so it is opt-in
//    (`--remote`), on in CI.
//
// WARN, DON'T FAIL, by default. The archive step belongs at the end of the
// branch, so a todo legitimately sits in active/ for the whole review; a red
// check during review would be noise and get ignored. `--strict` exits 1 on
// a finding and is what the maintainer runs right before merging, when the
// finding is a real blocker.
//
// Under GITHUB_ACTIONS each finding is a `::warning` annotation on the file,
// so it shows up on the PR's Files tab next to the todo itself.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDirectRun } from './direct-run.mjs';

const UNCHECKED = /^\s*- \[ \]/m;
// `#1234`, but not `##` headings or `#N` inside a URL path.
const ISSUE_REF = /(?<![\w/#])#(\d{3,6})\b/g;
// A number that belongs to the server repository, not this one:
// `yorkie #2020`, `yorkie-team/yorkie#2030`, `yorkie#2077`.
const FOREIGN_REF = /yorkie(?:-team\/yorkie)?\s*#\d{3,6}\b/g;
// A number the todo is *for*, as opposed to one it mentions: the keyword
// has to sit right in front of it -- `Tracked as #N`, `Fixes #N`,
// `issue #N`, `PR (#N)`.
const TRACKING_REF =
  /(?:tracked as|fixes|closes|resolves|\bissue|\bpr)\s*:?\s*\(?#(\d{3,6})\b/gi;

/**
 * Active todo files under `tasksDir`, as repo-relative paths.
 */
export function listActiveTodos(tasksDir) {
  const dir = path.join(tasksDir, 'active');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('-todo.md'))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * Whether the todo still has an unticked box.
 */
export function hasOpenBoxes(text) {
  return UNCHECKED.test(text);
}

/**
 * The numbers in this repository a todo refers to, in order of first
 * appearance, with the server repository's numbers left out.
 */
export function issueRefs(text) {
  const seen = new Set();
  for (const m of text.replace(FOREIGN_REF, '').matchAll(ISSUE_REF)) {
    seen.add(Number(m[1]));
  }
  return [...seen];
}

/**
 * The numbers the todo may be tracking, in order of appearance: those a
 * tracking keyword stands right in front of ("Tracked as #N", "Fixes #N",
 * "... PR (#N)"). A number mentioned elsewhere is not a candidate -- a todo
 * that cites another task's PR would otherwise be judged by that PR. The
 * caller takes the first candidate GitHub resolves, because a number that
 * belongs to the server repository (`yorkie #2020` is stripped, `yorkie
 * PR #2020` is not) does not exist here and is skipped that way.
 */
export function trackedRefs(text) {
  const seen = new Set();
  for (const m of text.replace(FOREIGN_REF, '').matchAll(TRACKING_REF)) {
    seen.add(Number(m[1]));
  }
  return [...seen];
}

/**
 * Active todos the branch added or modified, relative to `base`.
 * `run` is injectable for tests; it takes git args and returns stdout.
 */
export function touchedActiveTodos({ tasksDir, base, cwd, run = runGit }) {
  const out = run(
    [
      'diff',
      '--name-only',
      '--diff-filter=AM',
      `${base}...HEAD`,
      '--',
      `${tasksDir}/active/`,
    ],
    cwd,
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('-todo.md'));
}

function runGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
  return r.stdout;
}

/**
 * Looks a number up on GitHub: `{ kind: 'pr'|'issue', state, merged }` or
 * undefined when it cannot be resolved. `repo` is `owner/name`.
 */
export function lookupGitHub(repo, number, exec = spawnSync) {
  const r = exec(
    'gh',
    [
      'api',
      `repos/${repo}/issues/${number}`,
      '--jq',
      '{state: .state, pr: (.pull_request != null), merged: (.pull_request.merged_at != null)}',
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || !r.stdout) return undefined;
  try {
    const j = JSON.parse(r.stdout);
    return { kind: j.pr ? 'pr' : 'issue', state: j.state, merged: j.merged };
  } catch {
    return undefined;
  }
}

/**
 * Runs both checks. Returns `{ findings, notes }`; a finding is an active
 * todo that should have been archived, a note is context that is not a
 * finding on its own (a touched todo that is still in progress).
 */
export function checkTasks({
  tasksDir = 'docs/tasks',
  base,
  remote = false,
  repo = 'yorkie-team/yorkie-js-sdk',
  cwd = process.cwd(),
  run = runGit,
  lookup = lookupGitHub,
} = {}) {
  const findings = [];
  const notes = [];
  const read = (file) => readFileSync(path.join(cwd, file), 'utf8');

  if (base) {
    for (const file of touchedActiveTodos({ tasksDir, base, cwd, run })) {
      if (!existsSync(path.join(cwd, file))) continue;
      if (hasOpenBoxes(read(file))) {
        notes.push({
          file,
          message:
            'in progress; archive it before merging once its boxes are ticked',
        });
      } else {
        findings.push({
          file,
          message:
            'every box is ticked but the todo is still in active/; run `bash scripts/tasks-archive.sh && bash scripts/tasks-index.sh` before merging',
        });
      }
    }
  }

  if (remote) {
    for (const file of listActiveTodos(path.join(cwd, tasksDir)).map((f) =>
      path.relative(cwd, f),
    )) {
      const text = read(file);
      let first;
      let info;
      for (const ref of trackedRefs(text)) {
        info = lookup(repo, ref);
        if (info) {
          first = ref;
          break;
        }
      }
      if (!info) continue;
      const done = info.kind === 'pr' ? info.merged : info.state === 'closed';
      if (!done) continue;
      const boxes = hasOpenBoxes(text)
        ? ' (it still has unticked boxes: tick or drop them, or say why it stays)'
        : '';
      findings.push({
        file,
        message: `tracks #${first}, which is ${info.kind === 'pr' ? 'merged' : 'closed'}, but is still in active/${boxes}`,
      });
    }
  }

  return { findings, notes };
}

/**
 * Prints findings as GitHub annotations under Actions, plain lines
 * otherwise.
 */
export function report({ findings, notes }, out = console) {
  const annotate = !!process.env.GITHUB_ACTIONS;
  for (const n of notes) {
    out.log(
      annotate
        ? `::notice file=${n.file}::${n.message}`
        : `[tasks-check] note: ${n.file}: ${n.message}`,
    );
  }
  for (const f of findings) {
    out.log(
      annotate
        ? `::warning file=${f.file}::${f.message}`
        : `[tasks-check] ${f.file}: ${f.message}`,
    );
  }
  if (findings.length === 0) {
    out.log('[tasks-check] No finished task left in docs/tasks/active/.');
  }
}

function parseArgs(argv) {
  const opts = { remote: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') opts.base = argv[++i];
    else if (a === '--tasks') opts.tasksDir = argv[++i];
    else if (a === '--repo') opts.repo = argv[++i];
    else if (a === '--remote') opts.remote = true;
    else if (a === '--strict') opts.strict = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

if (isDirectRun(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const result = checkTasks(opts);
  report(result);
  if (opts.strict && result.findings.length > 0) process.exit(1);
}
