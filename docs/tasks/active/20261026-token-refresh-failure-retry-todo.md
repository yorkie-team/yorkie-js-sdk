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
      refresh may run, but no longer than 5s at a time (`loopRetryDelay`,
      `AuthRetryMaxWaitMs`), so the refused token is sent once per refresh
      while the backoff is short and once per 5s after (see "Simplified"
      below).
- [x] A one-shot call (`attach`, `detach`, `remove`, `sync`, the first try
      of `broadcast`, …) behaves as before: it calls the injector on every
      401, even during the backoff, and throws the injector's error when it
      rejects. Only its failure now counts toward the loops' backoff.
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
- [x] ~~While a channel is attached, the sync loop waits no longer than the
      channel heartbeat interval.~~ Replaced by the 5s cap below.
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
- [x] ~~A refresh that ends the backoff wakes the waiting retries, and
      `deactivate` drops the sync loop's waiting retry.~~ Replaced by the 5s
      cap below.
- [x] The local deactivation on an unrefreshable 401 keeps `deactivating`
      set, as a deactivation that succeeds does, so the sync loop exits
      instead of resuming during the refresh, and a late first
      `RefreshChannel` response cannot mark the client activated again.
- [x] No new event or API. Telling a permanent failure from a transient one
      is the app's call inside its injector; the stop is `client.deactivate()`.
- [x] The auth webhook can guard `DeactivateClient` too, so for a signed-out
      user the documented stop got the same 401 and left the loops running.
      When `deactivate` gets a 401 and the injector rejects, the client now
      deactivates locally and throws; the server reaps it after its
      `clientDeactivateThreshold`, as for `deactivateOnUnload: false`. Decided
      with the requester.

### Simplified: a loop's 401 wait is capped at 5s

Holding the loops' 401 retries for the whole backoff (up to 30s) broke what
the rest of the client assumes, that a failed loop runs again within about a
second: a channel attached during the wait went without its first refresh
past the server's 15s session TTL, a `Polling` document or a token refreshed
by a one-shot call waited for the old timer, and a deactivate followed by
`activate` within the wait ran two sync loops. Each fix (a heartbeat bound
for the channels attached at the time, waking the loops on a refresh,
cancelling the retry on deactivate) brought the next case. Decided with the
requester:

- [x] A loop's 401 retry waits for the backoff but no longer than 5s
      (`AuthRetryMaxWaitMs`, the default channel heartbeat, TTL/3). The
      heartbeat bound, the wake-up and the retry cancel are gone.
- [x] The injector keeps its 1s-to-30s backoff: the loops' retries in
      between skip it, so the token API, the service that is down, gets at
      most one call per backoff per client. Each loop sends Yorkie and the
      webhook the refused token once per refresh while the backoff is
      shorter than 5s, and every 5s after.
- [x] `runSyncLoop` numbers its loops and an older one stops at its next
      tick, so a deactivate and an `activate` within a retry wait (up to 5s
      after a 401, 1s otherwise, as on `main`) run one loop, not two.
- [x] Local review: one-shot calls had come to throw `ErrUnauthenticated`
      instead of the injector's error, which is how an app learns it was
      signed out; restored to `main`'s behaviour. A broadcast's first try is
      the app's call, so it no longer skips the injector during the backoff.
- Looked at and left out, from the same review: a loop timer set for the end
  of the backoff can fire about 1ms early, so the loop sends the refused
  token once more and refreshes one retry delay later; and a wall clock set
  back during the backoff lengthens it, the loops still retrying every 5s.
  Neither loses data or stops a loop, and guarding them adds state for
  little gain.

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
      sync loop retried at least every 5s while the injector backs off to
      30s, a one-shot `sync` and a broadcast's first try during the backoff
      calling the injector and throwing its error, `deactivate` stopping
      locally on a 401 the injector cannot refresh, `activate` dropping a
      pending call, one sync loop after a deactivate and `activate`, a
      token set while a later call is pending on a slow token API, a Watch
      reconnect through `runWatchStream` and `Attachment` held to the
      backoff.
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
