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

// Assert every first-party source file carries the Apache 2.0 header.
//
// The header is the convention in every package, and until this existed
// nothing checked it. It had drifted: 58 files carried none when this was
// written — all of `packages/prosemirror`, a run of sdk tests, two sdk
// sources, and the scripts themselves. A convention with no lane behind it
// looks like that.
//
// WHAT IS SCANNED. The source a package ships and the tests that pin it:
// `packages/<pkg>/src` and `packages/<pkg>/test`, plus `scripts/`. Not
// `examples/` — those are sample apps people copy out, not the library — and
// not per-package build configs (`vite.config.ts` and friends), which carry
// no code anybody depends on. Generated protobuf (`*_pb.ts`) IS in scope:
// `buf generate` reproduces the header from the .proto, so it passes today,
// and a plugin change that dropped it is exactly the case worth catching.
//
// WHAT IT MATCHES. One line: the Apache grant clause. Not the copyright year,
// not the comment style. A file that has the clause has the header.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectRun } from './direct-run.mjs';

const PREFIX = '[verify:license]';

/** The grant clause, as it appears in every headered file in the tree. */
export const LICENSE_CLAUSE = 'Licensed under the Apache License, Version 2.0';

/**
 * How far into a file the header may start. Generated files open with a tool
 * banner, and a shebang or triple-slash directive can precede it; 40 lines
 * clears those without letting the clause hide in the body of a file.
 */
export const HEADER_SCAN_LINES = 40;

/** Source extensions checked. */
export const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.sh',
];

/** Per-package directories holding first-party code. */
export const PACKAGE_DIRS = ['src', 'test'];

/**
 * Directories never descended into, at any depth: other people's code and
 * build output.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'coverage']);

/**
 * The directories to walk under `root`: each package's `src`/`test`, and
 * `scripts`. Only the ones that exist — a package without tests is normal.
 */
export function scanRoots(root) {
  const roots = [];
  const errors = [];
  const packages = path.join(root, 'packages');
  let entries = [];
  try {
    entries = readdirSync(packages, { withFileTypes: true });
  } catch (err) {
    // Absent is fine — a tree with nothing at all is caught as "scanned
    // nothing". Present but unreadable is a gap, and has to say so, or a
    // readable scripts/ turns it into a green run.
    if (err.code !== 'ENOENT') {
      errors.push(`packages could not be listed (${err.code ?? err.message})`);
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const dir of PACKAGE_DIRS) {
      const candidate = path.join(packages, entry.name, dir);
      if (safeIsDirectory(candidate)) roots.push(candidate);
    }
  }
  const scripts = path.join(root, 'scripts');
  if (safeIsDirectory(scripts)) roots.push(scripts);
  return { roots, errors };
}

/**
 * Every source file in scope as paths relative to `root`, sorted, plus the
 * directories that could not be listed.
 *
 * THE ERRORS ARE RETURNED, NOT SWALLOWED. An unreadable directory skipped
 * with a bare `return` would leave its files unexamined while the rest pass
 * and the run reports success — a silent pass one directory down.
 */
export function sourceFiles(root) {
  const files = [];
  const errors = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const rel = path.relative(root, dir) || '.';
      errors.push(`${rel} could not be listed (${err.code ?? err.message})`);
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(abs);
      } else if (
        entry.isFile() &&
        SOURCE_EXTENSIONS.includes(path.extname(entry.name))
      ) {
        files.push(path.relative(root, abs));
      }
    }
  };
  const scan = scanRoots(root);
  errors.push(...scan.errors);
  for (const dir of scan.roots) walk(dir);
  files.sort();
  return { files, errors };
}

function safeIsDirectory(target) {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** A line that is part of a comment in any of the scanned languages. */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#)/;

/**
 * True iff the file opens with the Apache grant clause in a comment. A
 * string literal that quotes the clause — this file has one — is not a
 * header.
 */
export function hasLicenseHeader(content) {
  return content
    .split('\n', HEADER_SCAN_LINES)
    .some((line) => COMMENT_LINE.test(line) && line.includes(LICENSE_CLAUSE));
}

/**
 * One finding per source file missing the header. Pure over a directory, so
 * the suite can plant a tree and never touch this repository.
 *
 * SCANNING NOTHING IS A FINDING, not a pass. A wrong root walks a tree with
 * no source in it, reports zero missing headers and exits 0 — a green check
 * with no coverage.
 */
export function collectFindings(repoRoot) {
  const { files, errors } = sourceFiles(repoRoot);
  if (files.length === 0 && errors.length === 0) {
    return [
      `no source files found under ${repoRoot} — this check scanned nothing`,
    ];
  }
  const findings = [...errors];
  for (const rel of files) {
    let content;
    try {
      content = readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch (err) {
      // A gap in the scan, not a file without a header. Say which.
      findings.push(`${rel} could not be read (${err.code ?? err.message})`);
      continue;
    }
    if (!hasLicenseHeader(content)) {
      findings.push(`${rel} has no Apache 2.0 header`);
    }
  }
  return findings;
}

if (isDirectRun(import.meta.url)) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const checked = sourceFiles(repoRoot);
  const findings = collectFindings(repoRoot);
  if (findings.length === 0) {
    // The count is in the success line on purpose: "every source file" is
    // true of a tree with none, and the number makes a collapsed scan visible.
    console.log(
      `${PREFIX} Every source file (${checked.files.length}) carries the Apache 2.0 header.`,
    );
  } else {
    for (const finding of findings) console.log(`${PREFIX}   ${finding}`);
    console.log(`${PREFIX} ${findings.length} file(s) missing the header.`);
    process.exit(1);
  }
}
