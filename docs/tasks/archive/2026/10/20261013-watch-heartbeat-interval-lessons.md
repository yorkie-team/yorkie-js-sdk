# Watch heartbeat interval lessons

**Created**: 2026-10-13

- Port 8080 and 18080 on this machine are held by an ssh tunnel on IPv4.
  A local server bound to the same port only gets IPv6, so tests addressed
  at `127.0.0.1` silently hit the tunnel's far end. Check
  `lsof -iTCP:<port> -sTCP:LISTEN` before trusting a local run.
- `pnpm i` with pnpm 12 refuses the lockfile (`overrides` moved out of
  `package.json`); CI pins pnpm 9, and `npx pnpm@9 i --frozen-lockfile`
  installs cleanly.
- The integration test is meaningful only against a server that clamps:
  against a pre-#2209 server the heartbeat cases fail with an advertised 0,
  which is the expected red until the CI image catches up.
- Full integration run against a local #2209 server (memdb): 2630 passed,
  1 failed. The failure, `gc_test.ts` "gc targeting nodes made by
  deactivated client" (`client not found`), also fails against a server
  built from yorkie main and with this SDK asking for no heartbeat, so it is
  not this change.
- `offline_persist_sync_test.ts` and `persist_disabled_test.ts` fail under
  Node 24 in this checkout on main as well (persistence lock); excluded from
  the local unit run.

## Self review

Reviewer: a general-purpose subagent over `git diff origin/main...HEAD`
(not the CI lens panel).

- Round 1 (correctness, test adequacy): no blocking findings, so the loop
  stopped here. Fixed: a finite interval above int64 (e.g. `1e20`) made
  every Watch request fail to serialize, so it is now capped at
  `MAX_SAFE_INTEGER` with a test for it and for `Infinity`; the
  integration test names no longer claim to check the heartbeat period.
  Deferred: the integration test fails in CI until the image carries
  #2209, so the PR stays a draft until then.
