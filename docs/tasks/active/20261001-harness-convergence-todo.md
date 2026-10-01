# Make the agent loop converge instead of re-litigating unchanged code

**Created**: 2026-10-01

PR #1426 (fix for #1425) is the case study. The panel promoted it to
`agent:ready` on `b9a3ecc`. Over the next twelve hours and seven panel
rounds it never got back to ready, and it ended at `agent:blocked` with two
fixer runs that produced nothing. None of the cost after round 4 bought a
better PR. This task fixes the harness defects behind that, in priority
order. It does not fix #1426 itself.

## What happened on #1426

| Time (UTC) | Head | Event |
|---|---|---|
| 09-30 10:26 | `565a6e5` | `@claude loop`, the PR becomes `agent:managed` |
| 10:48–11:54 | → `b9a3ecc` | Rounds 1–3, three fix rounds (the budget is now spent) |
| 12:09 | `b9a3ecc` | Round 4 approves, `agent:ready`. 7 majors are demoted to backlog |
| 12:13 | `d593a98` | Maintainer `update-branch` (merge of #1424, PR diff unchanged) |
| 12:27 | `d593a98` | Round 5 is a full review (`merge-in-range`). Two of the round-4 demoted majors are now blocking. Budget is 0, so `round-cap` page and `agent:blocked` |
| 13:54 | `6915bc6` | Human merge of main (#1397 conflict) |
| 16:06 | | `@claude rerun`, budget reset |
| 16:35 | `6915bc6` | Round 6, 4 blocking → fix 1 → `e6900da` |
| 16:56 | `e6900da` | The fixer reports "Fixed", but it **deleted a failing two-replica test** that showed the gap was still open |
| 17:15 | `e6900da` | Round 7, 4 blocking. The new ones are about surface fix 1 added |
| 17:16–17:26 | | Fix 2: `is_error` after 25 turns, 10 min, $0.90, no commit, `stalled` page |
| 10-01 00:02 | `e6900da` | `@claude rerun`. Round 8 re-reviews the **identical head** |
| 00:30 | | Fix: `is_error` after 1 turn, 0.5 s, $0. Blocked again |

The post-rerun window alone cost $35.23 ($31.14 panel, $4.10 fix).

## Defects, with evidence

D1. **A diff-neutral head forces a full re-review.**
`review-state.mjs:292` returns `full("merge-in-range")` for any merge in
`since..head`, and `:280` returns `full("no-new-commits")` for the same SHA.
Nothing compares the PR's own diff across heads: no patch-id, range-diff or
tree comparison anywhere in `scripts/agent/`. wafflebase has the same code
and names the problem without solving it
(`wafflebase/docs/design/agent-pipeline/harness-engineering.md:1775`).

D2. **`agent:ready` is not anchored to anything.** The label carries no SHA
(`set-state.mjs:12-17`). The only way out of ready is a page
(`set-state.mjs:120`). A non-deterministic re-review of unchanged code
(D1) with an exhausted budget therefore goes straight from ready to blocked
(`review-round-guard.mjs:325`).

D3. **Demotions are forgotten.** `prior-findings.mjs:156-159` carries
forward only blocking, non-backlog findings. A round-N `relocated` or
`out-of-scope` demotion leaves no trace. Round N+1 re-derives the lane
from inputs that drift: the merge-base moves with main (`agent-review-panel.yml:463`),
and the cited line is taken from model output (`novelty.mjs:157-188`).
`finding-key.mjs:40` gives findings an identity, but nothing stores a
verdict against it.

D4. **The flip metric only looks one way.** `metrics.mjs:449` `detectFlips`
counts blocking→clean. The clean→blocking flip #1426 went through is not
counted anywhere.

D5. **An infra failure in the fixer spends a round and pages a human as if
the fixer gave up.**
- The dispatch record is posted before the fixer starts
  (`agent-review-panel.yml:2020-2039`).
- `is_error` makes the step fail, and `stalled` posts a generic "the fixer
  agent failed" (`:2873-2891`).
- The cause is computed (`classifyFixResult`, `metrics.mjs:852`), but only
  into `$GITHUB_STEP_SUMMARY`.
- `renderFixEffort`, which gives "session limit, wait then re-run" advice,
  is wired only into `agent-fix.yml:903`, not into the panel's `fix-report`.

D6. **A dead fixer credential is never noticed or retried.**
- Retirement happens only on panel sessions (`ask.mjs:732-736`).
- `pick-fix-credential.mjs:80` hands out the first slot "live" by default.
- The fixer gets one token and one attempt (`agent-review-panel.yml:2159`).
- Only 2 of 9 slots are configured.
- wafflebase has `auth-smoke.mjs` (a per-credential preflight, exit 2 on
  quota). This repo does not.

D7. **Nothing checks a "Fixed" claim against the tests.**
- `fix-report.mjs` records claims as-is.
- The adjudicator re-reads the code, at most 5 claims
  (`fix-report.mjs:267`), and is not pointed at tests.
- The repo accepts this as a review property (`checks.mjs:113-118`), so a
  fixer that deletes its own failing test can report the finding fixed.

D8. **Fix rounds widen the PR and nothing pulls it back.**
- Fix 1 added a decoder check in answer to a security finding. That check
  became the main blocker for four rounds.
- Fix 1 on `6915bc6` added remote-path re-pointing, and round 7 then asked
  for the local path as well.
- `rebuttal.mjs:392-395` rules out `out-of-scope` as an overturn ground.
- design-fit runs without a spec when the issue lacks `agent:candidate`
  (`agent-review-panel.yml:523`). Even then, `design-fit.md` still tells it
  to judge "unrequested scope creep".

D9. **A rerun on an identical head pays for a full panel again.** Round 8
re-reviewed `e6900da` from scratch, for about $10, to re-derive findings
already on record. `reusedPriorVerdicts` is a within-round verifier saving
(`review-panel.mjs:1148`), not reuse across heads.

## Plan

Work in this repo first, where the incident and its fixtures are. Then
port the shared modules to yorkie and wafflebase: `review-state.mjs` and
`review-scope.mjs` are byte-identical across the three. Every change below
ships with a test that replays the #1426 shape as a fixture.

Workflow-file edits (`.github/workflows/*`) cannot be pushed by the agent
token. A human with `workflow` scope has to apply them.

### Phase A: stop paying for unchanged code (D1, D2, D9)

- [x] A1. Add a **PR-diff fingerprint** to the review state for each
  reviewed head: `git patch-id --verbatim` of the unfiltered
  `git diff $(merge-base) head` (not `--stable`, which discards whitespace;
  see Review). Unfiltered on purpose: a generated-file
  change must also break the fingerprint.
- [x] A2. In `resolveReviewMode`, before the `merge-in-range` and
  `no-new-commits` checks, add a `carry` mode. If the new head's fingerprint
  equals the last reviewed head's, and CI is green on the new head, re-post
  each lens check on the new SHA with the prior verdict ("carried from
  `<sha>`, PR diff unchanged") and spawn no lens session.
  - A merge that resolved a conflict changes the fingerprint and still gets
    a full review, which is the correct outcome.
  - Guard against main changing behaviour under an unchanged diff: CI must
    pass on the new head; carry at most N consecutive heads (start with 2)
    before a forced rebaseline; and record `carried` in the metrics ledger.
- [x] A3. Make `mark-ready.mjs` accept carried lens checks, so a carried
  approve keeps `agent:ready` on the new head. Record the SHA it was earned
  on in the handoff comment.
- [x] A4. `@claude rerun` on an identical head (D9): when the last round
  on this SHA was blocking and nothing changed, skip the panel and dispatch
  the fixer on the recorded findings. Re-review only when the human asks
  for it (`@claude rerun review`).
- [x] A5. Tests:
  - `review-state.test.mjs`: a merge-only range with an equal fingerprint
    gives `carry`, and a conflict-resolving merge gives `full`.
  - `mark-ready.test.mjs`: a carried approve promotes.
  - A guard test: ready, then a diff-neutral merge, never pages.

### Phase B: an infra failure is not a fix round (D5, D6)

A retry after the fixer has failed cannot happen inside the `fix` job.
`checks.test.mjs` enforces that nothing runs after the agent in its own
job: from that point the agent owns `$GITHUB_ENV`, `~/.gitconfig` and
`.git/config`. So the credential is proven before the round is spent, and
any failure after that is refunded.

- [x] B1. **Probe before dispatch.** In the `fix` job, after the trusted
  scripts are staged and before the App token and the branch checkout (so
  no branch code is on disk while the pool secrets are in the
  environment), a probe sends a one-word query to each candidate slot in
  turn and picks the first that answers. The probe uses
  `classifyFailure` from wafflebase's `auth-smoke.mjs`.
  - Candidates are the live slots from the panel's pool state, or every
    configured slot when that state is missing (a reused round has no
    panel run).
  - If every slot refuses on quota or auth, the existing no-credential page
    fires and no round is spent.
  - If every failure is unclassified, it proceeds on the first slot
    (fail-open, as today).
  - The probe replaces "Pick a live fixer credential" and keeps its outputs.
- [x] B2. **Classify a failed fixer** in `fix-report` (a fresh, trusted
  runner) with `classifyFixResult` on the execution log. `infra` means the
  fixer failed, the head did not advance, and the cause is one of:
  `USAGE_LIMIT`, `AUTH_REJECTED`, a retryable API error, or ≤1 turn at $0.
- [x] B3. ~~**Refund.**~~ Dropped in review. The infra page latches the
  PR, only `@claude rerun` lifts the latch, and a rerun restarts the fix
  budget, so a refund in the old window could never change a decision. B4's
  honest page is what was needed.
- [x] B4. **Honest page.** On `infra`, `fix-report` posts the page itself:
  the cause, "no fix round was consumed", and when to `@claude rerun`
  (reusing `renderFixEffort`'s advice). `stalled` stands down when
  `fix-report` has already paged, so nothing is reported twice.
- [x] B5. Tests:
  - Classifier fixtures for both #1426 failures (25 turns / $0.90 /
    `is_error`, and 1 turn / $0 / `is_error`).
  - Refund arithmetic and the cap in `rounds.test.mjs`.
  - Probe ordering and fail directions with an injected `query`.
  - `checks.test.mjs`: the probe runs before the branch checkout, and
    `stalled` stands down.

### Phase C: keep verdicts stable across rounds (D3, D4)

- [x] C1. **Dropped.** The plan was to keep earlier demotions across
  rounds. Measured on #1426, it would not have held the flip (see the PR 2
  review).
- [x] C2. Make `detectFlips` also report adjacent clean→blocking transitions
  (`escalations`), rendered as advisory in the summary. It does not compare
  diffs. On an unchanged diff, carry means no lens re-runs, so no escalation
  can come from one.
- [x] C3. Test that a clean→blocking transition is reported as an
  escalation, separately from `flips`, and that infra rounds are skipped.

### Phase D: fix claims need evidence, and rounds must not widen the PR (D7, D8)

- [x] D1. Run a mechanical check in `fix-report`. If the fix commit deletes
  a test file, or lowers the `it(`/`test(` count in a touched test file,
  attach that fact to every `--fixed` claim in the commit and send it to
  the adjudicator.
- [x] D2. Add a fixer prompt rule: a test that shows the finding still
  reproduces must not be deleted. Keep it as `it.fails` (which still runs)
  with a comment naming the finding, and report the item `--skipped`.
  `.skip`/`.todo` count as removals.
- [ ] D3. **Split into a follow-up task.** It needs a new command and a human
  acknowledgement flow. Scope: add a `defer` outcome for a finding about behaviour the PR
  did not set out to change. The fixer files it with a proposed follow-up
  issue body. It moves to backlog only when a human acknowledges it, for
  example with `@claude defer <id>`. A scope argument still never
  overturns a finding on its own.
- [x] D4. design-fit without a spec: scope-creep findings are advisory,
  and fit-with-codebase findings still gate (Decision 3). Update
  `lenses/design-fit.md` with an explicit no-spec section.
- [x] D5. Tests: a test committed and then deleted inside one fix round is
  flagged (`aggregateCommits`). `e6900da` itself is not: that test was never
  committed, as recorded in the review.

### Phase E: process and docs

- [x] E1. Record in `docs/design/agent-harness.md`:
  - What shipped: carry, reuse, the credential probe, infra pages, removal
    evidence, no-spec design-fit, escalations.
  - The alternatives that were dropped: the main-overlap carry rule, infra
    refunds, keeping demotions across rounds (C1), and retrying the fixer
    after it fails.
  - The scope `defer` flow (D3) is a follow-up and is not recorded there.
- [x] E2. Until A lands, add a caution to the `maintainer-merge` skill:
  `update-branch` on an `agent:managed` PR re-runs the panel and can drop
  `agent:ready`, so bring main in right before the merge instead.
- [ ] E3. File the follow-up task for porting to yorkie and wafflebase
  (PRs 3 and 4 below) once PRs 1 and 2 have run on real PRs here.

## Decisions (2026-10-01)

1. **Carry-forward** requires an equal fingerprint and green CI on the new
   head. Carries are capped at 2 in a row, after which a full rebaseline
   runs.
   - The first draft also refused to carry when main had changed a file the
     PR touches. Checking that rule against #1426 rejected it: #1424 changed
     `document.ts` and `history.ts`, both in the PR. So the rule would have
     blocked the one carry this task exists for, even though both
     `b9a3ecc` and `d593a98` fingerprint the same (`b0832c12…` with the
     `--verbatim` fingerprint that shipped; `ac6ab9f3…` with the first
     draft's `--stable`).
   - The rule was not protecting anything CI does not already cover. Main
     can change what the PR's code means through any file, not only the
     ones the PR touches, and CI on the merged head is the check that sees
     that.
   - A merge that touches the PR's hunks or their context changes the
     fingerprint and gets a full review. On #1426 that was `6915bc6`
     (`d37f55f4…`), which resolved the #1397 conflict.
2. **A rerun on an identical head** skips the panel by default when the
   last round on that SHA produced a valid blocking verdict. It dispatches
   the fixer on the recorded findings instead. When that round's verdict
   was infra (no valid verdict), the rerun re-reviews.
   `@claude rerun review` always forces a re-review.
3. **design-fit without an `agent:candidate` spec** keeps gating on fit
   with the codebase. Its "unrequested scope creep" findings become
   advisory. The PR body is not a spec: for an agent PR it is written by
   the same agent the lens is judging.
4. **Land here first**, then port. This repo has the incident and its
   fixtures, and `review-state.mjs`/`review-scope.mjs` are byte-identical
   in all three copies, so the port is mechanical.

## PR plan

There are two PRs here and one port per sibling repo. The maintainer's
token has `workflow` scope, so the workflow edits ride along with the
script changes and need no separate PR.

| PR | Repo | Phases | Why grouped |
|---|---|---|---|
| 1 | yorkie-js-sdk | A, B, E2, task docs | Removes the waste #1426 paid for. A and B touch the same modules (`review-state`, `rounds`, `review-round-guard`, the panel's `fix`/`fix-report`/`stalled` jobs) |
| 2 | yorkie-js-sdk | C, D, E1 | Verdict stability and claim checking. They touch `prior-findings`, `novelty`, `fix-report`, `rebuttal` and the lens prompts. PR 1 gives the refunds and carry state that C builds on. The design doc is written once both sets of decisions are in |
| 3 | yorkie | A–D port | One mechanical port once 1 and 2 have run here for a few PRs |
| 4 | wafflebase | A–D port | Same. wafflebase's `auth-smoke.mjs` is the source for B5, so here it only needs wiring |

PRs 3 and 4 are a follow-up task, not this one. They start only after PR 1
and PR 2 have shown carry-forward and refunds working on real PRs here.

Within this task, merge PR 1 before PR 2 and develop PR 2 on top of it.

## Out of scope

- Fixing #1426 itself. It needs a human scope decision: drop the decoder
  check, prove or drop the remote-path re-pointing, and file the local
  `update()` path as a follow-up.
- Panel cost per round (verifier > detection) beyond what D9 removes.

## Review

### PR 1 (A, B, E2)

- `git patch-id --stable` was checked before anything was built on it. On a
  scratch repo it was stable across a merge into another file and a merge
  far away in the same file, and it changed when a merge touched the hunk's
  context. On #1426's real commits, `b9a3ecc` and `d593a98` give
  `ac6ab9f3…` and `6915bc6` gives `d37f55f4…`. That data also overturned
  the first draft of Decision 1 (the overlap rule).
- Carry and reuse write `.agent-review/` in the panel's own shape, so
  promote, the round guard and the fix brief read them as a reviewed round.
  `carry-verdicts.mjs` refuses on any doubt, and the panel then runs.
- B2 as first planned (retry on another slot after the fixer fails) was
  replaced by a probe before dispatch. `checks.test.mjs` forbids anything
  after the agent in its own job, so a retry there is not possible. Against
  the real SDK, the probe classified a bogus token as `auth` and returned
  `available=false`. It has not been run with a valid token; the code path
  is the one wafflebase's `auth-smoke.mjs` already uses.
- Review (an independent agent over the whole diff) found one blocking
  defect. `git patch-id --stable` discards whitespace, so moving a Python
  call out of an `if` by indentation alone fingerprinted the same and would
  have carried an approval over a change in behaviour. The fix is
  `--verbatim`, plus `--no-ext-diff --no-textconv`. `fingerprint.test.mjs`
  runs the workflow's exact command on real repositories, and it was Red
  before the fix. #1426 still carries: `b9a3ecc` = `d593a98` = `b0832c12…`,
  and `6915bc6` differs.
- The same review showed the refund ledger (B3) could never take effect,
  so it was removed. Also fixed in review:
  - the infra page now requires a known-unpushed head;
  - carried findings are read only on a carried round;
  - each probe child gets one token and a throwaway HOME, with a 30 s
    timeout.
- `/code-review high` on #1428 raised 10 unverified findings; 8 were fixed:
  - A transient 429/overload no longer counts as a refusal. Only a closed
    usage window or a rejected credential does, so an API blip cannot
    latch a PR.
  - A reused blocking verdict whose findings cannot be read is refused,
    not reused empty.
  - `rerun review` is answered only by a round that *started* after it, and
    a failed permission lookup fails toward reviewing.
  - The probe uses `classifyFixResult` as its success rule.
  - The lens-key lookup is shared.
  - The no-credential page now says whether slots were probed or the pool
    state had already retired them.
  - The stale lesson was corrected.
- Not fixed:
  - Disputed: "a carry skips the merge-in-range review of the next round".
    Before this change M was fully reviewed and stamped `reviewed=M`, and F
    was then reviewed incrementally from M, so the path is the same. The
    lenses review the PR's diff, and the fingerprint proves it unchanged.
  - Not worth it: fetching comments lazily. It is one paginated call plus a
    memoized permission lookup per rerun author.
- `scripts/agent`: all tests pass.

### PR 2 (C2, D1, D2, D4, E1)

- **C1 was rejected after measuring it on #1426.**
  - The finding demoted in round 4 was raised against `converter.ts`.
  - The ones that turned blocking in round 5 were raised against
    `client.ts:3366` and `change.ts:264`: the same concern, raised at its call
    sites.
  - `findingSimilarity` matches only within a lens and a file, so keeping
    demotions by finding identity would not have held them.
  - Matching more loosely would drop real findings off the gate.
  - The flip's cause, a re-review of an unchanged diff, is removed by PR 1's
    carry.
- **D3 moved to a follow-up task.** It needs a new `@claude defer` command, a
  human acknowledgement flow and workflow changes. D4 covers part of it: with
  no spec, scope findings no longer block.
- **C2:** `detectFlips` now also returns `escalations` (clean→blocking), and
  the summary renders it. `flips` keeps its meaning.
- **D1:** `test-removals.mjs`. The trusted report job compares the heads
  before and after a fix round through the API. When a test file was deleted
  or lost active cases (`.skip`/`.todo` count as lost, `.fails` does not), it
  posts an `agent-fix-tests` record as `github-actions[bot]`. The record is
  joined to the fix report with the same head, and its contents are put ahead
  of the author's note on every "fixed" claim the adjudicator reads.
- **D2:** both fixer prompts say not to delete or disable a test that still
  reproduces a finding. Keep it as `it.fails` and report the item skipped.
- **D4:** a spec-reading lens with no spec gets `NO_SPEC_NOTE`, and the
  design-fit rubric caps scope findings at `minor` then.
- **Independent review of PR 2: nothing blocking.** Two majors, both fixed:
  - The removal evidence had been joined into the claim text, which the
    adjudicator reads inside the untrusted `<author-rebuttal>` fence. It is
    now a field rendered before the fence.
  - **D1 would not have caught #1426's own case.** That test was written and
    deleted without ever being committed, and on `e6900da` the compare shows
    removed 3 / added 4, so no record. The limit is now stated in the module
    and the design doc, and D2's prompt rule is the guard for uncommitted
    tests.
  - Minor fixes:
    - renames that stop a test from running count as a removal;
    - chained modifiers and tagged `each` are recognized;
    - `describe.skip`/`.todo` counts as a removal;
    - a test file whose diff is too large to show is marked unreadable rather
      than clean;
    - the compare is paginated;
    - deleting a helper with no cases is ignored;
    - an empty record cannot hide a real one;
    - the record joins on the report's head (`--head`).
- **`/code-review high` on #1432: 10 findings, all fixed.**
  - The adjudicator saw a deleted file without a diff as "changed". It now
    reads as deleted.
  - Disputed findings got no evidence. The round's record now goes to every
    adjudicated record (`withRoundEvidence`).
  - A three-dot compare blames a merge of main on the fixer. The record is
    now built per commit from the round's own commits. Measured on #1406:
    main's commits enter the compare with one parent each, so they are
    excluded by the PR's commit list, not by "skip merges". This also sees a
    test committed and deleted inside the round, and avoids the 300-file
    cap.
  - Suites switched off (`describe.skip`/`skipIf`/`runIf`) are counted
    apart from cases and never netted against added cases. Editing an
    already-skipped suite is not a disablement.
  - Branch-supplied paths have control characters stripped wherever they
    are rendered.
  - An issue fetch that failed is recorded (`/tmp/issue.state`), and the
    lens is not told "no spec".
  - The headline counts files.
  - JSDoc fixes.
- **E1:** `docs/design/agent-harness.md` records the convergence design, its
  decisions, and the rejected alternatives (overlap rule, refund, C1, retry
  after failure). `lint:check`, `verify:license` and
  `verify:doc-links` pass.
- Not verified until it runs on GitHub: the workflow wiring end to end.
  The structural tests (`carry-wiring`, `infra-wiring`) pin the step order
  and conditions, but no real PR has gone through carry, reuse, the probe or
  a refund yet.
