// Which tests did a fix round take away?
//
// WHY THIS EXISTS. On #1426 (e6900da) the fixer wrote a two-replica test for a
// finding, watched it fail, DELETED it, and reported the finding "Fixed" with a
// caveat in prose. The next round's adjudicator was told "a claim of having
// fixed something is not evidence that it was fixed" — and was given nothing
// else to go on. Weakened tests were left entirely to the test-adequacy lens
// (checks.mjs says as much), which reads the cumulative diff and cannot see a
// test that was written and removed between two of its rounds.
//
// This is the mechanical half. The trusted `fix-report` job compares the head
// before and after the fix round through the API — never a checkout the agent
// touched — and when a test file was deleted or lost active cases, posts a
// `<!-- agent-fix-tests -->` record as `github-actions[bot]`. The next round
// joins it to the fix report it belongs to (same `head`) and puts it in front of
// the adjudicator beside every "fixed" claim (fix-report.mjs). It decides
// nothing itself: a removed test can be a legitimate cleanup, so it is EVIDENCE
// for a component that already re-reads the code, not a gate.
//
// Usage:
//   node test-removals.mjs post <pr> --before <sha> --after <sha>
// Posts only when something was removed. Always exits 0: an unread compare is
// "no evidence", which is exactly the behaviour before this existed.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TEST_REMOVALS_MARKER = "<!-- agent-fix-tests ";
export const TEST_REMOVALS_VERSION = 1;
/** The one identity whose records are believed: the trusted job's GITHUB_TOKEN. */
export const TEST_REMOVALS_AUTHOR_LOGIN = "github-actions[bot]";

const str = (v) => (typeof v === "string" ? v : "");

/** This repo's test layouts: `test/` trees, `__tests__/`, and `*.test.*` / `*.spec.*` / `*_test.*` files. */
export function isTestFile(file) {
  const f = str(file);
  return /(^|\/)(test|tests|__tests__)\//.test(f) || /[._](test|spec)\.[cm]?[jt]sx?$/.test(f);
}

// An ACTIVE case declaration at the start of a diff line: `it(`, `test(`, and the
// modifiers that still run (`only`, `each`, `concurrent`, `fails`). `.fails` runs
// and asserts the failure — it is how a fixer should record a reproduction it
// could not fix — so turning a case into `.fails` is not a removal. `.skip` and
// `.todo` do not run, so a case rewritten to either IS one.
const CASE = /^[-+]\s*(?:it|test)(?:\.(?:only|each|concurrent|fails))?(?:\([^)]*\))?\s*\(/;

/** Active test cases a unified diff removes and adds. Never throws. */
export function countCases(patch) {
  let removed = 0, added = 0;
  for (const line of str(patch).split("\n")) {
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (!CASE.test(line)) continue;
    if (line[0] === "-") removed++;
    else added++;
  }
  return { removed, added };
}

/**
 * Test files the compare shows deleted, or with fewer active cases than before.
 * `files` is the compare API's `files` array (`filename`, `status`, `patch`).
 */
export function testRemovals(files) {
  const out = [];
  for (const f of Array.isArray(files) ? files : []) {
    const file = str(f?.filename);
    if (!isTestFile(file)) continue;
    const deleted = f.status === "removed";
    const { removed, added } = countCases(f.patch);
    if (deleted || removed > added) out.push({ file, deleted, removed, added });
  }
  return out;
}

/** The hidden record. The terminator is escaped, as every record here does. */
export function serializeTestRemovals({ head = "", after = "", removals = [] } = {}) {
  const payload = {
    v: TEST_REMOVALS_VERSION,
    head: str(head).slice(0, 64),
    after: str(after).slice(0, 64),
    removals: (Array.isArray(removals) ? removals : []).slice(0, 40).map((r) => ({
      file: str(r.file).slice(0, 300),
      deleted: r.deleted === true,
      removed: Number.isInteger(r.removed) ? r.removed : 0,
      added: Number.isInteger(r.added) ? r.added : 0,
    })),
  };
  return `${TEST_REMOVALS_MARKER}${JSON.stringify(payload).replace(/-->/g, "-\\u002d>")} -->`;
}

/** Visible line plus hidden record. Every `<!--` in the visible part is broken. */
export function renderTestRemovals(rec) {
  const list = Array.isArray(rec?.removals) ? rec.removals : [];
  const cases = list.reduce((n, r) => n + Math.max(0, (r.removed || 0) - (r.added || 0)), 0);
  const lines = [
    `🧪 **This fix round removed ${cases} test case(s)** between \`${str(rec?.head).slice(0, 9)}\` and \`${str(rec?.after).slice(0, 9)}\`. ` +
      "Removing a test can be legitimate; it is passed to the next round's adjudicator as evidence beside every \"fixed\" claim.",
    "",
    ...list.map((r) => (r.deleted
      ? `- deleted \`${r.file}\` (${r.removed} case(s))`
      : `- \`${r.file}\`: ${r.removed} case(s) removed or disabled, ${r.added} added`)),
  ].join("\n").replace(/<!--/g, "<!-‌-");
  return `${lines}\n\n${serializeTestRemovals(rec)}`;
}

/** Every believable record on the PR, in comment order. */
export function collectTestRemovals(comments) {
  const out = [];
  for (const c of Array.isArray(comments) ? comments : []) {
    if (c?.user?.type !== "Bot" || c?.user?.login !== TEST_REMOVALS_AUTHOR_LOGIN) continue;
    const m = new RegExp(`${TEST_REMOVALS_MARKER}([\\s\\S]*?) -->`).exec(str(c.body));
    if (!m) continue;
    let d;
    try {
      d = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (!d || typeof d !== "object" || d.v !== TEST_REMOVALS_VERSION || !Array.isArray(d.removals)) continue;
    out.push({ head: str(d.head), after: str(d.after), removals: d.removals });
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const [verb, pr] = argv;
  const flag = (k) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? str(argv[i + 1]) : "";
  };
  const before = flag("before");
  const after = flag("after");
  if (verb !== "post" || !/^\d+$/.test(str(pr)) || !/^[0-9a-f]{40}$/i.test(before) || !/^[0-9a-f]{40}$/i.test(after)) {
    console.error("usage: test-removals.mjs post <pr> --before <sha40> --after <sha40>");
    return;
  }
  let files;
  try {
    files = JSON.parse(execFileSync("gh", ["api", `repos/{owner}/{repo}/compare/${before}...${after}`, "--jq", ".files"], {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    }));
  } catch (err) {
    console.error(`test-removals: could not read the compare (${err.message}); recording nothing.`);
    return;
  }
  const removals = testRemovals(files);
  if (removals.length === 0) {
    console.error("test-removals: the fix round removed no test.");
    return;
  }
  try {
    execFileSync("gh", ["pr", "comment", pr, "--body-file", "-"], {
      input: renderTestRemovals({ head: before, after, removals }), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    });
    console.error(`test-removals: recorded ${removals.length} file(s).`);
  } catch (err) {
    console.error(`test-removals: could not post (${err.message}).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
