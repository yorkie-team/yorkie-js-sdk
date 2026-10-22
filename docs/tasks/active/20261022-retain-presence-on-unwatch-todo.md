# Retain a peer's presence on `DOCUMENT_UNWATCHED`

**Created**: 2026-10-22
Tracked as #1499

## Problem

When a peer's watch stream drops and reconnects, other clients can stop seeing
it: no `watched` event fires and `getOthersPresences()` leaves it out.

`Document.applyDocEvent` handles `DOCUMENT_UNWATCHED` by calling
`removeOnlineClient(publisher)` **and** `this.presences.delete(publisher)`.
When the next `DOCUMENT_WATCHED` for the same publisher arrives, the
`hasPresence(publisher)` guard is false, so `reconcilePresence` has no presence
to report and no `watched` event is published. The peer stays hidden until it
changes its presence or this client receives a snapshot.

#1186 fixed exactly this on the `applyWatchInit` path; the NOTE comment there
(`document.ts:3138-3148`) spells out why stale presences must be kept for
reconnect. The `UNWATCHED` path was never updated. The Go SDK does not delete
the presence on unwatch (`pkg/document/document.go` in yorkie).

## Plan

- [x] Drop `this.presences.delete(publisher)` from the `DOCUMENT_UNWATCHED`
      branch of `applyDocEvent`; keep `removeOnlineClient`. Explain why in a
      comment that points at the `applyWatchInit` NOTE.
- [x] Confirm the `unwatched` event still fires: `reconcilePresence` emits it
      on `(hadPresence && wasOnline) → !isOnline`, which `removeOnlineClient`
      alone already produces.
- [x] Confirm nothing leaks the stale entry: `getPresence`,
      `getPresences`, `getOthersPresences` all gate on `onlineClients`.
- [x] Unit test in `test/unit/document/document_test.ts`: UNWATCHED then
      WATCHED for the same peer → `unwatched` then `watched`, peer back in
      `getOthersPresences()` with its original presence.

## Out of scope

- `applyDocEventsForReplay` (devtools replay) still deletes the presence on an
  `Unwatched` event. That path replays a recorded event log rather than a live
  stream, and the issue does not cover it.
- Evicting presences of peers that never come back. Same trade-off
  `applyWatchInit` already accepts: the map keeps stale entries, and every
  accessor filters by `onlineClients`.

## Verification

- `pnpm verify:fast`
- `pnpm sdk exec vitest run test/unit/document/document_test.ts`
