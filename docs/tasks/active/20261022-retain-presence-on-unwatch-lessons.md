# Lessons — Retain a peer's presence on `DOCUMENT_UNWATCHED`

**Created**: 2026-10-22
Tracked as #1499

## A half-applied fix is a fix that looks done

#1186 removed the presence pruning from `applyWatchInit` and left a long NOTE
explaining the reconnect invariant. The identical `presences.delete` two
methods below it survived, because the bug reproduced through the init path and
that is the path that got tested. The invariant — *the presences map is a cache
keyed by actor, and `onlineClients` is the only thing that decides visibility*
— holds for the whole class, so the fix had to be applied to every writer of
the map, not to the one the repro happened to hit.

## The event still fires without the delete

The obvious worry with dropping `presences.delete` is that `unwatched` stops
firing. It does not: `reconcilePresence` keys the unwatched transition on
`prev.hadPresence && prev.wasOnline && (!hasPresence || !isOnline)`, and
`removeOnlineClient` alone flips `isOnline`. The presence is only read to fill
the event payload, where it must still be present anyway. Reading the state
table in that method's doc comment settled the question without running
anything.

## Removing a delete is also removing an eviction policy

The review panel landed the point the todo had waved away under "out of scope":
`presences.delete` on unwatch was not only wrong, it was the *only* thing that
ever shrank the map. Taking it out left no eviction path at all, and the map is
serialized into the locally persisted snapshot, so it was unbounded in memory
*and* at rest — with other people's presence, which applications fill with
names, avatars and cursors. Retention and eviction are one decision: whoever
decides to keep something has to say when it goes.

The fix keeps both properties: the presence survives long enough for a
reconnect (`retainedPresences`, capped at 100 in LRU order), and only *live*
presences (`livePresences()`) reach `toBytes`. The two concerns split cleanly
because visibility was already keyed on `onlineClients` rather than on the
map's contents.

## Rounds

- **Round 1** — CI review panel (not `/self-review`: this run is headless and
  has no tool that can dispatch the reviewer subagent). Two blocking findings,
  both downstream of the deleted line rather than in it: no pruning path for
  peers that vanish without detaching (blast-radius), and departed peers'
  presence persisted into the offline snapshot (security). Both fixed above;
  no finding disputed.

- **Round 2** — CI red, but not from this branch's code: `mongo:8` now refuses
  to boot on the runners ("Linux kernel versions 6.19 and newer has a known
  incompatibility", SERVER-121912), so the server had no database, exited with
  cobra's usage text, and `wait-for-yorkie` timed out before a single suite
  ran. Pinned `docker/docker-compose-ci.yml` to `mongo:9`, which carries the
  fix; the full integration suite then passed (3790 tests).

- **Round 3** — Review panel, two blocking findings, both about the *cap*
  rather than the retention. The eviction policy had been wired into every
  path that could notice a peer was absent, including two where "absent from
  `onlineClients`" does not mean "gone": `resetOnlineClients()` (the watch
  stream dropped, so the set is empty by construction and the reconnect is
  imminent) and `applySnapshot()` (the set is only as fresh as the last thing
  the stream said). On a document with more than 100 peers, a single stream
  blip therefore evicted 50 of them before the reconnect's watch init could
  report them online — reintroducing the exact invisible-peer bug the branch
  exists to fix. The lesson is that a cap is only safe where the signal
  feeding it is authoritative: retention now happens solely on an explicit
  `DOCUMENT_UNWATCHED` and on `applyWatchInit`, where the online set *is* the
  server's answer. `applySnapshot` only prunes the bookkeeping to the actors
  that survived the snapshot.

  The second finding was the downstream consequence: a wire presence `Patch`
  carries only the keys that changed, so `change.ts` folded it onto
  `presences.get(actorID) ?? {}` and an evicted base silently produced a
  presence missing every untouched field, typed `P`. Eviction and that `?? {}`
  were each defensible alone and wrong together. The fold now requires a base;
  with none, the actor is left without a presence — a state `getPresence` and
  `getPresences` already model, and one the next snapshot heals — instead of
  one that type-checks and lies.
