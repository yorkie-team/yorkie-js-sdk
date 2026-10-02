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

// Tests for the archiver. Each case plants a scratch git repository under the
// OS temp directory; the script is taken from this checkout.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = path.resolve('scripts/tasks-archive.sh');

// One environment for every subprocess: git picks its repository from
// GIT_DIR / GIT_WORK_TREE before it looks at cwd, so an inherited value (a
// hook runs this suite, say) would point both `git()` and the archiver at the
// caller's repository instead of the scratch one.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
);
ENV.GIT_CONFIG_GLOBAL = '/dev/null';
ENV.GIT_CONFIG_NOSYSTEM = '1';

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

function plant(repo, name, body) {
  writeFileSync(path.join(repo, 'docs/tasks/active', name), body);
}

function archive(repo) {
  const r = spawnSync('bash', [SCRIPT, 'docs/tasks'], {
    cwd: repo,
    encoding: 'utf8',
    env: ENV,
  });
  return r;
}

describe('tasks-archive', () => {
  let repo;
  before(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'tasks-archive-'));
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'test');
    mkdirSync(path.join(repo, 'docs/tasks/active'), { recursive: true });
    plant(
      repo,
      '20260901-done-todo.md',
      '# Done\n\n**Created**: 2026-09-01\n\n- [x] a\n',
    );
    plant(repo, '20260901-done-lessons.md', '# Lessons\n');
    plant(
      repo,
      '20260902-open-todo.md',
      '# Open\n\n**Created**: 2026-09-02\n\n- [x] a\n- [ ] b\n',
    );
    // A `- [ ]` quoted inside a sentence is prose, not an open box.
    plant(
      repo,
      '20260903-quoted-todo.md',
      '# Quoted\n\n**Created**: 2026-09-03\n\nThe archiver skips a todo with a `- [ ]` line.\n\n- [x] a\n',
    );
    // The destination is built from this line, which a branch author writes.
    plant(
      repo,
      '20260904-traversal-todo.md',
      '# Bad\n\n**Created**: ../../../../tmp/x\n\n- [x] a\n',
    );
    plant(
      repo,
      '20260905-trailing-todo.md',
      '# Trailing\n\n**Created**: 2026-09-05/../../x\n\n- [x] a\n',
    );
    plant(repo, '20260906-nodate-todo.md', '# No date\n\n- [x] a\n');
    plant(
      repo,
      '20260907-month13-todo.md',
      '# Month 13\n\n**Created**: 2026-13-01\n\n- [x] a\n',
    );
    plant(
      repo,
      '20260908-prefix-todo.md',
      '# Prefix\n\n**Created**: 2026-101\n\n- [x] a\n',
    );
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'base');
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it('moves finished pairs by their Created month and leaves the rest', () => {
    const r = archive(repo);
    assert.equal(r.status, 0, r.stderr);
    const archived = (f) =>
      existsSync(path.join(repo, 'docs/tasks/archive/2026/09', f));
    const active = (f) => existsSync(path.join(repo, 'docs/tasks/active', f));

    assert.ok(archived('20260901-done-todo.md'));
    assert.ok(archived('20260901-done-lessons.md'));
    assert.ok(
      archived('20260903-quoted-todo.md'),
      'a quoted `- [ ]` is not an open box',
    );
    assert.ok(active('20260902-open-todo.md'), 'an unticked box keeps it');
    assert.ok(
      active('20260906-nodate-todo.md'),
      'no Created line: warned about and left',
    );
    assert.ok(
      active('20260907-month13-todo.md'),
      'a month outside 01-12 is not a date',
    );
    assert.ok(!existsSync(path.join(repo, 'docs/tasks/archive/2026/13')));
    assert.ok(active('20260908-prefix-todo.md'), '2026-101 is not 2026-10');
    assert.match(
      r.stderr,
      /cannot parse date from 20260904-traversal-todo\.md|no \*\*Created\*\* line in 20260906/,
    );
  });

  it('builds the destination from the matched date only, never from the line', () => {
    const r = archive(repo);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(
      existsSync(
        path.join(repo, 'docs/tasks/active/20260904-traversal-todo.md'),
      ),
    );
    assert.ok(!existsSync('/tmp/x/20260904-traversal-todo.md'));
    assert.match(
      r.stderr,
      /cannot parse date from 20260904-traversal-todo\.md/,
    );
    // Text after the date is not reachable either.
    assert.ok(
      existsSync(
        path.join(repo, 'docs/tasks/archive/2026/09/20260905-trailing-todo.md'),
      ),
    );
    assert.ok(!existsSync(path.join(repo, 'docs/tasks/archive/2026/09/x')));
  });
});
