// Was a failed fix round the fixer's failure, or the infrastructure's?
//
// WHY THIS EXISTS. On #1426, after a rerun, fix round 2 died with
// `is_error: true` after 25 turns ($0.90) and the next one died 0.5 s after init
// ($0). Each had already been charged a round — the dispatch is recorded before
// the fixer starts — and each was paged by the `stalled` net as "the fixer agent
// failed and the branch head is unchanged". The cause (an API that stopped
// answering) was computed by `classifyFixResult`, but only into the job summary,
// which nobody paged reads.
//
// This runs in the trusted `fix-report` job, on a runner the agent never had a
// shell on, and decides from the fixer's execution log:
//
//   infra  the fixer job FAILED, the branch head did NOT advance, and the
//          session ended on an API error (no response, a closed usage window, a
//          rejected credential, a rate limit). The round is refunded (a
//          `<!-- agent-fix-refund -->` record, see rounds.mjs) and the page
//          names the cause and the next step.
//   not    anything else — a turn ceiling, a clean finish, a cancellation, a
//          round that pushed, a log with no result. Charged and paged exactly
//          as before.
//
// THE LOG IS AGENT-WRITABLE: the action writes it on the runner the agent ran
// on, with a shell. So nothing from it reaches the PR except `classifyResult`'s
// closed vocabulary, and the refund it can earn is capped (rounds.mjs).
//
// Usage:
//   node fix-outcome.mjs page <pr> --execution <file> --fixer <outcome>
//     --advanced <true|false> --from <sha> [--run-url <url>]
// Writes `infra=` and `paged=` to $GITHUB_OUTPUT. On infra it posts the refund
// record, then the page. Exits non-zero only if the page itself could not be
// posted, so the `stalled` net still sees a failed job.

import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFixResult } from "./metrics.mjs";
import {
  PAGED_LATCH, MAX_FIX_REFUNDS, serializeFixRefund, collectFixRefunds,
  collectFixDispatches, rerunPointFrom,
} from "./rounds.mjs";
import { gh, permissionResolver, parseArgs } from "./gh-checks.mjs";

/**
 * Decide from the execution log and the two facts the workflow knows. Pure.
 * Returns `{ infra: false }` or `{ infra: true, code, reason, advice }`.
 */
export function classifyFixOutcome({ messages, fixer, advanced } = {}) {
  const no = { infra: false };
  // Only a round that pushed NOTHING. One that pushed did work, and the next
  // panel judges it; refunding it would hand back a round that was used.
  if (advanced !== false && advanced !== "false") return no;
  // Only a FAILED fixer step. A clean finish with no commit is the no-commit
  // page's case, and a cancellation is the job wall's.
  if (fixer !== "failure") return no;
  const result = Array.isArray(messages) ? [...messages].reverse().find((m) => m && m.type === "result") : null;
  const outcome = classifyFixResult(result);
  if (!outcome || outcome.ok) return no;
  // `limit` is a ceiling the fixer itself ran into (turns, budget) — the round
  // was honestly spent. Only an API error is the infrastructure's.
  if (outcome.kind !== "api-error") return no;
  const code = typeof outcome.code === "string" ? outcome.code : "UPSTREAM_ERROR";
  return { infra: true, code, reason: String(outcome.reason || `[${code}]`), advice: adviceFor(code) };
}

function adviceFor(code) {
  if (code === "USAGE_LIMIT" || code === "RATE_LIMITED" || code === "POOL_EXHAUSTED") {
    return "An account usage window is closed. It reopens on its own; comment `@claude rerun` once it has, or register more `CLAUDE_CODE_OAUTH_TOKEN_N` secrets so one busy account cannot starve the fixer.";
  }
  if (code.startsWith("AUTH_")) {
    return "A Claude credential was refused. Check the `CLAUDE_CODE_OAUTH_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN_N` secrets on the `agent` environment, then comment `@claude rerun`.";
  }
  return "The API stopped answering mid-session, which is usually transient. Comment `@claude rerun` to try again.";
}

