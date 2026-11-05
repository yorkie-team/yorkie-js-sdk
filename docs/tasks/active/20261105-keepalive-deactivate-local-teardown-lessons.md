**Created**: 2026-11-05

# Lessons — Local teardown for keepalive deactivate (#1521)

## Notes

- The keepalive branch used to share the whole `task` closure with the queued
  path, and that sharing is the bug: everything in there — the local
  teardown, the 401 refresh, `handleConnectError`, the rethrow — is written
  for a response the caller is still around to receive. Once the two paths
  disagree about whether the response matters at all, the branch has to be
  its own code, not a flag threaded through the shared one.
- `this.keepalive` is read by the transport interceptor during the
  synchronous part of the `fetch` call, so it only has to be set across the
  `rpcClient.deactivateClient(...)` call itself and not across any await.
  Keeping the window that narrow is what lets the new path resolve
  immediately without the flag leaking into a later request.
- Dropping the late error means dropping the documented "401 + a rejecting
  `authTokenInjector` throws the injector's error" behaviour for keepalive
  only. That is the right trade here — there is no caller left to catch it,
  and the client is deactivated locally either way, which was the point of
  that clause — but the doc comment on `deactivate` had to say so.

## Self review

Not run: this task ran as a one-shot autonomous job with no reviewer subagent
available. Review is left to CI, `@claude review` and a human on the PR.

### Panel round 1 — test adequacy

- Both session guards are a disjunction (`!isActive()` **or** a different
  `clientId`), and the first two tests only reached the `!isActive()` side:
  weakening `ownsSession()` to a plain `isActive()` check left the suite
  green. The re-activation side is the half the `abandoned` flag exists for,
  so it needed its own tests.
- Reaching it takes a re-activation that does **not** go through the task
  queue, because the queue runs one task at a time: `activate()` enqueued
  behind an in-flight attach can never change `this.id` while that attach is
  still awaiting. The sync loop's first `RefreshChannel` response is the path
  that does assign `this.id` outside the queue, so the new tests emulate that
  assignment (`reactivateOutsideQueue`) rather than calling `activate()`.
- Verified the new tests are load-bearing by weakening both guards to
  `!this.isActive()` locally: exactly the two new cases failed.

### Panel round 2 — blast radius and the transport flag

- The session guard belonged at the **sink**, not at one source. Round 1 put
  the `abandoned` escape only on `attachDocument`, but every queued task and
  every loop routes a late error through `handleConnectError`, whose
  `ErrClientNotActivated` / `ErrClientNotFound` branch calls
  `deactivateInternal()`. Since the keepalive teardown now runs outside the
  queue, each of them had the same window. Fixed by giving
  `handleConnectError` an `ownsSession` predicate (default `() => true`, so
  nothing else changes) and threading `captureSession()` from detach, sync,
  remove, the four revision tasks, broadcast, the sync loop and both watch
  streams.
- `captureSession()` is called where the request's `clientId` is read, so the
  captured id is the one the request actually carries. A task enqueued under
  session A but run under session B legitimately sends B's id, and must still
  be allowed to tear B down; only an error from a session that has since been
  replaced is ignored.
- `this.keepalive` could not work as a field. The transport's custom `fetch`
  reads it at fetch time, and connect awaits its interceptor chain
  (`auth_interceptor`, `metric_interceptor` — both async) before calling it,
  so the `finally` that reset the flag had already run. Replaced with a
  per-request `x-yorkie-keepalive` header the transport consumes and strips,
  which also removes the shared mutable flag the `detach({keepalive:true})`
  path was toggling. The new test drives a real transport over a stubbed
  `globalThis.fetch`, so it sees the interceptor chain the mocked `rpcClient`
  tests cannot.
