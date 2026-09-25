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

// Tests for the local enforcement layer: the git hooks, the Claude Code hooks
// and their installers. Ported from the server repository's suite of the same
// name, which carries the long form of each argument.
//
// Unlike its sibling suites this one reads THIS repository rather than a
// planted tree — the facts being checked are about this tree. It stays
// read-only: it runs hooks with a payload on stdin and reads files, and every
// git write goes to a scratch repository addressed with `git -C`.

import { spawnSync } from 'node:child_process';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { HOOK_WIRING, shellQuote, wireHooks } from '../hooks/install.mjs';

/**
 * `base` with every GIT_* variable removed. A hook runs with GIT_DIR,
 * GIT_INDEX_FILE and friends set by the outer git, and a test that inherits
 * them writes into the repository it runs from rather than its fixture — in
 * the server repository that once produced a PR whose diff appeared to delete
 * every file. Stripping by prefix is blunter than a list and cannot drift.
 */
function withoutGitVars(base = process.env) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

/** Environment for reading this repository: no discovery past its root. */
function repoScopedEnv(root) {
  return {
    ...withoutGitVars(),
    GIT_CEILING_DIRECTORIES: path.dirname(path.resolve(root)),
  };
}

/** Environment for a throwaway repository: GIT_DIR pinned, no discovery. */
function fixtureGitEnv(dir, base = process.env) {
  const abs = path.resolve(dir);
  return {
    ...withoutGitVars(base),
    GIT_DIR: path.join(abs, '.git'),
    GIT_WORK_TREE: abs,
  };
}

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const GUARD = path.join(REPO, 'scripts', 'hooks', 'guard-generated-files.sh');

/** Run the guard hook with a PreToolUse payload; returns its exit code. */
function guard(filePath) {
  const r = spawnSync('bash', [GUARD], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

/** Every generated file actually in the tree, found without asking git. */
function generatedFiles() {
  const found = [];
  const walk = (dir, match) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, match);
      else if (match(e.name)) found.push(abs);
    }
  };
  walk(path.join(REPO, 'packages', 'sdk', 'src', 'api'), (n) =>
    n.endsWith('_pb.ts'),
  );
  walk(path.join(REPO, 'packages', 'schema', 'antlr'), (n) =>
    n.endsWith('.ts'),
  );
  return found;
}

test('the guard refuses every generated file present in the tree', () => {
  // DERIVED FROM THE TREE, NOT LISTED HERE. A hard-coded list would keep
  // passing the day a new generated file appears while the hook's `case`
  // patterns silently stopped covering it — and because the hook fails open,
  // nothing else would notice.
  const generated = generatedFiles();
  assert.ok(
    generated.length >= 6,
    `expected the generated set, found ${generated.length}`,
  );
  for (const abs of generated) {
    assert.equal(
      guard(abs).status,
      2,
      `guard allowed an edit to ${path.relative(REPO, abs)}`,
    );
  }
});

test('the guard refuses the .proto copies and names the upstream', () => {
  const proto = path.join(
    REPO,
    'packages',
    'sdk',
    'src',
    'api',
    'yorkie',
    'v1',
    'yorkie.proto',
  );
  statSync(proto); // the guard is meaningless if the path moved
  const r = guard(proto);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /yorkie-team\/yorkie/);
});

test('the guard allows ordinary and source-of-truth files', () => {
  for (const rel of [
    'packages/sdk/src/document/document.ts',
    'packages/react/src/index.ts',
    'packages/schema/antlr/YorkieSchema.g4',
  ]) {
    statSync(path.join(REPO, rel));
    assert.equal(guard(path.join(REPO, rel)).status, 0, `guard refused ${rel}`);
  }
});

test('the guard fails open on an unusable payload', () => {
  // A guard that starts refusing everything is a worse outage than one that
  // stops guarding, so every unreadable input has to allow.
  for (const payload of ['', 'not json', '{}', '{"tool_input":{}}']) {
    const r = spawnSync('bash', [GUARD], { input: payload, encoding: 'utf8' });
    assert.equal(
      r.status,
      0,
      `guard blocked on payload ${JSON.stringify(payload)}`,
    );
  }
});

