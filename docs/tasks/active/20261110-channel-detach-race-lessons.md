# Lessons: Channel detach race

## Findings

- Found in an app (a multiplayer game server) that detaches a player's
  channel and attaches a new Channel of the same key when the player
  reconnects. It worked around it by waiting for the previous detach.

## Self-review log

### Round 1 — correctness/tests (no blocking findings)

Checked: every other `detachInternal` caller passes nothing, so the default
keeps `ownsKey` true and their teardown unchanged; the overwritten old
attachment is still torn down by its pending detach task (watch stream and
local-broadcast subscription are bound to the attachment object, and the
task queue is never cleared); deactivate during a pending detach is
idempotent; the stale-object guard breaks no caller (React's
`ChannelProvider` detaches its own object and already tolerates "not
attached"). Applied the test findings:

1. The stale-object test caught its own `assert.fail`; now
   `expect(...).rejects.toMatchObject({ code: 'ErrNotAttached' })`.
2. Test 1 is deterministic (attach enqueues before the awaited detach), so
   what it pins is "the old detach runs before the new first refresh";
   renamed, and it checks the old channel too.
3. Test 2 held the detach with a fixed 1.5s sleep; it now waits until the
   new channel has attached, so it always covers the intended order.
4. Added: detaching the new channel while the old detach is held.

Out of scope (follow-up issue): two live attachments of one key.
