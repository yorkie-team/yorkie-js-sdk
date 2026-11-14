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

// What THIS repository's harness configuration must say.
//
// `scripts/agent/*.test.mjs` grade the harness code against a fixture
// configuration and are the same bytes in every repository that runs the
// harness. This file is the other half: it grades the values in this directory
// — the ones that are different in every repository — and it is the only test
// that reads them.
//
// It is this repository's own file, so unlike `scripts/agent/**` it follows
// this repository's lint and formatting rules and the root ESLint checks it.
//
// Run from `scripts/agent`: `npm run test:repo`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const AGENT = path.join(ROOT, 'scripts', 'agent');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const ACTION_DIR = path.join(ROOT, '.github', 'actions', 'agent-toolchain');
/** Everything the toolchain action is: the step, its checker, main's `.npmrc`. */
const ACTION_FILES = [
  'action.yml',
  'check-install-inputs.mjs',
  'entry.sh',
  'npmrc',
];

// This directory, whatever the caller's environment says. Set before the first
// harness module is imported — which is why the imports below are dynamic: a
// static import would be evaluated before this line.
process.env.AGENT_HARNESS_CONFIG_DIR = HERE;

const agent = (file) => import(path.join(AGENT, file));
const checks = await agent('checks.mjs');
const panel = await agent('review-panel.mjs');
const captureMeta = await agent('capture-meta.mjs');
const rounds = await agent('rounds.mjs');
const metrics = await agent('metrics.mjs');
const setState = await agent('set-state.mjs');
const rebuttal = await agent('rebuttal.mjs');
const fixGuard = await agent('fix-guard.mjs');
const testRemovals = await agent('test-removals.mjs');
const protection = await agent('branch-protection.mjs');
const reviewScope = await agent('review-scope.mjs');
const { compileGlob, loadConfig } = await agent('config.mjs');
const workflowValues = await agent('workflow-values.mjs');
const installInputs = await import(
  path.join(ACTION_DIR, 'check-install-inputs.mjs')
);

const CONFIG = loadConfig();

const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8');
/** A file's lines that are not comments: prose does not run. */
const codeOf = (text) =>
  text
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
const tracked = execFileSync('git', ['ls-files'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\n')
  .filter(Boolean);

test('this file grades the configuration in its own directory', () => {
  assert.equal(loadConfig(HERE), CONFIG);
  assert.equal(CONFIG.repo.name, 'yorkie-js-sdk');
});

// --- the values the harness ran on, before they were configuration -----------
//
// `repo.snapshot.json` was first written from this repository's ADAPTED copy of
// the harness, while every value below was still a literal in `scripts/agent/`
// and the workflows (the commit that added it holds that recording). Replacing
// that copy with the repository-agnostic one must not change what the harness
// exports, says to a reviewer, or decides — so each is compared against the
// recording, and the differences the replacement did make are in the recording
// too, as the diff of that file in the change that made them:
//
//   - `.github/agent-harness/**` joined the CI-defining paths, and two shared
//     entries moved within their lists (`lint-staged.config.mjs`,
//     `.githooks/**`): same sets, different order;
//   - the removal record says "test(s) or suite(s) switched off";
//   - the fix-guard block is new: this repository had no fix guard;
//   - the prompts gained the shared frame's wording (scope enforcement, the
//     reviewer-directed-text rule, the longer generated-code rule).
//
// It stays as a change detector: an edit to `config.json` or
// `coverage-note.md` that alters a gate, a prompt or a comment fails here until
// the recording is updated in the same change, which puts the before and after
// of every such edit in front of whoever reviews it.

const SNAPSHOT = JSON.parse(
  readFileSync(path.join(HERE, 'repo.snapshot.json'), 'utf8'),
);

test('snapshot: the paths that define CI', () => {
  assert.deepEqual([...checks.CI_DEFINING_PATHS], SNAPSHOT.CI_DEFINING_PATHS);
});

test('snapshot: the file-class rules', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(panel.CLASS_RULES)),
    SNAPSHOT.CLASS_RULES,
  );
});

test('snapshot: the mechanical-coverage note', () => {
  assert.equal(
    panel.MECHANICAL_COVERAGE_NOTE,
    SNAPSHOT.MECHANICAL_COVERAGE_NOTE,
  );
});

test("snapshot: every lens's appliesWhen and rubric, as the panel loads them", () => {
  const lenses = panel.loadLenses(path.join(AGENT, 'lenses'));
  assert.deepEqual(
    Object.fromEntries(lenses.map((l) => [l.id, [...panel.lensGlobs(l)]])),
    SNAPSHOT.lensAppliesWhen,
  );
  assert.deepEqual(
    Object.fromEntries(lenses.map((l) => [l.id, l.rubric])),
    SNAPSHOT.lensRubrics,
  );
  assert.ok(
    lenses.length >= 6,
    `expected the whole panel, loaded ${lenses.length} lenses`,
  );
});

test("snapshot: the ready gate's CI gate name and the hand-off comment's CI bullet", () => {
  assert.equal(checks.CI_GATE_NAME, SNAPSHOT.ciGateName);
  assert.deepEqual([...checks.HANDOFF_CI_SUMMARY], SNAPSHOT.handoffCiBullet);
});

test("snapshot: the capture schema id and the lens prompt's opening line", () => {
  assert.equal(captureMeta.CAPTURE_META_SCHEMA, SNAPSHOT.CAPTURE_META_SCHEMA);
  assert.equal(
    panel.lensCacheKey({ diff: 'x', scopeNote: '' }).split('\n')[0],
    SNAPSHOT.lensPromptFirstLine,
  );
});

test('snapshot: the bot identities each reader believes', () => {
  assert.deepEqual([...rounds.PAGE_AUTHOR_LOGINS], SNAPSHOT.PAGE_AUTHOR_LOGINS);
  assert.deepEqual(
    [...metrics.LEDGER_AUTHOR_LOGINS],
    SNAPSHOT.LEDGER_AUTHOR_LOGINS,
  );
  assert.deepEqual(
    [...setState.LATCH_AUTHOR_LOGINS],
    SNAPSHOT.LATCH_AUTHOR_LOGINS,
  );
  assert.deepEqual(
    [...rebuttal.REBUTTAL_AUTHOR_LOGINS],
    SNAPSHOT.REBUTTAL_AUTHOR_LOGINS,
  );
});

test('snapshot: the branch-protection decline message', () => {
  assert.equal(
    protection.decideProtection({ classicError: { status: 403 } }).reason,
    SNAPSHOT.protectionUnreadableReason,
  );
});

test('snapshot: which changes the fix guard calls a replicated rule, and what it says', () => {
  const paths = Object.entries(SNAPSHOT.fixGuard.replicatedRule);
  assert.ok(
    paths.length >= 9,
    `expected the recorded sample paths, found ${paths.length}`,
  );
  for (const [file, expected] of paths) {
    assert.equal(
      fixGuard.crdtRuleChanges([{ filename: file }]).length === 1,
      expected,
      file,
    );
  }
  const files = [{ filename: 'packages/sdk/src/document/crdt/tree.ts' }];
  const lint = (prBody) => fixGuard.lintRound({ files, prBody }).crdt;
  assert.deepEqual(
    lint('the server half is Yorkie-Team/Yorkie#1'),
    SNAPSHOT.fixGuard.lintWithBodyNamingCounterpart,
  );
  assert.deepEqual(
    lint('a yorkie-js-sdk change; see yorkie-team/yorkie-js-sdk#1'),
    SNAPSHOT.fixGuard.lintWithBodyNamingOnlyThisRepository,
  );
  assert.deepEqual(lint('nothing'), SNAPSHOT.fixGuard.lintWithoutIt);
  assert.equal(
    fixGuard.renderFixGuard(fixGuard.lintRound({ files, prBody: '' }), {
      head: 'a'.repeat(40),
      after: 'b'.repeat(40),
    }),
    SNAPSHOT.fixGuard.rendered,
  );
});

test('snapshot: what the test-removal record counts as a test, and as a case', () => {
  const R = SNAPSHOT.testRemovals;
  assert.ok(
    Object.keys(R.isTestFile).length >= 25,
    'expected the recorded sample paths',
  );
  for (const [file, expected] of Object.entries(R.isTestFile)) {
    assert.equal(
      testRemovals.isTestFile(file),
      expected,
      `isTestFile(${file})`,
    );
  }
  for (const [file, expected] of Object.entries(R.isRunnableTest)) {
    assert.equal(
      testRemovals.isRunnableTest(file),
      expected,
      `isRunnableTest(${file})`,
    );
  }
  assert.ok(R.countCases.length >= 4, 'expected the recorded patches');
  for (const { file, status, result } of R.countCases) {
    assert.deepEqual(
      testRemovals.countCases(R.countCasesPatch, { file, status }),
      result,
      `${file} (${status})`,
    );
  }
  const removals = testRemovals.testRemovals(R.removalFiles);
  assert.deepEqual(removals, R.removals);
  assert.deepEqual(
    removals.map((r) => testRemovals.describeRemoval(r)),
    R.described,
  );
});

// --- the paths that define CI --------------------------------------------------
//
// `ci.definingPaths`, entry by entry, with the reason each is on the list. The
// harness adds the entries every repository shares (the workflows and actions,
// CODEOWNERS, this directory, the hook layer) around these; this is what THIS
// repository's CI resolves through. `config.json` cannot carry comments, so
// they live here, and the test below fails if the two lists drift apart.
//
// NO SECOND LIST TO MIRROR. Some repositories keep a CODEOWNER-ed declaration
// of "files that decide how much CI runs" for a test to compare against. This
// one has none: `ci.yml` has no path filter at all, so its jobs are
// unconditional and no path can shrink them. That removes the drift risk and
// the cross-check with it, which is why the comments below are the only thing
// saying why each entry is listed.
const CI_DEFINING = [
  // The lanes themselves. Every `ci.yml` step is `pnpm <script>`, and what a
  // script runs is written in these manifests — a branch that turns `test:ci`
  // into `true` supplies part of the CI definition exactly as if it had edited
  // the workflow.
  'package.json',
  'packages/*/package.json',
  // `pnpm build:examples` runs each example's own `build` script. An example's
  // other files (its vite config, its sources) are that sample app's code,
  // graded by the build succeeding, and stay reviewable rather than refused.
  'examples/*/package.json',
  // The dependency graph CI installs before it runs anything, and where it
  // installs it from (`.npmrc` names a registry for the `@buf` scope).
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  // What `pnpm lint:check` checks. eslint looks its config up per file
  // (`--flag v10_config_lookup_from_file`), so a package-level config decides
  // that package's rules; `prettier/prettier` reads the Prettier config and
  // ignore file.
  'eslint.config.mjs',
  'packages/*/eslint.config.mjs',
  '.prettierrc.js',
  '.prettierignore',
  // What `tsc` checks and what vitest collects: the include globs, the setup
  // file and the environment are all here.
  'packages/*/tsconfig*.json',
  'packages/*/vite.config.*',
  'packages/*/vite.build.*',
  'packages/*/vitest.config.*',
  'codecov.yml',
  // The stack the integration suites are graded against.
  'docker/**',
  // Scripts a workflow invokes directly, and the modules they import.
  // `verify-doc-links.mjs` and `verify-license.mjs` both import
  // `direct-run.mjs` for the predicate that decides whether their CLI body runs
  // at all, so a branch editing that one file makes both gates exit 0 having
  // checked nothing — the same fail-open as editing the verify scripts
  // themselves. The directory's top level holds nothing but those scripts and
  // their shared helpers, so the glob costs no false refusals.
  'scripts/*.mjs',
  // `conformance-sync.yml` runs this one by path rather than through a pnpm
  // script (`bash packages/sdk/test/conformance/sync.sh --check`), so it is CI
  // definition that happens to live under a package's test tree. Only the
  // script itself: the corpus and the fixtures beside it are the evidence the
  // lane grades, which a branch is expected to change and a reviewer reads.
  'packages/sdk/test/conformance/sync.sh',
  // …and the suite those scripts are graded by. `pnpm test:scripts` runs
  // `node --test 'scripts/test/**'`, so a branch editing a guard there changes
  // what the lane proves exactly as much as editing the script it guards.
  'scripts/test/**',
  // …and the inputs those scripts read. `verify:exports` installs its
  // consumer, and the tools it runs (tsc, attw, vite, esbuild), from the
  // fixture lockfile, so dropping a tool there changes what the lane proves.
  'scripts/fixtures/**',
  // What the pre-commit hook runs. The hook layer itself (`scripts/setup.sh`,
  // `scripts/hooks/**`, `.githooks/**`) is on the harness's shared list.
  'lint-staged.config.mjs',
];

test("CI_DEFINING_PATHS covers the surface CI's behaviour is read from", () => {
  // Gate 1b refuses a PR that supplies any part of the CI definition.
  assert.deepEqual(
    [...CONFIG.ci.definingPaths],
    CI_DEFINING,
    'config.json and the annotated list above have drifted',
  );

  for (const p of [
    '.github/workflows/ci.yml',
    '.github/workflows/nested/whatever.yml',
    '.github/actions/setup/action.yml',
    '.github/actions/agent-toolchain/npmrc',
    '.github/CODEOWNERS',
    // The lanes: every `ci.yml` step is a pnpm script, and what those run is
    // written in the manifests and the tool configs they read.
    'package.json',
    'packages/sdk/package.json',
    'packages/prosemirror/package.json',
    'examples/vanilla-prosemirror/package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    'eslint.config.mjs',
    'packages/sdk/eslint.config.mjs',
    '.prettierrc.js',
    '.prettierignore',
    'packages/sdk/tsconfig.json',
    'packages/sdk/vite.build.ts',
    'packages/sdk/vitest.config.ts',
    'packages/prosemirror/vite.config.ts',
    'packages/react/vite.config.js',
    'codecov.yml',
    'docker/docker-compose-ci.yml',
    'docker/docker-compose.yml',
    'scripts/verify-doc-links.mjs',
    'scripts/verify-license.mjs',
    // The module both verify scripts import their "am I the entry point?"
    // predicate from. Editing it alone makes both gates exit 0 without
    // checking anything, so it defines CI's behaviour exactly as much as the
    // scripts that import it.
    'scripts/direct-run.mjs',
    // Run by path from conformance-sync.yml, not through a pnpm script: the
    // lane that proves the conformance corpus still matches yorkie's.
    'packages/sdk/test/conformance/sync.sh',
    'scripts/test/verify-license.test.mjs',
    'scripts/fixtures/package-exports/package-lock.json',
    'scripts/setup.sh',
    'scripts/hooks/install.mjs',
    '.githooks/pre-push',
    'lint-staged.config.mjs',
  ]) {
    assert.equal(
      checks.definesCi(p),
      true,
      `${p} defines what CI does and must be refused by gate 1b`,
    );
  }

  // ...and does not swallow the code under review. A gate that refuses every
  // PR is the same outage as one that refuses none, arrived at from the other
  // side.
  for (const p of [
    'packages/sdk/src/document/crdt/tree.ts',
    'packages/sdk/test/integration/tree_test.ts',
    // The conformance suite's own tests and corpus: the evidence `sync.sh
    // --check` grades, not the definition of the lane that runs it.
    'packages/sdk/test/conformance/tree_conformance_test.ts',
    'packages/sdk/test/conformance/tree/corpus/split-order-span-2.json',
    'packages/sdk/src/api/yorkie/v1/resources.proto',
    'packages/prosemirror/src/sync.ts',
    'examples/react-todomvc/src/App.tsx',
    'examples/react-todomvc/vite.config.ts',
    'scripts/agent/review-panel.mjs',
    'docs/design/prosemirror.md',
    'README.md',
  ]) {
    assert.equal(
      checks.definesCi(p),
      false,
      `${p} is code or prose under review, not the CI definition`,
    );
  }
});