test('every hook the installer wires exists and is executable', () => {
  // A rename makes the entry a no-op, and Claude Code does not announce it.
  assert.ok(
    HOOK_WIRING.length >= 2,
    `expected the hooks to be wired, found ${HOOK_WIRING.length}`,
  );
  for (const { script } of HOOK_WIRING) {
    const abs = path.join(REPO, 'scripts', 'hooks', script);
    statSync(abs); // throws with the path if it moved
    accessSync(abs, constants.X_OK);
  }
});

test('the hook wiring is never tracked in the working tree', () => {
  // THE SECURITY PROPERTY, pinned because nothing else fails when it goes.
  // Claude Code runs the commands a project settings file names, with no
  // confirmation, at SessionStart and before every Edit/Write. A tracked
  // `.claude/settings.json` therefore means checking out a pull-request branch
  // executes that branch's `scripts/hooks/*.sh` — and both halves are ordinary
  // tracked files any contributor can rewrite. The wiring lives in the
  // gitignored `settings.local.json` instead, written by `install.mjs`.
  // ASKS GIT WHAT IS TRACKED, because `.gitignore` is not a security control:
  // `git add -f .claude/settings.local.json` commits it regardless, and a
  // branch that does so ships hook wiring that runs the moment a reviewer
  // checks it out — the exact attack install.mjs closed, one filename over.
  // Checking `existsSync` cannot tell the two apart either, since that file
  // legitimately exists on any clone where setup.sh has been run.
  const tracked = spawnSync('git', ['-C', REPO, 'ls-files', '--', '.claude/'], {
    encoding: 'utf8',
    env: repoScopedEnv(REPO),
  });
  assert.equal(tracked.status, 0, `git ls-files failed: ${tracked.stderr}`);
  const settingsFiles = tracked.stdout
    .split('\n')
    .filter(Boolean)
    .filter((f) => /^\.claude\/settings(\.[\w-]+)?\.json$/.test(f));
  assert.deepEqual(
    settingsFiles,
    [],
    'no .claude/settings*.json may be tracked — Claude Code executes what it names, ' +
      'straight out of a branch checkout. See scripts/hooks/install.mjs.',
  );

  // The ignore entry is still worth pinning: it is what stops the file being
  // committed by accident, which is the common case. It is not what stops it
  // being committed on purpose — the assertion above is.
  const ignore = readFileSync(path.join(REPO, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.claude\/settings\.local\.json$/m);
});

test('the installer wires the snapshot and keeps everything else', () => {
  // Two failures this catches, both silent. Re-running setup must REPLACE the
  // previous wiring rather than stack a second copy of every hook; and the
  // file it merges into is where a contributor's `permissions.allow` grants
  // live, so anything the installer does not own has to survive untouched.
  const snapshot = '/tmp/clone/.git/agent-hooks';
  const existing = {
    permissions: { allow: ['Bash(pnpm lint)'] },
    hooks: {
      SessionStart: [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: 'bash scripts/hooks/session-prime.sh' },
          ],
        },
      ],
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] },
      ],
    },
  };

  const once = wireHooks(existing, snapshot);
  assert.deepEqual(
    once.permissions,
    existing.permissions,
    'unrelated settings must survive',
  );

  const commands = Object.values(once.hooks)
    .flat()
    .flatMap((g) => g.hooks)
    .map((h) => h.command);
  // The stale in-tree wiring is migrated, the unrelated Bash hook is kept.
  assert.ok(commands.includes('echo mine'), "another tool's hook must survive");
  assert.equal(
    commands.filter((c) => c.includes('scripts/hooks/')).length,
    0,
    'in-tree wiring must be replaced',
  );
  for (const { script } of HOOK_WIRING) {
    assert.ok(
      commands.includes(`bash ${shellQuote(`${snapshot}/${script}`)}`),
      `${script} must be wired to the snapshot`,
    );
  }

  assert.deepEqual(
    wireHooks(once, snapshot),
    once,
    'a second install must be a no-op',
  );
});

