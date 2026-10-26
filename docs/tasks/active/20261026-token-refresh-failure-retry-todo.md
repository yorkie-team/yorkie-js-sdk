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

- [x] In the `ErrUnauthenticated` branch of `handleConnectError`, catch a
      rejected refresh, keep the previous token, log it, and still report the
      error as retryable. The next attempt gets 401 again and refreshes again.
- [x] Document the behavior on `ClientOptions.authTokenInjector`.
- [x] Integration tests (`webhook_test.ts`): the first refresh rejects and the
      second succeeds, for realtime sync (`PushPull`) and for Watch. Both
      hang without the fix.

## Verification

- [x] `pnpm verify:fast` — lint, licence, doc links, build pass. Unit:
      1146 passed, 23 failed in `offline_persist_sync_test.ts` and
      `persist_disabled_test.ts` ("already open in another tab"); the same 23
      fail on `main` in this environment, so they are not from this change.
- [x] `webhook_test.ts` against the docker server: 11/11 pass with the fix.
      Without it, the two new tests time out and the injector's rejection
      surfaces as an unhandled error. (Run locally with the webhook host
      pointed at `host.lima.internal` — Rancher Desktop cannot reach the host
      through `host.docker.internal`; not committed.)

## Out of scope

Listed in #1512 as follow-ups; not needed to end the stall.

- Publish `auth-error` again when the refresh itself fails
  (e.g. `{ refreshFailed: true }`) so the app can decide to stop.
- Share one refresh between the sync loop and Watch when both get a 401 at the
  same moment (single-flight), and back off on repeated failures.
