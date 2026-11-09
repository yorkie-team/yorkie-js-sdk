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

### Round 2 — one finding disputed, no code change

The panel re-raised the same-key double attach ("document attach can still
clobber a channel attachment of the same key"; "the new identity guard makes
an orphaned same-key channel attachment permanently undetachable") against
8299c7d0, the commit in which a maintainer reverted rounds 1 and 2 and
scoped this to a follow-up issue. Disputed rather than fixed, because the
finding's mechanism does not hold on the reviewed commit:

- It is anchored on `assertChannelKeyFree` (client.ts:2644), which this
  branch no longer has — `370310cf` added it, `8299c7d0` reverted it, and
  2644 is now the `SyncMode.Realtime` branch of `changeChannelSyncMode`.
  The delta tightens nothing there.
- The clobber predates the PR unchanged. `attachChannel`'s only
  precondition is the `ChannelStatus.Detached` check (client.ts:2329) and
  it takes the key unconditionally at client.ts:2412 — the same code at the
  same line on `origin/main`. The diff touches only `detachChannel`
  (2436-2465) and `detachInternal` (4003-4065).
- The orphan was not detachable before the guard either. On `origin/main`,
  `detachChannel` resolved the key's *current* attachment (main:2436) and
  `detachInternal(key)` (main:2459) tore that one down, so detaching
  through the stale object destroyed the live attachment and still left the
  overwritten one's watch stream and `local-broadcast` subscription in
  place. The guard turns "tears down the wrong attachment, orphan leaks"
  into "`ErrNotAttached`, orphan leaks" — strictly fewer casualties, and
  not the origin of the leak.

Taking the key over in `attachChannel` instead of refusing it was not
attempted either: it detaches the first holder, which breaks the
two-providers-on-one-key case `8299c7d0` named as the reason the
`ErrAlreadyAttached` rule was reverted. The leak needs a design decision
about what one key with two live Channels means, which is the follow-up
issue, not this PR.
