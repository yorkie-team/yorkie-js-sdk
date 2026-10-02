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
//    whatever its boxes say. Needs an authenticated `gh` and network, so it
//    is opt-in (`--remote`), and it belongs on the maintainer's machine
//    rather than in CI: the CI step executes the pull request's OWN copy of
//    this file, so a token in that step's environment is a token handed to
//    branch-authored code, on a workflow any fork PR can trigger.
//
//    (The CI step did pass `--remote` with a token at first, on a shallow
//    clone; both were taken out once a human with `workflow` scope could
//    touch ci.yml.)
//
// WARN, DON'T FAIL, by default. The archive step belongs at the end of the
// branch, so a todo legitimately sits in active/ for the whole review; a red
// check during review would be noise and get ignored. `--strict` exits 1 on
// a finding and is what the maintainer runs right before merging, when the
// finding is a real blocker.
//
// NEVER FAIL OPEN. Both halves can be prevented from running at all -- a
// shallow clone with no merge base, a `gh` that is missing, unauthenticated
// or rate-limited, or neither half being asked for in the first place. That
// is not "nothing to report": it is "nothing was checked", so it is collected
// as an `error`, printed, and under `--strict` it exits 1 exactly like a
// finding would. A green line here has to mean the check ran.
//
// Under GITHUB_ACTIONS each finding is a `::warning` annotation on the file,
// so it shows up on the PR's Files tab next to the todo itself.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDirectRun } from './direct-run.mjs';

// "Still open" has to mean the same thing here and in the archiver, or this
// check reports a todo as finished that `scripts/tasks-archive.sh` then
// refuses to move -- a blocker whose prescribed fix cannot clear it. Both
// anchor the box to the start of a line, so a `- [ ]` quoted mid-sentence is
// prose in both; keep them in step (tasks-archive.sh's `grep -qE`).
const UNCHECKED = /^[ \t]*- \[ \]/m;
// `#1234`, but not `##` headings or `#N` inside a URL path.
const ISSUE_REF = /(?<![\w/#])#(\d{3,6})\b/g;
// A number that belongs to the server repository, not this one:
// `yorkie #2020`, `yorkie-team/yorkie#2030`, `yorkie#2077`.
const FOREIGN_REF = /yorkie(?:-team\/yorkie)?\s*#\d{3,6}\b/g;
// A number the todo *declares* it is for, as opposed to one it mentions:
// `Tracked as #N`, `Tracked by #N`, `Fixes #N`, `Closes #N`, `Resolves #N`.
//
// Only a declaration counts. The looser `PR #N` / `issue #N` keywords were
// tried first and withdrawn: they matched prose and checklist lines about
// *other* tasks' numbers, and all three occurrences in this repository's own
// active/ were false ones -- "PR #1426 ... is the case study" on a todo that
// then says "It does not fix #1426 itself", and "- [x] Open the Phase 0 PR
// (#1384)". Each would have judged a live task by a merged PR, under the
// `--strict` run that blocks a merge.
// `[ \t]*`, not `\s*`: the keyword and the number have to sit on one line, or
// a paragraph ending in "fixes" would claim the number opening the next.
const TRACKING_REF =
  /\b(?:tracked as|tracked by|fixes|closes|resolves)[ \t]*:?[ \t]*\(?#(\d{3,6})\b/gi;
// The `**Created**: YYYY-MM-DD` line `tasks-archive.sh` buckets by. A todo
// without one is skipped by the archiver, so the checker has to say so, or
// its finding is one the prescribed fix cannot clear.
// Same boundary as the archiver's `([^0-9]|$)` and month range, so the two
// agree on `2026-101` (rejected) as they do on `2026-10-02`.
const CREATED_LINE = /^\*\*Created\*\*:[ \t]*\d{4}-(?:0[1-9]|1[0-2])(?!\d)/m;

/** Annotation-safe: `::warning file=X::Y` is terminated by a newline. */
function oneLine(s) {
  // eslint-disable-next-line no-control-regex
  const CONTROL = /[\u0000-\u001f\u007f]+/g;
  return String(s).replace(CONTROL, ' ').trim();
}

/**
 * Active todo files under `tasksDir`, as repo-relative paths.
 *
 * An absent directory is an empty list HERE and an `error` in `checkTasks`,
 * which refuses to run either half without it: "no todos" and "no directory to
 * read todos from" are the same empty list, and only the caller knows that the
 * second one must not read as a pass.
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
 * The numbers the todo declares it is tracking, in order of appearance:
 * those a closing keyword stands right in front of ("Tracked as #N",
 * "Fixes #N"). A number merely mentioned -- in prose, in a checklist line,
 * next to the word "PR" -- is not a candidate, because a todo that cites
 * another task's number would otherwise be judged by that task. A todo that
 * declares nothing is simply not checked against GitHub.
 *
 * The caller takes the first candidate GitHub resolves, because a number
 * that belongs to the server repository (`yorkie #2020` is stripped,
 * `yorkie-team/yorkie fixes #2020` is not) does not exist here and is
 * skipped that way.
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

/**
 * `process.env` with every GIT_* variable removed, so `cwd` is what decides
 * which repository git reads. It otherwise is not: git exports GIT_DIR and
 * friends into every hook it runs, and this script is reachable from one, so
 * an inherited GIT_DIR would have it diff a different repository than the one
 * it was pointed at -- and answer confidently about it.
 */
function gitEnv(base = process.env) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

function runGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv() });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
  return r.stdout;
}

