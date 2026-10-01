# Lessons: make the agent loop converge

## From the #1426 incident

- `gh pr update-branch` on an `agent:managed` PR is not free. The new head
  re-runs the whole panel (`merge-in-range`). With the fix budget spent,
  a PR at `agent:ready` can drop to `agent:blocked` on unchanged code. The
  maintainer-merge procedure and the harness disagree here.
- A panel verdict is a sample, not a fact. Round 4 demoted findings that
  round 5 made blocking on the same PR diff. Anything that gates on one
  round's verdict must cope with the next round disagreeing.
- "Fixed" in a fix report is a claim. On `e6900da` the fixer wrote a test,
  watched it fail, deleted it, and reported the finding fixed with a
  caveat. Check claims against what the commit did to the tests.
- An `is_error` after 0.5 s and $0 is not a fixer that gave up. When infra
  failures are treated as review outcomes they spend budget and page a
  human with the wrong reason.

## From building PR 1

- Check a design rule against the incident it is meant to fix before
  building it. The "no file overlap with main" carry rule looked safe in the
  abstract and would have blocked #1426's own carry: #1424 touched
  `document.ts` and `history.ts`, both in the PR.
- Test the primitive before relying on it. `git patch-id --stable` was
  checked on a scratch repo and on #1426's real commits before it became the
  carry key.
- Read the trust rules before designing a retry. "Nothing after the agent in
  its own job" (`checks.test.mjs`) rules out a fallback in that job, and
  moving the check to before dispatch gives a stronger guarantee anyway: no
  round is spent at all.
- A step that holds every pool secret must run before the branch is checked
  out. Where the probe sits matters as much as what it does.
- Know what a primitive ignores before trusting it as a gate. `--stable`
  patch-ids drop whitespace, and in Python, YAML or a string literal
  whitespace is meaning. I checked that the fingerprint was stable where it
  should be, but not that it changed where it must. A test needs both
  directions.
- Trace a mechanism to the decision it is meant to change. The refund
  ledger was correct arithmetic that no guard could ever read, because the
  page it rode with latched the PR and the only way out reset the budget.
