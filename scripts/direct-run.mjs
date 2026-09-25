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

// "Was this module run, or imported?" — for the verify scripts, which are both
// a CLI and a library the test suite imports.
//
// REALPATH BOTH SIDES, which is the whole reason this is a shared function
// rather than three lines inlined in each script. `import.meta.url` is
// resolved through symlinks by the loader; `process.argv[1]` is whatever the
// caller typed. Compared as plain strings, invoking a script through a
// symlinked path — `/tmp/...` on macOS, a link to `/private/tmp` — makes the
// two differ, the CLI block never runs, and the process exits 0 having checked
// nothing. A verify script that silently stops verifying is the exact failure
// these scripts exist to prevent.

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * True iff `moduleUrl` is the entry point of this process.
 *
 * Call as `isDirectRun(import.meta.url)`. When a path cannot be resolved it
 * falls back to the weaker `path.resolve` comparison rather than answering
 * false: false would make a CLI invocation exit 0 having verified nothing.
 */
export function isDirectRun(moduleUrl) {
  if (!process.argv[1]) return false;
  const entry = fileURLToPath(moduleUrl);
  try {
    return realpathSync(process.argv[1]) === realpathSync(entry);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(entry);
  }
}
