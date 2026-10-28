# Keep Retrying After a Failed Token Refresh

**Created**: 2026-10-26

Fixes #1512

When `authTokenInjector` rejects during the refresh that follows a 401, the
rejection escapes `handleConnectError` and is thrown from inside the callers'
`catch` blocks. The sync loop never schedules its retry (`runSyncLoop`), the
Watch stream never reconnects (`runWatchStream`), and nothing is published
after the first `auth-error`. Found in the second TeamBoard audit (3-3-a): a
connection whose hourly refresh overlaps a few seconds of token API downtime
stays stopped after the API is back.

## Plan

### Step 1 — do not stop on a rejected refresh

- [x] In the `ErrUnauthenticated` branch of `handleConnectError`, catch a
      rejected refresh, keep the previous token, and still report the error
      as retryable.
- [x] Integration tests (`webhook_test.ts`): the first refresh rejects and the
      second succeeds, for realtime sync (`PushPull`) and for Watch. Both
      hang without the fix.

### Step 2 — back off the refresh

Step 1 alone retried every 1s, and each retry sent three requests that could
only fail: the RPC with the refused token, the server's webhook call that
refuses it again, and the injector call. Decided with the requester:

- [x] A rejection is transient: keep the previous token and do not call the
      injector again until 1s later, doubling up to 30s, ±20% jitter. Not an
      option. A 401 that arrives sooner skips the injector
      (`refreshAuthToken`).
- [x] The sync loop and the Watch streams hold their retries until the next
      refresh may run (`loopRetryDelay`), so the refused token is sent once
      per refresh, not once per loop delay.
- [x] A one-shot call (`attach`, `detach`, `remove`, `sync`, …) throws as
      before; during the backoff it throws without calling the injector.
- [x] 401s that arrive together (the sync loop's and the Watch streams' when
      the token expires) count as one failure.
- [x] No new event or API. Telling a permanent failure from a transient one
      is the app's call inside its injector; the stop is `client.deactivate()`.

A first version kept one refresh running in the background and made the loops
wait until it succeeded. The agent review found that a Watch stream opened
inside `attach` then held the task queue for as long as the refresh kept
failing, so `deactivate` could not run either. The time gate above has no
wait longer than one injector call, the same as before this change.

## Verification

- [x] Unit (`test/unit/client/auth_refresh_test.ts`, fake timers): 1s/2s/4s
      backoff and reset on success, 30s cap, 401s arriving together counted
      once, loop retry delay held to the backoff, one-shot call during the
      backoff does not call the injector. All five fail with step 1 only.
- [x] Integration (`webhook_test.ts`, 12/12 with `CI=true`'s 5s budget): with
      a 100ms loop delay and two failing refreshes, the refreshes are ≥0.8s
      and ≥1.6s apart and the refused token is pushed three times (110ms
      apart without step 2).
- Local runs pointed the webhook host at `host.lima.internal` (Rancher
  Desktop cannot reach the host through `host.docker.internal`); not
  committed.

## Out of scope

- An auth webhook that is down answers `Internal` (`ErrWebhookTimeout`,
  `ErrUnexpectedStatusCode`), not 401, and `handleConnectError` does not
  retry `Internal`, so the loops stop. Not a token refresh problem; the
  requester chose to leave it for now.
