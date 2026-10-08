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
  // findings it was handed and nothing else, and whether
  // `claude-code-action` loads a branch's `.claude/` is unsettled. Refusing
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
  // The sdk and prosemirror suites include integration tests; only their
  // `test:unit` halves are server-free. react and schema have none.
  assert.doesNotMatch(
    fast,
    /pnpm (sdk|prosemirror) test(?!:unit)|test:ci|integration/,
  );
  assert.match(fast, /pnpm sdk test:unit/);
  assert.match(fast, /pnpm prosemirror test:unit/);
});

test('Husky is gone, so .githooks/ is the only hook directory', () => {
  // `prepare: husky` pointed core.hooksPath at `.husky/`. Putting it back
  // would silently repoint every clone away from `.githooks/` on the next
  // `pnpm install`, and the two directories would drift.
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
    git('config', 'commit.gpgsign', 'false');
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
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
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
 */
function runHookProbe(hook, { dir, marker, env = {} }) {
  const src = readFileSync(path.join(REPO, '.githooks', hook), 'utf8').replace(
    /^exec pnpm (exec lint-staged|verify:fast)$/m,
    `echo ${marker}`,
  );
  const probe = path.join(dir, `.probe-${hook}`);
  writeFileSync(probe, src);

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

test('pre-commit hands a staged source deletion to lint-staged', () => {
  // This pins only that the hook does not skip a deletion. lint-staged
  // itself lints added/changed files, so what catches the imports a deletion
  // breaks is the build in pre-push.
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

/**
 * A scratch upstream plus a clone of it, built without `git clone` so every
 * command can be addressed with `git -C` under a stripped environment. No
 * GIT_DIR is pinned: the worktree cases need git's own discovery, and the
 * ceiling keeps that discovery inside the scratch directory.
 */
function inScratchClone(body) {
  const root = mkdtempSync(path.join(tmpdir(), 'scratch-clone-'));
  const env = {
    ...withoutGitVars(),
    GIT_CEILING_DIRECTORIES: path.dirname(root),
  };
  const at =
    (cwd) =>
    (...args) => {
      const r = spawnSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        env,
      });
      return r;
    };
  try {
    const upstream = path.join(root, 'upstream');
    const clone = path.join(root, 'clone');
    for (const dir of [upstream, clone]) {
      mkdirSync(dir);
      const git = at(dir);
      git('init', '-q', '-b', 'main', '.');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'test');
      git('config', 'commit.gpgsign', 'false');
    }
    at(upstream)('commit', '-qm', 'base', '--allow-empty', '--no-verify');
    const git = at(clone);
    git('remote', 'add', 'origin', upstream);
    git('fetch', '-q', 'origin');
    git('reset', '-q', '--hard', 'origin/main');
    return body({ root, upstream, clone, at, env });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Run a hook from this repository against `dir` with a stub pnpm on PATH. */
function runHookIn(hook, dir, env) {
  const bin = path.join(dir, '..', 'probe-bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    path.join(bin, 'pnpm'),
    '#!/usr/bin/env bash\necho "RAN pnpm $*"\n',
  );
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  const hooks = path.join(dir, '..', 'probe-hooks');
  mkdirSync(hooks, { recursive: true });
  writeFileSync(
    path.join(hooks, hook),
    readFileSync(path.join(REPO, '.githooks', hook)),
  );
  return spawnSync('bash', [path.join(hooks, hook)], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
}

test('pre-push runs on your own branch, and reaches verify:fast', () => {
  inScratchClone(({ clone, at, env }) => {
    at(clone)('commit', '-qm', 'mine', '--allow-empty', '--no-verify');
    const r = runHookIn('pre-push', clone, env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /RAN pnpm verify:fast/);
  });
});

test('the hooks run on a branch somebody else wrote', () => {
  // THE REGRESSION THIS PINS. The hooks once refused any checkout carrying
  // commits this clone did not create. On an agent-loop branch every bot
  // commit is such a commit, so a maintainer finishing one could neither
  // commit nor push without --no-verify, and the guard's own override leaked
  // into pre-push's harness tests. A gate that refuses the everyday case gets
  // bypassed by reflex; both hooks now just run.
  inScratchClone(({ upstream, clone, at, env }) => {
    at(upstream)('checkout', '-qb', 'pr');
    at(upstream)(
      '-c',
      'user.email=bot@agent.example',
      'commit',
      '-qm',
      'theirs',
      '--allow-empty',
      '--no-verify',
    );
    at(clone)('fetch', '-q', 'origin');
    at(clone)('checkout', '-qb', 'review', 'origin/pr');
    writeFileSync(path.join(clone, 'a.ts'), 'export {};\n');
    at(clone)('add', 'a.ts');

    const commit = runHookIn('pre-commit', clone, env);
    assert.equal(commit.status, 0, commit.stderr);
    assert.match(commit.stdout, /RAN pnpm exec lint-staged/);
    const push = runHookIn('pre-push', clone, env);
    assert.equal(push.status, 0, push.stderr);
    assert.match(push.stdout, /RAN pnpm verify:fast/);
  });
});

/** Copy what setup.sh runs into `dir` and commit it as origin/main. */
function plantSetup({ upstream, clone, at }) {
  for (const rel of [
    '.githooks/commit-msg',
    '.githooks/pre-commit',
    '.githooks/pre-push',
    'scripts/setup.sh',
    'scripts/direct-run.mjs',
    'scripts/hooks/install.mjs',
    'scripts/hooks/session-prime.sh',
    'scripts/hooks/guard-generated-files.sh',
  ]) {
    const dest = path.join(upstream, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(path.join(REPO, rel)));
    chmodSync(dest, statSync(path.join(REPO, rel)).mode);
  }
  at(upstream)('add', '-A');
  at(upstream)('commit', '-qm', 'hooks', '--no-verify');
  at(clone)('fetch', '-q', 'origin');
  at(clone)('reset', '-q', '--hard', 'origin/main');
}

function runSetup(cwd, env, ...args) {
  return spawnSync('bash', [path.join(cwd, 'scripts', 'setup.sh'), ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
}

test('setup.sh points core.hooksPath at .githooks, then --check is quiet', () => {
  inScratchClone((ctx) => {
    const { clone, at, env } = ctx;
    plantSetup(ctx);
    // A clone set up by the earlier snapshot install: the copy must go.
    const legacy = path.join(clone, '.git', 'githooks');
    mkdirSync(legacy);
    at(clone)('config', 'core.hooksPath', legacy);
    const before = runSetup(clone, env, '--check');
    assert.equal(before.status, 0);
    assert.match(before.stderr, /not installed/);

    const r = runSetup(clone, env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      at(clone)('config', '--get', 'core.hooksPath').stdout.trim(),
      '.githooks',
    );
    assert.equal(existsSync(legacy), false, 'the old snapshot must be removed');
    statSync(path.join(clone, '.claude', 'settings.local.json'));

    const after = runSetup(clone, env, '--check');
    assert.equal(after.stderr, '');
  });
});

/** Commit with a subject commit-msg refuses; true when a hook refused it. */
function refusedByCommitMsg(at, cwd) {
  const r = at(cwd)('commit', '-q', '--allow-empty', '-m', 'x'.repeat(71));
  return r.status !== 0 && /commit-msg/.test(r.stderr);
}

test('setup.sh in a worktree serves every worktree from its own checkout', () => {
  // `core.hooksPath` is shared config, and git resolves a relative value
  // against the top of the worktree running the hook. So one setting must
  // reach the main checkout and every linked worktree, each running its own
  // `.githooks/` — and removing a worktree must not take the hooks with it,
  // which is how the old snapshot under `.git/worktrees/<name>` failed.
  inScratchClone((ctx) => {
    const { root, clone, at, env } = ctx;
    plantSetup(ctx);
    const wt = path.join(root, 'wt');
    at(clone)('worktree', 'add', '-q', wt, 'origin/main');

    const r = runSetup(wt, env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      at(clone)('config', '--get', 'core.hooksPath').stdout.trim(),
      '.githooks',
    );
    assert.equal(
      runSetup(wt, env, '--check').stderr,
      '',
      '--check in a worktree',
    );
    assert.ok(refusedByCommitMsg(at, wt), 'hooks must run in the worktree');

    at(clone)('worktree', 'remove', '--force', wt);
    assert.equal(runSetup(clone, env, '--check').stderr, '');
    assert.ok(refusedByCommitMsg(at, clone), 'hooks must run in the clone');
  });
});

test('a hook change applies on the next commit, with no re-install', () => {
  // The cost the snapshot install carried: an improved hook reached a clone
  // only when someone re-ran setup.sh. Running from the tree removes it.
  inScratchClone((ctx) => {
    const { clone, at, env } = ctx;
    plantSetup(ctx);
    assert.equal(runSetup(clone, env).status, 0);
    assert.ok(refusedByCommitMsg(at, clone));

    writeFileSync(
      path.join(clone, '.githooks', 'commit-msg'),
      '#!/usr/bin/env bash\nexit 0\n',
    );
    const r = at(clone)('commit', '-q', '--allow-empty', '-m', 'x'.repeat(71));
    assert.equal(r.status, 0, `the edited hook must run: ${r.stderr}`);
  });
});

test('setup.sh refuses Claude Code hook sources that differ from origin/main', () => {
  // The Claude Code hooks are still snapshotted, so a re-run inside a reviewed
  // branch would make that branch's `scripts/hooks/*.sh` permanent for every
  // session. The git hooks are enabled before the refusal: they run from the
  // tree anyway.
  inScratchClone((ctx) => {
    const { clone, at, env } = ctx;
    plantSetup(ctx);
    writeFileSync(
      path.join(clone, 'scripts', 'hooks', 'session-prime.sh'),
      '#!/usr/bin/env bash\nexit 0\n',
    );
    const r = runSetup(clone, env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /YORKIE_ALLOW_LOCAL_HOOKS=1/);
    assert.equal(
      existsSync(path.join(clone, '.claude', 'settings.local.json')),
      false,
      'the branch copies must not be wired',
    );
    assert.equal(
      at(clone)('config', '--get', 'core.hooksPath').stdout.trim(),
      '.githooks',
    );

    const forced = runSetup(clone, { ...env, YORKIE_ALLOW_LOCAL_HOOKS: '1' });
    assert.equal(forced.status, 0, forced.stderr);
  });
});

test('setup.sh does not refuse a .githooks/ change', () => {
  // `.githooks/` is no longer copied anywhere, so a local edit to it persists
  // nothing and must not block the install.
  inScratchClone((ctx) => {
    const { clone, env } = ctx;
    plantSetup(ctx);
    writeFileSync(
      path.join(clone, '.githooks', 'pre-push'),
      '#!/usr/bin/env bash\nexit 0\n',
    );
    const r = runSetup(clone, env);
    assert.equal(r.status, 0, r.stderr);
  });
});
