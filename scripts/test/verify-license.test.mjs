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

// Tests for the licence header gate. Every case plants its tree under the OS
// temp directory, as `verify-doc-links.test.mjs` does, so nothing here can
// touch the checkout it runs from.

import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import {
  collectFindings,
  hasLicenseHeader,
  HEADER_SCAN_LINES,
  LICENSE_CLAUSE,
  sourceFiles,
} from '../verify-license.mjs';

const SCRIPT = fileURLToPath(new URL('../verify-license.mjs', import.meta.url));

const BLOCK_HEADER = `/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
 *
 * ${LICENSE_CLAUSE} (the "License");
 */

export {};
`;

const LINE_HEADER = `// Copyright 2026 The Yorkie Authors
//
// ${LICENSE_CLAUSE} (the "License");

export {};
`;

function withTree(files, body) {
  const root = mkdtempSync(path.join(tmpdir(), 'verify-license-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = path.join(root, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, contents);
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('both header comment styles satisfy the gate', () => {
  assert.equal(hasLicenseHeader(BLOCK_HEADER), true);
  assert.equal(hasLicenseHeader(LINE_HEADER), true);
});

test('a source file with no header is a finding', () => {
  withTree({ 'packages/sdk/src/a.ts': 'export {};\n' }, (root) =>
    assert.deepEqual(collectFindings(root), [
      'packages/sdk/src/a.ts has no Apache 2.0 header',
    ]),
  );
});

test('src, test and scripts are scanned; every source extension counts', () => {
  withTree(
    {
      'packages/sdk/src/a.ts': 'x',
      'packages/react/src/b.tsx': 'x',
      'packages/sdk/test/c_test.ts': 'x',
      'scripts/d.mjs': 'x',
      'scripts/test/e.test.mjs': 'x',
      'packages/sdk/src/ok.ts': BLOCK_HEADER,
    },
    (root) =>
      assert.deepEqual(collectFindings(root), [
        'packages/react/src/b.tsx has no Apache 2.0 header',
        'packages/sdk/src/a.ts has no Apache 2.0 header',
        'packages/sdk/test/c_test.ts has no Apache 2.0 header',
        'scripts/d.mjs has no Apache 2.0 header',
        'scripts/test/e.test.mjs has no Apache 2.0 header',
      ]),
  );
});

test('examples, build configs and non-source files are out of scope', () => {
  withTree(
    {
      'examples/app/src/main.ts': 'x',
      'packages/sdk/vite.config.ts': 'x',
      'packages/schema/antlr/Gen.ts': 'x',
      'packages/sdk/src/notes.md': 'x',
      'packages/sdk/src/ok.ts': BLOCK_HEADER,
    },
    (root) => {
      assert.deepEqual(sourceFiles(root).files, ['packages/sdk/src/ok.ts']);
      assert.deepEqual(collectFindings(root), []);
    },
  );
});

test('build output and node_modules are skipped at any depth', () => {
  withTree(
    {
      'packages/sdk/src/node_modules/x.ts': 'x',
      'packages/sdk/test/dist/y.js': 'x',
      'packages/sdk/src/lib/z.ts': 'x',
      'packages/sdk/src/ok.ts': LINE_HEADER,
    },
    (root) =>
      assert.deepEqual(sourceFiles(root).files, ['packages/sdk/src/ok.ts']),
  );
});

test('the clause is found past a shebang and a banner', () => {
  const banner = '#!/usr/bin/env node\n' + '// generated\n'.repeat(5);
  withTree({ 'scripts/run.mjs': banner + LINE_HEADER }, (root) =>
    assert.deepEqual(collectFindings(root), []),
  );
});

test('the clause is not accepted past the scan window', () => {
  const filler = '// padding\n'.repeat(HEADER_SCAN_LINES + 5);
  withTree(
    { 'packages/sdk/src/late.ts': `${filler}// ${LICENSE_CLAUSE}\n` },
    (root) =>
      assert.deepEqual(collectFindings(root), [
        'packages/sdk/src/late.ts has no Apache 2.0 header',
      ]),
  );
});

test('a tree with no source is a finding, not a silent pass', () => {
  withTree({ 'docs/notes.md': 'no source here' }, (root) =>
    assert.match(collectFindings(root)[0], /scanned nothing/),
  );
});

test('an unlistable directory is a finding, not a gap in a green run', () => {
  withTree(
    {
      'packages/sdk/src/ok.ts': LINE_HEADER,
      'packages/sdk/src/locked/hidden.ts': 'x',
    },
    (root) => {
      const locked = path.join(root, 'packages/sdk/src/locked');
      chmodSync(locked, 0o000);
      try {
        const { files } = sourceFiles(root);
        if (files.includes('packages/sdk/src/locked/hidden.ts')) return; // root
        const findings = collectFindings(root);
        assert.equal(findings.length, 1, `got ${findings}`);
        assert.match(
          findings[0],
          /^packages\/sdk\/src\/locked could not be listed/,
        );
      } finally {
        chmodSync(locked, 0o755);
      }
    },
  );
});

/**
 * Run the CLI against a planted tree. The script resolves its root from its
 * own location, so a copy is planted at `<tree>/scripts/`.
 */
function runCliIn(root, { throughSymlink = false } = {}) {
  const scripts = path.join(root, 'scripts');
  mkdirSync(scripts, { recursive: true });
  copyFileSync(SCRIPT, path.join(scripts, 'verify-license.mjs'));
  copyFileSync(
    fileURLToPath(new URL('../direct-run.mjs', import.meta.url)),
    path.join(scripts, 'direct-run.mjs'),
  );
  let entry = path.join(scripts, 'verify-license.mjs');
  if (throughSymlink) {
    const link = path.join(root, 'link-to-scripts');
    symlinkSync(scripts, link, 'dir');
    entry = path.join(link, 'verify-license.mjs');
  }
  return spawnSync(process.execPath, [entry], { encoding: 'utf8' });
}

test('the CLI exits 1 and names each file when a header is missing', () => {
  // The planted copies of the script carry the header, so only a.ts fails.
  withTree(
    { 'packages/sdk/src/a.ts': 'x', 'packages/sdk/src/ok.ts': LINE_HEADER },
    (root) => {
      const r = runCliIn(root);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /packages\/sdk\/src\/a\.ts has no Apache 2\.0/);
      assert.match(r.stdout, /1 file\(s\) missing the header/);
    },
  );
});

test('the CLI runs when invoked through a symlinked path', () => {
  // Explicit symlink: on Linux /tmp is a real directory, so relying on the
  // macOS /tmp link would test nothing where this actually runs.
  withTree({ 'packages/sdk/src/a.ts': 'x' }, (root) => {
    const r = runCliIn(root, { throughSymlink: true });
    assert.equal(r.status, 1, `the CLI did not run: ${r.stdout}`);
  });
});

test('the CLI reports the count it checked in this repository', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = r.stdout.match(/Every source file \((\d+)\) carries/);
  assert.ok(m, `no count in the success line: ${r.stdout}`);
  assert.ok(Number(m[1]) > 100, `implausibly few files scanned: ${m[1]}`);
});

test('shell scripts under scripts/ need the header too', () => {
  withTree(
    {
      'scripts/setup.sh': '#!/usr/bin/env bash\necho hi\n',
      'scripts/ok.sh': `#!/usr/bin/env bash\n# ${LICENSE_CLAUSE}\n`,
    },
    (root) =>
      assert.deepEqual(collectFindings(root), [
        'scripts/setup.sh has no Apache 2.0 header',
      ]),
  );
});

test('the clause in code rather than a comment is not a header', () => {
  withTree(
    {
      'packages/sdk/src/a.ts': `export const clause = '${LICENSE_CLAUSE}';\n`,
    },
    (root) =>
      assert.deepEqual(collectFindings(root), [
        'packages/sdk/src/a.ts has no Apache 2.0 header',
      ]),
  );
});

test('an unlistable packages/ is a finding even when scripts/ is fine', () => {
  withTree(
    {
      'packages/sdk/src/a.ts': LINE_HEADER,
      'scripts/b.mjs': LINE_HEADER,
    },
    (root) => {
      const packages = path.join(root, 'packages');
      chmodSync(packages, 0o000);
      try {
        const findings = collectFindings(root);
        if (sourceFiles(root).files.includes('packages/sdk/src/a.ts')) return; // root
        assert.ok(
          findings.some((f) => /^packages could not be listed/.test(f)),
          `got ${findings}`,
        );
      } finally {
        chmodSync(packages, 0o755);
      }
    },
  );
});

test('a clause in a comment after code is not a header', () => {
  withTree(
    {
      'packages/sdk/src/a.ts': `export const x = 1;\n// ${LICENSE_CLAUSE}\n`,
    },
    (root) =>
      assert.deepEqual(collectFindings(root), [
        'packages/sdk/src/a.ts has no Apache 2.0 header',
      ]),
  );
});

test('an unreadable package src is a finding, not a skip', () => {
  withTree(
    {
      'packages/sdk/src/inner/a.ts': LINE_HEADER,
      'scripts/b.mjs': LINE_HEADER,
    },
    (root) => {
      // Search permission removed on the package, so `src` cannot be stat'ed.
      const pkg = path.join(root, 'packages', 'sdk');
      chmodSync(pkg, 0o600);
      try {
        const findings = collectFindings(root);
        if (sourceFiles(root).files.length > 1) return; // running as root
        assert.ok(
          findings.some((f) => /^packages\/sdk\/src could not be read/.test(f)),
          `got ${findings}`,
        );
      } finally {
        chmodSync(pkg, 0o755);
      }
    },
  );
});
