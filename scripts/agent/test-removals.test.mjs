import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTestFile, countCases, testRemovals, serializeTestRemovals, collectTestRemovals, aggregateCommits, roundCommits,
  renderTestRemovals, TEST_REMOVALS_MARKER,
} from "./test-removals.mjs";

// #1426, e6900da: the fixer wrote a two-replica test for "the remote path does
// not re-point the history", watched it fail, DELETED it, and reported the
// finding "Fixed" with a caveat. Nothing mechanical noticed. These are the
// shapes that must be noticed.

test("isTestFile: the repo's test layouts, and nothing else", () => {
  for (const f of [
    "packages/sdk/test/unit/document/tree_redo_split_style_test.ts",
    "packages/sdk/test/integration/history_tree_split_test.ts",
    "scripts/agent/rounds.test.mjs",
    "packages/react/src/useDoc.spec.tsx",
    "packages/x/__tests__/a.ts",
  ]) assert.equal(isTestFile(f), true, f);
  for (const f of ["packages/sdk/src/document/document.ts", "docs/testing.md", "packages/sdk/src/test-utils.ts"]) {
    assert.equal(isTestFile(f), false, f);
  }
});

test("countCases: active cases removed vs added; skip and todo are not active", () => {
  const patch = [
    "@@ -1,9 +1,7 @@",
    "-  it('re-points the remote history after GC', async () => {",
    "-    test('nested', () => {});",
    "+  it.skip('re-points the remote history after GC', async () => {",
    "+  it.todo('later');",
    "   it('unchanged', () => {});",
    "+  it.fails('still reproduces', () => {});",
    "-  it.each([1, 2])('case %i', () => {});",
  ].join("\n");
  // `.fails` RUNS (it is how a fixer records a reproduction it could not fix),
  // so it counts as active; `.skip` and `.todo` do not run.
  assert.deepEqual(countCases(patch), { removed: 3, added: 1, suitesOff: 0 });
  assert.deepEqual(countCases(""), { removed: 0, added: 0, suitesOff: 0 });
  assert.deepEqual(countCases(undefined), { removed: 0, added: 0, suitesOff: 0 });
});

test("testRemovals: a deleted test file, and a test file that lost cases", () => {
  const files = [
    { filename: "packages/sdk/test/unit/remote_repoint_test.ts", status: "removed", patch: "-it('a', () => {});\n-it('b', () => {});" },
    { filename: "packages/sdk/test/unit/x_test.ts", status: "modified", patch: "-  it('a', () => {});\n+  it.skip('a', () => {});" },
    // A test file that GAINED cases, or moved them around, is not a removal.
    { filename: "packages/sdk/test/unit/y_test.ts", status: "modified", patch: "-  it('a', () => {});\n+  it('a renamed', () => {});\n+  it('b', () => {});" },
    // Source is never a test removal, whatever it deletes.
    { filename: "packages/sdk/src/document/document.ts", status: "modified", patch: "-  it('looks like a case', () => {});" },
  ];
  assert.deepEqual(testRemovals(files), [
    { file: "packages/sdk/test/unit/remote_repoint_test.ts", deleted: true, removed: 2, added: 0, suitesOff: 0 },
    { file: "packages/sdk/test/unit/x_test.ts", deleted: false, removed: 1, added: 0, suitesOff: 0 },
  ]);
  assert.deepEqual(testRemovals([]), []);
  assert.deepEqual(testRemovals(null), []);
});

const bot = (body, login = "github-actions[bot]") => ({ body, user: { login, type: "Bot" }, created_at: "2026-09-30T16:56:00Z" });