test('session-prime says nothing in CI and speaks locally', () => {
  // The guidance it prints is a local multi-commit workflow — plan a task doc,
  // self-review, archive before merge. A CI fix job is told to fix the
  // findings it was handed "and nothing else", and whether
  // `claude-code-action` loads a branch's `.claude/` is unsettled: three
  // workflows delete the directory on the assumption that it does. Refusing
  // under GITHUB_ACTIONS settles it either way, and is easy to drop by
  // accident because nothing fails when it goes.
  const prime = path.join(REPO, 'scripts', 'hooks', 'session-prime.sh');

  const inCi = spawnSync('bash', [prime], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'true' },
  });
  assert.equal(inCi.status, 0);
  assert.equal(inCi.stdout.trim(), '', 'session-prime must stay silent in CI');

  const local = spawnSync('bash', [prime], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
  assert.equal(local.status, 0);
  assert.match(local.stdout, /WORKFLOW REQUIREMENTS/);
});

test('ci.yml runs the licence gate, where the CI-fix loop can see it', () => {
  // The gate has two homes and neither alone is sufficient: verify:fast only
  // runs where someone installed the hooks, and CI is the workflow an agent
  // CI-fix loop subscribes to.
  const wf = readFileSync(
    path.join(REPO, '.github', 'workflows', 'ci.yml'),
    'utf8',
  );
  assert.match(wf, /run: pnpm verify:license/);
});

test('verify:fast reaches the licence gate and needs no server', () => {
  // `verify:fast` is what pre-push calls, so a gate dropped from it is a gate
  // only CI still holds. And a suite that needs a server here would make the
  // hook fail on every machine without docker running.
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const fast = pkg.scripts['verify:fast'];
  assert.ok(fast, 'package.json has no verify:fast script');
  assert.match(fast, /\bverify:license\b/);
  assert.ok(
    pkg.scripts['verify:license'],
    'verify:fast names a script that does not exist',
  );
  assert.doesNotMatch(fast, /sdk test(?!:unit)|test:ci|integration/);
});

test('Husky is gone, so nothing wires hooks from the worktree', () => {
  // `prepare: husky` pointed core.hooksPath at the tracked `.husky/`. Putting
  // it back would silently undo the snapshot on every `pnpm install`.
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  assert.doesNotMatch(pkg.scripts.prepare ?? '', /husky/);
  assert.equal(pkg.devDependencies?.husky, undefined);
  assert.equal(existsSync(path.join(REPO, '.husky', 'pre-commit')), false);
});

/**
 * Run `pre-commit` against a throwaway repository.
 *
 * GIT IS ALWAYS ADDRESSED WITH `-C dir`, never through the working directory.
 * The sibling suite's header records why: a suite elsewhere in this
 * organization ran `git init`/`commit`/`checkout` against the CWD, and under a
 * `git worktree` it rewrote that checkout's HEAD and moved two branch refs.
 * Nothing below can see this repository.
 */
function inScratchRepo(body) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pre-commit-'));
  const git = (...args) =>
    spawnSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: fixtureGitEnv(dir),
    });
  try {
    git('init', '-q', '.');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    return body({ dir, git });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The hook's decision alone: false = "nothing to lint", true = "there is source". */
function wouldLint({ dir }) {
  // TWO SUBSTITUTIONS: the `exec pnpm ...` tail becomes a marker, and a stub
  // `pnpm` goes on PATH, because the hook refuses when pnpm is missing and the
  // decision under test is "is there source staged", not "is pnpm installed".
  const bin = stubLinter(dir);

  const r = runHookProbe('pre-commit', {
    dir,
    marker: 'WOULD_LINT',
    // THE TRUST GUARD IS NOT THE DECISION UNDER TEST HERE. A scratch repo has
    // no `origin/main`, so `trusted-tree.sh` refuses on every fixture and every
    // assertion below would measure the guard instead of the staged-source
    // decision. It has its own tests further down, with a real upstream ref.
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      YORKIE_ALLOW_FOREIGN_TREE: '1',
    },
  });
  return r.stdout.includes('WOULD_LINT');
}

