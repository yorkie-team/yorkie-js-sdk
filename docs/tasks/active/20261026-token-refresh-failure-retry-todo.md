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
      before. It calls the injector even during the backoff (see the second
      review below).
- [x] 401s that arrive together (the sync loop's and the Watch streams' when
      the token expires) count as one failure.

### Agent review follow-ups

- [x] ~~401s that arrive while an injector call is pending join it.~~
      Dropped after the next review: an injector that never settles then held
      every later 401 too, so nothing could refresh even once the token API
      answered again. Each 401 makes its own call, as before; 401s that
      arrive together still count as one failure.
- [x] Only a retry that got a 401 waits for the backoff. A Watch stream or a
      sync that failed for another reason keeps its own delay: a method the
      webhook does not guard still works with the refused token.
      `onDisconnect` now carries the error that ended the stream.
- [x] While a channel is attached, the sync loop waits no longer than the
      channel heartbeat interval: it sends the heartbeats, and the server
      drops a session whose TTL lapses.
- [x] Broadcast retries after a 401 wait for the backoff too.
- [x] A call that settles after a later one already set its token neither
      sets its own nor changes the backoff (`authTokenGeneration`), and
      `activate` drops the calls still pending. So an older token never
      overrides a newer one, and a stale rejection no longer re-arms the
      backoff after a later refresh succeeded.
- [x] ~~Only the latest call counts.~~ Fixed in the next review: with a token
      API slower than the loops' retry delay, the loops' calls kept dropping
      each other and no token was ever set. A call is now dropped only once a
      later one has set its token, not while one is pending.
- [x] Only the loops skip the injector during the backoff
      (`handleConnectError(err, true)`). A one-shot call the app retried on
      purpose calls it, so the retry gets a new token as soon as the token API
      is back instead of failing for up to 30s on the loops' backoff.
- Not taken from the review loop: a timeout on the injector call and making
  the `broadcast` promise wait for its retries. The first is older than this
  change; the second changes a public promise for every broadcast.
- [x] A refresh that ends the backoff wakes the sync loop and the Watch
      streams waiting to retry (`wakeRetries`), and `attachChannel` and
      `resync` wake a sync loop that waits. A loop's wait was set when it
      failed, up to 30s: a channel attached later went without its first
      refresh past the server's 15s session TTL, and a `Polling` document
      whose token a one-shot call refreshed still waited to pull.
- [x] No new event or API. Telling a permanent failure from a transient one
      is the app's call inside its injector; the stop is `client.deactivate()`.
- [x] The auth webhook can guard `DeactivateClient` too, so for a signed-out
      user the documented stop got the same 401 and left the loops running.
      When `deactivate` gets a 401 and the injector rejects, the client now
      deactivates locally and throws; the server reaps it after its
      `clientDeactivateThreshold`, as for `deactivateOnUnload: false`. Decided
      with the requester.

A first version kept one refresh running in the background and made the loops
wait until it succeeded. The agent review found that a Watch stream opened
inside `attach` then held the task queue for as long as the refresh kept
failing, so `deactivate` could not run either. The time gate above has no
wait longer than one injector call, the same as before this change.

### Review follow-up (CodeRabbit)

- [x] A remote-only pull that fails left `changeEventReceived` cleared, so the
      retry skipped the document and the change waited for the next remote
      event. The sync loop now restores the flag when the sync fails. Applies
      to every failed sync, not only to 401s.

## Verification

- [x] Unit (`test/unit/client/auth_refresh_test.ts`, fake timers): 1s/2s/4s
      backoff and reset on success, 30s cap, 401s arriving together counted
      once, a later 401 not held by a call that never settles, an earlier
      call settling later ignored, only 401 retries held to the backoff, the
      sync loop kept within the channel heartbeat, a one-shot call during the
      backoff calling the injector, `deactivate` stopping locally on a 401
      the injector cannot refresh, a token set while a later call is pending
      on a slow token API, a Watch reconnect through `runWatchStream` and
      `Attachment` held to the backoff, the waiting loops woken by a refresh
      that ends the backoff and the sync loop by `attachChannel`.
- [x] Integration (`webhook_test.ts`, 13/13 with `CI=true`'s 5s budget):
      - with a 100ms loop delay and two failing refreshes, the refreshes are
        ≥0.8s and ≥1.6s apart and the refused token is pushed three times
        (110ms apart without step 2);
      - a remote change whose pull got the 401 is pulled after recovery
        (never, without the flag fix). It waits out the server's 10s cache of
        allowed webhook answers, so it states a 25s budget.
- Local runs pointed the webhook host at `host.lima.internal` (Rancher
  Desktop cannot reach the host through `host.docker.internal`); not
  committed.

## Out of scope

- An auth webhook that is down answers `Internal` (`ErrWebhookTimeout`,
  `ErrUnexpectedStatusCode`), not 401, and `handleConnectError` does not
  retry `Internal`, so the loops stop. Not a token refresh problem; the
  requester chose to leave it for now.
- A `deactivate` that fails leaves the client `Activated` with its sync loop
  stopped (it exits on `deactivating`, which the failure only resets), and a
  later `activate` returns early, so a reused client's documents stop
  syncing. On `main` too, for any failure, not only a 401 refreshed here.
- A server that answers 401 to a token the injector has just returned gets
  the injector called on every retry, as before this change: the backoff
  starts only when the injector rejects.