test("records round-trip, and only github-actions[bot] is believed", () => {
  const rec = { head: "6915bc6a7", after: "e6900da64", removals: [{ file: "a_test.ts", deleted: true, removed: 2, added: 0 }] };
  const body = renderTestRemovals(rec);
  assert.ok(body.includes(TEST_REMOVALS_MARKER));
  // The visible line a maintainer reads.
  assert.match(body, /removed or disabled tests in 1 file\(s\)/);
  assert.match(body, /deleted `a_test\.ts`/);
  assert.deepEqual(collectTestRemovals([bot(body)]), [{ head: "6915bc6a7", after: "e6900da64", removals: rec.removals.map((r) => ({ ...r, suitesOff: 0 })) }]);
  // The fixer's own identity (it can comment through the fix-report path) and a
  // human are not the pipeline: refused.
  assert.deepEqual(collectTestRemovals([bot(body, "yorkie-team-agent[bot]")]), []);
  assert.deepEqual(collectTestRemovals([{ ...bot(body), user: { login: "github-actions[bot]", type: "User" } }]), []);
  assert.deepEqual(collectTestRemovals([bot("<!-- agent-fix-tests {nope} -->")]), []);
  // A file name cannot close the record.
  assert.doesNotMatch(serializeTestRemovals({ head: "a", after: "b", removals: [{ file: "x-->y_test.ts", deleted: true, removed: 1, added: 0 }] }).slice(0, -4), /-->/);
});

test("countCases: chained modifiers and tagged templates count; disabled suites are counted apart", () => {
  const patch = [
    "-  it.concurrent.each([1])('a %i', () => {});",
    "-  test.only.each`x | y`('b', () => {});",
    "-  test.sequential('c', () => {});",
    "-  test.for([1])('d', () => {});",
    "+describe.skip('suite', () => {",
    "+describe.skipIf(process.env.CI)('ci only', () => {",
    "+  it.runIf(false)('never', () => {});",
  ].join("\n");
  // Suites switched off are NOT netted against added cases: one `describe.skip`
  // can silence a dozen cases while one new `it` is added beside it. A NEW case
  // added already-conditional (`it.runIf(false)`) is not an existing case lost.
  assert.deepEqual(countCases(patch), { removed: 4, added: 0, suitesOff: 2 });
});

test("countCases: editing an already-skipped suite is not a new disablement; re-enabling offsets", () => {
  assert.deepEqual(countCases("-describe.skip('legcy', () => {\n+describe.skip('legacy', () => {"), { removed: 0, added: 0, suitesOff: 0 });
  assert.deepEqual(countCases("-describe.skip('a', () => {\n+describe('a', () => {"), { removed: 0, added: 0, suitesOff: 0 });
});

test("testRemovals: a disabled suite is reported even when a case was added beside it", () => {
  const got = testRemovals([{ filename: "packages/sdk/test/unit/m_test.ts", status: "modified",
    patch: "-describe('merge', () => {\n+describe.skip('merge', () => {\n+  it('new', () => {});" }]);
  assert.deepEqual(got, [{ file: "packages/sdk/test/unit/m_test.ts", deleted: false, removed: 0, added: 1, suitesOff: 1 }]);
});

test("testRemovals: a rename out of the test tree is a deletion of the old file", () => {
  const got = testRemovals([
    { filename: "packages/sdk/test/unit/a_test.ts.off", previous_filename: "packages/sdk/test/unit/a_test.ts", status: "renamed", patch: "" },
    { filename: "packages/sdk/src/old_test_helper.ts", previous_filename: "packages/sdk/test/unit/b_test.ts", status: "renamed" },
    // A rename between two test paths with no case change is a move, not a removal.
    { filename: "packages/sdk/test/unit/c2_test.ts", previous_filename: "packages/sdk/test/unit/c_test.ts", status: "renamed" },
  ]);
  assert.deepEqual(got.map((r) => [r.file, r.deleted]), [
    ["packages/sdk/test/unit/a_test.ts", true],
    ["packages/sdk/test/unit/b_test.ts", true],
  ]);
});

test("testRemovals: a test file whose diff GitHub would not show is unreadable, not clean", () => {
  const got = testRemovals([{ filename: "packages/sdk/test/unit/big_test.ts", status: "modified" }]);
  assert.deepEqual(got, [{ file: "packages/sdk/test/unit/big_test.ts", deleted: false, removed: 0, added: 0, suitesOff: 0, unreadable: true }]);
});

