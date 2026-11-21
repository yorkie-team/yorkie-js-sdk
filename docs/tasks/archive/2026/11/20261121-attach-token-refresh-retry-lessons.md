# Lessons: retry attach once after refreshing an expired auth token

**Created**: 2026-11-21

## The 401 was handled; the retry was not

The SDK already refreshed the token on an attach 401. The contract was that a
one-shot call rethrows and the caller retries, and the integration test said
so (`// retry attach`). No caller did: the React provider turns the error
into state and stops. A contract that every real caller breaks is the bug,
so the retry moves into the SDK instead of into each app.

## Retry the RPC, not the closure around it

`attachOnce` looks like the natural retry unit (the epoch re-anchor already
re-runs it), but it also restores from the store and seeds the initial
presence. Re-running it on a 401 would replay both. The retry wraps only the
`pushWithPresenceBase` call, which rebuilds the pack from the unchanged
document.

## Count injector calls on the failure path

Without a guard, a second 401 reaches the attach `catch`, whose
`handleConnectError` asks the injector again: two calls per attach for a
revoked user instead of one. The 401-twice test pins one (two in total,
counting the activate).

## Self review

Reviewer: `/code-review` (high) over `origin/main...HEAD`, the harness's own
reviewer, not the CI lens panel.

- Round 1 (correctness, tests): 10 findings. Fixed: the first test raced a
  second 500ms expiry; the 401-twice test also passed on main (now asserts
  two `AttachDocument` webhook calls, the second under the refreshed token);
  an injector rejection that is a `ConnectError` reached `handleConnectError`; the re-anchor's second
  `attachOnce` shared the retry flag (state is per RPC now); the session is
  checked before the refresh; the "stored nothing" claim was false on the
  schema-rebind path (the server writes the doc row and attaching mark
  first; the resend reuses them, comment corrected); task index. Deferred:
  a test of the store-backed path (todo, Out of scope); the other one-shot
  calls (#1564). The session lost mid-refresh got a unit test in round 2.
- Round 2 (design, simplification, blast radius): 8 findings. Fixed: the
  injector-error integration test threw a plain `Error`, which
  `handleConnectError` ignores anyway, so it pinned nothing (replaced by unit
  tests in `auth_refresh_test.ts` with a Yorkie-coded `ConnectError` and a
  session lost mid-refresh, each shown to fail when its guard is removed);
  the per-call `TokenRetry` state outlived its RPC and leaked bookkeeping into
  the caller (replaced by marking the handled errors in a `WeakSet`); the
  401-twice test read the global `webhookCalls` (now sliced from a baseline);
  the todo contradicted this log. Deferred: one shared retry layer for every
  one-shot call (#1564). Disputed: "resend goes out even when the token did
  not change" (`client.ts`, the resend in `retryAfterTokenRefresh`, ~line
  4180). A lost generation race
  means a newer token is already set, so the resend uses it, which is the
  point. An injector that hands back the token the server just refused is an
  app bug, and the cost is one RPC, bounded. Noted in the PR: apps that still
  retry attach on 401 themselves now send two requests per attempt.
- Round 3 (security, docs): no blocking findings; the loop ends here.
  Fixed the doc mismatches it listed (the `authTokenInjector` comment on the
  resend's 401, the call counts above, this file's `**Created**` line, the
  store-path gap moved to the todo) and folded the duplicated error fixture
  in `auth_refresh_test.ts`. Deferred to #1564: the module-level
  `tokenRetryHandled` set is a per-caller rule each new adopter must follow;
  a shared retry layer removes it.
