// D1/D2 take effect only through the workflows: the trusted report jobs must
// post the removal record, and both fixer prompts must carry the rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WF = (n) => readFileSync(path.join(HERE, "..", "..", ".github", "workflows", n), "utf8");

for (const file of ["agent-review-panel.yml", "agent-fix.yml"]) {
  test(`${file}: the trusted report job records removed tests as github-actions[bot]`, () => {
    const src = WF(file);
    const at = src.indexOf("- name: Record tests the fix round removed\n");
    assert.ok(at > 0, "no removal step");
    const block = src.slice(at, src.indexOf("\n      - ", at + 1));
    assert.match(block, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    assert.match(block, /node scripts\/agent\/test-removals\.mjs post "\$PR" --before "\$BEFORE" --after "\$AFTER"/);
    assert.match(block, /continue-on-error: true/, "evidence is best-effort; it must never red the report job");
  });

  test(`${file}: the fixer is told not to delete a test that still reproduces`, () => {
    assert.match(WF(file), /NEVER DELETE OR DISABLE A TEST THAT SHOWS A FINDING STILL REPRODUCES\./);
    assert.match(WF(file), /Keep it as `it\.fails\(\.\.\.\)`/);
  });
}
