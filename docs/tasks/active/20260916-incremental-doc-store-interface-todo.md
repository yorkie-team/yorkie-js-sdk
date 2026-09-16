# Incremental DocStore Interface (S1)

**Created**: 2026-09-16

Reshape `DocStore` from one opaque blob per document into the snapshot +
change-log + meta form the incremental persistence design needs, **without
changing any behavior**. The client keeps writing a full `toBytes()` snapshot
on every local change; it just does so through `saveSnapshot` instead of
`save`.

Design: `docs/design/offline-local-persistence.md` § Revision: Incremental
Persistence.

## Why this is a PR of its own

The engine change (S2) is the risky part — append on the hot path, compaction
policy, replay on restore, `clientSeq` contiguity. Landing the interface
separately means a regression in S2 cannot be confused with a regression in the
reshape, and it unblocks wafflebase's `WafflebaseDocStore` (W2), which can then
be written against the final contract while S2 is still in review.

`appendChange` and `saveMeta` are therefore **defined and implemented but not
yet called**. That is deliberate: the contract an external backend implements
should land whole, not grow under it one release at a time.

## Scope

In:

- [ ] `StoredDoc` / `StoredChange` types and the reshaped `DocStore`
- [ ] `MemoryDocStore` implementing the full interface
- [ ] `client.ts` call sites moved to `saveSnapshot` / the new `load` shape
- [ ] The `IndexedDBDocStore` reference fixture updated to the new contract
- [ ] Public exports in `yorkie.ts`
- [ ] A distinct error code for the session-lock failure (separate commit)

Out — these belong to S2:

- Appending on `LocalChange`, `saveMeta` on sync, compaction policy
- Replay on restore, contiguity validation, torn-write handling
- `PersistDisabled` and the persist budget

Out — these belong to wafflebase (W2):

- Reading entries written by the shipped single-blob layout. `MemoryDocStore`
  holds nothing across a process, so the SDK has no legacy to migrate; the
  IndexedDB backend does, and it is app-side.

## Task 1: the distinct error code

