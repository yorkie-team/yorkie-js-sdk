# Lessons: retry attach once after refreshing an expired auth token

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
`handleConnectError` asks the injector again. That is three calls per attach
for a revoked user. The second test pins two.

## Self review

Reviewer: `/code-review` (high) over `origin/main...HEAD`, the harness's own
reviewer, not the CI lens panel.

- Round 1 (correctness, tests): 10 findings. Fixed: the first test raced a
  second 500ms expiry; the 401-twice test also passed on main (now asserts
  two `AttachDocument` webhook calls, the second under the refreshed token);
  an injector rejection that is a `ConnectError` reached `handleConnectError`
  (now `isHandledByTokenRetry`, pinned by a test); the re-anchor's second
  `attachOnce` shared the retry flag (state is per RPC now); the session is
  checked before the refresh; the "stored nothing" claim was false on the
  schema-rebind path (the server writes the doc row and attaching mark
  first; the resend reuses them, comment corrected); task index. Deferred:
  integration tests for a session lost mid-refresh and the store-backed
  path (known limitation in the PR); the other one-shot calls (#1564).
