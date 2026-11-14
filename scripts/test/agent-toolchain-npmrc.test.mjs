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

// The agent toolchain action installs dependencies under main's `.npmrc`, and
// it cannot read the root file: an agent job checks out only the action's own
// directory from `main`. So a copy of the root `.npmrc` sits beside the
// action, and this is what keeps the copy equal to the original.
//
// It lives here, in the suite `pnpm test:scripts` runs on every pull request,
// because the other test that compares the two
// (`.github/agent-harness/repo.test.mjs`) runs in a workflow that a change to
// the root `.npmrc` alone does not start. Like `harness-hooks.test.mjs`, its
// facts are about this tree, so it reads the checkout, read-only.

import { lstatSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGINAL = path.join(ROOT, '.npmrc');
const COPY = path.join(ROOT, '.github/actions/agent-toolchain/npmrc');

test('the agent toolchain action carries a copy of the root .npmrc', () => {
  // A regular file, not a link to the original: the copy is checked out
  // without it. `lstat`, because `stat` would follow the link.
  const st = lstatSync(COPY);
  assert.ok(
    st.isFile() && !st.isSymbolicLink(),
    `${path.relative(ROOT, COPY)} must be a regular file`,
  );
  assert.equal(
    readFileSync(COPY, 'utf8'),
    readFileSync(ORIGINAL, 'utf8'),
    '.github/actions/agent-toolchain/npmrc differs from the root .npmrc: ' +
      'copy the root file over it in the same change',
  );
});