/** The page body. Every `<!--` after the latch is broken, as fix-report.mjs does. */
export function renderInfraPage({ outcome, refunded, refundsLeft, runUrl = "" }) {
  const charged = refunded
    ? `**No fix round was consumed** — this round has been refunded (${Math.max(0, refundsLeft)} infra refund(s) left in this budget window).`
    : `This round still counts: the refund cap (${MAX_FIX_REFUNDS}) for this budget window is used up, because the log a refund is decided from is one the fixer can write.`;
  const body = [
    `🛑 The fix agent did not get to finish: **${outcome.reason}**. That is an infrastructure failure, not a verdict on this pull request — nothing was pushed.`,
    "",
    charged,
    "",
    outcome.advice,
    "",
    "A rerun on this commit reuses the verdicts already on this commit and dispatches the fixer directly, without spending a new review.",
    "",
    runUrl ? `Where to look: [this run](${runUrl}) → job \`fix\`, step "Address panel findings".` : null,
  ].filter((l) => l !== null).join("\n").replace(/<!--/g, "<!-‌-");
  return `${PAGED_LATCH}\n${body}`;
}

function main() {
  const a = parseArgs(process.argv);
  const [verb, pr] = a._;
  const out = (k, v) => {
    console.error(`  ${k}=${v}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  };
  if (verb !== "page" || !/^\d+$/.test(String(pr ?? ""))) {
    console.error("usage: fix-outcome.mjs page <pr> --execution <file> --fixer <outcome> --advanced <bool> --from <sha>");
    out("infra", "false");
    out("paged", "false");
    return;
  }
  let messages = null;
  try {
    messages = JSON.parse(readFileSync(a.execution, "utf8"));
  } catch {
    // No log: nothing proves infra, so the existing nets page as before.
  }
  const outcome = classifyFixOutcome({ messages, fixer: a.fixer, advanced: a.advanced });
  out("infra", String(outcome.infra));
  if (!outcome.infra) {
    out("paged", "false");
    return;
  }

  // How many refunds this budget window has already had, read the way the
  // round guard reads the window (rerunPointFrom with the permission resolver).
  let left = MAX_FIX_REFUNDS;
  try {
    const comments = gh(["api", "--paginate", `repos/{owner}/{repo}/issues/${pr}/comments?per_page=100`]);
    const since = Date.parse(String(rerunPointFrom(comments, { trusts: permissionResolver({ api: gh }) }) ?? ""));
    const inWindow = (x) => !Number.isFinite(since) || (x.at ?? 0) > since;
    const dispatched = new Set(collectFixDispatches(comments).filter(inWindow).map((d) => d.from));
    left = MAX_FIX_REFUNDS - collectFixRefunds(comments).filter(inWindow).filter((r) => dispatched.has(r.from)).length;
  } catch (err) {
    console.error(`fix-outcome: could not count prior refunds (${err.message}); the round guard's cap still applies.`);
  }
  const refunded = left > 0;
  const from = String(a.from ?? "").slice(0, 64);
  // GITHUB_TOKEN, so the record is `github-actions[bot]`'s — the one identity the
  // dispatch and refund readers believe.
  const post = (body) => execFileSync("gh", ["pr", "comment", pr, "--body-file", "-"], { input: body, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (refunded && from) {
    try {
      post(`${serializeFixRefund({ from, code: outcome.code })}\n↩️ Refunded the fix round dispatched on \`${from.slice(0, 9)}\`: it ended on an infrastructure failure (\`${outcome.code}\`).`);
    } catch (err) {
      console.error(`fix-outcome: could not post the refund record (${err.message}).`);
    }
  }
  post(renderInfraPage({ outcome, refunded: refunded && Boolean(from), refundsLeft: left - 1, runUrl: a["run-url"] || "" }));
  out("paged", "true");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