Today the single-active-session failure throws `Code.ErrInvalidArgument` with
an explanatory message (`client.ts`), so a consumer has to match on message
text to tell "open in another tab" from any other invalid argument. wafflebase
needs to branch on it (W3's fallback backstop).

- [ ] **1.1** Write the failing test in
      `packages/sdk/test/unit/client/session_lock_test.ts`: configure a store
      and a `SessionLock` stub whose `acquire` resolves `undefined`, attach,
      and assert the rejection carries `Code.ErrDocumentOpenElsewhere`.
- [ ] **1.2** Run it. Expect failure: the code is `ErrInvalidArgument`.
- [ ] **1.3** Add to `Code` in `packages/sdk/src/util/error.ts`, with a comment
      in the style of its neighbours:

```ts
  // ErrDocumentOpenElsewhere is returned when an offline-persistence attach
  // cannot take the single-active-session lock because another session (in
  // practice, another tab) already holds it for the same client and document.
  ErrDocumentOpenElsewhere = 'ErrDocumentOpenElsewhere',
```

- [ ] **1.4** Change the throw site in `client.ts` to use it. Leave the message
      unchanged — it is good, and only the code is being made machine-readable.
- [ ] **1.5** Run the test. Expect pass.
- [ ] **1.6** `pnpm lint && pnpm sdk build && pnpm sdk test test/unit/client/session_lock_test.ts`
- [ ] **1.7** Commit: `Give the single-active-session failure its own error code`

## Task 2: the reshaped interface

- [ ] **2.1** Write the failing contract test in
      `packages/sdk/test/unit/client/doc_store_test.ts` against
      `MemoryDocStore`. These are the properties every backend must satisfy, so
      they are also what W2 will copy:

```ts
it('returns undefined for an unknown key', async () => {
  const store = new MemoryDocStore();
  assert.equal(await store.load('nope'), undefined);
});

it('returns a saved snapshot with an empty change log', async () => {
  const store = new MemoryDocStore();
  await store.saveSnapshot('k', new Uint8Array([1, 2, 3]));
  const stored = await store.load('k');
  assert.deepEqual(Array.from(stored!.snapshot), [1, 2, 3]);
  assert.deepEqual(stored!.changes, []);
});

it('returns appended changes in clientSeq order', async () => {
  const store = new MemoryDocStore();
  await store.saveSnapshot('k', new Uint8Array([0]));
  await store.appendChange('k', { clientSeq: 2, bytes: new Uint8Array([2]) });
  await store.appendChange('k', { clientSeq: 1, bytes: new Uint8Array([1]) });
  const stored = await store.load('k');
  assert.deepEqual(stored!.changes.map((c) => c.clientSeq), [1, 2]);
});

it('drops the change log when the snapshot is replaced', async () => {
  const store = new MemoryDocStore();
  await store.saveSnapshot('k', new Uint8Array([0]));
  await store.appendChange('k', { clientSeq: 1, bytes: new Uint8Array([1]) });
  await store.saveSnapshot('k', new Uint8Array([9]));
  const stored = await store.load('k');
  assert.deepEqual(Array.from(stored!.snapshot), [9]);
  assert.deepEqual(stored!.changes, []);
});

it('saveMeta drops changes at or below the acked clientSeq', async () => {
  const store = new MemoryDocStore();
  await store.saveSnapshot('k', new Uint8Array([0]));
  for (const seq of [1, 2, 3]) {
    await store.appendChange('k', { clientSeq: seq, bytes: new Uint8Array([seq]) });
  }
  await store.saveMeta('k', new Uint8Array([7]), 2);
  const stored = await store.load('k');
  assert.deepEqual(stored!.changes.map((c) => c.clientSeq), [3]);
  assert.deepEqual(Array.from(stored!.meta!), [7]);
});

it('remove clears snapshot, meta and changes', async () => {
  const store = new MemoryDocStore();
  await store.saveSnapshot('k', new Uint8Array([0]));
  await store.appendChange('k', { clientSeq: 1, bytes: new Uint8Array([1]) });
  await store.remove('k');
  assert.equal(await store.load('k'), undefined);
});

it('copies bytes defensively on both save and load', async () => {
  const store = new MemoryDocStore();
  const written = new Uint8Array([1, 2, 3]);
  await store.saveSnapshot('k', written);
  written[0] = 99;
  const first = (await store.load('k'))!;
  first.snapshot[1] = 99;
  const second = (await store.load('k'))!;
  assert.deepEqual(Array.from(second.snapshot), [1, 2, 3]);
});
```

- [ ] **2.2** Run them. Expect failure: `saveSnapshot` is not a function.
- [ ] **2.3** Replace the interface in `packages/sdk/src/client/doc-store.ts`.
      Keep the byte-oriented, async discipline — the point of the reshape is a
      log the client can append to, not a richer vocabulary:

```ts
/** One persisted local change, tagged with the `clientSeq` it carries. */
export interface StoredChange {
  clientSeq: number;
  bytes: Uint8Array;
}

/** What a backend holds for one document. */
export interface StoredDoc {
  /** A `Document.toBytes()` envelope. */
  snapshot: Uint8Array;
  /** Checkpoint + changeID, advanced after a sync. Absent before the first. */
  meta?: Uint8Array;
  /** Changes appended since the snapshot, ascending by `clientSeq`. */
  changes: Array<StoredChange>;
}

export interface DocStore {
  load(docKey: string): Promise<StoredDoc | undefined>;
  /** Replace the snapshot and atomically drop every appended change. */
  saveSnapshot(docKey: string, bytes: Uint8Array): Promise<void>;
  /** Append one local change. Frequent and small; must not be a full write. */
  appendChange(docKey: string, change: StoredChange): Promise<void>;
  /**
   * Advance the persisted meta and drop changes at or below `ackedClientSeq`.
   * What a successful sync writes, so it must stay cheap.
   */
  saveMeta(
    docKey: string,
    bytes: Uint8Array,
    ackedClientSeq: number,
  ): Promise<void>;
  remove(docKey: string): Promise<void>;
}
```

- [ ] **2.4** Rewrite `MemoryDocStore` against it, keeping the existing
      defensive-copy behavior on every read and write path.
- [ ] **2.5** Run the contract tests. Expect pass.
- [ ] **2.6** Commit: `Reshape DocStore into a snapshot, change log and meta`

## Task 3: move the client onto it

No behavior change: the client still serializes the whole document on every
local change. Only the method it calls and the shape it reads change.

- [ ] **3.1** Update the two persist sites in `packages/sdk/src/client/client.ts`
      — the `doc.subscribe('all')` handler installed in `attachDocument`, and
      the post-sync persist in `syncInternal` — from `store.save(key, bytes)`
      to `store.saveSnapshot(key, bytes)`. `persistToStore`'s per-key write
      chain is unchanged; it serializes whichever write it is handed.
- [ ] **3.2** Update the restore site: `store.load` now answers a `StoredDoc`,
      so the bytes handed to `restoreFromBytes` become `stored.snapshot`. A
      non-empty `stored.changes` is not yet possible — nothing appends — so do
      **not** write speculative replay here. That is S2's task, and a stub
      would be untested code pretending to be a feature.
- [ ] **3.3** Update `removeFromStore` if it names `save`/`load` in comments.
- [ ] **3.4** Run the existing persistence suites unchanged — they assert
      end-to-end behavior, which is exactly what must not move:
      `pnpm sdk test test/unit/client/doc_store_test.ts test/unit/client/offline_persist_sync_test.ts test/unit/client/epoch_reanchor_test.ts test/unit/client/client_options_test.ts`
- [ ] **3.5** Commit: `Move the client's persist path onto saveSnapshot`

## Task 4: the IndexedDB reference fixture

`test/unit/client/indexeddb_doc_store_test.ts` is the pattern apps copy, so it
has to demonstrate the real contract, not a reduced one.

- [ ] **4.1** Update the fixture to the new interface over `fake-indexeddb`.
      Use two object stores — one keyed by `docKey` for snapshot + meta, one
      keyed by `[docKey, clientSeq]` for the log — so `saveSnapshot`'s
      snapshot-write and log-clear can share a transaction.
- [ ] **4.2** Run the same contract assertions from Task 2 against it, plus the
      existing full persist/restore document loop.
- [ ] **4.3** `pnpm sdk test test/unit/client/indexeddb_doc_store_test.ts`
- [ ] **4.4** Commit: `Update the IndexedDB fixture to the new DocStore contract`

## Task 5: exports and docs

- [ ] **5.1** Export `StoredDoc` and `StoredChange` as types from
      `packages/sdk/src/yorkie.ts`, beside the existing `DocStore` /
      `MemoryDocStore` exports (both the named exports and the default-object
      entry, which lists `MemoryDocStore` today).
- [ ] **5.2** Update the `ClientOptions.store` doc comment in `client.ts`,
      which currently says the client "persists `doc.toBytes()` after every
      local change" — still true in this PR, and S2 will revise it again.
- [ ] **5.3** `pnpm lint && pnpm sdk build && pnpm sdk test`
- [ ] **5.4** Commit: `Export the DocStore value types`

## Verification

- [ ] `pnpm lint && pnpm sdk build && pnpm sdk test` green
- [ ] The offline integration suite passes unchanged against a live server
      (`docker compose -f docker/docker-compose.yml up --build -d`, then
      `pnpm sdk test test/integration/offline_persistence_test.ts`) — this is
      the real assertion that the reshape moved no behavior
- [ ] `git diff` shows no change to `document.ts`: the envelope format is
      untouched by this PR

## Review

_Filled in when the PR lands._