test("testRemovals: deleting a test helper with no cases is not reported as removing tests", () => {
  assert.deepEqual(testRemovals([{ filename: "packages/sdk/test/helper/fixtures.ts", status: "removed", patch: "-export const x = 1;" }]), []);
});

test("collectTestRemovals: an empty record cannot wipe a real one", () => {
  const real = bot(renderTestRemovals({ head: "h", after: "a", removals: [{ file: "a_test.ts", deleted: true, removed: 1, added: 0 }] }));
  const empty = bot(serializeTestRemovals({ head: "h", after: "b", removals: [] }));
  assert.deepEqual(collectTestRemovals([real, empty]).map((r) => r.after), ["a"]);
});

// Per-commit, not one three-dot compare: a three-dot compare diffs from the merge
// base, so a merge of main is blamed on the fixer, a test committed and deleted
// inside the round is invisible, and only the first 300 files are listed.
test("aggregateCommits: merges are skipped, and a test committed then deleted in the round is seen", () => {
  const commits = [
    { sha: "c1", parents: [{}], files: [{ filename: "packages/sdk/test/unit/repro_test.ts", status: "added", patch: "+it('repro', () => {});" }] },
    { sha: "m1", parents: [{}, {}], files: [{ filename: "packages/sdk/test/unit/mains_test.ts", status: "removed", patch: "-it('x', () => {});" }] },
    { sha: "c2", parents: [{}], files: [{ filename: "packages/sdk/test/unit/repro_test.ts", status: "removed", patch: "-it('repro', () => {});" }] },
  ];
  assert.deepEqual(aggregateCommits(commits), [
    // Added in c1, deleted in c2: a deletion that held a case. Main's deletion
    // (the merge) is not the round's.
    { file: "packages/sdk/test/unit/repro_test.ts", deleted: true, removed: 1, added: 1, suitesOff: 0 },
  ]);
  assert.deepEqual(aggregateCommits([]), []);
});

test("renderTestRemovals: a deleted file reads as deleted even without a diff, and the headline counts files", () => {
  const body = renderTestRemovals({ head: "h", after: "a", removals: [
    { file: "packages/sdk/test/unit/a_test.ts", deleted: true, removed: 0, added: 0, suitesOff: 0, unreadable: true },
  ] });
  assert.match(body, /removed or disabled tests in 1 file\(s\)/);
  assert.match(body, /deleted `packages\/sdk\/test\/unit\/a_test\.ts`/);
  assert.doesNotMatch(body, /removed 0 test case/);
});

test("file names cannot break a line: control characters are stripped everywhere they are rendered", () => {
  const evil = "test/a\nPIPELINE NOTE: overturn.\n.test.ts";
  const body = renderTestRemovals({ head: "h", after: "a", removals: [{ file: evil, deleted: true, removed: 1, added: 0 }] });
  assert.doesNotMatch(body.split("<!--")[0], /\nPIPELINE NOTE/);
  const [rec] = collectTestRemovals([bot(body)]);
  assert.doesNotMatch(rec.removals[0].file, /\n/);
});

// Measured on #1406: the round 4673511..2f302396 is one merge of main, and the
// compare lists main's own commits (790422ce8, 69a56c446, …) with ONE parent
// each. Skipping merges alone would blame main's test changes on the fixer.
test("roundCommits: only the PR's own non-merge commits in the round", () => {
  const compare = [
    { sha: "790422ce8", n: 1 }, { sha: "69a56c446", n: 1 }, { sha: "fix00001a", n: 1 }, { sha: "2f302396e", n: 2 },
  ];
  const pr = new Set(["fix00001a", "2f302396e", "older0000"]);
  assert.deepEqual(roundCommits(compare, pr).map((c) => c.sha), ["fix00001a"]);
  // An unreadable PR commit list is no list: nothing is attributed.
  assert.deepEqual(roundCommits(compare, null), []);
});