test('every configured path and glob matches a file this repository tracks', () => {
  // The loader can tell a glob from a non-glob, not a right glob from a wrong
  // one. `docker` is a valid glob that matches only a FILE of that name;
  // `*.ts` is a valid glob that matches only at the root; a renamed directory
  // leaves a valid glob behind. Each matches nothing, and on these lists
  // "matches nothing" means an entry quietly off a refusal surface or out of a
  // review scope. So every entry must match at least one tracked file — or be
  // on RESERVED, with the reason it is listed ahead of the file existing.
  const RESERVED = {
    // The two data-directory conventions no package uses yet. Listed so a
    // fixture added under either name is read as code's input from its first
    // commit rather than falling through to `code` by accident of naming.
    '**/__fixtures__/**': ['review.classRules.code-adjacent'],
    '**/testdata/**': ['review.classRules.code-adjacent'],
  };
  assert.ok(
    tracked.length > 500,
    `expected the repository's files, git listed ${tracked.length}`,
  );

  const lists = {
    'ci.definingPaths': CONFIG.ci.definingPaths,
    'review.classRules.code-adjacent':
      CONFIG.review.classRules['code-adjacent'],
    'review.classRules.policy': CONFIG.review.classRules.policy,
    'review.sourceGlobs': CONFIG.review.sourceGlobs,
    'fixGuard.replicatedRuleGlobs': CONFIG.fixGuard.replicatedRuleGlobs,
  };
  let checked = 0;
  const reservedSeen = [];
  for (const [key, entries] of Object.entries(lists)) {
    for (const entry of entries) {
      checked++;
      const re = compileGlob(entry);
      const matches = tracked.some((f) => re.test(f));
      const reserved = (RESERVED[entry] ?? []).includes(key);
      if (reserved) reservedSeen.push(`${key}: ${entry}`);
      assert.equal(
        matches,
        !reserved,
        reserved
          ? `${key}: ${entry} matches a tracked file now — take it off RESERVED`
          : `${key}: ${entry} matches no tracked file. A directory is \`dir/**\`, any depth is \`**/name\`; ` +
              'if the entry is deliberate, add it to RESERVED with the reason',
      );
    }
  }
  // `review.diffExcludes` are git pathspecs, so git is asked.
  for (const spec of CONFIG.review.diffExcludes) {
    checked++;
    const hit = execFileSync('git', ['ls-files', '--', spec], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    assert.ok(
      hit !== '',
      `review.diffExcludes: ${spec} matches no tracked file`,
    );
  }
  // Guards on the guard: the lists were walked, and RESERVED holds nothing
  // stale.
  assert.ok(
    checked >= 45,
    `expected every configured entry, checked ${checked}`,
  );
  assert.deepEqual(
    reservedSeen.sort(),
    Object.entries(RESERVED)
      .flatMap(([e, keys]) => keys.map((k) => `${k}: ${e}`))
      .sort(),
  );
});

test('ci.yml files a run for every PR, so a docs-only PR reaches the pipeline', () => {
  // THE PROPERTY THE WHOLE AUTONOMOUS ARM RESTS ON, and it is about the run
  // EXISTING, not about what runs inside it.
  //
  // `agent-review-panel.yml` and `agent-iterate-ci.yml` both trigger on
  // `workflow_run` of `ci.yml`. A workflow skipped by a trigger-level
  // `paths-ignore` files NO RUN, so there is no event, so neither fires — and a
  // PR confined to markdown would sit outside the loop entirely. The server
  // repository filters on its `build` JOB instead; this repository's `ci.yml`
  // has no path filter at all, which satisfies the same property more simply.
  //
  // Asserted here rather than left to review because it is a ONE-LINE
  // regression: adding `paths-ignore:` under `pull_request` changes nothing a
  // reviewer of that diff would see run.
  const yml = read(checks.CI_WORKFLOW_PATH);
  assert.match(
    yml,
    /^name:\s*CI\s*$/m,
    'ci.yml must still be the workflow whose runs are named CI',
  );

  // To the next TOP-LEVEL key after `on:`, whatever it is: this ci.yml has no
  // `env:` block, and slicing to a named key that is absent runs to the end of
  // the file.
  const onStart = yml.indexOf('\non:');
  const onEnd = yml.slice(onStart + 1).search(/\n[a-z_-]+:/);
  const on = yml.slice(onStart, onEnd < 0 ? yml.length : onStart + 1 + onEnd);
  const pr = on.slice(on.indexOf('  pull_request:'));
  assert.ok(
    pr.startsWith('  pull_request:'),
    'ci.yml must still trigger on pull_request',
  );
  assert.ok(
    !/^ {4}paths(-ignore)?:/m.test(codeOf(pr)),
    'ci.yml must not filter `pull_request` at the workflow level — a filtered-out PR files no run, ' +
      'and the review panel and the CI-fix arm both trigger on one',
  );

  // ...and any JOB-level filter must keep failing toward RUNNING: `**` as its
  // only positive pattern, the rest negations, with `predicate-quantifier:
  // every`. This repository has no such filter today — every job runs on
  // every PR — so the check below applies the moment one is added.
  if (/dorny\/paths-filter/.test(yml)) {
    const step = yml.slice(yml.indexOf('id: code-changed'));
    assert.ok(
      step.length < yml.length,
      'a paths-filter step exists but not as `id: code-changed`',
    );
    const filters = step.slice(step.indexOf('build:'), step.indexOf('\n\n'));
    const patterns = [...filters.matchAll(/^ {14}- '(.+)'$/gm)].map(
      (m) => m[1],
    );
    assert.ok(
      patterns.length >= 2,
      "could not read the build filter's patterns from ci.yml",
    );
    assert.equal(
      patterns[0],
      '**',
      "the build filter's only positive pattern must be `**`",
    );
    for (const p of patterns.slice(1)) {
      assert.ok(
        p.startsWith('!'),
        `the build filter must be \`**\` plus negations only; found '${p}'`,
      );
    }
    assert.match(
      step.slice(0, 400),
      /predicate-quantifier: every/,
      'the build filter needs `predicate-quantifier: every`, or its negations are inert',
    );
  } else {
    // No filter: then no job may be skipped by path some other way either.
    assert.ok(
      !/^\s+paths(-ignore)?:/m.test(yml),
      'ci.yml filters by path without dorny/paths-filter',
    );
  }
});

test('ci.laneReports says what ci.yml uploads', () => {
  // The CI-fix arm reads per-lane reports only where CI uploads them. This
  // `ci.yml` has no lane runner, so the failed-step log tail is the whole
  // diagnosis and the switch is off.
  const ci = read(checks.CI_WORKFLOW_PATH);
  const uploads = /^\s+name: ci-lane-reports\s*$/m.test(ci);
  assert.equal(CONFIG.ci.laneReports, uploads);
  assert.equal(CONFIG.ci.laneReports, false);
  assert.equal(
    existsSync(path.join(ROOT, 'scripts', 'ci', 'summarize-ci.mjs')),
    false,
    'a lane-report renderer exists now — should ci.laneReports be on?',
  );
});

// --- tests -----------------------------------------------------------------------

test('the vitest rules match how this repository writes and switches off tests', () => {
  // TypeScript and vitest only: with the Go rules on, a `.go` path would be
  // matched against idioms no file here uses, and `tests.go` would be required.
  assert.deepEqual([...CONFIG.tests.rules], ['vitest']);
  assert.equal(CONFIG.tests.go, undefined);

  // Where the tests live: each package's `test/` tree (the SDK names its files
  // `*_test.ts`), `*.test.*` beside source, and the script suite.
  for (const f of [
    'packages/sdk/test/unit/document/document_test.ts',
    'packages/sdk/test/integration/client_test.ts',
    'packages/sdk/test/helper/helper.ts',
    'scripts/test/tasks-check.test.mjs',
  ]) {
    assert.ok(tracked.includes(f), `${f} is no longer tracked`);
    assert.equal(testRemovals.isTestFile(f), true, f);
  }
  assert.equal(
    testRemovals.isTestFile('packages/sdk/src/document/document.ts'),
    false,
  );

  // THE REPRODUCER IDIOM the fixer prompts name. `it.fails` runs and asserts
  // the failure, so turning a case into one is not a removal; `.skip` and
  // `.todo` stop it running, so they are.
  const count = (patch) =>
    testRemovals.countCases(patch, {
      file: 'packages/sdk/test/unit/a_test.ts',
      status: 'modified',
    });
  assert.deepEqual(count("-  it('a', () => {\n+  it.fails('a', () => {"), {
    removed: 1,
    added: 1,
    suitesOff: 0,
  });
  for (const off of [
    "it.skip('a', () => {",
    "it.todo('a');",
    "test.skipIf(true)('a', () => {",
  ]) {
    assert.deepEqual(
      count(`-  it('a', () => {\n+  ${off}`),
      { removed: 1, added: 0, suitesOff: 0 },
      off,
    );
  }
  assert.equal(count("+describe.skip('s', () => {").suitesOff, 1);
  assert.equal(count("+  describe.todo('s');").suitesOff, 1);

  // ...and the prompts say the same thing the record counts.
  assert.match(CONFIG.fixer.keepReproducerAs, /`it\.fails\(\.\.\.\)`/);
  assert.match(CONFIG.fixer.disabledTestForms, /`\.skip`\/`\.todo`/);
});

// --- file classes and lens scoping ------------------------------------------------

test("classifyFile: this repository's lane configuration is policy, its tests are code-adjacent", () => {
  // THE precedence case. Every one of these is markdown or configuration, and
  // routing them by extension would hand the files that reprogram the agents
  // to the cheap lens.
  assert.equal(
    panel.classifyFile('scripts/agent/lenses/security.md'),
    'policy',
  );
  assert.equal(panel.classifyFile('CLAUDE.md'), 'policy');
  assert.equal(panel.classifyFile('CONTRIBUTING.md'), 'policy');
  assert.equal(panel.classifyFile('.github/workflows/ci.yml'), 'policy');
  // The lanes themselves: what eslint, tsc and vitest check, and what the
  // package scripts run, is the difference between a mechanical guarantee and
  // a claim.
  for (const p of [
    'package.json',
    'packages/sdk/package.json',
    'examples/react-todomvc/package.json',
    'scripts/agent/package.json',
    'scripts/agent/package-lock.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    'eslint.config.mjs',
    'packages/sdk/eslint.config.mjs',
    '.prettierrc.js',
    'lint-staged.config.mjs',
    'packages/sdk/tsconfig.json',
    'packages/sdk/vitest.config.ts',
    'packages/sdk/vite.build.ts',
    'packages/prosemirror/vite.config.ts',
    'docker/docker-compose-ci.yml',
    '.githooks/pre-push',
  ]) {
    assert.equal(
      panel.classifyFile(p),
      'policy',
      `${p} decides what a lane checks`,
    );
  }
  // The configuration this file grades governs the agents too: it is policy
  // to the reviewers, and part of the CI definition to the ready gate, so a
  // pull request that edits it is reviewed as policy and never promotes
  // itself. The toolchain action and the `.npmrc` copy beside it likewise.
  for (const file of [
    '.github/agent-harness/config.json',
    '.github/agent-harness/coverage-note.md',
    '.github/agent-harness/repo.snapshot.json',
    '.github/agent-harness/repo.test.mjs',
    '.github/agent-harness/README.md',
    '.github/actions/agent-toolchain/action.yml',
    '.github/actions/agent-toolchain/check-install-inputs.mjs',
    '.github/actions/agent-toolchain/npmrc',
  ]) {
    assert.ok(tracked.includes(file), `${file} is not tracked`);
    assert.equal(panel.classifyFile(file), 'policy', file);
    assert.equal(checks.definesCi(file), true, file);
  }

  // The design contract stays with design-fit, never with docs.
  assert.equal(panel.classifyFile('docs/design/tree.md'), 'design-spec');
  assert.equal(panel.classifyFile('docs/design/TEMPLATE.md'), 'design-spec');
  assert.equal(panel.classifyFile('docs/design/README.md'), 'design-spec');

  // Tests, and the data they assert against, are read by every code lens.
  for (const p of [
    'packages/sdk/test/integration/tree_test.ts',
    'packages/sdk/test/vitest.setup.ts',
    'packages/react/test/fixtures/sample.json',
  ]) {
    assert.equal(panel.classifyFile(p), 'code-adjacent', p);
  }

  // The narration this whole split exists to stop paying opus to re-read.
  for (const p of [
    'docs/tasks/active/20260912-x-todo.md',
    'docs/tasks/active/20260912-x-lessons.md',
    'README.md',
    'CHANGELOG.md',
    'ROADMAP.md',
  ]) {
    assert.equal(panel.classifyFile(p), 'prose', p);
  }

  // Source is code: the packages, the scripts, the examples, and the `.proto`
  // copies the SDK generates from. So is GENERATED output, which the
  // workflows drop from the diff BODY but never from the changed-file list,
  // and which must never be demoted to a cheap class: a lens that sees one in
  // the file list is seeing codegen move.
  for (const p of [
    'packages/sdk/src/document/crdt/tree.ts',
    'packages/prosemirror/src/sync.ts',
    'packages/sdk/src/api/yorkie/v1/resources.proto',
    'packages/sdk/src/api/yorkie/v1/resources_pb.ts',
    'packages/schema/antlr/YorkieSchemaParser.ts',
    'examples/react-todomvc/src/App.tsx',
    'scripts/verify-license.mjs',
    'scripts/agent/review-panel.mjs',
  ]) {
    assert.equal(panel.classifyFile(p), 'code', p);
  }
});

test('review.sourceGlobs covers the packages, and the path-scoped lenses run on them', () => {
  const lenses = panel.loadLenses(path.join(AGENT, 'lenses'));
  const manifest = JSON.parse(
    readFileSync(path.join(AGENT, 'lenses', 'lenses.json'), 'utf8'),
  );
  const lensOf = (id) => lenses.find((l) => l.id === id);

  // Every glob names a top-level directory that exists.
  for (const glob of CONFIG.review.sourceGlobs) {
    const dir = glob.replace(/\/\*\*$/, '');
    assert.ok(
      statSync(path.join(ROOT, dir)).isDirectory(),
      `${glob}: ${dir}/ is not a directory`,
    );
  }
  // …and every package's source is under one, or a new package would be
  // reviewed by the wildcard lenses only. `scripts/**` is in the lens manifest
  // itself, for every repository. `examples/**` is deliberately NOT here: the
  // sample apps were reviewed by the two wildcard lenses before this
  // configuration existed, and widening that is a decision of its own.
  assert.deepEqual([...CONFIG.review.sourceGlobs], ['packages/**']);
  const sourceRes = CONFIG.review.sourceGlobs.map(compileGlob);
  const packages = readdirSync(path.join(ROOT, 'packages'), {
    withFileTypes: true,
  })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  assert.ok(
    packages.length >= 5,
    `expected the workspace packages, found ${packages.join(',')}`,
  );
  for (const name of packages) {
    const sample = `packages/${name}/src/index.ts`;
    assert.ok(
      sourceRes.some((re) => re.test(sample)),
      `${sample} is under no review.sourceGlobs entry`,
    );
  }

  // A code PR runs every path-scoped lens; a docs-only PR runs none of them.
  const code = ['packages/sdk/src/document/crdt/tree.ts'];
  for (const id of [
    'correctness',
    'security',
    'design-fit',
    'test-adequacy',
    'blast-radius',
  ]) {
    assert.equal(panel.lensApplies(lensOf(id), code), true, id);
  }
  assert.equal(panel.lensApplies(lensOf('docs'), code), false);
  const reviewing = reviewScope.reviewingLensIds(manifest, code);
  const docsOnly = reviewScope.reviewingLensIds(manifest, [
    'docs/tasks/active/20260912-x-todo.md',
  ]);
  // Wildcard lenses run on everything, so both sets hold them.
  for (const set of [reviewing, docsOnly]) {
    for (const id of ['correctness', 'security']) {
      assert.ok(set.includes(id), `${id} is wildcard-scoped`);
    }
  }
  for (const id of ['test-adequacy', 'blast-radius']) {
    assert.ok(reviewing.includes(id), `${id} must review a code change`);
    assert.ok(!docsOnly.includes(id), id);
  }
  assert.ok(
    !reviewing.includes('docs'),
    'the docs lens must not be required for a source-only change',
  );
  assert.ok(docsOnly.includes('docs'));

  // The design-fit rubric names where THIS repository's shared primitives live.
  assert.match(
    lensOf('design-fit').rubric,
    /`packages\/sdk\/src\/` \(`document\/crdt\/`, `document\/json\/`, `util\/`\)/,
  );
  for (const dir of ['document/crdt', 'document/json', 'util']) {
    assert.ok(
      statSync(path.join(ROOT, 'packages', 'sdk', 'src', dir)).isDirectory(),
      `the design-fit rubric names packages/sdk/src/${dir}/, which is gone`,
    );
  }
});

test('the reviewed diff leaves out generated output, and only that', () => {
  // `*_pb.ts` is `buf generate` output and `packages/schema/antlr/` (bar the
  // grammar) is ANTLR output: machine-written and large. No CI lane
  // regenerates them here, which the coverage note says to every lens; the
  // changed-file list still carries them. The `.proto` copies and the `.g4`
  // grammar are the hand-written sources and are NEVER excluded, and neither
  // is the lockfile — supply-chain relevant.
  const excluded = new Set(
    CONFIG.review.diffExcludes.flatMap((spec) =>
      execFileSync('git', ['ls-files', '--', spec], {
        cwd: ROOT,
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean),
    ),
  );
  for (const f of [
    'packages/sdk/src/api/yorkie/v1/resources_pb.ts',
    'packages/sdk/src/api/yorkie/v1/yorkie_pb.ts',
    'packages/schema/antlr/YorkieSchemaParser.ts',
    'packages/schema/antlr/YorkieSchemaLexer.interp',
    'packages/schema/antlr/YorkieSchema.tokens',
  ]) {
    assert.ok(excluded.has(f), `${f} is generated and should be left out`);
  }
  for (const f of [
    'packages/sdk/src/api/yorkie/v1/resources.proto',
    'packages/sdk/src/api/yorkie/v1/yorkie.proto',
    'packages/schema/antlr/YorkieSchema.g4',
    'pnpm-lock.yaml',
  ]) {
    assert.ok(tracked.includes(f), `${f} is no longer tracked`);
    assert.ok(!excluded.has(f), `${f} is hand-written and must be reviewed`);
  }
  for (const f of excluded) {
    assert.ok(
      /_pb\.ts$|^packages\/schema\/antlr\/[^/]+\.(ts|interp|tokens)$/.test(f),
      `${f} is excluded from the reviewed diff but is not generated output`,
    );
  }
  assert.equal(
    workflowValues.values(['diff_pathspecs'])[0][1],
    ['.', ...CONFIG.review.diffExcludes.map((s) => `:(exclude)${s}`)].join(
      '\n',
    ),
  );
});

// --- the mechanical-coverage note ---------------------------------------------------
//
// EVERY CLAIM IN `coverage-note.md` WAS READ OFF THIS REPOSITORY, not assumed,
// because the failure mode is silent: tell a lens something is covered when it
// is not and that whole finding class stops being reported, with nothing in the
// output to show for it. Read off `.github/workflows/ci.yml` and the scripts
// it calls:
//   - FORMATTING IS ENFORCED, through eslint: the root config sets
//     `prettier/prettier` to `error`, and `pnpm lint:check` fails on any
//     warning. The server repository gets the same from gofmt; the pnpm
//     monorepo this pipeline first came from does not, so neither upstream's
//     formatting bullet carries over as written.
//   - typescript-eslint runs its `recommended` set, NOT
//     `recommendedTypeChecked`, so the type-aware rules (no-floating-promises
//     and friends) are enforced by nothing. "eslint runs" on its own would have
//     implied them.
//   - The root eslint ignores `examples/**`, `scripts/agent/**` and
//     `packages/schema/antlr`, so those are linted by nothing.
//   - `tsc` runs inside the sdk, react, prosemirror and schema builds and as
//     devtools' `typecheck`. prosemirror's build runs only in the
//     package-exports job, which then checks the packed tarballs with
//     `pnpm verify:exports`.
//   - The integration suites run against `yorkieteam/yorkie:latest` from
//     `docker/docker-compose-ci.yml`: the newest server image, not a pinned one.
//   - Coverage is uploaded to Codecov, and `codecov.yml` turns both status
//     checks off, so coverage gates nothing.
//   - `pnpm sdk test:bench` runs the benchmarks with no threshold: a slower
//     result passes.
//   - `ci.yml` has no path filter at all, so every lane runs on every pull
//     request, a documentation-only one included. (Upstream's note has a
//     documentation-only gap; this repository does not.)
//   - The Apache licence header has a lane: `scripts/verify-license.mjs`, over
//     `packages/*/src`, `packages/*/test` and `scripts/` (bar
//     `scripts/agent/`), not `examples/`.
//   - No lane regenerates the protobuf or ANTLR output, so a hand edit to
//     `*_pb.ts` or `packages/schema/antlr/*.ts` is caught by nothing in CI.

test('the coverage note claims only mechanisms this repo actually runs', () => {
  // Each assertion below pins a fact read off THIS repository, so a change to
  // the real lane breaks this test instead of quietly making the note a lie.
  const N = panel.MECHANICAL_COVERAGE_NOTE;
  assert.equal(
    N,
    readFileSync(path.join(HERE, 'coverage-note.md'), 'utf8').replace(
      /\n$/,
      '',
    ),
  );
  assert.equal(
    N.split('\n')[0],
    '## What the mechanical lanes cover on this branch',
  );
  assert.ok(
    N.indexOf('ENFORCED') >= 0 &&
      N.indexOf('NOT ENFORCED') > N.indexOf('ENFORCED'),
    'the note needs both halves, in order',
  );
  // The same anti-clamp rules `review-panel.test.mjs` applies to the rubrics:
  // a note that says "don't report X" is exactly the shape a clamp hides in.
  for (const clamp of [
    /when unsure,?\s+downgrade/i,
    /mark it minor/i,
    /only with (?:a )?concrete/i,
    /ONLY for a\s+concrete/i,
    /severity ONLY/i,
  ]) {
    assert.ok(
      !clamp.test(N),
      `coverage-note.md re-introduces a certainty clamp: ${clamp}`,
    );
  }
  const enforced = N.slice(N.indexOf('ENFORCED'), N.indexOf('NOT ENFORCED'));
  const notEnforced = N.slice(N.indexOf('NOT ENFORCED'));

  // FORMATTING IS CHECKED HERE, and this is the assertion most likely to be
  // copied wrong: the root eslint config sets `prettier/prettier` to `error`,
  // so a lens may rely on it. Read off the config rather than asserted from
  // memory.
  const eslintConfig = read('eslint.config.mjs');
  assert.match(
    eslintConfig,
    /'prettier\/prettier': 'error'/,
    'the note claims eslint enforces formatting; the root config no longer does',
  );
  assert.match(enforced, /`prettier\/prettier`\s+as an error/);
  assert.ok(
    !/write-only|no lane checks formatting/i.test(N),
    'eslint formats here — do not carry over the upstream formatting gap',
  );
  // What the lint bullet says is NOT linted is what the root config ignores.
  assert.match(enforced, /except examples\/ and the vendored scripts\/agent/);
  assert.match(eslintConfig, /'examples\/\*\*\/\*'/);
  assert.match(eslintConfig, /'scripts\/agent\/\*\*'/);

  // typescript-eslint's TYPE-AWARE rules are NOT configured. "eslint runs" on
  // its own implies them, which would silence the unawaited-promise class — so
  // the lint bullet must name the non-type-checked set, and the gap must be in
  // the NOT-enforced half.
  assert.ok(
    !/recommendedTypeChecked|strictTypeChecked|parserOptions:\s*{[^}]*project/.test(
      eslintConfig,
    ),
    'type-aware lint is configured now — move that bullet to the enforced half',
  );
  // FOUND FIRST, then read: a reworded bullet must fail here, not pass having
  // checked nothing.
  assert.ok(
    N.split('\n').some((l) => l.includes('`pnpm lint:check`')),
    'the note no longer has a `pnpm lint:check` bullet to check',
  );
  assert.match(enforced, /non-type-checked `recommended` set/);
  assert.match(notEnforced, /no-floating-promises/);

  // The licence header HAS a lane — pinned in both directions, because the
  // note's whole failure mode is a half that has stopped being true.
  assert.match(enforced, /verify-license\.mjs/);
  assert.doesNotMatch(notEnforced, /Apache 2\.0/);

  // Every lane the ENFORCED half names must be a step in ci.yml. Read off the
  // workflow, so deleting a step there breaks this test instead of quietly
  // making the note a lie.
  const ci = read(checks.CI_WORKFLOW_PATH);
  for (const lane of [
    'pnpm lint:check',
    'pnpm verify:doc-links',
    'pnpm verify:license',
    'pnpm test:scripts',
    'pnpm sdk build',
    'docker compose -f docker/docker-compose-ci.yml up',
    'pnpm sdk test:ci',
    'pnpm prosemirror test',
    'pnpm prosemirror build',
    'pnpm verify:exports',
    'pnpm build:examples',
    'pnpm react build',
    'pnpm react test',
    'pnpm schema build',
    'pnpm schema test',
    'pnpm devtools typecheck',
  ]) {
    assert.ok(
      ci.includes(lane),
      `the note relies on \`${lane}\`, which ci.yml no longer runs`,
    );
  }
  // `pnpm verify:exports` on the Node versions the note names.
  assert.match(enforced, /`pnpm verify:exports` on Node 20, 22 and 24/);
  assert.match(ci, /node-version: \[20\.x, 22\.x, 24\.x\]/);
  // ...and prosemirror's `tsc`, which CI runs, sits in the enforced half.
  assert.match(enforced, /`pnpm prosemirror build`/);
  assert.doesNotMatch(notEnforced, /prosemirror/);

  // The integration suite claim must name what it runs against ON ITS BULLET,
  // and what it names must be what the compose file actually starts.
  const lines = N.split('\n');
  const suiteLine = lines.findIndex((l) => l.includes('whole vitest suite'));
  assert.ok(
    suiteLine >= 0,
    "the note no longer claims the SDK's integration suite",
  );
  assert.match(
    lines.slice(suiteLine, suiteLine + 2).join('\n'),
    /Yorkie server and MongoDB/,
  );
  const compose = read('docker', 'docker-compose-ci.yml');
  assert.match(
    compose,
    /yorkieteam\/yorkie:latest/,
    'the note names the server image the suite runs against',
  );
  assert.match(notEnforced, /yorkieteam\/yorkie:latest/);

  // No path filter on ci.yml: a documentation-only PR runs every lane. This is
  // the upstream bullet most likely to be carried over by habit.
  assert.ok(
    !/^\s+paths(-ignore)?:/m.test(ci) && !/dorny\/paths-filter/.test(ci),
    "ci.yml filters paths now — the note's documentation-only claim is false",
  );
  assert.match(enforced, /documentation-only/);
  assert.doesNotMatch(notEnforced, /documentation-only PR/);

  // Generated-code freshness has no lane: nothing in ci.yml regenerates.
  assert.match(notEnforced, /Generated-code freshness/);
  assert.ok(
    !/build:proto|build:schema|buf generate|antlr4ts/.test(ci),
    'ci.yml regenerates code now — move that bullet to the enforced half',
  );

  // Coverage gates nothing: codecov.yml turns both statuses off.
  const codecov = read('codecov.yml');
  assert.match(codecov, /project: off/);
  assert.match(codecov, /patch: off/);
  assert.match(notEnforced, /Coverage/);

  // MECHANISMS, NEVER CATEGORIES. "type problems" and friends also cover the
  // things the named tool accepts; named tools and named lanes only.
  for (const category of [
    /\btype problems\b/i,
    /\btype issues\b/i,
    /\blint issues are\b/i,
    /\bstyle problems\b/i,
  ]) {
    assert.ok(
      !category.test(N),
      `the note must name a mechanism, not a category: ${category}`,
    );
  }

  // The tense claim. The panel runs CONCURRENTLY with CI, so nothing here is
  // proven at the moment a lens reads it — only that the lens is not the last
  // line of defence. "already caught" would be false for the current round.
  assert.ok(
    !/already (?:caught|checked|passed|proven)/i.test(N),
    'the panel runs alongside CI — the note may not claim these have already passed',
  );
  assert.match(N, /must pass before it can be promoted/);
});

// --- the bots and the documents ---------------------------------------------------

test('the bots the workflows believe are the ones the scripts believe', () => {
  const value = (name) => workflowValues.values([name])[0][1];
  assert.deepEqual(JSON.parse(value('bot_logins')), [
    ...rounds.PAGE_AUTHOR_LOGINS,
  ]);
  assert.deepEqual(JSON.parse(value('bot_logins')), [
    'github-actions[bot]',
    'yorkie-team-agent[bot]',
  ]);
  assert.equal(value('app_slug'), 'yorkie-team-agent');
  assert.ok(CONFIG.repo.appLogins.includes(value('app_bot_login')));
  assert.equal(
    value('allowed_bots'),
    'yorkie-team-agent[bot],yorkie-team-agent',
  );
});

test("the command-verbs reference is the server repository's document, by URL", () => {
  // The design document for the verbs lives in yorkie-team/yorkie and is not
  // copied here, so a repository-relative path would name a file that does not
  // exist. Decline messages and the protection check cite it by URL.
  const ref = CONFIG.docs.commandVerbsRef;
  assert.equal(
    ref,
    'https://github.com/yorkie-team/yorkie/blob/main/docs/design/agent-command-verbs.md',
  );
  assert.equal(
    existsSync(path.join(ROOT, 'docs', 'design', 'agent-command-verbs.md')),
    false,
    'the document exists here now — cite it by path instead',
  );
  assert.equal(workflowValues.values(['docs_ref'])[0][1], ref);
  assert.ok(
    protection
      .decideProtection({ classicError: { status: 403 } })
      .reason.includes(ref),
  );
});

test("the fix guard's counterpart is the server repository, and not this one", () => {
  // The counterpart's name, `yorkie`, is a prefix of this repository's own
  // (`yorkie-js-sdk`, `yorkie-team`, `@yorkie-js/sdk`), so a PR body that only
  // names this repository must not read as one that refers to the server's.
  // The guard matches a REFERENCE to `owner/name`, not a substring; this pins
  // that it tells the two apart for the names in play here.
  // One counterpart, written as a list: the key holds every repository that
  // must apply the same rule, and for this SDK that is the server alone.
  assert.deepEqual(CONFIG.fixGuard.counterpartRepos, ['yorkie-team/yorkie']);
  const refersToServer = fixGuard.counterpartReference(
    CONFIG.fixGuard.counterpartRepos[0],
  );
  for (const own of [
    'yorkie-js-sdk',
    'yorkie-team/yorkie-js-sdk#1529',
    'https://github.com/yorkie-team/yorkie-js-sdk/pull/1529',
    '@yorkie-js/sdk',
    'the Yorkie server',
    'the yorkie-team organisation',
  ]) {
    assert.equal(
      refersToServer(own),
      false,
      `"${own}" would silence the replicated-rule warning`,
    );
  }
  for (const theirs of [
    'yorkie-team/yorkie#2353',
    'see Yorkie-Team/Yorkie.',
    'yorkie#2353',
    'https://github.com/yorkie-team/yorkie/pull/2353',
  ]) {
    assert.equal(refersToServer(theirs), true, theirs);
  }
  // The notice names the server repository as the one to link.
  assert.match(
    CONFIG.fixGuard.replicatedRuleNotice,
    /Link the matching yorkie change in the PR body/,
  );
  // WHICH FILES HOLD A REPLICATED RULE. A rule is replicated when the Go
  // server and this SDK must compute the same answer from the same input, or
  // two replicas of one document stop converging. Decided from the code, and
  // kept narrow on purpose: this is a warning a fixer and a reviewer have to
  // read, and one that fires on every change teaches them not to.
  //
  //   IN  `document/crdt/*.ts`  The merge rules themselves: where a
  //       concurrent insert lands, what a concurrent delete removes, which
  //       write wins. Go: `pkg/document/crdt`.
  //   IN  `document/time/*.ts`  The order those rules break ties with.
  //       `ticket.ts` is the total order over tickets (Lamport time, then the
  //       actor, then the delimiter) and `version_vector.ts` decides what a
  //       replica is taken to have seen. Every rule in `crdt/` rests on both
  //       sides comparing identically. Go: `pkg/document/time`.
  //   OUT `document/operation/*.ts`  An operation mostly routes to a `crdt/`
  //       method, where the rule is; much of the rest is the reverse
  //       operations for undo and redo and the events for subscribers, which
  //       the server does not have. A warning here would fire on nearly all
  //       history work and say nothing about convergence.
  //   OUT `util/index_tree.ts`, `util/splay_tree.ts`, `util/llrb_tree.ts`
  //       Indexing structures. A replicated position is a ticket-based
  //       identifier, not an index, so what these compute is each replica's
  //       own view, and a rule that depends on one is stated in `crdt/`.
  //   OUT `api/converter.ts`  The wire encoding. It has to match the server,
  //       but the `.proto` it follows is copied from the server and the
  //       integration suite runs against a real one, so a one-sided change
  //       fails a lane instead of needing a warning.
  assert.deepEqual(
    [...CONFIG.fixGuard.replicatedRuleGlobs],
    [
      'packages/sdk/src/document/crdt/*.ts',
      'packages/sdk/src/document/time/*.ts',
    ],
  );
  const replicated = (f) => fixGuard.crdtRuleChanges([{ filename: f }]).length;
  for (const f of [
    'packages/sdk/src/document/crdt/tree.ts',
    'packages/sdk/src/document/crdt/rga_tree_split.ts',
    'packages/sdk/src/document/time/ticket.ts',
    'packages/sdk/src/document/time/version_vector.ts',
    'packages/sdk/src/document/time/actor_id.ts',
  ]) {
    assert.ok(tracked.includes(f), `${f} is no longer tracked`);
    assert.equal(replicated(f), 1, `${f} holds a replicated rule`);
  }
  for (const f of [
    'packages/sdk/src/document/operation/edit_operation.ts',
    'packages/sdk/src/util/index_tree.ts',
    'packages/sdk/src/util/splay_tree.ts',
    'packages/sdk/src/util/llrb_tree.ts',
    'packages/sdk/src/api/converter.ts',
    // A test of a replicated rule is not the rule.
    'packages/sdk/test/unit/document/crdt/tree_test.ts',
  ]) {
    assert.ok(tracked.includes(f), `${f} is no longer tracked`);
    assert.equal(replicated(f), 0, `${f} is deliberately not on the list`);
  }
});

// --- what the workflows say, in this repository's words -------------------------------
//
// The `agent-*.yml` files carry no command, path or name of this repository's:
// they read each from the configuration through `workflow-values.mjs`. These
// tests are where the result is pinned for THIS repository.

/** Collapse runs of whitespace: a prompt's line wrapping is not its text. */
const flat = (text) => text.replace(/\s+/g, ' ').trim();

/** `text` with every configured-value expression replaced by this repository's value. */
function rendered(text) {
  const all = Object.fromEntries(
    workflowValues.values(Object.keys(workflowValues.VALUES)),
  );
  return text.replace(
    /\$\{\{\s*(?:steps\.cfg|needs\.[\w-]+)\.outputs\.([a-z_]+)\s*\}\}/g,
    (whole, name) => (Object.hasOwn(all, name) ? all[name] : whole),
  );
}

/** Every `prompt: |` block of a workflow, in order. */
function promptBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  lines.forEach((line, i) => {
    const m = /^(\s+)prompt: \|\s*$/.exec(line);
    if (!m) return;
    const body = [];
    for (const next of lines.slice(i + 1)) {
      if (next.trim() !== '' && /^(\s*)/.exec(next)[1].length <= m[1].length) {
        break;
      }
      body.push(next);
    }
    blocks.push(body.join('\n'));
  });
  return blocks;
}

/** `NAME: ${{ steps.cfg.outputs.value }}` in a step's `env:`. */
const ENV_FROM_CONFIG =
  /^\s+([A-Z_]+): (\$\{\{ steps\.cfg\.outputs\.[a-z_]+ \}\})\s*$/gm;
/** A placeholder replaced by a QUOTED variable: unquoted, bash 5.2 expands `&` in it. */
const QUOTED_SUBSTITUTION =
  /^\s+TEMPLATE=\$\{TEMPLATE\/\/(__[A-Z_]+__)\/"\$([A-Z_]+)"\}\s*$/gm;

/**
 * The issue-to-PR prompt, which is a heredoc in a `run:` step. Configured
 * values reach it as environment variables substituted for `__PLACEHOLDER__`s,
 * so the same substitutions are made here: each quoted `TEMPLATE=` line, with
 * its variable resolved through the step's `env:`.
 */
function heredocPrompt(text) {
  const start = text.indexOf("<<'PROMPT'\n");
  const end = text.indexOf('\n          PROMPT\n', start);
  assert.ok(
    start > 0 && end > start,
    'agent-implement.yml no longer builds its prompt in a `PROMPT` heredoc',
  );
  let prompt = text.slice(start + "<<'PROMPT'\n".length, end);
  // No configured value may be spliced into the script itself.
  assert.ok(
    !prompt.includes('${{'),
    'the issue-to-PR heredoc interpolates an expression; configured values must arrive through env',
  );
  // The step that builds the prompt, and nothing after it.
  const stepAt = text.lastIndexOf('\n      - name: ', start);
  const stepEnd = text.indexOf('\n      - name: ', start);
  const step = text.slice(stepAt, stepEnd < 0 ? undefined : stepEnd);
  const env = new Map(
    [...step.matchAll(ENV_FROM_CONFIG)].map((m) => [m[1], m[2]]),
  );
  let substituted = 0;
  for (const m of step.matchAll(QUOTED_SUBSTITUTION)) {
    assert.ok(
      env.has(m[2]),
      `agent-implement.yml substitutes ${m[1]} with a variable its env does not set from the configuration`,
    );
    prompt = prompt.replaceAll(m[1], env.get(m[2]));
    substituted++;
  }
  assert.equal(
    substituted,
    env.size,
    "every configured value in the step's env must be substituted into the prompt, quoted",
  );
  assert.ok(
    substituted >= 5,
    `expected the configured placeholders, found ${substituted}`,
  );
  return [prompt];
}

test('snapshot: every value the workflows read from the configuration', () => {
  const names = Object.keys(workflowValues.VALUES);
  assert.deepEqual(
    Object.fromEntries(workflowValues.values(names)),
    SNAPSHOT.WORKFLOW_VALUES,
  );
});

test('snapshot: the prompts the agents are given, as rendered for this repository', () => {
  // First recorded from the prompts as they stood while every command and
  // path in them was a literal in this repository's adapted workflows. The
  // reply and summarize prompts are unchanged from that recording word for
  // word; the differences in the others are the shared frame's (see the list
  // above `SNAPSHOT`). Line wrapping is not compared: a configured value
  // arrives as one line.
  //
  // After that it is a change detector, like the rest of the recording: a
  // prompt edit, here or in a workflow, shows its before and after in the diff
  // of `repo.snapshot.json`.
  const sites = [
    ['agent-fix.yml', promptBlocks],
    ['agent-review-panel.yml', promptBlocks],
    ['agent-iterate-ci.yml', promptBlocks],
    ['agent-review-reply.yml', promptBlocks],
    ['agent-summarize.yml', promptBlocks],
    ['agent-implement.yml', heredocPrompt],
  ];
  const got = {};
  for (const [file, extract] of sites) {
    const blocks = extract(readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    assert.ok(blocks.length > 0, `${file}: no prompt found`);
    blocks.forEach((block, i) => {
      const text = flat(rendered(block));
      // Nothing configured may be left unrendered.
      assert.ok(
        !/(?:steps\.cfg|needs\.route)\.outputs\./.test(text),
        `${file}: a configured value was not rendered`,
      );
      got[`${file}#${i}`] = text;
    });
  }
  assert.deepEqual(got, SNAPSHOT.WORKFLOW_PROMPTS);
});

test('the commands the fixer prompts name are scripts this repository has', () => {
  const scripts = (...pkg) => JSON.parse(read(...pkg, 'package.json')).scripts;
  const root = scripts();
  // `fixer.verifyCommand` is the whole of what a fixer verifies with. A
  // hand-written subset would let a fixer push a file with no licence header,
  // red `ci.yml`, and buy the PR an extra round for a line it could have added
  // before pushing. Naming the target means a gate added to `verify:fast`
  // reaches every prompt at once.
  assert.equal(CONFIG.fixer.verifyCommand, 'pnpm verify:fast');
  const verifyFast = root['verify:fast'];
  assert.ok(verifyFast, 'package.json has no `verify:fast` script');
  // What the prompts say it is: lint, licence headers, doc links, the SDK
  // build and the unit suites — and never a suite that needs a server.
  for (const part of [
    'pnpm lint:check',
    'pnpm verify:license',
    'pnpm verify:doc-links',
    'pnpm sdk build',
    'pnpm sdk test:unit',
  ]) {
    assert.ok(
      verifyFast.includes(part),
      `verify:fast no longer runs \`${part}\`, which the prompts say it does`,
    );
  }
  assert.ok(
    !/pnpm sdk test(?::ci)?(?:\s|$)|pnpm prosemirror test(?:\s|$)/.test(
      verifyFast,
    ),
    'verify:fast runs an integration suite now; the prompts say it needs no server',
  );
  // The integration suites the prompts keep the fixer off are the ones that
  // wait for a server.
  assert.match(scripts('packages', 'sdk').test, /wait:yorkie/);

  // Every `pnpm <package> <script>` and `pnpm <script>` any configured
  // sentence names exists: a root script, or a root filter alias followed by
  // a script of that package (or `exec`).
  const named = new Set();
  for (const value of Object.values(CONFIG.fixer)) {
    for (const m of String(value).matchAll(/`pnpm ([^`]+)`/g)) named.add(m[1]);
  }
  assert.ok(
    named.size >= 6,
    `expected the pnpm commands the prompts name, found ${[...named].join(', ')}`,
  );
  for (const command of named) {
    const [first, second] = command.split(/\s+/);
    assert.ok(
      root[first],
      `a prompt names \`pnpm ${command}\`; package.json has no \`${first}\` script`,
    );
    if (second === undefined || second === 'exec') continue;
    const filter = /^pnpm --filter=@yorkie-js\/([a-z-]+)$/.exec(root[first]);
    assert.ok(
      filter,
      `\`pnpm ${first}\` is not a package filter, so \`${second}\` is not a script of it`,
    );
    assert.ok(
      scripts('packages', filter[1])[second],
      `a prompt names \`pnpm ${command}\`; packages/${filter[1]} has no \`${second}\` script`,
    );
  }

  // The generated-code rule names the generated files and their sources.
  for (const f of [
    'packages/sdk/src/api/yorkie/v1/resources_pb.ts',
    'packages/schema/antlr/YorkieSchemaParser.ts',
  ]) {
    assert.ok(tracked.includes(f), `${f} is no longer tracked`);
  }
  assert.match(
    CONFIG.fixer.generatedCodeNote,
    /packages\/sdk\/src\/api\/yorkie\/v1\/\*_pb\.ts/,
  );
  assert.match(
    CONFIG.fixer.generatedCodeNote,
    /packages\/schema\/antlr\/\*\.ts/,
  );

  // What a commit message must look like, said without naming a hook: in a
  // fix job the harness points `core.hooksPath` at its own scope hook, so
  // `.githooks/commit-msg` does not run there. The numbers are the hook's.
  assert.match(
    CONFIG.fixer.commitNote,
    /subject <= 70 characters, a blank line, body wrapped at 80/,
  );
  assert.doesNotMatch(CONFIG.fixer.commitNote, /hook/i);
  const commitMsg = read('.githooks', 'commit-msg');
  assert.match(commitMsg, /-gt 70/);
  assert.match(commitMsg, /-gt 80/);

  // Configured on purpose here, where the server repository leaves them empty:
  // a review reply verifies before it pushes, and the CI-fix prompt says what
  // to do about a failing integration lane it cannot run.
  assert.match(CONFIG.fixer.replyVerifyInstruction, /`pnpm verify:fast`/);
  assert.notEqual(CONFIG.fixer.ciFailureNote, '');
  // ...and no hint: nothing in `verify:fast` has an auto-fix target to name.
  assert.equal(CONFIG.fixer.verifyFailureHint, '');
});

test('the todo tracking line is the one scripts/tasks-check.mjs reads', () => {
  // The issue-to-PR agent writes the todo; `scripts/tasks-check.mjs --remote`
  // asks GitHub about the issue a todo declares, and a todo that declares none
  // is never checked at all. So the prompt must give the exact wording the
  // checker reads, with the issue number in it.
  assert.match(CONFIG.fixer.todoTrackingLine, /`Tracked as #__ISSUE_NUMBER__`/);
  assert.match(CONFIG.fixer.todoTrackingLine, /scripts\/tasks-check\.mjs/);
  const checker = read('scripts', 'tasks-check.mjs');
  // ...as the checker's own pattern has it, not as a comment there says.
  assert.match(checker, /TRACKING_REF =\s*\/\\b\(\?:tracked as\|/);
  assert.ok(
    read(checks.CI_WORKFLOW_PATH).includes('node scripts/tasks-check.mjs'),
    'ci.yml no longer runs the task-record check',
  );
  // The licence scope the prompt names is the one the licence check walks.
  assert.match(CONFIG.fixer.licenceScope, /`pnpm verify:license`/);
  const license = read('scripts', 'verify-license.mjs');
  assert.match(license, /Licensed under the Apache License, Version 2\.0/);
});

// --- the toolchain action ------------------------------------------------------------

test('the toolchain action is one step, and the runner does nothing with the branch in it', () => {
  // Every job that calls this action has checked out the PR branch
  // (UNTRUSTED) with an App token already minted — or, in the issue-to-PR
  // job, is about to hand the tree to an agent. So nothing the runner does
  // here may run what the branch wrote, be steered by a file of the branch,
  // or follow a path of the branch to somewhere else. The workflows cannot
  // check this: the action is a different file in every repository. It is
  // pinned here — by text, on purpose, because what a real runner and a real
  // container are given can only be read off the file. The tests after this
  // one run the step.
  const action = readFileSync(path.join(ACTION_DIR, 'action.yml'), 'utf8');
  const code = codeOf(action);
  assert.match(code, /^runs:\n {2}using: composite$/m);

  // NO OTHER ACTION. An action that sets a package manager up reads the
  // workspace to do it. One step, a script.
  assert.ok(!/\buses:/.test(code), 'the action uses another action');
  assert.equal((code.match(/^ {4}- /gm) ?? []).length, 1, 'expected one step');
  assert.ok(!/\bcache\b/.test(code), 'the action configures a cache');
  assert.ok(!/setup-node/.test(code), 'the action sets up Node; callers do');

  const joined = code.replace(/\\\n\s*/g, ' ');
  const script = joined.slice(joined.indexOf('run: |'));
  assert.ok(script.length < joined.length, 'the step has no script');
  assert.match(script, /set -euo pipefail/);

  // WHAT THE RUNNER RUNS. A command is read at the start of a line or after
  // `&&`, `||`, `;`, `|` or `(`. Nothing by path, no package manager, no
  // shell, and the programs that take settings from their environment only
  // through `env -i`.
  const COMMAND = /(?:^|&&|\|\||;|\||\(|\$\()[ \t]*([A-Za-z0-9_./-]+)/gm;
  const commands = new Set([...script.matchAll(COMMAND)].map((m) => m[1]));
  for (const forbidden of [
    'pnpm',
    'npm',
    'npx',
    'yarn',
    'corepack',
    'make',
    'node',
    'docker',
    'curl',
    'tar',
    'openssl',
    'git',
    'bash',
    'sh',
    'eval',
    'source',
    '.',
    'awk',
    'find',
    'cp',
    'mv',
    'ln',
    'cat',
  ]) {
    assert.ok(!commands.has(forbidden), `the runner runs \`${forbidden}\``);
  }
  for (const command of commands) {
    assert.ok(!command.includes('/'), `the runner runs a path: ${command}`);
  }
  const viaEnv = [...script.matchAll(/env -i ([^\n|)]*)/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim(),
  );
  const RECORD = '"$root" "$work/before.json" "$temp" "$work" "${HOME:-}"';
  assert.deepEqual(viaEnv.slice(0, 4), [
    'PATH="$PATH" curl -q --fail --silent --show-error --proto \'=https\' --tlsv1.2 --retry 3 --max-time 120 --output "$work/pnpm.tgz" "https://registry.npmjs.org/pnpm/-/pnpm-$PNPM_VERSION.tgz"',
    'PATH="$PATH" openssl dgst -sha512 -binary "$work/pnpm.tgz"',
    'PATH="$PATH" openssl base64 -A',
    'PATH="$PATH" tar -xzf "$work/pnpm.tgz" -C "$tools/pnpm" --strip-components 1',
  ]);
  assert.equal(viaEnv[4], `PATH="$PATH" node "$checker" snapshot ${RECORD}`);
  assert.equal(viaEnv[6], `PATH="$PATH" node "$checker" after ${RECORD}`);
  assert.equal(viaEnv.length, 7);

  // NOT IN THE WORKSPACE. The step leaves it at once and never returns.
  const cds = [...script.matchAll(/^\s*cd ([^\n]*)$/gm)].map((m) => m[1]);
  assert.deepEqual(cds, ['"$temp"'], 'the step changes directory elsewhere');
  const leaves = script.indexOf('cd "$temp"');
  for (const first of ['mktemp', 'env -i', 'docker', '>>']) {
    assert.ok(leaves < script.indexOf(first), `${first} runs in the workspace`);
  }

  // PNPM: one fixed file, checked against the pinned hash before it is
  // unpacked, into a directory of the step's own; then one launcher and ONE
  // line on the PATH of later steps.
  const fetched = script.indexOf('curl -q');
  const verified = script.indexOf(
    '[ "$actual" = "$PNPM_INTEGRITY" ] || refuse "the pnpm tarball is not the one pinned (its hash differs)"',
  );
  const unpacked = script.indexOf('tar -xzf');
  assert.ok(
    fetched >= 0 && fetched < verified && verified < unpacked,
    'the pnpm tarball is unpacked before its hash is checked',
  );
  assert.match(script, /tools="\$\(mktemp -d "\$temp\/agent-pnpm\.XXXXXX"\)"/);
  assert.match(
    script,
    /printf '#!\/bin\/sh\\nexec node "%s\/pnpm\/bin\/pnpm\.cjs" "\$@"\\n' "\$tools" > "\$tools\/bin\/pnpm"/,
  );
  const pathWrites = [...script.matchAll(/^[^\n]*GITHUB_PATH[^\n]*$/gm)].map(
    (m) => m[0].trim(),
  );
  assert.deepEqual(pathWrites, ['echo "$tools/bin" >> "$GITHUB_PATH"']);
  assert.ok(!/GITHUB_ENV|GITHUB_OUTPUT/.test(script));

  // THE CONTAINER, argument by argument:
  //   - the workspace, at its own path, is the one writable mount;
  //   - `.git` and every `.trusted-*` directory are covered read-only by an
  //     empty directory, and main's `.npmrc` stands read-only over the root
  //     one, so the branch's is not read and nothing is moved aside;
  //   - this directory and the pinned pnpm are read-only;
  //   - the image by digest, the runner's own user, no capability, no
  //     privilege gain, `CI` and a scratch `HOME` for an environment, the
  //     default bridge network, and no stored registry credential.
  assert.ok(
    viaEnv[5].startsWith('"${client[@]}" docker run --rm --pull missing'),
  );
  const container = script.slice(script.indexOf('docker run --rm'));
  assert.equal(
    container.slice(0, container.indexOf('\n')).replace(/\s+/g, ' ').trim(),
    [
      'docker run --rm',
      '--pull missing',
      '--network bridge',
      '--user "$(id -u):$(id -g)"',
      '--cap-drop ALL',
      '--security-opt no-new-privileges',
      '--env CI=true',
      '--env HOME=/tmp/home',
      '--workdir "$root"',
      '--volume "$root:$root"',
      '${covered[@]+"${covered[@]}"}',
      '--volume "$ACTION_PATH/npmrc:$root/.npmrc:ro"',
      '--volume "$ACTION_PATH:/opt/agent-toolchain:ro"',
      '--volume "$tools/pnpm:/opt/pnpm:ro"',
      '--entrypoint sh',
      '"$IMAGE"',
      '/opt/agent-toolchain/entry.sh "$root"',
    ].join(' '),
  );
  assert.equal((script.match(/\bdocker run\b/g) ?? []).length, 1);
  assert.ok(
    !/--privileged|docker\.sock|--pid|--ipc|--env-file|--volumes-from|--device|--cap-add|--mount/.test(
      script,
    ),
    'the container is given something beyond what is pinned above',
  );
  assert.match(
    script,
    /client=\(PATH="\$PATH" DOCKER_CONFIG="\$work\/docker"\)\n\s*if \[ -n "\$\{DOCKER_HOST:-\}" \]; then client\+=\(DOCKER_HOST="\$DOCKER_HOST"\); fi/,
  );
  const covers = [...script.matchAll(/covered\+=\(([^)]*)\)/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(covers, [
    '--volume "$work/empty:$root/.git:ro"',
    '--volume "$work/empty:$dir:ro"',
  ]);
  // Only REAL directories are covered, with plain names; a link is refused.
  // `.git` must be a real directory of the workspace's own: a link is
  // refused, and so is its absence — there would be nothing to cover.
  assert.match(
    script,
    /if \[ -L "\$root\/\.git" \] \|\| \[ ! -d "\$root\/\.git" \]; then\n\s*refuse "the workspace has no \.git directory of its own to cover"/,
  );
  // The workspace path itself is plain: no link, no parent component.
  assert.match(script, /case "\$root" in \*\.\.\*\) refuse /);
  assert.match(script, /if \[ -L "\$root" \]; then refuse /);
  assert.match(script, /if \[ -d "\$dir" \] && \[ ! -L "\$dir" \]; then/);
  assert.match(
    code,
    /\n {8}IMAGE: node:22-bookworm-slim@sha256:[0-9a-f]{64}\n/,
    'the container image is not Node 22 pinned by digest',
  );
  // NO FALLBACK.
  const needsDocker = script.indexOf(
    'command -v docker > /dev/null || refuse "Docker is not available; the install does not run outside a container"',
  );
  assert.ok(
    needsDocker >= 0 && needsDocker < fetched,
    'the step does not refuse to run without Docker, before anything else',
  );

  // WHAT THE RUNNER TOUCHES IN THE WORKSPACE: nothing it writes. Every line
  // that names a workspace path is one of these — a test of a fixed name
  // that follows no link, a mount for the container, or an argument to the
  // recorder — and after the container exits, only the comparison.
  const naming = script
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\$root|\$dir|\$\{dir|GITHUB_WORKSPACE/.test(l));
  const ALLOWED = [
    /^root="\$\{GITHUB_WORKSPACE:-\}"$/,
    /^case "\$root" in /,
    /^if \[ -L "\$root\/\.git" \] \|\| \[ ! -d "\$root\/\.git" \]; then$/,
    /^if \[ -L "\$root" \]; then refuse /,
    /^covered\+=\(--volume "\$work\/empty:(\$root\/\.git|\$dir):ro"\)$/,
    /^for dir in "\$root"\/\.trusted-\*; do$/,
    /^if \[ -d "\$dir" \] && \[ ! -L "\$dir" \]; then$/,
    /^case "\$\{dir##\*\/\}" in /,
    /^if \[ ! -f "\$root\/\.npmrc" \] \|\| \[ -L "\$root\/\.npmrc" \]; then$/,
    /^env -i PATH="\$PATH" node "\$checker" (snapshot|after) "\$root" /,
    /^env -i "\$\{client\[@\]\}"\s+docker run --rm /,
  ];
  for (const line of naming) {
    assert.ok(
      ALLOWED.some((re) => re.test(line)),
      `the runner does something else with a workspace path: ${line}`,
    );
  }
  assert.ok(naming.length >= 12, 'expected the lines that name the workspace');
  const afterContainer = container
    .slice(container.indexOf('\n') + 1)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  assert.deepEqual(afterContainer, [
    `env -i PATH="$PATH" node "$checker" after ${RECORD}`,
    'tools=""',
  ]);
  // However the step ends, its own directory goes; and unless it succeeded,
  // so does the pnpm it fetched.
  assert.match(script, /trap cleanup EXIT/);
  assert.match(
    script,
    /rm -rf "\$work"\n\s*if \[ -n "\$tools" \]; then rm -rf "\$tools"; fi/,
  );

  // Where this action is, from the expression rather than the runner's
  // variable; and its own files checked to be regular files.
  assert.match(code, /\n {8}ACTION_PATH: \$\{\{ github\.action_path \}\}\n/);
  assert.ok(!/GITHUB_ACTION_PATH/.test(code));
  assert.match(
    script,
    /for file in entry\.sh check-install-inputs\.mjs npmrc; do\n\s*if \[ ! -f "\$ACTION_PATH\/\$file" \] \|\| \[ -L "\$ACTION_PATH\/\$file" \]; then/,
  );

  // WHAT RUNS IN THE CONTAINER: `entry.sh`, whole. The check, the install,
  // the check of the result — and nothing else.
  const entry = codeOf(readFileSync(path.join(ACTION_DIR, 'entry.sh'), 'utf8'))
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  assert.deepEqual(entry, [
    'set -eu',
    'root="$1"',
    'cd "$root"',
    'node /opt/agent-toolchain/check-install-inputs.mjs before "$root"',
    'node /opt/pnpm/bin/pnpm.cjs install --frozen-lockfile --ignore-scripts --ignore-pnpmfile --config.manage-package-manager-versions=false --config.modules-dir=node_modules --config.virtual-store-dir=node_modules/.pnpm --config.store-dir=/tmp/pnpm-store',
    'node /opt/agent-toolchain/check-install-inputs.mjs installed "$root"',
  ]);

  // It is governed like the workflows that call it.
  for (const file of ACTION_FILES) {
    const rel = `.github/actions/agent-toolchain/${file}`;
    assert.equal(checks.definesCi(rel), true, rel);
    assert.equal(panel.classifyFile(rel), 'policy', rel);
  }
});

// What the trees below start from: a root and one package, the lockfile and
// the workspace file in the style pnpm writes, shaped like this repository's.
const HASH = `sha512-${'A'.repeat(86)}==`;
const TREE = {
  workspace: "packages:\n  - 'packages/*'\n  - '!**/test/**'\n",
  lockfile: [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '  excludeLinksFromLockfile: false',
    '',
    'importers:',
    '',
    '  .:',
    '    devDependencies:',
    '      dep:',
    '        specifier: ^1.0.0',
    '        version: 1.0.0',
    '      sdk:',
    '        specifier: workspace:*',
    '        version: link:packages/sdk',
    '',
    '  packages/sdk: {}',
    '',
    'packages:',
    '',
    '  dep@1.0.0:',
    `    resolution: {integrity: ${HASH}}`,
    '',
    'snapshots:',
    '',
    '  dep@1.0.0: {}',
    '',
  ].join('\n'),
  root: {
    name: 'root',
    private: true,
    devDependencies: { dep: '^1.0.0', sdk: 'workspace:*' },
  },
  sdk: { name: 'sdk', version: '1.0.0' },
};
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;

/**
 * The action's step, taken out of `action.yml`, with a way to run it on a
 * fresh tree laid out as a runner lays one out: `run(setup, { extra, env,
 * docker })`.
 *
 * STUBBED, AND SAID SO. This lane has no container. `docker` is a stub that
 * records the command the step built and then does what the container would:
 * runs the real `entry.sh` — with its two mount points rewritten to where
 * the step put the files — against the tree. `curl` is a stub that serves a
 * stand-in for the pnpm tarball, which records that the install was reached
 * and can be told to do something more (`extra`), as a hostile install
 * might. So the allow-list, the order of `entry.sh`, everything the runner
 * does around the container and the tripwire are exercised for real; what a
 * real container enforces is not, and is pinned by text in the test above.
 */
function installStep() {
  const action = readFileSync(path.join(ACTION_DIR, 'action.yml'), 'utf8');
  const start = action.indexOf('      run: |\n');
  assert.ok(start > 0, 'the step has no `run: |` script');
  const script = action
    .slice(start + '      run: |\n'.length)
    .split('\n')
    .map((l) => l.replace(/^ {8}/, ''))
    .join('\n');
  const pinned = (name) => {
    const m = new RegExp(`\\n {8}${name}: (\\S+)\\n`).exec(action);
    assert.ok(m, `the step pins no ${name}`);
    return m[1];
  };
  const image = pinned('IMAGE');
  const base = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'agent-toolchain-')),
  );
  // A copy of the action: what a job has is a checkout of it, and nothing
  // run here may reach the repository's own.
  const actionDir = path.join(base, 'action');
  cpSync(ACTION_DIR, actionDir, { recursive: true });
  const bin = path.join(base, 'bin');
  const nodocker = path.join(base, 'nodocker');
  const temp = path.join(base, 'work', '_temp');
  const home = path.join(base, 'home');
  for (const d of [
    'bin',
    'nodocker',
    'ran',
    'extra',
    'home',
    'work/_temp/agent-tools',
    'tgz/package/bin',
  ]) {
    mkdirSync(path.join(base, d), { recursive: true });
  }
  writeFileSync(path.join(temp, 'agent-tools', 'script.mjs'), 'trusted');
  writeFileSync(path.join(base, 'step.sh'), script);
  // `entry.sh` as the container would run it, its mount points rewritten.
  writeFileSync(
    path.join(base, 'entry.sh'),
    readFileSync(path.join(actionDir, 'entry.sh'), 'utf8')
      .replaceAll('/opt/agent-toolchain', actionDir)
      .replaceAll('/opt/pnpm', '$OPT_PNPM'),
  );
  // The stand-in for pnpm: it is told nothing through its environment, so it
  // finds its record, and any extra thing to do, by the name of the case
  // directory it is run in.
  writeFileSync(
    path.join(base, 'tgz/package/bin/pnpm.cjs'),
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { execFileSync } = require('node:child_process');",
      `const base = ${JSON.stringify(base)};`,
      'const n = path.basename(path.dirname(path.dirname(process.cwd())));',
      "if (process.argv[2] === '--version') {",
      "  console.log('9.15.9');",
      '  process.exit(0);',
      '}',
      "try { fs.writeFileSync(path.join(base, 'ran', n), process.argv.slice(2).join('\\n')); } catch {}",
      "fs.mkdirSync('node_modules', { recursive: true });",
      "const extra = path.join(base, 'extra', n);",
      "if (fs.existsSync(extra)) execFileSync('sh', [extra], { stdio: 'inherit' });",
      "if (fs.existsSync('.in-container.sh')) execFileSync('sh', ['.in-container.sh', base], { stdio: 'inherit' });",
      '',
    ].join('\n'),
  );
  writeFileSync(
    path.join(base, 'tgz/package/package.json'),
    json({ name: 'pnpm', version: '9.15.9' }),
  );
  execFileSync('tar', [
    '-czf',
    path.join(base, 'pnpm.tgz'),
    '-C',
    path.join(base, 'tgz'),
    'package',
  ]);
  const integrity = `sha512-${createHash('sha512')
    .update(readFileSync(path.join(base, 'pnpm.tgz')))
    .digest('base64')}`;
  const stub = (name, lines) =>
    writeFileSync(
      path.join(bin, name),
      ['#!/bin/sh', ...lines, ''].join('\n'),
      {
        mode: 0o755,
      },
    );
  stub('curl', [
    'out=""; url=""',
    'while [ $# -gt 0 ]; do [ "$1" = "--output" ] && out="$2"; url="$1"; shift; done',
    `echo "$url" > "${base}/ran/url"`,
    `cp "${base}/pnpm.tgz" "$out"`,
  ]);
  stub('docker', [
    'for a in "$@"; do root="$a"; done',
    'n="$(basename "$(dirname "$(dirname "$root")")")"',
    `printf '%s\\n' "$@" > "${base}/ran/$n.docker"`,
    `env > "${base}/ran/$n.env"`,
    'for a in "$@"; do case "$a" in *:/opt/pnpm:ro) OPT_PNPM="${a%:/opt/pnpm:ro}" ;; esac; done',
    'export OPT_PNPM',
    `exec sh "${base}/entry.sh" "$root"`,
  ]);
  // A PATH with no Docker on it at all, whatever this machine has: the
  // tools the step uses, one link each.
  copyFileSync(path.join(bin, 'curl'), path.join(nodocker, 'curl'));
  const realBin = path.join(base, 'realbin');
  mkdirSync(realBin);
  copyFileSync(path.join(bin, 'curl'), path.join(realBin, 'curl'));
  for (const tool of [
    'bash',
    'sh',
    'node',
    'env',
    'mktemp',
    'mkdir',
    'chmod',
    'rm',
    'id',
    'tar',
    'openssl',
    'basename',
    'dirname',
    'cp',
  ]) {
    const found = execFileSync('sh', ['-c', `command -v ${tool}`], {
      encoding: 'utf8',
      env: {
        PATH: [path.dirname(process.execPath), process.env.PATH].join(
          path.delimiter,
        ),
      },
    }).trim();
    symlinkSync(found, path.join(nodocker, tool));
  }
  const outside = path.join(base, 'outside');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'keep'), 'keep');
  let n = 0;
  const run = (
    setup,
    { extra = '', env = {}, docker = true, real = false } = {},
  ) => {
    const name = `case${++n}`;
    // As on a runner: the workspace two levels below a directory of its own.
    const dir = path.join(base, 'work', name, 'repo', 'repo');
    mkdirSync(path.join(dir, 'packages', 'sdk'), { recursive: true });
    mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
    writeFileSync(path.join(dir, '.git', 'config'), '[core]\n');
    writeFileSync(path.join(dir, '.npmrc'), 'branch=1\n');
    writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), TREE.workspace);
    writeFileSync(path.join(dir, 'pnpm-lock.yaml'), TREE.lockfile);
    writeFileSync(path.join(dir, 'package.json'), json(TREE.root));
    writeFileSync(path.join(dir, 'packages/sdk/package.json'), json(TREE.sdk));
    setup?.(dir);
    if (extra) writeFileSync(path.join(base, 'extra', name), extra);
    const ran = path.join(base, 'ran', name);
    const pathFile = `${ran}.path`;
    writeFileSync(pathFile, '');
    const r = spawnSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-e',
        '-o',
        'pipefail',
        path.join(base, 'step.sh'),
      ],
      {
        // The step is started in the workspace, as a runner starts it.
        cwd: dir,
        encoding: 'utf8',
        env: {
          // `real`: the stub for the tarball, and this machine's own Docker.
          ...(real && process.env.DOCKER_HOST
            ? { DOCKER_HOST: process.env.DOCKER_HOST }
            : {}),
          PATH: real
            ? [realBin, path.dirname(process.execPath), process.env.PATH].join(
                path.delimiter,
              )
            : docker
              ? [bin, path.dirname(process.execPath), process.env.PATH].join(
                  path.delimiter,
                )
              : nodocker,
          HOME: home,
          RUNNER_TEMP: temp,
          GITHUB_WORKSPACE: dir,
          GITHUB_PATH: pathFile,
          ACTION_PATH: actionDir,
          IMAGE: image,
          PNPM_VERSION: pinned('PNPM_VERSION'),
          PNPM_INTEGRITY: integrity,
          ...env,
        },
      },
    );
    return {
      dir,
      name,
      status: r.status,
      err: r.stderr,
      installed: existsSync(ran),
      reached: existsSync(`${ran}.docker`),
      ran,
      pathFile,
    };
  };
  return {
    run,
    base,
    outside,
    temp,
    home,
    image,
    integrity,
    actionDir,
    cleanup: () => {
      // A case may have left a directory it made unlistable.
      execFileSync('chmod', ['-R', 'u+rwx', base]);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/** `file` under `dir`, rewritten by `edit(text)`. */
const rewrite = (dir, file, edit) =>
  writeFileSync(
    path.join(dir, file),
    edit(readFileSync(path.join(dir, file), 'utf8')),
  );
/** Replace `from` in `text`, failing if it is not there to replace. */
const swap = (from, to) => (text) => {
  assert.ok(text.includes(from), `nothing to replace: ${from}`);
  return text.replace(from, to);
};

test('the step installs an ordinary tree without the runner touching it', () => {
  const step = installStep();
  try {
    // The job's environment is full of things a package manager or a
    // container client would act on; none of them reaches either.
    const ok = step.run(
      (dir) => {
        // A link that stays among the workspace's own files is not refused.
        symlinkSync('packages', path.join(dir, 'alias'));
        mkdirSync(path.join(dir, '.trusted-toolchain'));
      },
      {
        env: {
          npm_config_store_dir: '/nonexistent/store',
          NPM_CONFIG_USERCONFIG: '/nonexistent/rc',
          PNPM_HOME: '/nonexistent/pnpm',
          COREPACK_HOME: '/nonexistent/corepack',
          NODE_OPTIONS: '--require /nonexistent/hook.cjs',
          DOCKER_CONFIG: '/nonexistent/docker',
          GH_TOKEN: 'not-for-the-install',
        },
      },
    );
    assert.equal(ok.status, 0, ok.err);
    assert.equal(ok.installed, true);
    // pnpm came from the one fixed address, for the pinned version.
    assert.equal(
      readFileSync(path.join(step.base, 'ran', 'url'), 'utf8').trim(),
      'https://registry.npmjs.org/pnpm/-/pnpm-9.15.9.tgz',
    );
    // ONE line on the PATH of later steps: a directory under the runner's
    // temp directory holding a launcher for that pnpm, which works.
    const lines = readFileSync(ok.pathFile, 'utf8').trimEnd().split('\n');
    assert.equal(lines.length, 1);
    const tools = path.dirname(lines[0]);
    assert.match(lines[0], /\/work\/_temp\/agent-pnpm\.[A-Za-z0-9]+\/bin$/);
    assert.deepEqual(readdirSync(lines[0]), ['pnpm']);
    assert.equal(
      execFileSync('pnpm', ['--version'], {
        encoding: 'utf8',
        cwd: step.base,
        env: {
          PATH: [lines[0], path.dirname(process.execPath)].join(path.delimiter),
        },
      }).trim(),
      '9.15.9',
    );
    // The runner's temp directory holds that and what was there: the step's
    // own directory is gone.
    assert.deepEqual(readdirSync(step.temp).sort(), [
      path.basename(tools),
      'agent-tools',
    ]);
    // THE WORKSPACE IS AS THE CHECKOUT LEFT IT, but for what the install
    // made: the branch's `.npmrc` was never moved, and nothing else changed.
    assert.equal(
      readFileSync(path.join(ok.dir, '.npmrc'), 'utf8'),
      'branch=1\n',
    );
    assert.deepEqual(readdirSync(ok.dir).sort(), [
      '.git',
      '.npmrc',
      '.trusted-toolchain',
      'alias',
      'node_modules',
      'package.json',
      'packages',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ]);

    // THE CONTAINER THE STEP ASKS FOR, argument by argument, for this tree.
    const args = readFileSync(`${ok.ran}.docker`, 'utf8').trimEnd().split('\n');
    const work = /^(.*\/agent-toolchain\.[A-Za-z0-9]+)\/empty:/.exec(
      args.find((a) => a.endsWith('/.git:ro')) ?? '',
    )?.[1];
    assert.ok(
      work && path.dirname(work) === step.temp,
      "the directory that covers `.git` is not the step's own, outside the workspace",
    );
    assert.deepEqual(args, [
      'run',
      '--rm',
      '--pull',
      'missing',
      '--network',
      'bridge',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--env',
      'CI=true',
      '--env',
      'HOME=/tmp/home',
      '--workdir',
      ok.dir,
      '--volume',
      `${ok.dir}:${ok.dir}`,
      '--volume',
      `${work}/empty:${ok.dir}/.git:ro`,
      '--volume',
      `${work}/empty:${ok.dir}/.trusted-toolchain:ro`,
      '--volume',
      `${step.actionDir}/npmrc:${ok.dir}/.npmrc:ro`,
      '--volume',
      `${step.actionDir}:/opt/agent-toolchain:ro`,
      '--volume',
      `${tools}/pnpm:/opt/pnpm:ro`,
      '--entrypoint',
      'sh',
      step.image,
      '/opt/agent-toolchain/entry.sh',
      ok.dir,
    ]);
    // What the container client was given: a PATH and an empty
    // configuration of the step's own. (`PWD`, `SHLVL` and `_` are the
    // shell's.) The container gets `CI` and a scratch `HOME`, above.
    const given = Object.fromEntries(
      readFileSync(`${ok.ran}.env`, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
        .filter(
          ([k]) => !['PWD', 'SHLVL', '_', 'OLDPWD', 'OPT_PNPM'].includes(k),
        ),
    );
    assert.deepEqual(Object.keys(given).sort(), ['DOCKER_CONFIG', 'PATH']);
    assert.equal(given.DOCKER_CONFIG, `${work}/docker`);
    // ...and the install inside it.
    assert.deepEqual(readFileSync(ok.ran, 'utf8').split('\n'), [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--ignore-pnpmfile',
      '--config.manage-package-manager-versions=false',
      '--config.modules-dir=node_modules',
      '--config.virtual-store-dir=node_modules/.pnpm',
      '--config.store-dir=/tmp/pnpm-store',
    ]);
    rmSync(tools, { recursive: true });

    /** After a step that failed, the temp directory is as it was. */
    const clean = (what) =>
      assert.deepEqual(readdirSync(step.temp), ['agent-tools'], what);

    // NO DOCKER, NO INSTALL — and nothing fetched either.
    const without = step.run(null, { docker: false });
    assert.notEqual(without.status, 0);
    assert.match(
      without.err,
      /Docker is not available; the install does not run outside a container/,
    );
    assert.equal(existsSync(path.join(without.dir, 'node_modules')), false);
    assert.equal(readFileSync(without.pathFile, 'utf8'), '');
    clean('no docker');
    // A pnpm that is not the one pinned: by hash, or by major.
    const other = step.run(null, {
      env: { PNPM_INTEGRITY: `sha512-${'B'.repeat(86)}==` },
    });
    assert.notEqual(other.status, 0);
    assert.match(other.err, /the pnpm tarball is not the one pinned/);
    assert.equal(other.reached, false);
    assert.equal(readFileSync(other.pathFile, 'utf8'), '');
    clean('another hash');
    const major = step.run(null, { env: { PNPM_VERSION: '10.5.2' } });
    assert.notEqual(major.status, 0);
    assert.match(major.err, /pnpm is not major 9/);
    assert.equal(major.reached, false);
    clean('another major');

    // WHAT THE RUNNER REFUSES BEFORE THE CONTAINER, from three fixed names
    // it looks at without following a link.
    for (const [name, setup, message] of [
      [
        'no root .npmrc',
        (dir) => rmSync(path.join(dir, '.npmrc')),
        /no regular \.npmrc at its root/,
      ],
      [
        'a root .npmrc that is a link',
        (dir) => {
          rmSync(path.join(dir, '.npmrc'));
          symlinkSync('package.json', path.join(dir, '.npmrc'));
        },
        /no regular \.npmrc at its root/,
      ],
      [
        'a root .npmrc that is a directory',
        (dir) => {
          rmSync(path.join(dir, '.npmrc'));
          mkdirSync(path.join(dir, '.npmrc'));
        },
        /no regular \.npmrc at its root/,
      ],
      [
        'a .git that is a link',
        (dir) => {
          rmSync(path.join(dir, '.git'), { recursive: true });
          symlinkSync('packages', path.join(dir, '.git'));
        },
        /no \.git directory of its own to cover/,
      ],
      [
        'no .git at all',
        (dir) => rmSync(path.join(dir, '.git'), { recursive: true }),
        /no \.git directory of its own to cover/,
      ],
      [
        'a .git that is a file',
        (dir) => {
          rmSync(path.join(dir, '.git'), { recursive: true });
          writeFileSync(path.join(dir, '.git'), 'gitdir: elsewhere\n');
        },
        /no \.git directory of its own to cover/,
      ],
      [
        'a .trusted-* directory with a name that would not mount as written',
        (dir) => mkdirSync(path.join(dir, '.trusted-x:rw')),
        /a \.trusted-\* directory has a name this step does not mount/,
      ],
    ]) {
      const r = step.run(setup);
      assert.notEqual(r.status, 0, `${name}: the step did not fail`);
      assert.match(r.err, message, name);
      assert.equal(r.reached, false, `${name}: the container was started`);
      clean(name);
    }
    // A `.trusted-*` LINK is not covered — covering it would hide whatever it
    // points at — and is refused in the container, like any link there.
    const linked = step.run((dir) =>
      symlinkSync('packages', path.join(dir, '.trusted-zz')),
    );
    assert.notEqual(linked.status, 0);
    assert.match(linked.err, /\.trusted-zz is a symbolic link/);
    assert.ok(
      !readFileSync(`${linked.ran}.docker`, 'utf8').includes('.trusted-zz'),
      'a link named .trusted-* was mounted over',
    );
    assert.equal(linked.installed, false);

    // THE TRIPWIRE. A container cannot write to `.git`, the runner's temp
    // directory, its home, or beside the workspace, and the allow-list keeps
    // links among the workspace's own files; so none of this can happen for
    // real. The stand-in does each anyway, and the step must notice and
    // fail, before the agent runs.
    for (const [name, extra, message] of [
      [
        'a new hook',
        'echo x > .git/hooks/pre-commit\n',
        /changed the repository's \.git \(\.git\/hooks\/pre-commit\)/,
      ],
      [
        'a changed config',
        'echo x >> .git/config\n',
        /changed the repository's \.git \(\.git\/config\)/,
      ],
      [
        'a config of the same size and time, with other content',
        'touch -r .git/config .git/ref\nprintf "[cora]\\n" > .git/config\ntouch -r .git/ref .git/config\nrm .git/ref\n',
        /changed the repository's \.git \(\.git\/config\)/,
      ],
      [
        'a changed staged script',
        `echo x > "${step.temp}/agent-tools/script.mjs"\n`,
        /changed the runner's temp directory \(agent-tools\/script\.mjs\)/,
      ],
      [
        'a new file in the temp directory',
        `echo x > "${step.temp}/new"\n`,
        /changed the runner's temp directory \(new\)/,
      ],
      [
        'something beside the workspace',
        'mkdir -p ../sibling\n',
        /changed the directories around the workspace/,
      ],
      [
        'something beside its parent',
        'mkdir -p ../../sibling\n',
        /changed the directories around the workspace/,
      ],
      [
        'a setting in the home directory',
        `echo x=1 > "${step.home}/.npmrc"\n`,
        /changed the package-manager settings in the runner's home \(\.npmrc\)/,
      ],
      [
        'a setting under the home directory',
        `mkdir -p "${step.home}/.config/pnpm" && echo x=1 > "${step.home}/.config/pnpm/rc"\n`,
        /changed the package-manager settings in the runner's home \(\.config\/pnpm/,
      ],
      [
        'a link out of the workspace',
        'ln -s ../../.. out\n',
        /out is a symbolic link out of the workspace's own files/,
      ],
      [
        'an absolute link',
        'ln -s /etc abs\n',
        /abs is a symbolic link out of the workspace's own files/,
      ],
      [
        'a link into .git',
        'ln -s .git/config later\n',
        /later is a symbolic link out of the workspace's own files/,
      ],
      [
        'a link into a trusted checkout',
        'mkdir -p x && ln -s ../.trusted-toolchain/a x/t\n',
        /x\/t is a symbolic link out of the workspace's own files/,
      ],
      [
        'a link into the temp directory',
        `ln -s "${step.temp}/agent-tools" tools\n`,
        /tools is a symbolic link out of the workspace's own files/,
      ],
      [
        'a link that replaced a directory',
        'rm -rf packages/sdk && ln -s ../../../.. packages/sdk\n',
        /packages\/sdk is a symbolic link/,
      ],
      [
        'a directory the walk cannot list',
        `mkdir -p h/.git && ln -s "${step.temp}/agent-tools" h/l && chmod 311 h\n`,
        /h cannot be listed/,
      ],
      [
        'a .git below the root',
        'mkdir -p sub/.git/hooks\n',
        /sub\/\.git: a \.git below the workspace root after the install/,
      ],
    ]) {
      const r = step.run(
        (dir) => mkdirSync(path.join(dir, '.trusted-toolchain')),
        { extra },
      );
      assert.equal(r.installed, true, name);
      assert.notEqual(r.status, 0, `${name}: the step did not fail`);
      assert.match(r.err, message, name);
      rmSync(path.join(step.temp, 'new'), { force: true });
      rmSync(path.join(step.home, '.npmrc'), { force: true });
      rmSync(path.join(step.home, '.config'), { recursive: true, force: true });
      writeFileSync(
        path.join(step.temp, 'agent-tools', 'script.mjs'),
        'trusted',
      );
      clean(name);
    }
    // A link the checkout already had, unchanged, is not the install's.
    assert.deepEqual(readdirSync(step.outside), ['keep']);
  } finally {
    step.cleanup();
  }
});

test('in a real container, the install can write only to the tree it is given', (t) => {
  // THE ONE TEST HERE THAT IS NOT STUBBED, where the lane has Docker (a
  // GitHub-hosted Ubuntu runner does): the step itself, a real container
  // from the pinned image, and in place of pnpm a stand-in that tries to
  // write everywhere an install must not. It is skipped, and says so, where
  // there is no Docker to run it.
  // Asked the way the step asks: with an empty client configuration, so a
  // daemon only a stored context knows of does not count.
  const emptyConfig = mkdtempSync(path.join(os.tmpdir(), 'agent-docker-'));
  const probe = spawnSync('docker', ['version', '--format', '{{.Server.Os}}'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      DOCKER_CONFIG: emptyConfig,
      ...(process.env.DOCKER_HOST
        ? { DOCKER_HOST: process.env.DOCKER_HOST }
        : {}),
    },
  });
  rmSync(emptyConfig, { recursive: true, force: true });
  if (probe.status !== 0 || probe.stdout.trim() !== 'linux') {
    t.skip('no Docker in this lane; containment is pinned by text only here');
    return;
  }
  const step = installStep();
  try {
    const ATTEMPTS = [
      ['a file in .git', 'echo x > .git/hooks/pre-commit'],
      ["the repository's configuration", 'echo x >> .git/config'],
      ['a trusted checkout', 'echo x > .trusted-toolchain/action.yml'],
      ['the root .npmrc', 'echo x > .npmrc'],
      ['removing the root .npmrc', 'rm .npmrc'],
      ['beside the workspace', 'echo x > ../beside'],
      ['pnpm itself', 'echo x > /opt/pnpm/bin/pnpm.cjs'],
      ['this action', 'echo x > /opt/agent-toolchain/entry.sh'],
    ];
    const r = step.run(
      (dir) => {
        mkdirSync(path.join(dir, '.trusted-toolchain'));
        writeFileSync(
          path.join(dir, '.trusted-toolchain', 'action.yml'),
          'main',
        );
        writeFileSync(
          path.join(dir, '.in-container.sh'),
          [
            ...ATTEMPTS.map(
              ([, command], i) =>
                `if (${command}) 2>/dev/null; then echo "${i} wrote" >> result.txt; else echo "${i} refused" >> result.txt; fi`,
            ),
            'echo "git: $(ls -A .git | wc -l)" >> result.txt',
            'echo "trusted: $(ls -A .trusted-toolchain | wc -l)" >> result.txt',
            'echo "temp: $(ls -A "$1/work/_temp" 2>/dev/null | wc -l)" >> result.txt',
            'echo "env: $(env | cut -d= -f1 | sort | tr "\\n" " ")" >> result.txt',
            'cp .npmrc npmrc.seen',
            '',
          ].join('\n'),
        );
      },
      { real: true },
    );
    assert.equal(r.status, 0, r.err);
    // A link through /proc resolves INTO the workspace in the container;
    // it is refused there all the same, by what it says.
    const viaProc = step.run(
      (dir) => symlinkSync('/proc/self/cwd', path.join(dir, 'x')),
      { real: true },
    );
    assert.notEqual(viaProc.status, 0);
    assert.match(
      viaProc.err,
      /x is a symbolic link that leads through the system/,
    );
    const result = readFileSync(path.join(r.dir, 'result.txt'), 'utf8')
      .trimEnd()
      .split('\n');
    ATTEMPTS.forEach(([name], i) => {
      assert.equal(
        result[i],
        `${i} refused`,
        `the container could write ${name}`,
      );
    });
    // `.git` and the trusted checkout are not even readable in there, the
    // runner's temp directory is not there at all, and the environment is
    // the image's own plus `CI` and a scratch `HOME`.
    assert.equal(result[ATTEMPTS.length].replace(/\s+/g, ' '), 'git: 0');
    assert.equal(
      result[ATTEMPTS.length + 1].replace(/\s+/g, ' '),
      'trusted: 0',
    );
    assert.equal(result[ATTEMPTS.length + 2].replace(/\s+/g, ' '), 'temp: 0');
    const env = result[ATTEMPTS.length + 3]
      .replace('env: ', '')
      .trim()
      .split(' ');
    for (const k of env) {
      assert.ok(
        [
          'CI',
          'HOME',
          'HOSTNAME',
          'NODE_VERSION',
          'YARN_VERSION',
          'PATH',
          'PWD',
          'OLDPWD',
          'SHLVL',
          '_',
        ].includes(k),
        `the container was given ${k}`,
      );
    }
    // The install read main's `.npmrc`; the branch's is where it was.
    assert.equal(
      readFileSync(path.join(r.dir, 'npmrc.seen'), 'utf8'),
      readFileSync(path.join(ACTION_DIR, 'npmrc'), 'utf8'),
    );
    assert.equal(
      readFileSync(path.join(r.dir, '.npmrc'), 'utf8'),
      'branch=1\n',
    );
    assert.equal(
      readFileSync(
        path.join(r.dir, '.trusted-toolchain', 'action.yml'),
        'utf8',
      ),
      'main',
    );
    // ...and so are the action's own files.
    for (const file of ACTION_FILES) {
      assert.equal(
        readFileSync(path.join(step.actionDir, file), 'utf8'),
        readFileSync(path.join(ACTION_DIR, file), 'utf8'),
        file,
      );
    }
    assert.deepEqual(readdirSync(path.join(r.dir, '.git', 'hooks')), []);
    assert.equal(
      readFileSync(path.join(r.dir, '.git', 'config'), 'utf8'),
      '[core]\n',
    );
    assert.equal(existsSync(path.join(path.dirname(r.dir), 'beside')), false);
  } finally {
    step.cleanup();
  }
});

test('a symbolic link is judged by its text, every one of them, and nothing may hide from the walk', () => {
  // WHERE A LINK LEADS DEPENDS ON WHO FOLLOWS IT. A target that goes through
  // a process's own view of the filesystem resolves into the workspace for
  // the check that runs in the container and somewhere else for a later step
  // on the runner. So a link is judged by what it SAYS, in the container
  // before the install and on the runner after it — and after it, every
  // link is judged, whether the checkout had it or the install made it.
  const root = '/w/repo/repo';
  const leaves = (at, target, temp = null) =>
    installInputs.linkLeaves(root, path.join(root, at), target, temp);
  for (const [at, target] of [
    ['x', 'packages/sdk'],
    ['packages/y', '../docs'],
    ['a/b/c', '../../packages/./sdk'],
    ['x', `${root}/packages`],
    ['node_modules/dep', '.pnpm/dep@1.0.0/node_modules/dep'],
    ['x', 'proc/self'],
  ]) {
    assert.equal(leaves(at, target), '', `${at} -> ${target}`);
  }
  for (const [at, target, why] of [
    ['x', '/proc/self/cwd', /system/],
    ['packages/y', '/proc/self/cwd/packages', /system/],
    ['z', `/proc/self/root${root}/packages`, /system/],
    ['x', '/dev/fd/0', /system/],
    ['x', '/sys/kernel', /system/],
    ['x', `${root}/../proc/self/cwd`, /system/],
    ['x', '/etc', /out of the workspace/],
    ['x', '/w/repo/repo-other', /out of the workspace/],
    ['x', '..', /out of the workspace/],
    ['a/b', '../../..', /out of the workspace/],
    ['x', `${root}/../../_temp`, /out of the workspace/],
    ['x', '.git/config', /\.git or a trusted checkout/],
    ['a/b', '../.git', /\.git or a trusted checkout/],
    ['x', '.trusted-toolchain/.github', /\.git or a trusted checkout/],
    ['x', `${root}/.trusted-cred`, /\.git or a trusted checkout/],
  ]) {
    assert.match(leaves(at, target), why, `${at} -> ${target}`);
  }
  assert.match(
    leaves('x', 'tmp/tools', `${root}/tmp`),
    /runner's temp directory/,
  );

  // ON A TREE. `checkLinks` is what the runner runs after the container;
  // `checkTree` what the container runs before the install.
  const base = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'agent-links-')),
  );
  try {
    const temp = path.join(base, '_temp');
    mkdirSync(path.join(temp, 'agent-tools'), { recursive: true });
    let n = 0;
    const tree = (setup) => {
      const dir = path.join(base, `t${++n}`, 'repo');
      mkdirSync(path.join(dir, 'packages', 'sdk'), { recursive: true });
      mkdirSync(path.join(dir, '.git'));
      mkdirSync(path.join(dir, '.trusted-toolchain'));
      setup(dir);
      return dir;
    };
    const after = (dir) => installInputs.checkLinks(dir, { runnerTemp: temp });
    const before = (dir) => installInputs.checkTree(dir);
    // A link among the workspace's own files passes both.
    const fine = tree((dir) =>
      symlinkSync('packages/sdk', path.join(dir, 'x')),
    );
    after(fine);
    before(fine);
    for (const [name, setup, message] of [
      [
        'through /proc',
        (d) => symlinkSync('/proc/self/cwd', path.join(d, 'x')),
        /x is a symbolic link .*system/,
      ],
      [
        'through /proc, below',
        (d) =>
          symlinkSync('/proc/self/cwd/packages', path.join(d, 'packages', 'y')),
        /packages\/y is a symbolic link .*system/,
      ],
      [
        'through /proc to the workspace itself',
        (d) => symlinkSync(`/proc/self/root${d}/packages`, path.join(d, 'z')),
        /z is a symbolic link .*system/,
      ],
      [
        'a device',
        (d) => symlinkSync('/dev/fd/0', path.join(d, 'x')),
        /system/,
      ],
      [
        'into the temp directory',
        (d) => symlinkSync(path.join(temp, 'agent-tools'), path.join(d, 'x')),
        /x is a symbolic link/,
      ],
      [
        'into .git',
        (d) => symlinkSync('.git/config', path.join(d, 'x')),
        /x is a symbolic link/,
      ],
      [
        'into a trusted checkout',
        (d) => symlinkSync('.trusted-toolchain/.github', path.join(d, 'x')),
        /x is a symbolic link/,
      ],
      [
        'out by a relative path',
        (d) => symlinkSync('../../..', path.join(d, 'packages', 'up')),
        /packages\/up is a symbolic link/,
      ],
    ]) {
      // BOTH checks refuse it, each on its own: neither leans on the other
      // having run, and `after` does not ask whether the link is new.
      assert.throws(
        () => after(tree(setup)),
        (e) => e instanceof installInputs.Refusal && message.test(e.message),
        `after: ${name}`,
      );
      assert.throws(
        () => before(tree(setup)),
        (e) => e instanceof installInputs.Refusal && message.test(e.message),
        `before: ${name}`,
      );
    }

    // NOTHING MAY HIDE. A directory that cannot be listed could hold a link
    // or a `.git` the walk never sees, so it is a refusal — in the walk
    // after the install and in the record before it.
    const hidden = tree((d) => {
      mkdirSync(path.join(d, 'h', '.git'), { recursive: true });
      symlinkSync(path.join(temp, 'agent-tools'), path.join(d, 'h', 'l'));
      chmodSync(path.join(d, 'h'), 0o311);
    });
    try {
      assert.throws(() => after(hidden), /h cannot be listed/);
    } finally {
      chmodSync(path.join(hidden, 'h'), 0o755);
    }
    const blind = tree(() => {});
    chmodSync(blind, 0o311);
    try {
      assert.throws(() => after(blind), /cannot be listed/);
    } finally {
      chmodSync(blind, 0o755);
    }
    const unlistable = path.join(temp, 'agent-tools', 'closed');
    mkdirSync(unlistable);
    chmodSync(unlistable, 0o311);
    try {
      assert.throws(
        () => installInputs.takeSnapshot(fine, { runnerTemp: temp }),
        /closed cannot be listed/,
      );
    } finally {
      chmodSync(unlistable, 0o755);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }

  // THIS REPOSITORY TRACKS NO SYMBOLIC LINK, so none of the above refuses an
  // ordinary checkout of it. One that is added on purpose shows up here.
  const links = execFileSync('git', ['ls-files', '-s'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.startsWith('120000 '));
  assert.deepEqual(links, []);
});

test('the install step refuses a tree that could lead it outside the workspace', () => {
  // THE INSTALL STAYS INSIDE THE WORKSPACE, and flags alone do not make it:
  // where a package manager writes also follows from the shape of the tree
  // it is pointed at. RUN FOR REAL, not read: each tree below is refused
  // BEFORE the install is reached (the stub records whether it was).
  const step = installStep();
  try {
    const { outside } = step;
    const refused = [
      [
        'a symlinked root node_modules',
        (dir) => symlinkSync(outside, path.join(dir, 'node_modules')),
        /refuses a symlinked node_modules/,
      ],
      [
        'a symlinked node_modules in a package, pointing inside',
        (dir) =>
          symlinkSync('.', path.join(dir, 'packages', 'sdk', 'node_modules')),
        /refuses a symlinked node_modules/,
      ],
      [
        'a node_modules the checkout brought with it',
        (dir) => mkdirSync(path.join(dir, 'packages', 'sdk', 'node_modules')),
        /brings its own node_modules/,
      ],
      [
        'a package directory that is a link to outside',
        (dir) => symlinkSync(outside, path.join(dir, 'packages', 'other')),
        /is a symbolic link that leads out of the workspace/,
      ],
      [
        'a .npmrc that is not the root one',
        (dir) =>
          writeFileSync(path.join(dir, 'packages', 'sdk', '.npmrc'), 'x=1\n'),
        /packages\/sdk\/\.npmrc: a \.npmrc that is not the workspace root's/,
      ],
      [
        'a directory named .npmrc',
        (dir) => mkdirSync(path.join(dir, 'packages', '.npmrc')),
        /a \.npmrc that is not the workspace root's/,
      ],
      [
        'a .git below the root',
        (dir) => mkdirSync(path.join(dir, 'packages', 'sdk', '.git')),
        /a \.git below the workspace root/,
      ],
      [
        'a link into .git',
        (dir) => symlinkSync('.git/config', path.join(dir, 'cfg')),
        /cfg is a symbolic link that leads into \.git or a trusted checkout/,
      ],
      [
        "a link through a process's own view of the filesystem",
        (dir) => symlinkSync('/proc/self/cwd', path.join(dir, 'x')),
        /x is a symbolic link that leads through the system/,
      ],
      [
        'such a link back to the workspace itself',
        (dir) =>
          symlinkSync(`/proc/self/root${dir}/packages`, path.join(dir, 'z')),
        /z is a symbolic link that leads through the system/,
      ],
      [
        'a link that resolves nowhere',
        (dir) => symlinkSync('nowhere', path.join(dir, 'dangling')),
        /does not resolve/,
      ],
      [
        'a workspace glob that climbs out of the root',
        (dir) =>
          rewrite(dir, 'pnpm-workspace.yaml', (t) => `${t}  - '../outside'\n`),
        /pnpm-workspace\.yaml names a path outside/,
      ],
      [
        'a workspace glob that climbs out from inside a path',
        (dir) =>
          rewrite(
            dir,
            'pnpm-workspace.yaml',
            (t) => `${t}  - packages/../../outside\n`,
          ),
        /pnpm-workspace\.yaml names a path outside/,
      ],
      [
        'an absolute workspace glob',
        (dir) =>
          rewrite(dir, 'pnpm-workspace.yaml', (t) => `${t}  - ${outside}\n`),
        /pnpm-workspace\.yaml/,
      ],
      [
        'a workspace file with a key this repository does not use',
        (dir) =>
          rewrite(
            dir,
            'pnpm-workspace.yaml',
            (t) => `${t}modulesDir: ../outside\n`,
          ),
        /`modulesDir` is not allowed here/,
      ],
      [
        'no workspace file',
        (dir) => rmSync(path.join(dir, 'pnpm-workspace.yaml')),
        /pnpm-workspace\.yaml is missing/,
      ],
      [
        'a lockfile importer that climbs out of the root',
        (dir) =>
          rewrite(
            dir,
            'pnpm-lock.yaml',
            swap(
              '  packages/sdk: {}',
              '  packages/sdk: {}\n\n  ../outside: {}',
            ),
          ),
        /pnpm-lock\.yaml: names a project/,
      ],
      [
        'a lockfile importer that climbs out from inside a path',
        (dir) =>
          rewrite(
            dir,
            'pnpm-lock.yaml',
            swap(
              '  packages/sdk: {}',
              '  packages/sdk: {}\n\n  packages/../../outside: {}',
            ),
          ),
        /pnpm-lock\.yaml: names a project/,
      ],
      [
        'a lockfile with no importers',
        (dir) =>
          writeFileSync(
            path.join(dir, 'pnpm-lock.yaml'),
            "lockfileVersion: '9.0'\n",
          ),
        /lists no importers/,
      ],
      [
        'a workspace project the lockfile does not list',
        (dir) => {
          mkdirSync(path.join(dir, 'packages', 'more'));
          writeFileSync(
            path.join(dir, 'packages', 'more', 'package.json'),
            json({ name: 'more' }),
          );
        },
        /packages\/more is a workspace project the lockfile does not list/,
      ],
    ];
    for (const [name, setup, message] of refused) {
      const r = step.run(setup);
      assert.notEqual(r.status, 0, `${name}: the step did not fail`);
      assert.match(r.err, message, name);
      assert.match(r.err, /^::error::agent-toolchain: /m, name);
      assert.equal(r.installed, false, `${name}: the install was reached`);
    }
    // Nothing was written to the directory the links pointed at.
    assert.deepEqual(readdirSync(outside), ['keep']);
  } finally {
    step.cleanup();
  }
});

test('the install step fetches registry packages and nothing else', () => {
  // WHAT THE INSTALL IS TOLD. With scripts, hooks and the branch's settings
  // off, an install still does what the lockfile says: a locked package whose
  // `resolution` is anything but a registry integrity hash is fetched some
  // other way, and a dependency that is not a registry range or `workspace:`
  // is found somewhere other than the registry. So every one of those is
  // refused before the install — by an allow-list of the shapes this
  // repository's own files have, never by a list of the shapes to avoid.
  // Each tree below is one field moved off that list.
  const step = installStep();
  try {
    const lock = (from, to) => (dir) =>
      rewrite(dir, 'pnpm-lock.yaml', swap(from, to));
    const RES = `    resolution: {integrity: ${HASH}}`;
    const resolution = (text) => lock(RES, `    resolution: ${text}`);
    const manifest = (file, edit) => (dir) =>
      rewrite(dir, file, (t) => {
        const m = JSON.parse(t);
        edit(m);
        return json(m);
      });
    const SHAPE = /its resolution is not exactly one of the allowed shapes/;
    const refused = [
      // --- the resolution of a locked package ---
      [
        'a git resolution',
        resolution('{type: git, repo: https://example.org/x.git, commit: abc}'),
        SHAPE,
      ],
      [
        'a git resolution in block style',
        lock(
          RES,
          '    resolution:\n      type: git\n      repo: https://example.org/x.git\n      commit: abc',
        ),
        SHAPE,
      ],
      [
        'a directory resolution',
        resolution('{directory: ../outside, type: directory}'),
        SHAPE,
      ],
      [
        'a local tarball',
        resolution('{tarball: file:../outside/dep.tgz}'),
        SHAPE,
      ],
      [
        'a tarball from another host',
        resolution('{tarball: https://example.org/dep.tgz}'),
        SHAPE,
      ],
      [
        'a hash and a tarball',
        resolution(
          `{integrity: ${HASH}, tarball: https://example.org/dep.tgz}`,
        ),
        SHAPE,
      ],
      [
        'a hash and a type',
        resolution(`{integrity: ${HASH}, type: git}`),
        SHAPE,
      ],
      [
        'a hash and a path',
        resolution(`{integrity: ${HASH}, path: ../outside}`),
        SHAPE,
      ],
      ['a hash of another kind', resolution('{integrity: sha1-AAAA}'), SHAPE],
      ['no resolution', lock(`${RES}\n`, '    hasBin: true\n'), SHAPE],
      [
        'a tarball on that registry, at its own path, for a package outside the scope',
        resolution(
          '{tarball: https://buf.build/gen/npm/v1/dep/-/dep-1.0.0.tgz}',
        ),
        SHAPE,
      ],
      [
        'the one tarball shape, for a package outside its scope',
        resolution(
          '{tarball: https://buf.build/gen/npm/v1/@buf/x/-/x-1.0.0.tgz}',
        ),
        SHAPE,
      ],
      [
        'a package whose name is a path',
        (dir) =>
          rewrite(dir, 'pnpm-lock.yaml', (t) =>
            t.replaceAll('  dep@1.0.0:', "  '@a/../../x@1.0.0':"),
          ),
        /not a registry package `name@version`|not a snapshot/,
      ],
      [
        'a package that is not from the registry',
        (dir) =>
          rewrite(dir, 'pnpm-lock.yaml', (t) =>
            t.replaceAll('  dep@1.0.0:', '  dep@file:vendor/dep.tgz:'),
          ),
        /pnpm-lock\.yaml/,
      ],
      [
        'a locked package with a key this repository does not use',
        lock(RES, `${RES}\n    name: other`),
        /`name` is not allowed here/,
      ],
      // --- what an importer asks for ---
      [
        'a git specifier',
        lock('specifier: ^1.0.0', 'specifier: github:x/y'),
        /dep is not asked for from the registry/,
      ],
      [
        'a URL specifier',
        lock('specifier: ^1.0.0', 'specifier: https://example.org/dep.tgz'),
        /pnpm-lock\.yaml/,
      ],
      [
        'a file specifier',
        lock('specifier: ^1.0.0', 'specifier: file:../outside'),
        /dep is not asked for from the registry/,
      ],
      [
        'a version that is not a registry version',
        lock('version: 1.0.0', 'version: file:../outside'),
        /locked to something that is not a registry version/,
      ],
      [
        'a link that leaves the workspace',
        lock('version: link:packages/sdk', 'version: link:../outside'),
        /links to something that is not a project of this workspace/,
      ],
      [
        'a link to a directory that is not a project',
        lock('version: link:packages/sdk', 'version: link:packages'),
        /links to something that is not a project of this workspace/,
      ],
      [
        'a link asked for by path',
        lock('specifier: workspace:*', 'specifier: link:packages/sdk'),
        /linked but not asked for as `workspace:`/,
      ],
      [
        'an importer with a key this repository does not use',
        lock(
          '  packages/sdk: {}',
          '  packages/sdk:\n    publishDirectory: ../../outside',
        ),
        /`publishDirectory` is not allowed here/,
      ],
      [
        'a snapshot that depends on something off the registry',
        lock(
          '  dep@1.0.0: {}',
          '  dep@1.0.0:\n    dependencies:\n      other: link:../outside',
        ),
        /other is not a registry version/,
      ],
      [
        'a snapshot of a package the lockfile does not lock',
        lock('  dep@1.0.0: {}', '  dep@1.0.0: {}\n\n  other@1.0.0: {}'),
        /not a snapshot of a package this lockfile locks/,
      ],
      [
        'a top-level key this repository does not use',
        (dir) =>
          rewrite(
            dir,
            'pnpm-lock.yaml',
            (t) =>
              `${t}\npatchedDependencies:\n  dep@1.0.0:\n    path: ../outside/x.patch\n`,
          ),
        /`patchedDependencies` is not allowed here/,
      ],
      [
        'another lockfile version',
        lock("lockfileVersion: '9.0'", "lockfileVersion: '6.0'"),
        /lockfileVersion/,
      ],
      [
        'an override that is not a range',
        lock('importers:', 'overrides:\n  dep: link:../outside\n\nimporters:'),
        /not overridden with a registry range/,
      ],
      // --- the manifests ---
      [
        'a manifest dependency off the registry',
        manifest('packages/sdk/package.json', (m) => {
          m.dependencies = { x: 'github:x/y' };
        }),
        /x is not asked for from the registry or the workspace/,
      ],
      [
        'a workspace specifier that is a path',
        manifest('package.json', (m) => {
          m.devDependencies.sdk = 'workspace:../outside';
        }),
        /sdk is not asked for from the registry or the workspace/,
      ],
      [
        'a root manifest that patches a dependency',
        manifest('package.json', (m) => {
          m.pnpm = { patchedDependencies: { 'dep@1.0.0': 'x.patch' } };
        }),
        /pnpm\.patchedDependencies is not allowed/,
      ],
      [
        'a root override that is not a range',
        manifest('package.json', (m) => {
          m.pnpm = { overrides: { dep: 'link:../outside' } };
        }),
        /pnpm\.overrides `dep` is not a registry range/,
      ],
      [
        'a `resolutions` field',
        manifest('package.json', (m) => {
          m.resolutions = { dep: 'file:../outside' };
        }),
        /`resolutions` is not a key a manifest may have here/,
      ],
      [
        'a `pnpm` field in a package',
        manifest('packages/sdk/package.json', (m) => {
          m.pnpm = { executionEnv: { nodeVersion: '18.0.0' } };
        }),
        /a `pnpm` field outside the root manifest/,
      ],
      [
        'a package published from another directory',
        manifest('packages/sdk/package.json', (m) => {
          m.publishConfig = { directory: '../../outside', linkDirectory: true };
        }),
        /publishConfig\.directory is not allowed/,
      ],
      [
        'an injected dependency',
        manifest('package.json', (m) => {
          m.dependenciesMeta = { sdk: { injected: true } };
        }),
        /`dependenciesMeta` is not a key a manifest may have here/,
      ],
      // --- what a manifest says that becomes a path ---
      [
        'a bin whose name climbs out of its directory',
        manifest('packages/sdk/package.json', (m) => {
          m.bin = { '@x/../../../outside/tool': './x.js' };
        }),
        /bin names a command that is not one plain name/,
      ],
      [
        "a bin whose name leads into the repository's own directory",
        manifest('packages/sdk/package.json', (m) => {
          m.bin = { '@x/../../.git/hooks/pre-commit': './x.js' };
        }),
        /bin names a command that is not one plain name/,
      ],
      [
        'a bin with a scope in its name',
        manifest('packages/sdk/package.json', (m) => {
          m.bin = { '@x/tool': './x.js' };
        }),
        /bin names a command that is not one plain name/,
      ],
      [
        'a bin named by a package name that is a path',
        manifest('packages/sdk/package.json', (m) => {
          m.name = '@x/../../../outside/tool';
          m.bin = './x.js';
        }),
        /name is not a package name/,
      ],
      [
        'a bin that points outside its package',
        manifest('packages/sdk/package.json', (m) => {
          m.bin = { tool: '../../../outside/tool' };
        }),
        /bin `tool` is not a path inside the package/,
      ],
      [
        'a bin that is neither a string nor an object',
        manifest('packages/sdk/package.json', (m) => {
          m.bin = ['./x.js'];
        }),
        /bin is not a string or an object/,
      ],
      [
        'a directory of bins',
        manifest('packages/sdk/package.json', (m) => {
          m.directories = { bin: 'b' };
        }),
        /`directories` is not a key a manifest may have here/,
      ],
      [
        'a package name that is a path',
        manifest('packages/sdk/package.json', (m) => {
          m.name = '../../outside';
        }),
        /name is not a package name/,
      ],
      [
        'a version that is a path',
        manifest('packages/sdk/package.json', (m) => {
          m.version = '1.0.0/../../x';
        }),
        /version is not a version/,
      ],
      [
        'a dependency called by a path',
        manifest('package.json', (m) => {
          m.devDependencies['../../outside'] = 'workspace:*';
        }),
        /devDependencies names `\.\.\/\.\.\/outside`/,
      ],
      [
        'a scoped dependency called by a path',
        manifest('package.json', (m) => {
          m.devDependencies['@a/../../../outside'] = '^1.0.0';
        }),
        /devDependencies names/,
      ],
      [
        'a locked dependency called by a path',
        lock('      sdk:\n', '      ../../outside:\n'),
        /\.\.\/\.\.\/outside is not a package name/,
      ],
      [
        'a snapshot dependency called by a path',
        lock(
          '  dep@1.0.0: {}',
          '  dep@1.0.0:\n    dependencies:\n      ../../outside: 1.0.0',
        ),
        /is not a registry version/,
      ],
      [
        'a key no manifest here uses',
        manifest('packages/sdk/package.json', (m) => {
          m.man = ['../../../outside/keep'];
        }),
        /`man` is not a key a manifest may have here/,
      ],
      [
        'workspaces declared in a manifest',
        manifest('package.json', (m) => {
          m.workspaces = ['../*'];
        }),
        /`workspaces` is not a key a manifest may have here/,
      ],
      [
        'bundled dependencies',
        manifest('packages/sdk/package.json', (m) => {
          m.bundledDependencies = ['dep'];
        }),
        /`bundledDependencies` is not a key a manifest may have here/,
      ],
      [
        'a publishConfig key that is not on the list',
        manifest('packages/sdk/package.json', (m) => {
          m.publishConfig = { executableFiles: ['./x'] };
        }),
        /publishConfig\.executableFiles is not allowed/,
      ],
      [
        'scripts that are not strings',
        manifest('package.json', (m) => {
          m.scripts = { build: ['x'] };
        }),
        /scripts is not an object of strings/,
      ],
      [
        'a manifest in another format',
        (dir) =>
          writeFileSync(
            path.join(dir, 'packages', 'sdk', 'package.yaml'),
            'name: sdk\n',
          ),
        /package\.yaml: a manifest that is not package\.json/,
      ],
      [
        'a project with no package.json',
        (dir) => rmSync(path.join(dir, 'packages', 'sdk', 'package.json')),
        /packages\/sdk\/package\.json is missing/,
      ],
      [
        'a manifest that is not JSON',
        (dir) =>
          writeFileSync(path.join(dir, 'package.json'), '{name: "root"}'),
        /package\.json: not JSON/,
      ],
    ];
    for (const [name, setup, message] of refused) {
      const r = step.run(setup);
      assert.notEqual(r.status, 0, `${name}: the step did not fail`);
      assert.match(r.err, message, name);
      assert.match(r.err, /^::error::agent-toolchain: /m, name);
      assert.equal(r.installed, false, `${name}: the install was reached`);
    }

    // A command a package offers under one plain name, from a file of its
    // own, is an ordinary thing to have, and installs.
    for (const bin of [
      { tool: './x.js' },
      { 'my-tool.2': 'bin/x.js' },
      './x.js',
    ]) {
      const r = step.run(
        manifest('packages/sdk/package.json', (m) => {
          m.bin = bin;
        }),
      );
      assert.equal(r.status, 0, r.err);
    }

    // THE ONE EXCEPTION, and only as this repository has it: a package of
    // the `@buf` scope, at its own path on the registry the trusted `.npmrc`
    // names for that scope, by address rather than by hash.
    const BUF = '{tarball: https://buf.build/gen/npm/v1/@buf/x/-/x-1.0.0.tgz}';
    const buf = step.run((dir) =>
      rewrite(dir, 'pnpm-lock.yaml', (t) =>
        t
          .replaceAll('  dep@1.0.0:', "  '@buf/x@1.0.0':")
          .replace(RES, `    resolution: ${BUF}`)
          .replace('      dep:\n', "      '@buf/x':\n"),
      ),
    );
    assert.equal(buf.status, 0, buf.err);
    for (const [name, text] of [
      ['another host', BUF.replace('buf.build', 'buf.build.example.org')],
      ['another scheme', BUF.replace('https:', 'http:')],
      ["another package's path", BUF.replaceAll('/x', '/y')],
      ['a path that climbs', BUF.replace('@buf/x/-/', '@buf/x/-/../../')],
    ]) {
      const r = step.run((dir) =>
        rewrite(dir, 'pnpm-lock.yaml', (t) =>
          t
            .replaceAll('  dep@1.0.0:', "  '@buf/x@1.0.0':")
            .replace(RES, `    resolution: ${text}`)
            .replace('      dep:\n', "      '@buf/x':\n"),
        ),
      );
      assert.notEqual(r.status, 0, name);
      assert.match(r.err, SHAPE, name);
      assert.equal(r.installed, false, name);
    }
  } finally {
    step.cleanup();
  }
});

test('the install step reads its inputs strictly, and refuses what it does not fully understand', () => {
  // ONE DOCUMENT, MANY SPELLINGS. A check that reads YAML line by line is
  // only as good as its guess at how the line will be written, and YAML
  // offers many ways to write one mapping. So the reader accepts the one
  // style pnpm itself writes and refuses every line that is anything else —
  // including spellings of a perfectly ordinary lockfile, which is what each
  // of these is. None says anything the plain tree does not.
  const step = installStep();
  try {
    const respelled = [
      [
        'an anchor and an alias',
        '  packages/sdk: {}',
        '  packages/sdk: &a {}\n\n  other: *a',
      ],
      ['a merge key', '  packages/sdk: {}', '  packages/sdk:\n    <<: {}'],
      ['a tag', 'version: 1.0.0', 'version: !!str 1.0.0'],
      [
        'a double-quoted key',
        '        version: 1.0.0',
        '        "version": 1.0.0',
      ],
      ['a double-quoted value', 'version: 1.0.0', 'version: "1.0.0"'],
      ['a quoted key in a one-line mapping', '{integrity: ', "{'integrity': "],
      ['a one-line mapping without spaces', '{integrity: ', '{"integrity":'],
      ['a folded scalar', 'version: 1.0.0', 'version: >-\n          1.0.0'],
      ['a literal scalar', 'version: 1.0.0', 'version: |\n          1.0.0'],
      [
        'a mapping over two lines',
        '  packages/sdk: {}',
        '  packages/sdk: {\n  }',
      ],
      [
        'a nested one-line mapping',
        '  packages/sdk: {}',
        '  packages/sdk: {dependencies: {}}',
      ],
      [
        'a repeated key',
        '  packages/sdk: {}',
        '  packages/sdk: {}\n\n  packages/sdk: {}',
      ],
      ['a second document', 'snapshots:', '---\nsnapshots:'],
      ['an explicit key', '  packages/sdk: {}', '  ? packages/sdk\n  : {}'],
      ['a tab', '  packages/sdk: {}', '  packages/sdk:\t{}'],
      ['a trailing comment', '  packages/sdk: {}', '  packages/sdk: {} # x'],
      ['an escaped quote', 'specifier: ^1.0.0', "specifier: '^1.0.0'''"],
      ['odd indentation', '    devDependencies:', '   devDependencies:'],
      [
        'a value on the next line',
        'version: 1.0.0',
        'version:\n          1.0.0',
      ],
      [
        'a directive',
        "lockfileVersion: '9.0'",
        "%YAML 1.2\n---\nlockfileVersion: '9.0'",
      ],
      ['a carriage return', '  packages/sdk: {}', '  packages/sdk: {}\r'],
      ['a comment after a value', 'version: 1.0.0', 'version: 1.0.0 # x'],
      ['an anchor on a value', 'version: 1.0.0', 'version: &v 1.0.0'],
      ['an alias as a value', 'version: 1.0.0', 'version: *v'],
      ['a key that is a merge', '  packages/sdk: {}', "  '<<': {}"],
      ['a key with a colon in it', '  packages/sdk: {}', '  a: b: {}'],
      ['a tab between words', 'version: 1.0.0', 'version: 1.0.0\tx'],
      ['a form feed', 'version: 1.0.0', 'version: 1.0.0\fx'],
    ];
    for (const [name, from, to] of respelled) {
      // By the reader alone, whatever a later check would have said...
      assert.throws(
        () =>
          installInputs.readStrictYaml(swap(from, to)(TREE.lockfile), 'doc'),
        installInputs.Refusal,
        name,
      );
      // ...and by the step, before the install.
      const r = step.run((dir) =>
        rewrite(dir, 'pnpm-lock.yaml', swap(from, to)),
      );
      assert.notEqual(r.status, 0, `${name}: the step did not fail`);
      assert.match(r.err, /^::error::agent-toolchain: pnpm-lock\.yaml/m, name);
      assert.equal(r.installed, false, `${name}: the install was reached`);
    }
    // The workspace file is read by the same reader.
    for (const [name, text] of [
      ['a one-line list', "packages: ['packages/*', '../outside']\n"],
      ['double quotes', 'packages:\n  - "packages/*"\n'],
      ['an alias', "packages: &p\n  - 'packages/*'\nother: *p\n"],
    ]) {
      const r = step.run((dir) =>
        writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), text),
      );
      assert.notEqual(r.status, 0, name);
      assert.match(
        r.err,
        /^::error::agent-toolchain: pnpm-workspace\.yaml/m,
        name,
      );
      assert.equal(r.installed, false, name);
    }
  } finally {
    step.cleanup();
  }
});

