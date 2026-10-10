# Detect a half-open Watch stream from the server heartbeat

**Created**: 2026-10-10
Tracked as #1472

The SDK half of yorkie #2153; the server and Go client half landed as
yorkie #2163.

## Problem

A Watch stream carries one `initialization` response and then events only, so
a quiet document sends nothing. A half-open connection — a laptop resuming
from sleep, a network or VPN change, a proxy dropping an idle socket without a
reset — looks exactly like a quiet document. `runWatchStream` reads with a
bare `for await` and no timer, so the stream stays "connected" until TCP or a
load balancer gives up. Unary RPCs keep working over new connections, so a
watching-only client sees the document freeze with no error.

Server v0.7.25 can send a `WatchHeartbeat` on idle streams and advertises the
interval in `WatchInitialization.heartbeat_interval_ms` (0 when off, the
default). The JS protos predate both fields, so this SDK cannot read the
interval, and nothing in it would act on silence anyway.

## Plan

1. Protos — copy `yorkie.proto` and `resources.proto` from yorkie main and
   regenerate. Brings `WatchHeartbeat`, `heartbeat_interval_ms`, and the
   presence `CHANGE_TYPE_PATCH`/`removed_keys` fields; the presence decoder
   already rejects types it does not know, and the server folds patches into
   puts before anyone pulls them.
2. `client/watch.ts` — `watchIdleTimeout(intervalMs)` with Go's arithmetic:
   3× the interval, clamped to [1s, 24h], 0 for an interval of 0 or less.
   `runWatchStream` takes the interval from the init response, arms a timer
   once it is non-zero, restarts it on every response, and aborts the stream
   when it fires. An idle abort reports `ErrWatchStreamIdle` through
   `onError` and reconnects through `onDisconnect` from the timer itself,
   not once the stream unwinds — over Node's fetch an aborted read on a
   half-open socket never settles. Whatever the abandoned stream does later
   is ignored. One timer per stream, re-armed for the time left since the
   last response. A stream the client aborted is never reported as idle.
3. `client/client.ts` — both document and channel streams pass
   `watchHeartbeatInterval` (in `watch.ts`, required by the config so a
   missing call site fails to compile).
4. `util/error.ts` — `Code.ErrWatchStreamIdle`.

No timeout on the wait for the init response: the server's handshake
includes an auth webhook with project-configurable retries, which the client
has no basis to bound (same call as the Go client).

## Checklist

- [x] Protos synced and regenerated
- [x] Unit tests (Red first): timeout arithmetic; silent stream after init
      aborts, reports `ErrWatchStreamIdle`, reconnects; heartbeats keep it
      alive; interval 0 never times out; timer cleared on end and cancel
- [x] Implementation (Green)
- [x] E2E against a yorkie main server with the heartbeat on, through a
      proxy that stops relaying: stream reconnects instead of freezing
- [x] `pnpm verify:fast`, `pnpm sdk test`
- [x] Self review
- [x] PR — #1472

## Review

- Unit: `test/unit/client/watch_idle_test.ts`, 10 tests, 7 red before the
  implementation. Covers the clamp arithmetic, a silent stream timing out
  and reconnecting, heartbeats keeping it alive, interval 0 never timing
  out, an `AbortError` the channel stream ignores, a transport that ends
  quietly on abort, and the timer cleared on end and on cancel.
- E2E (scratch, not committed): yorkie main (`6141a48b`) with
  `--backend-watch-heartbeat-interval 1s`, the watcher behind a TCP proxy
  that black-holes the open Watch socket while new connections pass. On
  main the watcher still read `v=1` 15s after the peer's edit and published
  no connection event; on this branch it published `disconnected,connected`
  and read `v=2` after 3.5s.
- `pnpm verify:fast` green. `pnpm sdk test` against the docker server
  (heartbeat off): 3561 passed. Integration suite against the heartbeat
  server: 2618 passed, 10 failed — the same 10 fail on main against that
  server (9 webhook tests, which need a webhook it lacks, and
  `gc targeting nodes made by deactivated client`, the memory backend's
  detach bug).
- Self review, round 1 (independent agent): no blocking findings. Applied:
  clear the timer at the top of `catch`. Left as known: reconnects use the
  fixed `reconnectStreamDelay` rather than Go's backoff, as every other
  stream error already does; nothing in CI checks that `client.ts` passes
  the interval, because the CI server runs with the heartbeat off.
- Code review (`/code-review`, 9 findings), round 2. Fixed:
  - the idle reconnect waited for the iterator to unwind after `abort()`;
    E2E with the watcher quiet for 5s before the freeze showed the timer fire
    and the stream never settle, so it never reconnected — on the first
    commit too. Now the timer reconnects; a test pins a never-unwinding
    transport
  - a client cancel racing the timer was reported as idle and called
    `onDisconnect`; the timer now returns on an aborted signal (test added,
    red first)
  - one timer per stream instead of one per response
  - the extractor moved to `watch.ts` as `watchHeartbeatInterval`, imported
    by the test, and the config field is required
  - the document stream's `onError` now logs the error
- E2E rerun with the watcher quiet for 0s, 5s and 12s before the freeze:
  no reconnect while heartbeats flow, reconnect ~3.5s after the freeze in
  all three.

## Open

- A reconnect after an idle abort has no deadline before the init
  response. A browser on HTTP/2 may put the new Watch on the same dead
  pooled connection, and nothing would notice. Same as the Go client, which
  declined an init timeout because the handshake includes the auth webhook.
  Filed as #1473.
- A page resumed from a freeze longer than the timeout may run the overdue
  timer before the buffered heartbeats, costing one spurious reconnect.
