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

No `/self-review` rounds: this run is headless and is granted no tool that can
dispatch the reviewer subagent. Review is left to CI, `@claude review`, and a
human on the PR.
