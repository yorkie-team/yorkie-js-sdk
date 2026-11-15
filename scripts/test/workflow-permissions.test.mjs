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

// Every workflow names its token's permissions at the top, and grants no write
// there. A workflow without that block hands its jobs the repository's default
// token, which is not something a reader of the file can see. Writes belong on
// the job that needs them, where its steps show why.
//
// It lives here, in the suite `pnpm test:scripts` runs on every pull request,
// rather than in `.github/agent-harness/repo.test.mjs`: the rule is about every
// workflow, not the agent harness, and `ci.yml` has no path filter, so a new
// or edited workflow is always checked. Like `harness-hooks.test.mjs`, its facts
// are about this tree, so it reads the checkout, read-only.
//
// No YAML parser: the root workspace has none of its own to import. A
// top-level key starts in column 0, and the block under it is the indented
// lines that follow, which is all this needs.

import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOWS = path.join(ROOT, '.github/workflows');

/**
 * Returns the workflow-level `permissions:` of `text`: `null` when there is
 * none, the scalar (`{}`, `read-all`, ...) when it is one, or an object of
 * scope to access when it is a block.
 */
function workflowPermissions(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => /^permissions\s*:/.test(line));
  if (at === -1) return null;
  const scalar = lines[at]
    .replace(/^permissions\s*:/, '')
    .replace(/\s+#.*$/, '')
    .trim();
  if (scalar !== '') return scalar;
  const scopes = {};
  for (const line of lines.slice(at + 1)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (!/^\s/.test(line)) break;
    const m = line.match(/^\s+([\w-]+)\s*:\s*([\w-]+)\s*(#.*)?$/);
    assert.ok(m, `unreadable permissions line: ${JSON.stringify(line)}`);
    scopes[m[1]] = m[2];
  }
  return scopes;
}

/** Whether a workflow-level grant gives no write. */
function grantsNoWrite(permissions) {
  if (permissions === '{}' || permissions === 'read-all') return true;
  if (typeof permissions !== 'object' || permissions === null) return false;
  return Object.values(permissions).every((v) => v === 'read' || v === 'none');
}

const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

test('there are workflows to check', () => {
  assert.ok(files.includes('ci.yml'), `found: ${files.join(', ')}`);
});

for (const file of files) {
  test(`${file} declares workflow-level permissions with no write`, () => {
    const text = readFileSync(path.join(WORKFLOWS, file), 'utf8');
    const permissions = workflowPermissions(text);
    assert.notEqual(
      permissions,
      null,
      `${file} has no top-level \`permissions:\`; its jobs would get the ` +
        "repository's default token. Add `permissions: {}` (or `contents: " +
        'read`) and grant each job what its steps need.',
    );
    assert.ok(
      grantsNoWrite(permissions),
      `${file} grants ${JSON.stringify(permissions)} at the top; keep the ` +
        'workflow level read-only and put writes on the job that needs them.',
    );
  });
}

test('the reader handles each form a workflow uses', () => {
  assert.equal(workflowPermissions('on: push\njobs: {}\n'), null);
  assert.equal(workflowPermissions('permissions: {}\njobs:\n'), '{}');
  assert.equal(
    workflowPermissions('permissions: write-all # x\n'),
    'write-all',
  );
  assert.deepEqual(
    workflowPermissions(
      'permissions:\n  # why\n  contents: read # checkout\n\n  id-token: write\njobs:\n  a:\n    permissions:\n      contents: write\n',
    ),
    { contents: 'read', 'id-token': 'write' },
  );
  // A job's own block is indented, so it is not the workflow's.
  assert.equal(
    workflowPermissions(
      'jobs:\n  a:\n    permissions:\n      contents: write\n',
    ),
    null,
  );
  assert.ok(grantsNoWrite('{}'));
  assert.ok(grantsNoWrite({ contents: 'read', actions: 'none' }));
  assert.ok(!grantsNoWrite('write-all'));
  assert.ok(!grantsNoWrite({ contents: 'read', 'id-token': 'write' }));
});