/** A no-op `pnpm` on PATH; returns the directory to prepend. */
function stubLinter(dir) {
  const bin = path.join(dir, '.probe-bin');
  mkdirSync(bin, { recursive: true });
  const stub = path.join(bin, 'pnpm');
  writeFileSync(stub, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(stub, 0o755);
  return bin;
}

/**
 * Run one of the git hooks against a scratch repo with its `exec pnpm …` tail
 * replaced by a marker.
 *
 * `trusted-tree.sh` is copied in beside the probe because the hooks source it
 * through `dirname "$0"` — which is what makes it travel with them into the
 * `$GIT_DIR` snapshot, and what makes it have to travel here too.
 */
function runHookProbe(hook, { dir, marker, env = {} }) {
  const src = readFileSync(path.join(REPO, '.githooks', hook), 'utf8').replace(
    /^exec pnpm (exec lint-staged|verify:fast)$/m,
    `echo ${marker}`,
  );
  const probe = path.join(dir, `.probe-${hook}`);
  writeFileSync(probe, src);
  writeFileSync(
    path.join(dir, 'trusted-tree.sh'),
    readFileSync(path.join(REPO, '.githooks', 'trusted-tree.sh'), 'utf8'),
  );

  return spawnSync('bash', [probe], {
    cwd: dir,
    encoding: 'utf8',
    // The hook itself runs `git diff --cached`; `git -C` above protects the
    // helper, but nothing protected the hook until this.
    env: fixtureGitEnv(dir, { ...process.env, ...env }),
  });
}

test('pre-commit refuses when source is staged and pnpm is missing', () => {
  // "Nothing to lint" and "no linter" must keep producing different answers.
  inScratchRepo(({ dir, git }) => {
    writeFileSync(path.join(dir, 'a.ts'), 'export {};\n');
    git('add', 'a.ts');
    const src = readFileSync(
      path.join(REPO, '.githooks', 'pre-commit'),
      'utf8',
    ).replace(/^exec pnpm exec lint-staged$/m, 'echo WOULD_LINT');
    const probe = path.join(dir, '.probe-pre-commit');
    writeFileSync(probe, src);
    const r = spawnSync('bash', [probe], {
      cwd: dir,
      encoding: 'utf8',
      env: fixtureGitEnv(dir, { ...process.env, PATH: '/usr/bin:/bin' }),
    });
    assert.equal(r.status, 1, 'a missing pnpm with source staged must refuse');
    assert.match(r.stderr, /pnpm not found/);
  });
});

test('pre-commit lints whenever a commit stages source, however it stages it', () => {
  // `--diff-filter=ACM` would drop `R`, and git reports a rename-with-edit as
  // a single `R` entry above ~50% similarity.
  inScratchRepo(({ dir, git }) => {
    writeFileSync(path.join(dir, 'a.ts'), 'export function a() {}\n');
    git('add', 'a.ts');
    git('commit', '-qm', 'init', '--no-verify');

    git('mv', 'a.ts', 'b.ts');
    writeFileSync(
      path.join(dir, 'b.ts'),
      'export function a() {}\nexport function b() {}\n',
    );
    git('add', 'b.ts');
    assert.match(git('diff', '--cached', '--name-status').stdout, /^R/);
    assert.equal(
      wouldLint({ dir }),
      true,
      'a rename-with-edit must still lint',
    );
  });
});

test('pre-commit lints a staged source deletion', () => {
  // A deletion breaks every import of the deleted file.
  inScratchRepo(({ dir, git }) => {
    writeFileSync(path.join(dir, 'a.mjs'), 'export const a = 1;\n');
    git('add', 'a.mjs');
    git('commit', '-qm', 'init', '--no-verify');

    git('rm', '-q', 'a.mjs');
    assert.equal(wouldLint({ dir }), true, 'a staged deletion must still lint');
  });
});

test('pre-commit skips a commit that stages no source at all', () => {
  // A contributor fixing a typo must not need the toolchain to commit.
  inScratchRepo(({ dir, git }) => {
    writeFileSync(path.join(dir, 'README.md'), '# docs\n');
    git('add', 'README.md');
    assert.equal(wouldLint({ dir }), false, 'a docs-only commit must not lint');
  });
});

/**
 * A scratch repo that looks like a clone: an `origin/main` to compare against,
 * one commit of the local identity's own work on top of it, and — when
 * `foreign` is set — one commit somebody else wrote, which is the shape
 * `gh pr checkout` produces.
 */
function inReviewedCheckout({ foreign }, body) {
  return inScratchRepo(({ dir, git }) => {
    git('commit', '-qm', 'base', '--allow-empty', '--no-verify');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('commit', '-qm', 'mine', '--allow-empty', '--no-verify');
    if (foreign) {
      git(
        '-c',
        'user.email=someone@else.example',
        '-c',
        'user.name=Someone',
        'commit',
        '-qm',
        'theirs',
        '--allow-empty',
        '--no-verify',
      );
    }
    writeFileSync(path.join(dir, 'a.ts'), 'export {};\n');
    git('add', 'a.ts');
    return body({ dir, git, bin: stubLinter(dir) });
  });
}

test('pre-commit refuses to run a branch it did not write', () => {
  // THE HOLE THE $GIT_DIR SNAPSHOT DOES NOT CLOSE. Pinning WHICH script runs
  // says nothing about what it invokes: `pnpm exec lint-staged` resolves
  // through the working tree's `lint-staged.config.mjs` and `eslint.config.mjs`,
  // both JavaScript modules that run on load. So `gh pr checkout` plus one
  // commit would be arbitrary local execution.
  inReviewedCheckout({ foreign: true }, ({ dir, bin }) => {
    const r = runHookProbe('pre-commit', {
      dir,
      marker: 'WOULD_LINT',
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(
      r.status,
      1,
      `a foreign checkout must refuse: ${r.stdout}${r.stderr}`,
    );
    assert.doesNotMatch(
      r.stdout,
      /WOULD_LINT/,
      "the branch's lint config must not be reached",
    );
    assert.match(
      r.stderr,
      /someone@else\.example/,
      'the refusal must name whose commits these are',
    );
    assert.match(
      r.stderr,
      /--no-verify|YORKIE_ALLOW_FOREIGN_TREE/,
      'a refusal must name its bypass',
    );
  });
});

test('pre-commit runs on your own branch', () => {
  // The other half: the guard is worthless if it also refuses the everyday
  // case, because then it gets bypassed by reflex and nothing is enforced.
  inReviewedCheckout({ foreign: false }, ({ dir, bin }) => {
    const r = runHookProbe('pre-commit', {
      dir,
      marker: 'WOULD_LINT',
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });
    assert.match(r.stdout, /WOULD_LINT/, `own work must lint: ${r.stderr}`);
  });
});

test('pre-push refuses to run a branch it did not write', () => {
  // `pnpm verify:fast` is the wider surface of the two: it RUNS every unit
  // test file in the tree, and the branch's own vitest configs.
  // No file list can pin that — running the tree is what the gate is for —
  // which is why the check is on authorship rather than on a set of paths.
  inReviewedCheckout({ foreign: true }, ({ dir }) => {
    const r = runHookProbe('pre-push', { dir, marker: 'WOULD_VERIFY' });
    assert.equal(
      r.status,
      1,
      `a foreign checkout must refuse: ${r.stdout}${r.stderr}`,
    );
    assert.doesNotMatch(
      r.stdout,
      /WOULD_VERIFY/,
      "the branch's tests must not be reached",
    );
    assert.match(r.stderr, /someone@else\.example/);
  });
});

test('the trust guard fails closed when it cannot tell whose work this is', () => {
  // "I could not answer" and "it is yours" must not share an answer. A scratch
  // repo with no `origin/main` is the never-fetched clone; the refusal has to
  // say which one-line fix applies.
  inScratchRepo(({ dir, git }) => {
    git('commit', '-qm', 'only', '--allow-empty', '--no-verify');
    writeFileSync(path.join(dir, 'a.ts'), 'export {};\n');
    git('add', 'a.ts');
    const r = runHookProbe('pre-commit', {
      dir,
      marker: 'WOULD_LINT',
      env: { PATH: `${stubLinter(dir)}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(r.status, 1, 'no upstream ref must refuse, not pass');
    assert.match(r.stderr, /git fetch origin main/);
  });
});

test('the trust guard is not satisfied by an author line the branch supplies', () => {
  // THE BYPASS THIS PINS, and the reason the guard no longer rests on `%aE`.
  // The author address is a field the branch's own author writes: one
  // `git config user.email <the reviewer>` before committing and an
  // authorship check calls a stranger's pull request "your own work". Every
  // address in this repository's history is public, so the spoof needs no
  // secret.
  //
  // So the fixture IS the attack — a commit authored as the local identity,
  // FETCHED into this clone rather than created in it, which is the shape
  // `gh pr checkout` produces. The guard has to refuse it on the evidence
  // that survives the spoof: HEAD's reflog, which lives in `$GIT_DIR` and
  // records which commits this git built.
  const root = mkdtempSync(path.join(tmpdir(), 'trusted-tree-'));
  try {
    const upstream = path.join(root, 'upstream');
    const dir = path.join(root, 'clone');
    const at =
      (cwd) =>
      (...args) =>
        spawnSync('git', ['-C', cwd, ...args], {
          encoding: 'utf8',
          env: fixtureGitEnv(cwd),
        });

    mkdirSync(upstream);
    const up = at(upstream);
    up('init', '-q', '-b', 'main', '.');
    up('config', 'user.email', 'test@example.com');
    up('config', 'user.name', 'test');
    up('commit', '-qm', 'base', '--allow-empty', '--no-verify');
    up('checkout', '-qb', 'pr');
    up('commit', '-qm', 'theirs', '--allow-empty', '--no-verify');

    // Built by fetch rather than `git clone`, because `fixtureGitEnv` pins
    // GIT_DIR at the directory it is given and a clone has no repository to
    // pin yet. The resulting refs are the same ones a clone would have.
    mkdirSync(dir);
    const git = at(dir);
    git('init', '-q', '-b', 'main', '.');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    git('remote', 'add', 'origin', upstream);
    git('fetch', '-q', 'origin');
    git('checkout', '-q', '-B', 'main', 'origin/pr');

    // The premise, asserted rather than assumed: an authorship check would
    // have waved this branch straight through.
    assert.equal(
      git(
        'log',
        '--format=%aE',
        'refs/remotes/origin/main..HEAD',
      ).stdout.trim(),
      'test@example.com',
      'the fixture must carry the local identity as its author, or it tests nothing',
    );

    const r = runHookProbe('pre-push', { dir, marker: 'WOULD_VERIFY' });
    assert.equal(
      r.status,
      1,
      `a spoofed author must still refuse: ${r.stdout}${r.stderr}`,
    );
    assert.doesNotMatch(
      r.stdout,
      /WOULD_VERIFY/,
      "the branch's tests must not be reached",
    );
    assert.match(r.stderr, /not created by this clone/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the trust guard refuses a commit carrying no author address at all', () => {
  // The cheaper half of the same bypass, needing no address to forge. Git
  // accepts `--author='A U Thor <>'` and `%aE` prints an empty line for it.
  // The earlier check filtered the author list with `grep -vFx "$me"`, which
  // KEPT that blank line (it is not equal to `$me`); the caller's `$(...)`
  // then stripped it to the empty string, and empty read as "no foreign
  // commits".
  inScratchRepo(({ dir, git }) => {
    git('commit', '-qm', 'base', '--allow-empty', '--no-verify');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(
      'commit',
      '-qm',
      'blank',
      '--allow-empty',
      '--no-verify',
      '--author=A U Thor <>',
    );

    const r = runHookProbe('pre-push', { dir, marker: 'WOULD_VERIFY' });
    assert.equal(
      r.status,
      1,
      `an empty author address must refuse: ${r.stdout}${r.stderr}`,
    );
    assert.doesNotMatch(r.stdout, /WOULD_VERIFY/);
    assert.match(r.stderr, /no author address/);
  });
});

test('both git hooks still consult the trust guard', () => {
  // Structural, because dropping the two lines is a silent change: the hooks
  // keep working, they just start running unread branches again.
  for (const hook of ['pre-commit', 'pre-push']) {
    const src = readFileSync(path.join(REPO, '.githooks', hook), 'utf8');
    assert.match(
      src,
      /trusted-tree\.sh/,
      `${hook} no longer sources the trust guard`,
    );
    const guard = src.indexOf('yorkie_require_own_work');
    const run = src.search(/^exec pnpm (exec lint-staged|verify:fast)$/m);
    assert.ok(guard > 0, `${hook} no longer calls the trust guard`);
    assert.ok(run > 0, `${hook} no longer ends in its exec line`);
    assert.ok(
      guard < run,
      `${hook} runs pnpm before checking whose tree it is`,
    );
  }
});

test('a clone path with a space stays one argument, and stays idempotent', () => {
  // THE BUG THIS PINS. The command is handed to a shell. Unquoted, a clone
  // under `~/My Projects/` becomes two words, the hook never starts, and the
  // guard is silently gone — the failure this whole change exists to refuse.
  //
  // Idempotency is half the test: `isOurs` recognises previous wiring by
  // matching the path, and quoting changes the character that follows `.sh`.
  // Miss that and every re-run of setup.sh stacks another copy of every hook.
  const snapshot = '/Users/someone/My Projects/repo/.git/agent-hooks';
  const once = wireHooks({}, snapshot);
  const commands = Object.values(once.hooks)
    .flat()
    .flatMap((g) => g.hooks)
    .map((h) => h.command);

  for (const c of commands) {
    assert.match(
      c,
      /^bash '\/Users\/someone\/My Projects\/.*\.sh'$/,
      `unquoted: ${c}`,
    );
    // Parsed by a real shell, the path must arrive as ONE argument.
    const script = c.slice('bash '.length);
    const argc = spawnSync('bash', ['-c', `set -- ${script}; echo $#`], {
      encoding: 'utf8',
    });
    assert.equal(argc.stdout.trim(), '1', `the shell split the path: ${c}`);
  }

  assert.deepEqual(
    wireHooks(once, snapshot),
    once,
    'a second install must be a no-op',
  );
});

test('a clone path with shell metacharacters cannot inject', () => {
  const snapshot =
    '/tmp/repo$(touch /tmp/pwned-by-hook-wiring)/.git/agent-hooks';
  const once = wireHooks({}, snapshot);
  const command = Object.values(once.hooks)
    .flat()
    .flatMap((g) => g.hooks)[0].command;
  const script = command.slice('bash '.length);
  // Single quotes make the substitution inert; echo it rather than run it.
  const out = spawnSync('bash', ['-c', `set -- ${script}; printf '%s' "$1"`], {
    encoding: 'utf8',
  });
  assert.match(
    out.stdout,
    /\$\(touch/,
    'the metacharacters must survive as literal text',
  );
  assert.equal(existsSync('/tmp/pwned-by-hook-wiring'), false);
});

test('setup.sh installs git hooks from a snapshot, not from the worktree', () => {
  // THE PROPERTY, and it is the same one install.mjs exists for. Pointing
  // `core.hooksPath` at the tracked `.githooks/` makes every hook
  // branch-controlled: a pull request rewrites `pre-commit`, a reviewer checks
  // the branch out and commits, and it runs — reaching the branch's configs
  // and test code through lint-staged / verify:fast. Closing that for the
  // Claude hooks and leaving it open for the git hooks would be two threat
  // models in one change.
  const setup = readFileSync(path.join(REPO, 'scripts', 'setup.sh'), 'utf8');

  assert.match(
    setup,
    /rev-parse --absolute-git-dir/,
    'setup.sh must resolve $GIT_DIR',
  );
  // THE COMMAND, not the comment. The paragraph above it explains the change
  // by quoting the old `core.hooksPath ... .githooks` form, so a naive `find`
  // on the setting name reads the argument for the fix as the fix.
  const hooksPath = setup
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('git config core.hooksPath'));
  assert.ok(hooksPath, 'setup.sh no longer configures core.hooksPath');
  assert.doesNotMatch(
    hooksPath,
    /REPO_ROOT|\.githooks"?$/,
    `core.hooksPath must name the $GIT_DIR snapshot, not the worktree: ${hooksPath}`,
  );
  assert.match(hooksPath, /HOOKS_SNAPSHOT/);
});
