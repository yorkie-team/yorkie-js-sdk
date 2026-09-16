# Incremental Persistence Engine (S2)

**Created**: 2026-09-16

Drive the `DocStore` shape S1 landed: append each local change instead of
re-serializing the document, compact on a threshold relative to the snapshot,
and replay the appended log on restore.

Design: `docs/design/offline-local-persistence.md` § Revision: Incremental
Persistence. Depends on S1
(`20260916-incremental-doc-store-interface-todo.md`), which defined
`appendChange` / `saveMeta` / `saveSnapshot` and left them uncalled.

## What this is worth

Measured on 0.7.21: one change is ~471 B *regardless of document size*, while
a snapshot of an 8,000-cell sheet is 2.77 MB and takes 286 ms of main thread.
Today every local change — including a caret move — pays the snapshot. After
this, it pays the change.

## The primitives that already exist

Reading first saved inventing these:

- **Replay** is `applySnapshot`'s existing move (`document.ts`): rebuild the
  root, then `applyChanges(this.localChanges, OpSource.Local)` on top. Public
  `applyChanges` applies changes without touching the push queue, so restore
  can apply and queue as two explicit steps.
- **Change serialization** is `Change.toStruct()` / `Change.fromStruct()`, the
  same encoding `toBytes` already uses for its pending-changes blob. The append
  unit needs no new format.
- **`Document.fromBytes`** already restores root, checkpoint, changeID and the
  pending changes that were inside the envelope. Those pending changes are
  *already reflected in the snapshot's root* (`toBytes` serializes the live
  root), so they are queued but must not be re-applied. Changes from the
  appended log are the opposite case: written after the snapshot, so they must
  be both applied and queued. Getting this backwards duplicates operations.

## Task 1: document-level support

**Files:** `packages/sdk/src/document/document.ts`,
`packages/sdk/test/unit/document/document_bytes_test.ts`

- [ ] **1.1** Write the failing round-trip test: build a document, snapshot it
      with `toBytes()`, make three further edits, collect them with
      `getPendingChangeStructs()`, then restore from the snapshot plus those
      structs and assert `toSortedJSON()` equals the live document and that the
      restored pending queue holds all of them.
- [ ] **1.2** Run it. Expect failure: no restore-with-appended-changes entry
      point exists.
- [ ] **1.3** Add `metaToBytes()` / `restoreMetaFromBytes()` — checkpoint and
      changeID only, packed with the same `packBlobs` discipline as `toBytes`.
      This is what `saveMeta` persists after a sync: the snapshot stays put
      while the checkpoint advances, so without it a restore resumes from a
      stale checkpoint.
- [ ] **1.4** Add `restoreAppendedChanges(structs)`: `Change.fromStruct` each,
      `applyChanges(changes, OpSource.Local)` to bring the root forward, then
      queue them for push. Assert ascending `clientSeq` on the way in.
- [ ] **1.5** Run the test. Expect pass.
- [ ] **1.6** Add the inverse-case test: changes *inside* the envelope must not
      be re-applied. Snapshot a document with pending edits, restore from the
      envelope alone, and assert the root matches — not double-applied.
- [ ] **1.7** `pnpm lint && pnpm sdk build && pnpm sdk test test/unit/document/document_bytes_test.ts`
- [ ] **1.8** Commit: `Add document-level meta and appended-change restore`

## Task 2: the compaction policy

**Files:** create `packages/sdk/src/client/persist-policy.ts`, create
`packages/sdk/test/unit/client/persist_policy_test.ts`

A pure function, separated from the client so the rule can be asserted as a
truth table rather than through a live document.

- [ ] **2.1** Write the failing test, including the asymmetry that makes a
      fixed threshold impossible — the measured break-even is ~6,300 edits for
      an 8,000-cell sheet and ~50 for a 5,000-character note:

```ts
it('compacts a small document sooner than a large one', () => {
  // A note: 15 KB snapshot. Its log passes half the snapshot quickly, but
  // compacting is cheap precisely because the snapshot is small.
  assert.isTrue(shouldCompact({ snapshotBytes: 15_000, logBytes: 70_000, changeCount: 200 }));
  // A sheet: 2.77 MB snapshot. The same log is nowhere near worth a 286 ms
  // re-serialization.
  assert.isFalse(shouldCompact({ snapshotBytes: 2_770_000, logBytes: 70_000, changeCount: 200 }));
});

it('holds a floor so a tiny snapshot does not compact every few edits', () => {
  assert.isFalse(shouldCompact({ snapshotBytes: 500, logBytes: 2_000, changeCount: 5 }));
});

it('compacts on replay count even when the log is small', () => {
  // Bounds restore latency, which bytes do not.
  assert.isTrue(shouldCompact({ snapshotBytes: 10_000_000, logBytes: 1_000, changeCount: 1_001 }));
});
```

- [ ] **2.2** Run it. Expect failure: module not found.
- [ ] **2.3** Implement:

```ts
export const MIN_LOG_BYTES = 64 * 1024;
export const LOG_RATIO = 0.5;
export const MAX_REPLAY = 1000;

export function shouldCompact(s: {
  snapshotBytes: number;
  logBytes: number;
  changeCount: number;
}): boolean {
  if (s.changeCount > MAX_REPLAY) return true;
  return s.logBytes > Math.max(MIN_LOG_BYTES, s.snapshotBytes * LOG_RATIO);
}
```