/**
 * Looks a number up on GitHub. Three outcomes, which the caller must keep
 * apart:
 *
 * - `{ kind: 'pr'|'issue', state, merged }` -- answered.
 * - `undefined` -- answered with "no such number in this repository" (HTTP
 *   404). The todo cites something that is not ours; skip it.
 * - `{ error }` -- NOT answered: `gh` is missing, unauthenticated, rate
 *   limited, the network is down, the output did not parse. Nothing is known
 *   about this number, and treating that as a skip is how a `--strict` run
 *   reports a clean pass having checked nothing.
 *
 * `repo` is `owner/name`. `exec` is injectable for tests.
 */
export function lookupGitHub(repo, number, exec = spawnSync) {
  const api = `repos/${repo}/issues/${number}`;
  let r;
  try {
    r = exec(
      'gh',
      [
        'api',
        api,
        '--jq',
        '{state: .state, pr: (.pull_request != null), merged: (.pull_request.merged_at != null)}',
      ],
      { encoding: 'utf8' },
    );
  } catch (err) {
    return { error: `gh could not be run: ${err.message}` };
  }
  // spawnSync reports a failure to launch in `.error`, not by throwing.
  if (!r || r.error) {
    return {
      error: `gh could not be run: ${r?.error?.message ?? 'no result'}`,
    };
  }
  if (r.status === 0) {
    try {
      const j = JSON.parse(r.stdout);
      return {
        kind: j.pr ? 'pr' : 'issue',
        state: j.state,
        merged: !!j.merged,
      };
    } catch {
      return { error: `gh ${api} returned output that is not JSON` };
    }
  }
  const stderr = String(r.stderr ?? '');
  // Only gh's own 404 line says "no such number"; any other failure that
  // happens to mention "not found" is an error, or --strict would read it as
  // a skip and pass.
  if (/\(HTTP 404\)/.test(stderr)) return undefined;
  return {
    error: `gh ${api} failed (exit ${r.status}): ${oneLine(stderr) || 'no stderr'}`,
  };
}

/**
 * `lookupRepo` asks GitHub whether `repo` is visible to this `gh` at all.
 * `{ ok: true }`, or `{ error }` naming why not (404 included: a repository
 * this token cannot see is indistinguishable from a wrong name, and either
 * way nothing below can be trusted).
 */
export function lookupRepo(repo, exec = spawnSync) {
  let r;
  try {
    r = exec('gh', ['api', `repos/${repo}`, '--jq', '.full_name'], {
      encoding: 'utf8',
    });
  } catch (err) {
    return { error: `gh could not be run: ${err.message}` };
  }
  if (!r || r.error) {
    return {
      error: `gh could not be run: ${r?.error?.message ?? 'no result'}`,
    };
  }
  if (r.status !== 0) {
    return {
      error: `gh repos/${repo} failed (exit ${r.status}): ${oneLine(r.stderr ?? '') || 'no stderr'}`,
    };
  }
  return { ok: true };
}

/**
 * Runs both checks. Returns `{ findings, notes, errors }`; a finding is an
 * active todo that should have been archived, a note is context that is not
 * a finding on its own (a touched todo that is still in progress), and an
 * error is a check that could not run at all. Errors are never silent: they
 * suppress the clean line and fail a `--strict` run, so "no findings" cannot
 * mean "nothing was looked at".
 */
