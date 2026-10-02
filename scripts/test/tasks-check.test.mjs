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
  report,
  trackedRefs,
} from '../tasks-check.mjs';

/**
 * `base` with every GIT_* variable removed. `pnpm test:scripts` runs inside
 * the pre-push hook, and git exports GIT_DIR, GIT_INDEX_FILE and friends into
 * every hook it runs: a fixture that inherits them writes into the
 * developer's real checkout instead of its scratch repository. The quiet one
 * is GIT_INDEX_FILE, which leaves the suite green and the real index
 * corrupt. Stripping by prefix is blunter than a list and cannot drift --
 * same rule as the sibling suite in this directory.
 */
function withoutGitVars(base = process.env) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

/** Environment for a throwaway repository: GIT_DIR pinned, no discovery. */
function fixtureGitEnv(dir, base = process.env) {
  const abs = path.resolve(dir);
  return {
    ...withoutGitVars(base),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_DIR: path.join(abs, '.git'),
    GIT_WORK_TREE: abs,
  };
}

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: fixtureGitEnv(cwd),
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
    assert.equal(hasOpenBoxes('  - [ ] nested\n'), true);
    // Anchored, like tasks-archive.sh's grep: a box quoted mid-sentence is
    // prose. The two rules have to agree, or this check flags a todo the
    // archive script then refuses to move.
    assert.equal(hasOpenBoxes('Write `- [ ]` for an open box.\n'), false);
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
    // `--base ""` is an unset shell variable in the caller's command line.
    // Taking it would leave `base` falsy and turn the diff half off quietly.
    assert.throws(() => parseArgs(['--base', '']), /needs a value/);
    assert.throws(() => parseArgs(['--repo', '']), /needs a value/);
    assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  });

  // Asking for neither half is "nothing was checked", not a pass: the same
  // invariant as an unreachable `gh`, at the one place it used to leak --
  // `--strict` with no selector printed the clean line and exited 0.
  it('reports asking for no check at all as an error, not a clean pass', () => {
    const { findings, notes, errors } = checkTasks({ cwd: repo });
    assert.deepEqual(findings, []);
    assert.deepEqual(notes, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /nothing was checked/);
  });

  it('exits 1 under --strict when neither half was asked for', () => {
    const script = path.resolve('scripts/tasks-check.mjs');
    const env = fixtureGitEnv(repo);
    delete env.GITHUB_ACTIONS;
    const lax = spawnSync('node', [script], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
    assert.equal(lax.status, 0, lax.stderr);
    assert.match(lax.stdout, /error: .*nothing was checked/);
    assert.doesNotMatch(lax.stdout, /No finished task/);
    const strict = spawnSync('node', [script, '--strict'], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
    assert.equal(strict.status, 1, strict.stdout);
    assert.doesNotMatch(strict.stdout, /No finished task/);
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

  // `pnpm test:scripts` runs inside the pre-push hook, where git has exported
  // GIT_DIR and GIT_INDEX_FILE for the real checkout. `cwd` must still decide
  // which repository is diffed, or the check answers about another one.
  it('diffs the repository cwd names, not the one GIT_DIR names', () => {
    const prev = { ...process.env };
    process.env.GIT_DIR = path.resolve('.git');
    process.env.GIT_WORK_TREE = path.resolve('.');
    process.env.GIT_INDEX_FILE = path.resolve('.git/index');
    try {
      const { findings } = checkTasks({ base: 'main', cwd: repo });
      assert.deepEqual(findings.map((f) => f.file).sort(), [
        'docs/tasks/active/20261002-done-todo.md',
        'docs/tasks/active/20261002-port-todo.md',
      ]);
    } finally {
      for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
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
      probeRepo: () => ({ ok: true }),
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
      probeRepo: () => ({ ok: true }),
      lookup: () => undefined,
    });
    assert.deepEqual(findings, []);
    assert.deepEqual(errors, []);
  });

  it('reports an unreachable GitHub as an error, not as a clean pass', () => {
    const { findings, errors } = checkTasks({
      remote: true,
      cwd: repo,
      probeRepo: () => ({ ok: true }),
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
      probeRepo: () => ({ ok: true }),
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
    it('reads only gh\'s own 404 line as "not ours"', () => {
      const exec = (stderr) => () => ({ status: 1, stdout: '', stderr });
      assert.equal(
        lookupGitHub('o/r', 1, exec('gh: Not Found (HTTP 404)')),
        undefined,
      );
      assert.match(
        lookupGitHub('o/r', 1, exec('config file not found')).error,
        /failed/,
      );
      assert.match(
        lookupGitHub('o/r', 1, exec('error connecting to api.github.com'))
          .error,
        /failed/,
      );
    });

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
    const env = fixtureGitEnv(repo);
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

  // The file's headline invariant: a check that could not run is reported as
  // an error, never as a clean pass, and blocks --strict exactly like a
  // finding. Both halves of that, at the report layer and through the CLI.
  it('report: an error suppresses the clean line, in both formats', () => {
    const run = (actions) => {
      const lines = [];
      const prev = process.env.GITHUB_ACTIONS;
      if (actions) process.env.GITHUB_ACTIONS = 'true';
      else delete process.env.GITHUB_ACTIONS;
      try {
        report(
          {
            findings: [],
            notes: [],
            errors: [
              {
                file: 'docs/tasks/active',
                message: 'could not diff against main\nno merge base',
              },
            ],
          },
          { log: (l) => lines.push(l) },
        );
      } finally {
        if (prev === undefined) delete process.env.GITHUB_ACTIONS;
        else process.env.GITHUB_ACTIONS = prev;
      }
      return lines;
    };

    const plain = run(false);
    assert.match(plain[0], /^\[tasks-check\] error: docs\/tasks\/active: /);
    assert.match(plain.join('\n'), /is not a pass/);
    assert.doesNotMatch(plain.join('\n'), /No finished task/);

    const annotated = run(true);
    assert.match(annotated[0], /^::error file=docs\/tasks\/active::could not/);
    // Squashed to one line, so it cannot forge a second workflow command.
    assert.doesNotMatch(annotated[0], /\n/);
    assert.doesNotMatch(annotated.join('\n'), /No finished task/);
  });

  it('exits 1 under --strict on an error alone, with no finding', () => {
    const script = path.resolve('scripts/tasks-check.mjs');
    const env = fixtureGitEnv(repo);
    delete env.GITHUB_ACTIONS;
    // The ref does not exist, so the diff cannot run: nothing is checked and
    // nothing is found. That must not read as a pass.
    const args = [script, '--base', 'no-such-ref'];
    const lax = spawnSync('node', args, { cwd: repo, encoding: 'utf8', env });
    assert.equal(lax.status, 0, lax.stderr);
    assert.match(lax.stdout, /error: .*could not diff against no-such-ref/);
    assert.match(lax.stdout, /is not a pass/);
    assert.doesNotMatch(lax.stdout, /No finished task/);
    const strict = spawnSync('node', [...args, '--strict'], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
    assert.equal(strict.status, 1, strict.stdout);
    assert.doesNotMatch(strict.stdout, /No finished task/);
  });

  it('prints annotations on the file under GITHUB_ACTIONS', () => {
    const script = path.resolve('scripts/tasks-check.mjs');
    const r = spawnSync('node', [script, '--base', 'main'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...fixtureGitEnv(repo), GITHUB_ACTIONS: 'true' },
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

  it('treats a repository gh cannot see as "nothing checked", not as "no findings"', () => {
    const { findings, errors } = checkTasks({
      remote: true,
      cwd: repo,
      probeRepo: () => ({ error: 'gh repos/x/y failed (exit 1): HTTP 404' }),
      lookup: () => {
        throw new Error('must not be called when the repository probe failed');
      },
    });
    assert.deepEqual(findings, []);
    assert.equal(errors.length, 1);
    assert.match(
      errors[0].message,
      /could not reach x?.*GitHub|could not reach/,
    );
  });

  it('keeps the tracking keyword and its number on one line', () => {
    assert.deepEqual(
      trackedRefs('This change fixes\n\n#1500 is unrelated'),
      [],
    );
    assert.deepEqual(trackedRefs('Tracked as #1433'), [1433]);
    assert.deepEqual(
      trackedRefs('prefixes #1500'),
      [],
      'a longer word is not the keyword',
    );
  });

  it('names the missing Created line when the archiver would skip the todo', () => {
    const nodate = path.join(repo, 'docs/tasks/active/20261002-nodate-todo.md');
    writeFileSync(nodate, '# No date\n\n- [x] done\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'nodate');
    try {
      const { findings } = checkTasks({ base: 'main', cwd: repo });
      const f = findings.find((x) => x.file.endsWith('nodate-todo.md'));
      assert.ok(f, 'the finished todo is still reported');
      assert.match(f.message, /no `\*\*Created\*\*: YYYY-MM-DD` line/);
    } finally {
      git(repo, 'reset', '-q', '--hard', 'HEAD~1');
    }
  });
});