test("the install checker accepts this repository's own files, and they have the shapes it allows", () => {
  // The allow-list is this repository's files, so they must pass it — read
  // here from the checkout, by the function the step runs.
  const importers = installInputs.checkInputs(ROOT);
  assert.ok(importers.includes('.') && importers.includes('packages/sdk'));
  assert.ok(importers.length >= 20, `found ${importers.length} importers`);

  // THE RESOLUTION SHAPES IN THE LOCKFILE, counted: an integrity hash for
  // every package but one. That one is the `@buf` package, which its
  // registry serves without a hash — the exception the checker carries, and
  // the reason it is one. A second shape appearing here is a decision to
  // make, not a line to add.
  const shapes = new Map();
  for (const m of read('pnpm-lock.yaml').matchAll(
    /^ {4}resolution: \{(\w+): /gm,
  )) {
    shapes.set(m[1], (shapes.get(m[1]) ?? 0) + 1);
  }
  assert.deepEqual([...shapes.keys()].sort(), ['integrity', 'tarball']);
  assert.equal(shapes.get('tarball'), 1);
  assert.ok(shapes.get('integrity') > 1000);
  assert.match(
    read('pnpm-lock.yaml'),
    /^ {2}'@buf\/[^']+':\n {4}resolution: \{tarball: https:\/\/buf\.build\/gen\/npm\/v1\/@buf\//m,
  );
  // ...on the registry the trusted `.npmrc` names for that scope.
  assert.match(
    readFileSync(path.join(ACTION_DIR, 'npmrc'), 'utf8'),
    /^@buf:registry=https:\/\/buf\.build\/gen\/npm\/v1$/m,
  );

  // The reader gives back what was written, and nothing cleverer.
  const doc = installInputs.readStrictYaml(
    "a:\n  b: 1.0\n  'c d': 'x: y'\nlist:\n  - one\nflow: {k: v}\n",
    'doc',
  );
  assert.equal(doc.get('a').get('b'), '1.0');
  assert.equal(doc.get('a').get('c d'), 'x: y');
  assert.deepEqual(doc.get('list'), ['one']);
  assert.equal(doc.get('flow').get('k'), 'v');
  assert.throws(
    () => installInputs.readStrictYaml('__proto__: {}\n', 'doc'),
    installInputs.Refusal,
  );

  // It imports nothing but Node's own modules: it runs from a checkout of
  // the action's directory alone.
  const source = readFileSync(
    path.join(ACTION_DIR, 'check-install-inputs.mjs'),
    'utf8',
  );
  const imported = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.ok(imported.length >= 4);
  for (const spec of imported) {
    assert.match(spec, /^node:/, `the checker imports ${spec}`);
  }
  assert.ok(
    !/\bimport\(|require\(|child_process|eval\(|Function\(/.test(source),
  );
});

test("the toolchain action's pins are this repository's: pnpm, Node, .npmrc", () => {
  const code = codeOf(
    readFileSync(path.join(ACTION_DIR, 'action.yml'), 'utf8'),
  );
  // PNPM, EXACTLY: one version and the registry's own hash of its tarball,
  // side by side in the step's `env`. The step downloads that one file and
  // refuses it if the hash differs, so the pair is what decides which pnpm
  // every agent job runs.
  const pin =
    /\n {8}PNPM_VERSION: (\d+)\.(\d+\.\d+)\n {8}PNPM_INTEGRITY: (sha512-[A-Za-z0-9+/]{86}==)\n/.exec(
      code,
    );
  assert.ok(pin, 'the action does not pin a pnpm version and its hash');
  const major = pin[1];
  assert.equal(
    `${pin[1]}.${pin[2]} ${pin[3]}`,
    '9.15.9 sha512-aARhQYk8ZvrQHAeSMRKOmvuJ74fiaR1p5NQO7iKJiClf1GghgbrlW1hBjDolO95lpQXsfF+UA+zlzDzTfc8lMQ==',
    'the pnpm version or its hash changed: they change together, from the ' +
      "registry's `dist.integrity` for that version, and here with them",
  );
  const ci = codeOf(read(checks.CI_WORKFLOW_PATH));

  // THE INSTALL STEP WAS AUDITED AGAINST PNPM 9, and only 9. That major takes
  // its settings from `.npmrc` and the command line, which is what the step
  // controls. A later major also reads settings from `pnpm-workspace.yaml`,
  // a file the branch controls, so the step's refusals would no longer cover
  // everything that decides where the install writes. Moving the major means
  // repeating that audit (see "THE INSTALL STAYS INSIDE THE WORKSPACE" in
  // the action) and then changing this number with it.
  assert.equal(
    major,
    '9',
    'the toolchain action installs with a pnpm major its install step was not audited against — ' +
      're-audit the step (which settings that major reads from files in the working tree) before changing this',
  );

  // The pnpm major is the one every `ci.yml` job installs with.
  const ciPnpm = [
    ...ci.matchAll(
      /uses: pnpm\/action-setup@\S+\n\s+with:\n\s+version: (\d+)\n/g,
    ),
  ].map((m) => m[1]);
  assert.ok(ciPnpm.length >= 2, 'could not read the pnpm version from ci.yml');
  for (const v of ciPnpm) {
    assert.equal(
      v,
      major,
      'the toolchain action and ci.yml install different pnpm majors',
    );
  }
  // ...and the lockfile is one that major reads.
  assert.match(
    read('pnpm-lock.yaml'),
    new RegExp(`^lockfileVersion: '${major}\\.\\d+'$`, 'm'),
  );
  // `package.json` names no package manager today. If it gains one, it has to
  // agree, or `pnpm/action-setup` refuses to run with two versions.
  const pm = JSON.parse(read('package.json')).packageManager;
  if (pm !== undefined) {
    assert.match(
      pm,
      new RegExp(`^pnpm@${major}\\.`),
      'package.json names another pnpm',
    );
  }

  // Node is set up by the workflows, not the action, and `.nvmrc` (`lts/*`)
  // names no version to compare. What can be pinned: every agent job that
  // calls the action runs the Node `ci.yml`'s `build` job tests on.
  const build = ci.slice(ci.indexOf('\n  build:\n'));
  const matrix = /node-version: \[([^\]]+)\]/.exec(build);
  assert.ok(matrix, "could not read the build job's Node matrix from ci.yml");
  const ciNodes = matrix[1].split(',').map((s) => s.trim());
  let callers = 0;
  for (const file of readdirSync(WORKFLOWS).filter((f) =>
    /^agent-.*\.yml$/.test(f),
  )) {
    const wf = codeOf(readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    if (
      !/uses: \.\/(?:\.trusted-toolchain\/)?\.github\/actions\/agent-toolchain\s*$/m.test(
        wf,
      )
    ) {
      continue;
    }
    callers++;
    const nodes = [
      ...wf.matchAll(
        /uses: actions\/setup-node@\S+\n(?:\s+if: [^\n]*\n)?\s+with:\n\s+node-version: (\S+)/g,
      ),
    ].map((m) => m[1]);
    assert.ok(
      nodes.length > 0,
      `${file} calls the toolchain action but sets up no Node`,
    );
    for (const node of nodes) {
      assert.ok(
        ciNodes.includes(node),
        `${file} runs Node ${node}; ci.yml's build job tests on ${ciNodes.join(', ')}`,
      );
    }
    // No pnpm cache on the caller's Node setup either.
    assert.ok(!/cache: ['"]?pnpm/.test(wf), `${file} caches the pnpm store`);
  }
  // Five jobs verify with pnpm: the three fixers, the reply, and implement.
  assert.equal(
    callers,
    5,
    `expected the five agent jobs, found ${callers} callers`,
  );

  // MAIN'S .npmrc, COPIED. The action cannot read the root `.npmrc`: a caller
  // checks out only the action's directory from `main`. So a copy sits beside
  // it, and it has to stay equal. This workflow does not start on a change to
  // the root file alone, so the same comparison also runs on every pull
  // request, in `scripts/test/agent-toolchain-npmrc.test.mjs` — which this
  // asserts is there, and is in the suite `ci.yml` and `verify:fast` run.
  const perPr = 'scripts/test/agent-toolchain-npmrc.test.mjs';
  assert.ok(tracked.includes(perPr), `${perPr} is no longer tracked`);
  assert.match(
    read(perPr),
    /COPY = path\.join\(ROOT, '\.github\/actions\/agent-toolchain\/npmrc'\)/,
  );
  const rootScripts = JSON.parse(read('package.json')).scripts;
  assert.equal(
    rootScripts['test:scripts'],
    "node --test 'scripts/test/**/*.test.mjs'",
  );
  assert.ok(rootScripts['verify:fast'].includes('pnpm test:scripts'));
  assert.ok(ci.includes('pnpm test:scripts'));
  assert.equal(
    readFileSync(path.join(ACTION_DIR, 'npmrc'), 'utf8'),
    read('.npmrc'),
    '.github/actions/agent-toolchain/npmrc is not the root .npmrc — copy it over',
  );
  // `lstat`: `stat` follows the link and could never say so.
  for (const file of ACTION_FILES) {
    const st = lstatSync(path.join(ACTION_DIR, file));
    assert.ok(
      st.isFile() && !st.isSymbolicLink(),
      `${file} beside the toolchain action is not a regular file`,
    );
  }
  assert.match(
    read('.npmrc'),
    /^@buf:registry=https:\/\/buf\.build\/gen\/npm\/v1$/m,
  );
  // Only these: anything else beside the action is checked out into the
  // fixer's workspace with it.
  assert.deepEqual(readdirSync(ACTION_DIR).sort(), ACTION_FILES);
});

// --- the credentials a fix agent's token could reach -----------------------------------

test('a release the agent App created publishes nothing', () => {
  // `contents: write` IS ONE PERMISSION COVERING COMMITS AND RELEASES. The
  // token a fix agent holds to push a branch can therefore publish a release,
  // and `npm-publish.yml` answers `release: published` with `NPM_TOKEN` and
  // `devtools-publish.yml` with the Chrome Web Store keys. GitHub offers no
  // narrower grant, so the escape closes at the consumer or not at all.
  //
  // These two are not harness files: a harness sync does not touch them, and
  // this test is what notices if the refusal is ever dropped.
  const appBot = CONFIG.repo.appLogins.find((l) => l.endsWith('[bot]'));
  assert.equal(appBot, 'yorkie-team-agent[bot]');
  const workflows = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'));
  const triggers = (f) => {
    const code = codeOf(readFileSync(path.join(WORKFLOWS, f), 'utf8')).split(
      '\n',
    );
    return code.slice(
      0,
      code.findIndex((l) => /^jobs:/.test(l)),
    );
  };
  const onRelease = workflows.filter((f) =>
    triggers(f).some((l) => /^\s+release:\s*$/.test(l)),
  );
  assert.deepEqual(
    onRelease.sort(),
    ['devtools-publish.yml', 'npm-publish.yml'],
    'the release-triggered publishers must be found — this guard would be vacuous',
  );
  for (const file of onRelease) {
    assert.ok(
      readFileSync(path.join(WORKFLOWS, file), 'utf8').includes(
        `github.event.release.author.login != '${appBot}'`,
      ),
      `${file} runs on a published release and would run for one the agent App created`,
    );
  }
  // THE SAME CREDENTIALS, REACHED THROUGH A MERGE. `contents: write` also
  // merges a PR a human already approved, which is a push to `main` authored
  // by the App — and a push-triggered workflow that holds a real credential
  // answers it the same way. Every such workflow must refuse the App as the
  // actor.
  //
  // This repository has none today: its push-triggered workflows are `ci.yml`
  // (Codecov's upload token only), `github-page-publish.yml` (GITHUB_TOKEN
  // only, deploying what `main` already holds) and `agent-scripts.yml` (no
  // secret at all). The predicate matches a secret referenced directly as
  // well as `secrets: inherit`, so the loop is empty by fact and re-arms the
  // day a push-triggered workflow reaches for a real credential. Codecov's
  // token is allowed: it can only upload a coverage report.
  const HARMLESS = new Set(['GITHUB_TOKEN', 'CODECOV_TOKEN']);
  const onPush = workflows.filter((f) =>
    triggers(f).some((l) => /^\s+push:\s*$/.test(l)),
  );
  assert.ok(
    onPush.includes('ci.yml'),
    'the push-triggered workflows must be found',
  );
  for (const file of onPush) {
    const text = codeOf(readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    const named = [...text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map(
      (m) => m[1],
    );
    const credentialed =
      /^\s+secrets: inherit\s*$/m.test(text) ||
      named.some((name) => !HARMLESS.has(name));
    if (!credentialed) continue;
    assert.ok(
      text.includes(`github.actor != '${appBot}'`),
      `${file} holds a credential on a push and would run for one the agent App made by merging`,
    );
  }
});
