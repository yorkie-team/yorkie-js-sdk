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
  lookupGitHub,
  parseArgs,
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
    // The shape that produced the real false positive: a live task whose
    // opening paragraph is *about* a merged PR it explicitly does not fix.
    writeFileSync(
      path.join(repo, 'docs/tasks/active/20260901-case-study-todo.md'),
      '# Case study\n\n**Created**: 2026-09-01\n\nPR #500 (fix for #501) is the case study. This task fixes the harness\ndefects behind it. It does not fix #500 itself. See issue #502.\n\n- [ ] Still working on it\n',
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
    // Mentions numbers but declares none, so --remote has nothing to ask
    // about it: the server-repo number is not ours, and "Open the PR (#400)"
    // is a step this task performed, not the number it is tracked by.
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
    // Only a declaration counts, and a number mentioned elsewhere does not.
    assert.deepEqual(
      trackedRefs('Ported from #1300.\n\nTracked as #1433.\n\nSee #1375.'),
      [1433],
    );
    assert.deepEqual(trackedRefs('Fixes #1433; closes (#1375)'), [1433, 1375]);
    assert.deepEqual(
      trackedRefs('- [x] File the defect #1375 left open as its own issue.'),
      [],
    );
    assert.deepEqual(trackedRefs('Mentions #1500 in passing'), []);
    // The two shapes that misfired on this repository's own active todos:
    // a PR named in prose, and a checklist step that opened one. Both would
    // have judged a live task by somebody else's merged PR.
    assert.deepEqual(
      trackedRefs(
        'PR #1426 (fix for #1425) is the case study.\n\nIt does not fix #1426 itself.',
      ),
      [],
    );
    assert.deepEqual(
      trackedRefs('- [x] Open the Phase 0 PR (#1384); CI green'),
      [],
    );
  });

  it('parses arguments and rejects a flag with no value', () => {
    assert.deepEqual(parseArgs(['--base', 'main', '--remote', '--strict']), {
      base: 'main',
      remote: true,
      strict: true,
    });
    assert.throws(() => parseArgs(['--base', '--strict']), /needs a value/);
    assert.throws(() => parseArgs(['--base']), /needs a value/);
    assert.throws(() => parseArgs(['--nope']), /unknown argument/);
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

  it('archives cleanly: a branch that moves its todo out of active/ is clean', () => {
    const moved = mkdtempSync(path.join(os.tmpdir(), 'tasks-check-moved-'));
    try {
      git(moved, 'init', '-q', '-b', 'main');
      git(moved, 'config', 'user.email', 'test@example.com');
      git(moved, 'config', 'user.name', 'test');
      mkdirSync(path.join(moved, 'docs/tasks/active'), { recursive: true });
      writeFileSync(
        path.join(moved, 'docs/tasks/active/20261002-a-todo.md'),
        todo('#700', true),
      );
      git(moved, 'add', '-A');
      git(moved, 'commit', '-q', '-m', 'base');
      git(moved, 'checkout', '-q', '-b', 'topic');
      mkdirSync(path.join(moved, 'docs/tasks/archive/2026/10'), {
        recursive: true,
      });
      git(
        moved,
        'mv',
        'docs/tasks/active/20261002-a-todo.md',
        'docs/tasks/archive/2026/10/20261002-a-todo.md',
      );
      git(moved, 'commit', '-q', '-m', 'archive it');
      const { findings, notes, errors } = checkTasks({
        base: 'main',
        cwd: moved,
      });
      assert.deepEqual(findings, []);
      assert.deepEqual(notes, []);
      assert.deepEqual(errors, []);
    } finally {
      rmSync(moved, { recursive: true, force: true });
    }
  });

  it('with --remote, flags active todos whose issue closed or PR merged', () => {
    const lookup = (_repo, n) =>
      ({
        100: { kind: 'issue', state: 'closed', merged: false },
        200: { kind: 'pr', state: 'open', merged: false },
        300: { kind: 'pr', state: 'closed', merged: true },
        // Mentioned by the port and case-study todos, but declared by
        // neither, so it is never asked about.
        400: { kind: 'pr', state: 'closed', merged: true },
        500: { kind: 'pr', state: 'closed', merged: true },
      })[n];
    const { findings, errors } = checkTasks({
      remote: true,
      cwd: repo,
      lookup,
    });
    const files = findings.map((f) => f.file).sort();
    assert.deepEqual(files, [
      'docs/tasks/active/20260901-old-todo.md',
      'docs/tasks/active/20261002-wip-todo.md',
    ]);
    assert.deepEqual(errors, []);
    const wip = findings.find((f) => f.file.includes('wip'));
    assert.match(wip.message, /unticked boxes/);
  });

  it('skips a reference GitHub answers "no such number" for', () => {
    const { findings, errors } = checkTasks({
      remote: true,
      cwd: repo,
      lookup: () => undefined,
    });
    assert.deepEqual(findings, []);
    assert.deepEqual(errors, []);
  });

  it('reports an unreachable GitHub as an error, not as a clean pass', () => {
    const { findings, errors } = checkTasks({
      remote: true,
      cwd: repo,
      lookup: () => ({ error: 'gh could not be run: spawn gh ENOENT' }),
    });
    assert.deepEqual(findings, []);
    // Every todo that declares a number is unchecked, and says so.
    assert.deepEqual(errors.map((e) => e.file).sort(), [
      'docs/tasks/active/20260901-old-todo.md',
      'docs/tasks/active/20261002-done-todo.md',
      'docs/tasks/active/20261002-wip-todo.md',
    ]);
    assert.match(errors[0].message, /was not checked.*ENOENT/);
  });

  it('reports a diff that could not run as an error, and still runs --remote', () => {
    const { findings, errors } = checkTasks({
      base: 'no-such-ref',
      remote: true,
      cwd: repo,
      run: () => {
        throw new Error('git diff failed:\nno merge base');
      },
      lookup: (_r, n) =>
        n === 100
          ? { kind: 'issue', state: 'closed', merged: false }
          : undefined,
    });
    assert.deepEqual(
      findings.map((f) => f.file),
      ['docs/tasks/active/20260901-old-todo.md'],
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /could not diff against no-such-ref/);
    // The message is one line, so it cannot forge a workflow command.
    assert.doesNotMatch(errors[0].message, /\n/);
  });

  describe('lookupGitHub', () => {
    const call = (result) => {
      const seen = [];
      const exec = (cmd, args, opts) => {
        seen.push({ cmd, args, opts });
        if (result instanceof Error) throw result;
        return result;
      };
      return { out: lookupGitHub('o/r', 1234, exec), seen };
    };

    it('asks gh for the right thing', () => {
      const { seen } = call({ status: 0, stdout: '{"state":"open"}' });
      assert.equal(seen.length, 1);
      assert.equal(seen[0].cmd, 'gh');
      assert.deepEqual(seen[0].args.slice(0, 3), [
        'api',
        'repos/o/r/issues/1234',
        '--jq',
      ]);
      assert.match(seen[0].args[3], /pull_request/);
      assert.equal(seen[0].opts.encoding, 'utf8');
    });

    it('reads a merged PR and an open issue', () => {
      assert.deepEqual(
        call({
          status: 0,
          stdout: '{"state":"closed","pr":true,"merged":true}\n',
        }).out,
        { kind: 'pr', state: 'closed', merged: true },
      );
      assert.deepEqual(
        call({
          status: 0,
          stdout: '{"state":"open","pr":false,"merged":false}\n',
        }).out,
        { kind: 'issue', state: 'open', merged: false },
      );
    });

    it('treats a 404 as an answer: the number is not ours', () => {
      assert.equal(
        call({ status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' }).out,
        undefined,
      );
    });

    for (const [name, result] of [
      ['gh is missing', new Error('spawn gh ENOENT')],
      ['gh cannot be spawned', { error: new Error('EACCES'), status: null }],
      [
        'the credential is rejected',
        { status: 1, stdout: '', stderr: 'gh: Bad credentials (HTTP 401)' },
      ],
      [
        'the API is rate limited',
        {
          status: 1,
          stdout: '',
          stderr: 'gh: API rate limit exceeded (HTTP 403)',
        },
      ],
      [
        'the network is down',
        { status: 1, stdout: '', stderr: 'dial tcp: lookup api.github.com' },
      ],
      ['gh exits 0 saying nothing', { status: 0, stdout: '' }],
      ['the output is not JSON', { status: 0, stdout: 'not json' }],
    ]) {
      it(`refuses to answer when ${name}`, () => {
        const { out } = call(result);
        assert.ok(out?.error, `expected an error, got ${JSON.stringify(out)}`);
        assert.equal(out.kind, undefined);
      });
    }
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