- [ ] **2.4** Run the test. Expect pass.
- [ ] **2.5** Commit: `Add a snapshot-relative compaction policy`

## Task 3: the client write path

**Files:** `packages/sdk/src/client/client.ts`,
`packages/sdk/test/unit/client/offline_persist_sync_test.ts`

- [ ] **3.1** Write the failing test: with a `MemoryDocStore`, attach and make
      several edits; assert the store holds **one** snapshot and a change per
      edit, rather than a snapshot rewritten per edit.
- [ ] **3.2** Write the second failing test: a presence-only local change is
      appended too. It is worthless on restore — presence is re-established on
      reconnect — but it consumes a `clientSeq`, and `restoreFromBytes` does
      not renumber, so skipping it leaves a hole that the first restored push
      is rejected for.
- [ ] **3.3** Run both. Expect failure.
- [ ] **3.4** Replace the persist subscription. Track the last appended
      `clientSeq` per attachment and, on either `LocalChange` or a local
      `PresenceChanged`, append every pending change above it. Driving it off
      the queue rather than off the event payload keeps a missed event from
      silently dropping a change.
- [ ] **3.5** Snapshot once at attach to establish the base the log appends to.
- [ ] **3.6** Replace the post-sync persist with `saveMeta(key,
      doc.metaToBytes(), ackedClientSeq)`. Not a snapshot: an online client
      syncs constantly, and snapshotting per sync reintroduces the cost this
      removes.
- [ ] **3.7** Consult `shouldCompact` after each append; on true, `saveSnapshot`
      and reset the tracked log size.
- [ ] **3.8** Run the tests. Expect pass.
- [ ] **3.9** `pnpm sdk test test/unit` — the S1 suites assert end-to-end
      persistence behavior and must still pass.
- [ ] **3.10** Commit: `Append local changes instead of re-snapshotting`

## Task 4: the client restore path

**Files:** `packages/sdk/src/client/client.ts`,
`packages/sdk/test/unit/client/offline_persist_sync_test.ts`

- [ ] **4.1** Write the failing test: seed a store with a snapshot plus
      appended changes, attach, and assert the document carries the appended
      edits and queues them for push.
- [ ] **4.2** Write the torn-write test: a log containing changes at or below
      the snapshot's `clientSeq` (compaction wrote the snapshot but the clear
      was not observed) must drop those, not replay them.
- [ ] **4.3** Write the discontinuity test: a log with a `clientSeq` hole
      restores from the snapshot alone and emits `LocalChangesDropped` carrying
      the changes it could not replay.
- [ ] **4.4** Run them. Expect failure.
- [ ] **4.5** Implement in the store-backed attach path: filter the log against
      the snapshot's `clientSeq`, check contiguity, then
      `restoreAppendedChanges`. Apply `meta` when present, since it may carry a
      checkpoint newer than the snapshot's.
- [ ] **4.6** Run the tests. Expect pass.
- [ ] **4.7** Commit: `Replay the appended change log on restore`

## Task 5: the persist budget

**Files:** `packages/sdk/src/client/client.ts`,
`packages/sdk/src/document/document.ts` (event type),
`packages/sdk/test/unit/client/persist_disabled_test.ts` (create)

- [ ] **5.1** Write the failing test: with `maxPersistBytes` set below the
      document's snapshot size, the first compaction latches persistence off
      for that document and emits `PersistDisabled` with reason `too-large`.
- [ ] **5.2** Write the second: after latching, no further `toBytes` call is
      made — the waste is bounded to one.
- [ ] **5.3** Run them. Expect failure.
- [ ] **5.4** Add `DocEventType.PersistDisabled` with reasons `too-large` /
      `too-slow`, and `maxPersistBytes` / `maxPersistMillis` to
      `ClientOptions`. Measure at compaction only — appends are cheap and
      constant, so they need no budget.
- [ ] **5.5** On exceeding, tear down the persist subscription for that
      document and publish the event.
- [ ] **5.6** Run the tests. Expect pass.
- [ ] **5.7** Commit: `Latch persistence off for a document that cannot afford it`

## Task 6: integration

**Files:** `packages/sdk/test/integration/offline_persistence_test.ts`

- [ ] **6.1** Extend the suite: edit offline, "reload" (fresh client and
      document against the same store), assert the un-pushed edits survive and
      push successfully once reconnected — through the incremental path rather
      than the snapshot-per-change one.
- [ ] **6.2** Assert the store holds one snapshot and N changes mid-session,
      which is the property that distinguishes this from S1's behavior.
- [ ] **6.3** Run against a live server started from **this repo's** compose
      file. Note that `docker compose up` fails outright if anything else holds
      8080; S1's runs silently went to a sibling project's server for exactly
      that reason.
- [ ] **6.4** Commit: `Cover the incremental offline round trip end to end`

## Verification

- [ ] `pnpm lint && pnpm sdk build && pnpm sdk test` green
- [ ] Integration suite green against a server from this repo's compose file
- [ ] A benchmark built by **editing**, not by one bulk `update()`: a fixture
      assembled in a single update understates cost by two orders of magnitude
      (a 20k-character note is 59 KB built at once, 6.60 MB typed)
- [ ] The `ClientOptions.store` doc comment no longer says a full snapshot is
      written per local change

## Review

_Filled in when the PR lands._
