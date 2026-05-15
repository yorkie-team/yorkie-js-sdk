# Channel RefreshChannel-Only Lifecycle — Lessons

## What landed

The original 10-task plan + four follow-up commits driven by failures that
only surfaced once the new lifecycle ran end-to-end:

1. **SDK Task 8** — Drop the `isActive()` guard on `peekChannel`,
   `changeChannelSyncMode`, `sync(channel)`, and `broadcast`. (`e64b10c20`)
2. **`Attachment.lastHeartbeatTime`** — initialize to `0` instead of
   `Date.now()` so the first heartbeat fires on the very next sync-loop
   tick. With the old default the first RefreshChannel did not fire
   until one full interval (5 s) had elapsed, making fresh attachments
   look broken. (`960b24510`)
3. **React `YorkieProvider activate?: boolean`** + `ChannelProvider`
   loading-timing fix + `usePeekChannel` guard removal — channel-only
   apps can now opt out of `client.activate()` / `client.deactivate()`,
   and the `loading` flag stays true until the first heartbeat
   completes (no transient `loading: false, sessionCount: 0`). (`e6748d835`)
4. **Integration test updates** — old tests assumed synchronous attach
   semantics and short detach-visibility windows. Add `waitForAttached`
   / `waitForCount` helpers; cross-peer count drops now poll for up
   to 25 s to absorb the server's 15 s TTL + cleanup interval; Manual
   mode tests call `sync()` explicitly to obtain initial state. (`f6ae30d08`)
5. **Playground** — set `<YorkieProvider activate={false}>` since it
   only uses channels, and render an em-dash placeholder during the
   `attaching` state. (`beb643a9b`)

## Surprises

### "First heartbeat is delayed by one interval"

The plan correctly identified that `client.attach(channel)` should no
longer block on an RPC, but it did not catch that `Attachment`'s
`lastHeartbeatTime` initializer (`Date.now()`) implicitly deferred the
first sync-loop tick by a full interval. This bug was latent before
the PR — Polling documents had the same staircase — it just became
acutely visible because channel attach now relies on the first
heartbeat for the server-side attach itself. **Lesson:** when shifting
work from "during attach()" to "first sync-loop tick," audit how the
loop schedules its first iteration.

### "loading: false / sessionCount: 0" race in React

`ChannelProvider` flipped `loading: false` the moment `client.attach()`
resolved. Under the old lifecycle that was correct (attach returned
the populated sessionCount). Under the new lifecycle the channel
hadn't actually attached yet, so the UI got a one-frame flash of
`0 people watching`. The fix was to defer `loading: false` until the
channel's first event arrives with `isAttached()` true. **Lesson:**
when the SDK contract for "ready" changes from sync to async, every
consumer that gates a `loading` flag on the SDK call needs to move
the flip to the event boundary.

### Synchronous test assumptions

Most failures from the full SDK sweep were tests doing
`await client.attach(ch); assert.equal(ch.getSessionCount(), 1)`
or `await client.detach(ch); assert.equal(peer.getSessionCount(), 1)`.
The new lifecycle violates both:

- Attach returns before status flips to Attached.
- Detach is local-only; peers see the drop via TTL reclamation.

The natural temptation is to insert "wait a bit" `setTimeout`s, but
the right shape is **wait-for-condition** (poll `isAttached()` or
`getSessionCount() === expected`) with a generous deadline. The
generous deadline matters for cross-peer scenarios: with TTL=15s and
a cleanup ticker of 10s, peer-visible drop can take ~25 s in the
worst case.

### Server-induced session count of 0 was not real

While debugging the "count starts at 0" UX issue, I initially
suspected the server was returning sessionCount=0 on the first
RefreshChannel response. The server code (`channel/manager.go:319`)
actually computes the count *after* inserting the new session, so
the count should always be ≥ 1. The 0 was purely the
`lastHeartbeatTime = Date.now()` bug — the response with count=1
hadn't arrived yet because the first heartbeat hadn't fired.
**Lesson:** when both the server and the client could be at fault,
prove the server path first (read its handler) before assuming a
server-side bug.

### Webhook test environment fragility

The auth-webhook test starts an Express server on port 3004 in
`beforeAll` and closes it in `afterAll`. If a vitest run is killed
mid-flight (Ctrl-C, parent-process exit, etc.), the leftover Node
process keeps the port. The next run's `listen(3004)` silently fails
and `beforeAll` never returns — vitest hangs with no output. The
recovery pattern is `pkill -9 -f vitest && lsof -nP -iTCP:3004 -sTCP:LISTEN`
before retrying. **Lesson:** tests that bind a fixed port need an
explicit `EADDRINUSE` handler or randomized ports, otherwise debug
sessions waste minutes chasing phantom hangs.

## Out-of-scope items deliberately left behind

- A `SessionExpired` channel event surfaced via subscriber callbacks,
  for apps that want to observe expiry rather than rely on the SDK's
  transparent re-attach.
- `client.broadcast`'s `clientId: this.id!` non-null assertion. If a
  caller emits a broadcast on a not-yet-activated channel-only client
  between attach and the first heartbeat, this will throw. The
  attachment-driven `local-broadcast` wiring doesn't trigger early
  enough in practice to hit this, but a defensive fix (queue the
  broadcast until `this.id` is set) is a clean follow-up.
- A React lazy-activate path inside `useDocument` that would let
  YorkieProvider drop the explicit `activate` prop entirely. Option A
  (the prop) was chosen because it's explicit and ~5 lines; Option B
  (lazy) would need an in-flight Promise guard against concurrent
  useDocument calls. Worth revisiting if the SDK ever gains many
  Document-bound hooks.
