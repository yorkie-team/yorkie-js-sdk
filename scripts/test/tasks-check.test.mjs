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

// Tests for the active-task check. Each case plants a scratch git repository
// under the OS temp directory, so nothing here reads or writes the checkout.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkTasks,
  hasOpenBoxes,
  issueRefs,
  trackedRefs,
} from '../tasks-check.mjs';

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

const todo = (ref, open) =>
  `# A task\n\n**Created**: 2026-10-02\n\nTracked as ${ref}.\n\n## Plan\n\n- [x] done\n${open ? '- [ ] not yet\n' : ''}`;

describe('tasks-check', () => {
  let repo;
  before(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'tasks-check-'));
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'test');
    mkdirSync(path.join(repo, 'docs/tasks/active'), { recursive: true });
    writeFileSync(
      path.join(repo, 'docs/tasks/active/20260901-old-todo.md'),
      todo('#100', false),
    );
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'base');
    git(repo, 'checkout', '-q', '-b', 'topic');
    writeFileSync(
      path.join(repo, 'docs/tasks/active/20261002-done-todo.md'),
      todo('#200', false),
    );
    writeFileSync(
      path.join(repo, 'docs/tasks/active/20261002-wip-todo.md'),
      todo('#300', true),
    );
    // Its first number is a server-repo PR that does not exist here; the PR
    // it opened is named further down, next to the word "PR".
    writeFileSync(
      path.join(repo, 'docs/tasks/active/20261002-port-todo.md'),
      '# Port\n\n**Created**: 2026-10-02\n\nMirror of yorkie #2020 -> #2040.\n\n- [x] Open the PR (#400); green\n',
    );
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'topic');
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it('reads boxes and references', () => {
    assert.equal(hasOpenBoxes('- [x] a\n- [ ] b\n'), true);
    assert.equal(hasOpenBoxes('- [x] a\n'), false);
    assert.deepEqual(
      issueRefs('Fixes #1433, see #1375 and #1433; ## heading; url/pull/1'),
      [1433, 1375],
    );
    // The server repository's numbers are not ours.
    assert.deepEqual(
      issueRefs(
        'Mirror of yorkie #2020 and yorkie-team/yorkie#2030; our #1384',
      ),
      [1384],
    );
    // Tracking-line numbers first, then the rest, each once.
    assert.deepEqual(
      trackedRefs('Ported from #1300.\n\nTracked as #1433.\n\nSee #1375.'),
      [1433],
    );
    // The keyword has to sit next to the number: a passing mention of
    // another task's PR on a line that also says "issue" is not tracking.
    assert.deepEqual(
      trackedRefs('- [x] File the defect #1375 left open as its own issue.'),
      [],
    );
    assert.deepEqual(
      trackedRefs('- [x] Open the Phase 0 PR (#1384); CI green'),
      [1384],
    );
    assert.deepEqual(trackedRefs('Mentions #1500 in passing'), []);
  });

  it('flags a finished todo the branch leaves in active/, and only notes a WIP one', () => {
    const { findings, notes } = checkTasks({ base: 'main', cwd: repo });
    assert.deepEqual(findings.map((f) => f.file).sort(), [
      'docs/tasks/active/20261002-done-todo.md',
      'docs/tasks/active/20261002-port-todo.md',
    ]);
    assert.deepEqual(
      notes.map((n) => n.file),
      ['docs/tasks/active/20261002-wip-todo.md'],
    );
  });

  it('says nothing about a todo the branch did not touch, without --remote', () => {
    const { findings } = checkTasks({ base: 'main', cwd: repo });
    assert.ok(!findings.some((f) => f.file.includes('old-todo')));
  });

  it('with --remote, flags active todos whose issue closed or PR merged', () => {
    const lookup = (_repo, n) =>
      ({
        100: { kind: 'issue', state: 'closed', merged: false },
        200: { kind: 'pr', state: 'open', merged: false },
        300: { kind: 'pr', state: 'closed', merged: true },
        400: { kind: 'pr', state: 'closed', merged: true },
      })[n];
    const { findings } = checkTasks({ remote: true, cwd: repo, lookup });
    const files = findings.map((f) => f.file).sort();
    assert.deepEqual(files, [
      'docs/tasks/active/20260901-old-todo.md',
      'docs/tasks/active/20261002-port-todo.md',
      'docs/tasks/active/20261002-wip-todo.md',
    ]);
    const wip = findings.find((f) => f.file.includes('wip'));
    assert.match(wip.message, /unticked boxes/);
  });

  it('skips a reference it cannot resolve', () => {
    const { findings } = checkTasks({
      remote: true,
      cwd: repo,
      lookup: () => undefined,
    });
    assert.deepEqual(findings, []);
  });

  it('exits 1 only under --strict, and prints plain lines off Actions', () => {
    const script = path.resolve('scripts/tasks-check.mjs');
    // The CLI switches to `::warning` annotations under GITHUB_ACTIONS, so
    // pin the plain format with the variable removed, whatever this test
    // itself runs under.
    const env = { ...process.env };
    delete env.GITHUB_ACTIONS;
    const lax = spawnSync('node', [script, '--base', 'main'], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
    assert.equal(lax.status, 0, lax.stderr);
    assert.match(lax.stdout, /done-todo\.md: every box is ticked/);
    const strict = spawnSync('node', [script, '--base', 'main', '--strict'], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
    assert.equal(strict.status, 1);
  });

  it('prints annotations on the file under GITHUB_ACTIONS', () => {
    const script = path.resolve('scripts/tasks-check.mjs');
    const r = spawnSync('node', [script, '--base', 'main'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'true' },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      r.stdout,
      /^::warning file=docs\/tasks\/active\/20261002-done-todo\.md::every box is ticked/m,
    );
    assert.match(
      r.stdout,
      /^::notice file=docs\/tasks\/active\/20261002-wip-todo\.md::in progress/m,
    );
  });
});