export function checkTasks({
  tasksDir = 'docs/tasks',
  base,
  remote = false,
  repo = 'yorkie-team/yorkie-js-sdk',
  cwd = process.cwd(),
  run = runGit,
  lookup = lookupGitHub,
  probeRepo = lookupRepo,
} = {}) {
  const findings = [];
  const notes = [];
  const errors = [];
  const read = (file) => readFileSync(path.join(cwd, file), 'utf8');

  // Neither half was asked for, so neither ran. That is the same "nothing was
  // checked" as an unreachable `gh`, and it has to read the same way: without
  // this, `tasks-check.mjs --strict` prints the clean line and exits 0 having
  // looked at nothing, which is exactly the pass a pre-merge gate must not
  // give.
  if (!base && !remote) {
    errors.push({
      file: `${tasksDir}/active`,
      message:
        'nothing was checked: pass --base <ref> to check this branch against its base, --remote to check active todos against GitHub, or both',
    });
  }

  // The directory both halves read is missing, so neither can answer anything
  // about it -- `listActiveTodos` enumerates nothing and the diff half's
  // pathspec matches nothing, and an empty list is indistinguishable from "all
  // clear". A mistyped `--tasks`, a run from the wrong directory, and a branch
  // that deletes or renames `active/` all land here, and all three would
  // otherwise print the green line and pass `--strict`. The directory is
  // tracked (it carries a README), so on a real checkout it is always there:
  // absent means the question was asked of the wrong tree.
  const active = path.join(cwd, tasksDir, 'active');
  const haveActive = existsSync(active);
  if (!haveActive) {
    errors.push({
      file: `${tasksDir}/active`,
      message: `nothing was checked: ${tasksDir}/active does not exist under ${cwd}; run from the repository root, or point --tasks at the task records`,
    });
  }

  if (base && haveActive) {
    // A shallow clone with no merge base makes `git diff base...HEAD` fail.
    // Record that and carry on, so the failure is reported and the remote
    // half still runs instead of dying with the exception.
    let touched = [];
    try {
      touched = touchedActiveTodos({ tasksDir, base, cwd, run });
    } catch (err) {
      errors.push({
        file: `${tasksDir}/active`,
        message: `could not diff against ${base}, so no todo was checked against this branch: ${oneLine(err.message)}`,
      });
    }
    for (const file of touched) {
      if (!existsSync(path.join(cwd, file))) continue;
      if (hasOpenBoxes(read(file))) {
        notes.push({
          file,
          message:
            'in progress; archive it before merging once its boxes are ticked',
        });
      } else if (!CREATED_LINE.test(read(file))) {
        findings.push({
          file,
          message:
            'every box is ticked but the todo is still in active/, and it has no `**Created**: YYYY-MM-DD` line, so `tasks-archive.sh` will skip it; add the line, then archive',
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

  if (remote && haveActive) {
    // A wrong --repo or a token that cannot see the repository makes every
    // issue lookup a 404, which the loop below reads as "not our number" --
    // a clean pass having checked nothing. Ask about the repository first.
    const probe = probeRepo(repo);
    if (probe?.error) {
      errors.push({
        file: `${tasksDir}/active`,
        message: `could not reach ${repo} on GitHub, so no todo was checked against it: ${oneLine(probe.error)}`,
      });
    }
    for (const file of probe?.error
      ? []
      : listActiveTodos(path.join(cwd, tasksDir)).map((f) =>
          path.relative(cwd, f),
        )) {
      const text = read(file);
      let first;
      let info;
      for (const ref of trackedRefs(text)) {
        const got = lookup(repo, ref);
        if (got?.error) {
          errors.push({
            file,
            message: `could not resolve #${ref} on GitHub, so this todo was not checked: ${oneLine(got.error)}`,
          });
          info = undefined;
          break;
        }
        if (got) {
          info = got;
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

  return { findings, notes, errors };
}

/**
 * Prints findings as GitHub annotations under Actions, plain lines
 * otherwise. A path or message is squashed to one line first: both sides of
 * a `::warning file=X::Y` are newline-terminated, and both can carry
 * branch-supplied text.
 */
export function report({ findings, notes, errors = [] }, out = console) {
  const annotate = !!process.env.GITHUB_ACTIONS;
  const emit = (level, prefix, items) => {
    for (const i of items) {
      out.log(
        annotate
          ? `::${level} file=${oneLine(i.file)}::${oneLine(i.message)}`
          : `[tasks-check] ${prefix}${oneLine(i.file)}: ${oneLine(i.message)}`,
      );
    }
  };
  emit('notice', 'note: ', notes);
  emit('warning', '', findings);
  emit('error', 'error: ', errors);
  if (errors.length > 0) {
    out.log(
      '[tasks-check] The check could not complete; the result above is not a pass.',
    );
  } else if (findings.length === 0) {
    out.log('[tasks-check] No finished task left in docs/tasks/active/.');
  }
}

export function parseArgs(argv) {
  const opts = { remote: false, strict: false };
  const value = (name, v) => {
    // An empty value is rejected rather than taken: `--base ""` (an unset
    // shell variable in a caller's command line) is otherwise accepted and
    // then falsy, which silently turns the half it names off.
    if (v === undefined || v === '' || v.startsWith('--')) {
      throw new Error(`${name} needs a value`);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') opts.base = value(a, argv[++i]);
    else if (a === '--tasks') opts.tasksDir = value(a, argv[++i]);
    else if (a === '--repo') opts.repo = value(a, argv[++i]);
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
  // An error fails --strict as hard as a finding does: the maintainer's
  // pre-merge gate must not pass on a check that did not run.
  const blocking = result.findings.length + result.errors.length;
  if (opts.strict && blocking > 0) process.exit(1);
}
