# Drop a pull already in flight when switching to push-only

**Created**: 2026-10-06
Tracked as #1452

## Problem

`changeSyncMode` has run on the client task queue since #1243 (v0.7.8). The
sync loop runs on the same queue and awaits its `syncInternal` calls, so a
switch to `RealtimePushOnly` requested while a realtime pull is in flight
waits for that pull. When the pull's response arrives, the guard in
`syncInternal` still sees `attachment.syncMode === Realtime` and applies the
pulled changes, after the caller asked to stop receiving. Up to v0.7.7 the mode
was set before anything awaited, so the guard caught it.

An editor binding that pauses pulling during IME composition reopens
`Realtime` for about 1 ms between syllables. In a Korean editor this left a
stray jamo in about one of ten five-syllable words.

## Plan

- [x] Red: an integration test holds c1's pull after the server answered,
      requests `RealtimePushOnly` (and `RealtimeSyncOff`), releases the pull,
      and expects no `remote-change`, then lets the realtime loop catch up on
      its own (fails on `main`: one remote change applied).
- [x] `Attachment.pendingPullPauses`: `changeSyncMode` increments it before
      enqueueing a switch to `RealtimePushOnly` / `RealtimeSyncOff`, and the
      queued task decrements it in `finally`.
- [x] The response guard (`dropsRemoteState`) also drops while
      `pendingPullPauses > 0`. A count rather than a flag, so an earlier queued
      pause finishing does not clear a later one (P → R → P).
- [x] `docs/design/polling-sync-mode.md`: note that a pause covers a pull
      already in flight.
- [x] `pnpm verify:fast`; `pnpm sdk test` for the touched integration suites
      with the server running.
- [x] Self review round 1 (correctness, test adequacy): `return await` in the
      queued task so the count drops only after the switch settles; the test
      covers `RealtimeSyncOff`, waits for the realtime loop instead of an
      explicit sync, bounds its waits and restores the RPC in `finally`.

## Out of scope

- A switch back to `Realtime` stays queued as before. Pulls resume in queue
  order and pick up what the dropped pull carried.
- An explicit `sync(doc)` requested while a pause is pending is also only
  push-acked. That matches what it does once the document is in push-only.
- The Go SDK (`client.ChangeSyncMode`) was not checked.
- P → R → P (the reason for a count rather than a flag) has no test: whether
  the sync loop pulls between the queued R and the second P depends on the
  loop tick, so it cannot be held deterministically the way the in-flight
  pull is.
- A pause requested before `attach` resolves is not counted (there is no
  attachment yet); the switch still applies when the queue reaches it.

## Verification

- New tests `Should drop a pull already in flight when switching to
  realtime-pushonly` / `realtime-syncoff` (`client_test.ts`): both fail on
  `main` (`expected 1 to equal +0`), pass with the fix (3 of 3 runs).
- `client_test.ts`, `pushonly_gc_test.ts`, `document_polling_test.ts`: 24
  passed against `yorkie server` 0.7.24.
- SDK-only timing repro (two clients, 1 ms `Realtime` window, 150 rounds,
  server 0.7.24): v0.7.7 0, v0.7.21 5, v0.7.24 9, this branch 0.
