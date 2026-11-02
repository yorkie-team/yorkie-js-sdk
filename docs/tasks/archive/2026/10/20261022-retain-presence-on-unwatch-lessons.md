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

## Rounds

- The run had no `/self-review`; the review panel ran five rounds instead.
  Its first round raised two blocking findings on the one-line fix: departed
  peers' presences are kept, and written into persisted snapshots by
  `toBytes()`, with no eviction. The three fix rounds answered them with
  JS-only rules the Go SDK does not have (a retention cap, a guard against
  folding a patch onto a missing base, a heal path for that guard), and each
  round's review found a defect in the previous round's code.
- A maintainer reverted the rounds to the first commit's Go parity. The
  eviction the panel asked for belongs on the server, which already writes a
  presence clear when it deactivates a client; that clear was the part
  actually broken for stable-actor clients (yorkie#2290, fixed in yorkie#2291).
- Lesson: when a fix round's answer to a finding has no counterpart in the
  other SDK, check whether the finding belongs to another layer before
  writing more client code.
