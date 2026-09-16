---
created: 2026-09-04
updated: 2026-09-16
tags: [offline, persistence, storage, indexeddb, actor]
---

# Offline Local Persistence

## Problem

Offline editing works only while the tab is open. A `Document` holds its root
and un-pushed `localChanges` in memory; `SyncMode.Manual` lets edits continue
offline and `client.sync()` flushes them on reconnect. But close or reload the
tab and everything un-pushed is gone — nothing is written to disk.

The sync-status indicator (Wafflebase PR #967) surfaces this risk to the user
("Not saved") but deliberately does not fix it. This document covers the fix:
persisting a document and its pending changes locally so they survive a reload.

Three gaps block it:

1. **Serialization is one-way.** `converter.ts` has `bytesToSnapshot`
   (bytes → snapshot) but no reverse. `objectToBytes` serializes only the
   `CRDTObject` root — presence, version vector, and checkpoint are excluded.
   There is no `Document.toBytes()` / `fromBytes()`. We cannot produce the bytes
   to store.
2. **The actor changes every reload.** `client.attach` adopts a fresh actorID
   from the server (`this.id = res.clientId` in `client.ts`, then
   `doc.setActor`). Every position ticket in a stored change carries the old
   actor, so replaying stored changes under a new actor breaks their references.
3. **The checkpoint resets to `0`** on re-attach, so even correctly-actored
   changes are rejected by the server's `clientSeq` continuity check.

Gaps (2) and (3) are server-protocol concerns, addressed by the companion doc in
the yorkie server repo (`docs/design/offline-resumable-attach.md`): a **stable
actor** so no ticket rewriting is needed, and a **resumable checkpoint**. This
document assumes that protocol and focuses on the client: storage,
serialization, restore flow, and multi-tab safety.

### Goals

- Persist `{snapshot, checkpoint, changeID, pendingChanges}` per document so a
  reload restores the document — including un-pushed edits — before the network
  responds.
- Provide a pluggable `DocStore` interface with a dependency-free `MemoryDocStore`
  default; keep concrete browser backends (IndexedDB) out of the SDK core.
- Restore-then-sync: `getRoot()` is usable from local state immediately, then
  reconcile with the server.
- Do not lose data silently when the same document is open in two tabs.

### Non-Goals

- The server-side stable actor and resumable checkpoint — see the yorkie
  companion doc. This design depends on them.
- Rebasing pending changes onto a new actor. Rejected below.
- True concurrent multi-tab co-editing of the _same local store_. Bounded by a
  single-active-session lease.
- Shipping any concrete browser/remote backend. The SDK ships only the interface
  and `MemoryDocStore`; IndexedDB is app-implemented (a tested fixture is provided
  as a reference).

## Design

### Symmetric document serialization

Add the missing reverse direction so a full document round-trips:

```ts
class Document<T> {
  toBytes(): Uint8Array; // root + presences + checkpoint
  // + changeID (lamport, VV, actor)
  static fromBytes<T>(key: string, bytes: Uint8Array): Document<T>;
}
```

`Change.toStruct` / `fromStruct` already exist, so `pendingChanges` encode with
the existing machinery. The new work is a `snapshotToBytes` counterpart to
`bytesToSnapshot` that also captures presence, version vector, and checkpoint —
not just the root that `objectToBytes` handles.

### DocStore interface + storage backends

The store persists one opaque `Uint8Array` per document (the `Document.toBytes()`
envelope that already bundles snapshot + checkpoint + changeID + pending changes),
so the interface stays tiny and backend-agnostic:

```ts
interface DocStore {
  load(docKey: string): Promise<Uint8Array | undefined>;
  save(docKey: string, bytes: Uint8Array): Promise<void>;
  remove(docKey: string): Promise<void>;
}

const client = new yorkie.Client({
  rpcAddr,
  store: new MemoryDocStore(), // or an app-provided IndexedDB store
  // deactivateOnUnload auto-defaults to false once a store is set (overridable)
});
```

**The SDK ships only the interface and a dependency-free `MemoryDocStore`.** It
deliberately does **not** ship an IndexedDB backend, so the core carries no
browser-storage coupling and stays environment-agnostic (Node, workers, RN). The
browser-durable backend is a ~40-line app-side implementation over the raw
IndexedDB API; the SDK's tests keep a reference `IndexedDBDocStore` fixture
(`test/unit/client/indexeddb_doc_store_test.ts`) that verifies the DocStore
contract and the full persist/restore document loop against a real IndexedDB (via
the `fake-indexeddb` dev shim), so apps have a verified pattern to copy.

Writing a full snapshot on every keystroke is too much. Append encoded changes
and compact periodically into a fresh snapshot.

### Actor identity split

The server (companion doc `offline-resumable-attach.md`) returns two ids from
`ActivateClient`: the per-session `clientId` and a **stable actor**. The SDK must
split today's single `this.id` (`client.ts:547`) accordingly:

- **session id** — the wire `clientId`, sent on every RPC for row lookup
  (`client.ts:598` et al). Unchanged.
- **stable actor** — read from the new `ActivateClientResponse` field and fed
  **only** to `doc.setActor` (`client.ts:702/1320`). Nil-guard it: against an old
  server that omits the field, fall back to `clientId`-as-actor (status quo).

The stable actor is what gets stamped into every change, so it must equal the
server's pull-dedup / VV / GC key — that equality is the whole point of the
server-side decoupling.

### Restore-then-sync flow

```text
attach(doc, { syncMode: Manual })
  └─ store.load(docKey)
       └─ hit  → doc.setActor(stableActor)  ← BEFORE any element is rehydrated
                 Document.fromBytes → getRoot() usable immediately (offline OK)
       └─ miss → normal attach
  └─ attach with resume intent + persisted checkpoint (server resumes it)
  └─ pull-before-trust: server may re-anchor via snapshot / ErrEpochMismatch
  └─ reconcile persisted clientSeq to the post-attach checkpoint
  └─ push persisted pendingChanges from the reconciled clientSeq
```

Three client obligations the server does not cover:

- **Set the actor before rehydrating elements.** `Document.setActor` carries a
  standing TODO (`document.ts:1246`) that it does **not** rewrite the actors of
  existing root elements. On restore this is benign _only_ if `setActor` runs
  before any local element is rehydrated from the snapshot; otherwise restored
  elements keep a stale actor. Enforce set-actor-first ordering.
- **Reconcile `clientSeq`.** A resumed client must reconcile its serialized
  `clientSeq` to the post-attach checkpoint (the preserved value when the server
  honors resume intent, else `0`) or `validateClientSeqContinuity` rejects the
  first restored push. On `ErrInvalidClientSeq` or `ErrEpochMismatch`, fall back
  to a full re-attach-from-snapshot.

  On `ErrEpochMismatch` the document was force-compacted while the client was
  offline, so the persisted un-pushed changes reference a pre-compaction state
  and cannot be presented again. The client re-anchors from the current
  snapshot and **must not silently drop** those changes: before discarding, it
  captures the pending local changes and emits an app-visible
  `local-changes-dropped` data-loss event (`DocEventType.LocalChangesDropped`,
  reason `epoch-reanchor`) carrying their serialized structs, so the app can
  surface the loss and, if it wishes, re-apply them. **Follow-up:** the SDK does
  not yet replay the dropped changes on top of the re-anchored/compacted state;
  the data-loss event is the safe, design-mandated minimum, and automatic
  replay-on-top is a genuine future enhancement.

- **Guard against silent purge (Tier 3).** If the server GC'd or deleted the
  document, attach silently mints a fresh empty doc with **no error signal**.
  Persist `docID` (alongside `epoch`) in the `toBytes` envelope — appended as an
  optional trailing blob so a legacy envelope without it still decodes (absent
  blob → empty). On restore-then-attach, compare the server-returned
  `documentId` against the persisted one; if they differ, or `serverSeq`
  regressed to `0` against a non-empty local snapshot, emit the same
  `local-changes-dropped` data-loss event (reason `document-purged`) carrying
  the dropped changes, clear the stale store entry, and re-anchor fresh.
- **Guard against a store reused under a different identity.** The store key is
  scoped to `apiKey/clientKey/docKey` (matching the session lock) so a store
  shared across identities cannot collide on the bare `docKey`. As a second
  line of defence, `restoreFromBytes` asserts the persisted `changeID` actor
  equals the current stable actor; on mismatch (or a corrupt envelope) it emits
  the `local-changes-dropped` data-loss event (reason `actor-mismatch`), clears
  the entry, and attaches fresh rather than divergently restoring under the
  wrong actor. A flaky store (a rejected `load`/`remove`) degrades gracefully to
  a fresh attach instead of aborting.

`deactivateOnUnload` must be `false` on this path: the default `true` detaches on
unload, which triggers the server-side checkpoint reset and defeats persistence.
Configuring a `store` auto-defaults it to `false` (an explicit option still wins).

### Multi-tab safety

The stable actor is shared by every tab using the same persisted client
identity. Two live tabs would share one checkpoint and mint colliding
`clientSeq` values, and actor-based pull dedup would filter each other's
changes out — silent edit loss, not a merge conflict. With resumable checkpoints
this sharpens: racing attaches could _both_ preserve and then diverge the
resumed `clientSeq`.

Guard with a **single-active-session lease**. The shipped MVP is **fail-fast**:
on the store-backed path, `attach` acquires a Web Lock keyed by
`apiKey/clientKey/docKey` (`WebLocksSessionLock`, injectable; a no-op in
non-browser runtimes) and holds it for the attachment's lifetime, releasing on
detach/deactivate. A second tab of the same client+doc cannot acquire the lock,
so its `attach` **rejects with a clear "already open in another tab" error**
rather than driving concurrent sync on a shared checkpoint. Leader hand-off and
an observe/read-only mode (so a background tab follows instead of erroring) are a
follow-up on top of this guard.

### Risks and Mitigation

| Risk                                                                                                                                                          | Mitigation                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full-snapshot-per-keystroke is too expensive                                                                                                                  | **Not mitigated in the shipped version** — it writes a full `toBytes()` on every local change. Measured and quantified in [Revision: incremental persistence](#revision-incremental-persistence); the append-and-compact design that closes it is specified there     |
| `localStorage` is synchronous, ~5 MB, string-only                                                                                                             | Apps should back the store with IndexedDB (async, large); `localStorage` only viable for tiny documents                                                                                                                                                               |
| `setActor` runs after elements are rehydrated → restored elements keep a stale actor (`document.ts:1246` TODO)                                                | Enforce set-actor-first ordering on the restore path; validate no rehydrated element predates `setActor`                                                                                                                                                              |
| Resumed `clientSeq` misaligned with the server checkpoint → first push rejected                                                                               | Reconcile `clientSeq` to the post-attach checkpoint; on `ErrInvalidClientSeq`/`ErrEpochMismatch` fall back to full re-attach-from-snapshot                                                                                                                            |
| `ErrEpochMismatch` re-anchor silently drops un-pushed offline edits                                                                                           | Capture the pending changes and emit an app-visible `local-changes-dropped` event (reason `epoch-reanchor`) before discarding; replay-on-top is a follow-up                                                                                                           |
| Server GC'd or deleted the doc (Tier 3): attach silently mints a new empty doc, no error                                                                      | Persist `docID` (optional trailing blob) alongside `epoch`; raise a `local-changes-dropped` event (reason `document-purged`) on re-attach when `docID` differs or `serverSeq` regressed to `0` against a non-empty local snapshot, then clear the entry and re-anchor |
| Store reused under a different `clientKey` → restored edits carry a stale actor, diverging the CRDT                                                           | Scope the store key to `apiKey/clientKey/docKey`; `restoreFromBytes` also asserts persisted actor == current actor and emits a `local-changes-dropped` event (reason `actor-mismatch`) on mismatch                                                                    |
| A push acked with nothing pulled emits no Remote/Snapshot event, so the stored envelope keeps already-pushed changes + a stale checkpoint until the next edit | Persist explicitly after a successful sync (`syncInternal`), in addition to the event-driven persist on local/presence changes. It is a full overwrite, so it does not grow unbounded                                                                                 |
| A flaky store (rejected `load`/`remove`) aborts attach                                                                                                        | Wrap store access; degrade to a fresh attach and log rather than throwing out of attach                                                                                                                                                                               |
| Two tabs share one store and corrupt/diverge `clientSeq` (worse with resumable checkpoints)                                                                   | Single-active-session lease; non-leader tabs are read-only observers                                                                                                                                                                                                  |
| App forgets to persist a stable client key                                                                                                                    | The SDK's default `key` is a random uuid per session (`client.ts`); persistence requires the app to pass a stable, stored key. Document this as a hard requirement                                                                                                    |
| Fear that restore double-counts HLL dedup counters                                                                                                            | Non-issue: dedup identity is the app-supplied actor arg (`DedupCounter.add(actor)` → `IncreaseOperation.actor`), independent of the client actor; reusing or re-minting the SDK actor cannot re-count                                                                 |

### Design Decisions

| Decision                                                                                       | Reason                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depend on a server-side stable actor instead of rebasing on the client                         | Rebase is unsound (below); a stable actor needs zero ticket rewriting and keeps the CRDT protocol intact                                                              |
| Ship only the `DocStore` interface + dependency-free `MemoryDocStore`; keep IndexedDB app-side | No browser-storage coupling in the core (works in Node/workers/RN); apps supply the backend. A tested `IndexedDBDocStore` fixture is the reference                    |
| Append changes + periodic compaction                                                           | Per-keystroke full snapshots are too heavy; append is cheap and bounded by compaction                                                                                 |
| Single-active-session lease (fail-fast Web Lock) over concurrent multi-tab                     | Converts a silent `clientSeq`-collision data-loss path into an explicit "open in another tab" error; leader hand-off / observe mode is a follow-up                    |
| Auto-default `deactivateOnUnload` to false when a store is set (overridable)                   | The default detaches on unload and resets the server checkpoint, defeating persistence; configuring a store signals intent to persist, so make it work out of the box |

## Alternatives Considered

| Alternative                                            | Why not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rebase pending changes onto a new actor on restore** | The pushed/pending boundary is _per-embedded-ticket_, not per-change. A normal edit (insert/edit next to synced content) produces a pending op that **references** an already-pushed element — `prevCreatedAt` in `add_operation.ts`, `fromPos`/`toPos` in `edit_operation.ts` — whose ticket carries the old actor the server knows it by. Remapping that anchor makes it miss the actor-keyed element map (server `root.go`, `Ticket.Key() = lamport:delimiter:actorID`); leaving it makes the change mixed-actor. The only discriminator, a lamport watermark, is unsound: all tickets in one change share one lamport (`context.ts` `issueTimeTicket` bumps only the delimiter) and lamport is bumped non-monotonically on every remote pull (`change_id.ts` `syncLamport`). Also `Document.setActor` already carries a standing TODO noting it does not update root element actors. Misclassification is **silent divergence** — dropped or mis-anchored ops, duplicated pulled changes, and HLL dedup counters that cannot be un-counted — not a crash. Rejected |
| `localStorage` instead of IndexedDB                    | Synchronous, ~5 MB, string-only; unsuitable beyond tiny documents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Persist only the snapshot, drop pending changes        | Loses exactly the un-pushed edits this feature exists to protect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Concurrent multi-tab co-editing on one store           | Shared checkpoint → `clientSeq` collisions and self-filtered pull dedup → real edit loss                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Revision: Incremental Persistence

The section above ships a **full snapshot on every local change**. The Goals
claimed "append encoded changes and compact periodically", but the
implementation persists `doc.toBytes()` from a `doc.subscribe('all')` handler
(`client.ts`), undebounced, on every `LocalChange` _and_ every local
`PresenceChanged`. This section measures what that costs and specifies the
append-and-compact design that replaces it.

### What it costs

Measured against `@yorkie-js/sdk` 0.7.21 on documents shaped like a real
consumer's (wafflebase: a stable-key spreadsheet, a `Text` note, a `Tree`
document, a free-position board). Synthetic, single machine — the absolute
milliseconds are machine-dependent, but the scaling law and the ratios are not.

`toBytes()` is linear in document size, at roughly 36 µs per spreadsheet cell:

| Sheet        | Snapshot | `toBytes()` |
| ------------ | -------- | ----------- |
| 1,000 cells  | 350 KB   | 31 ms       |
| 4,000 cells  | 1.38 MB  | 155 ms      |
| 8,000 cells  | 2.77 MB  | 286 ms      |
| 16,000 cells | 5.66 MB  | 583 ms      |

A 1,000-row × 20-column sheet is 20,000 cells. So an ordinary document costs
most of a second of **main-thread** time per save. It cannot be moved to a
worker: `toBytes()` reads the live document object.

Two findings matter more than the raw numbers:

- **The CRDT tax is 11–16×** over the equivalent raw JSON, and it is inherent,
  not a property of a fat payload. A minimal `{v:"1"}` cell still costs
  339 B/cell, because every member carries a `TimeTicket` (lamport + delimiter
  - a 24-hex actor).
- **A document is largest exactly while it is being edited.** Offline, no GC
  runs, so tombstones and per-keystroke node splits accumulate:

  |                    | Built in one update | After real editing                           |
  | ------------------ | ------------------- | -------------------------------------------- |
  | Sheet, 2,000 cells | 703 KB              | 3.79 MB after 5,000 edits (5.4×)             |
  | Note, 20,000 chars | 59 KB               | 6.60 MB typed one character at a time (112×) |

  The 112× is the important one. A note's stored size tracks its **edit count**,
  not its content length — and a real note is typed, not pasted. Any
  benchmark that builds its fixture in a single `update()` understates this
  design's cost by two orders of magnitude.

Compression recovers the _footprint_ but not the _time_: gzip yields 11–18×
(a typed 20k-char note, 6.60 MB → 376 KB), so 50 stored documents fall from
~139 MB to ~12 MB. It adds ~27 ms of CPU to each save. Space is a solved
problem; main-thread time is not, and compression makes it slightly worse.

### Why debouncing is not the fix

Debouncing reduces how _often_ the cost is paid, never how much it is. At any
interval, one save still blocks the main thread for the full serialization. A
frame-budget threshold (`maxPersistMillis` ≈ 16 ms) would latch persistence
**off** for almost every document above ~500 cells, which reduces the feature
to notes and small documents while appearing to support everything.

Google's hosted-document offline service reaches the same conclusion from the
other direction: its patent (US9361395B2) stores offline changes "in a separate
data structure from committed mutations" — a pending-mutation queue beside a
cached model, not a re-serialized snapshot.

### The design

Persist a snapshot **rarely** and each local change **as it happens**, so the
per-save cost is the size of one change (hundreds of bytes) rather than the
size of the document.

`DocStore` grows from one opaque blob into three operations over the same
opaque-bytes discipline:

```ts
interface StoredDoc {
  snapshot: Uint8Array; // a `Document.toBytes()` envelope
  meta?: Uint8Array; // checkpoint + changeID, advanced after a sync
  changes: Array<{ clientSeq: number; bytes: Uint8Array }>; // in clientSeq order
}

interface DocStore {
  load(docKey: string): Promise<StoredDoc | undefined>;
  /** Replace the snapshot and atomically drop every appended change. */
  saveSnapshot(docKey: string, bytes: Uint8Array): Promise<void>;
  /** Append one local change. The hot path: small, frequent, no serialization
   *  of the document. */
  appendChange(
    docKey: string,
    change: { clientSeq: number; bytes: Uint8Array },
  ): Promise<void>;
  /** Record the post-sync header. Cheap — this is what a push-ack writes.
   *  It does NOT trim the log; only compaction does. The header itself carries
   *  the acknowledged clientSeq, so restore reads it from there. */
  saveMeta(docKey: string, bytes: Uint8Array): Promise<void>;
  remove(docKey: string): Promise<void>;
}
```

The append unit is `JSON.stringify(change.toStruct())` — exactly what
`toBytes()` already embeds as its `pendingChanges` blob, so no new
serialization is introduced. Measured, **one change is ~471 B regardless of
document size**, which is the property the whole design rests on:

| Sheet        | Snapshot | One change |                 |
| ------------ | -------- | ---------- | --------------- |
| 1,000 cells  | 350 KB   | 471 B      | 760× cheaper    |
| 8,000 cells  | 2.77 MB  | 471 B      | 6,174× cheaper  |
| 16,000 cells | 5.66 MB  | 471 B      | 12,610× cheaper |

Write paths:

- **`LocalChange`** → `appendChange`. This is the only path on the hot edit
  loop, and it never calls `toBytes()`.
- **Local `PresenceChanged`** → `appendChange`, the same as any other change.
  It is tempting to drop these — presence is re-established on reconnect, so
  its _content_ is worthless after a restore — but a presence-only change still
  consumes a `clientSeq`, and `restoreFromBytes` does **not** renumber:
  it restores the persisted checkpoint and changeID verbatim and lets the server
  seed from the presented checkpoint. Omitting one therefore leaves a hole in
  the `clientSeq` run, and the first restored push is rejected for
  discontinuity. Excluding presence was the right call when every change
  triggered a full snapshot; at ~300 B an append it buys nothing and costs
  correctness.
- **Successful sync that only acked a push** → `saveMeta`. Not a snapshot: an
  online client syncs constantly, and snapshotting per sync would reintroduce
  the original cost. `saveMeta` records the header and **does not trim the
  log** — see the invariant below.
- **Successful sync that pulled content** → `saveSnapshot`. The log carries
  local changes only, so nothing in it records what a pull brought in; writing
  only the header would advance the persisted `serverSeq` past a root the
  store never received, and the server would never resend it. Persisting
  remote changes incrementally too would avoid the cost and is the natural
  follow-up.
- **Compaction** → `saveSnapshot`. One `toBytes()`, amortized over many edits;
  threshold below.
- **Attach** → `saveSnapshot` once, to establish the base.

#### The invariant: snapshot + meta + log reconstructs the document

**At every moment, replaying the log over the snapshot (with meta applied) must
reproduce the live document.** This is the property the whole layout exists to
provide, and it is easy to break by accident because the log is doing two jobs
at once:

1. it holds un-pushed changes so they survive a reload, and
2. it is the delta between the snapshot and the document's current content.

Trimming acknowledged entries serves the first job and destroys the second.
Nothing brings the snapshot forward on a push-ack, so an acked entry removed
from the log leaves that content in neither place — while the persisted
`serverSeq` claims the server has it, so it is never resent either. The result
is a replica that silently reverts to its last snapshot and stays there.

**Only compaction trims the log**, and it does so by folding the entries into a
fresh snapshot first. `saveMeta` records the header and nothing else.

Restore therefore reads **two** watermarks: the snapshot's (which entries it
already contains, so everything above must be replayed to bring the root
forward) and the ack's (which of those the server already took, so only
entries above it are queued for push). Replaying an acked change is required;
re-pushing one is not.

A test asserting a single field cannot see this break, because a log entry that
sets an absolute value reconstructs that value whether or not the base survived.
Assert `restored.toSortedJSON() === doc.toSortedJSON()`, and cover at least one
**relative** operation (`Counter.increase`, `Text.edit`).

**One carve-out: the invariant holds up to garbage-collection state.** A sync
runs `garbageCollect` on every non-snapshot pack, including a pure push-ack —
which writes only `meta`, so the persisted triple keeps tombstones the live
document has already dropped. The reconstructed document is observably
identical under `toSortedJSON()` and converges normally, so this is deliberate
rather than a defect: paying a full serialization per GC would give back the
cost the design exists to remove. The measurable consequence is that a restored
document's `totalDocSize` counts tombstones the server purged, and that figure
feeds the local `maxSizeLimit` check — so an edit the server would accept can
be refused locally until the next compaction.

#### The compaction threshold is relative, not absolute

A fixed change count is wrong, because the point at which appending stops
paying is a function of the snapshot it is appended to. Measured, an 8,000-cell
sheet's log equals its snapshot after ~6,300 edits; a 5,000-character note's
log (100 changes ≈ 29.6 KB) already **exceeds** its 15.3 KB snapshot after
~50. Two orders of magnitude apart — no single constant serves both.

```
compact when  logBytes > max(MIN_LOG_BYTES, snapshotBytes × LOG_RATIO)
           or changeCount > MAX_REPLAY     // bounds restore latency, not size
```

This self-tunes. A small document compacts often, which is harmless precisely
because its snapshot is small (a 15 KB note serializes in about a
millisecond). A large document compacts rarely, so its 286 ms serialization is
divided across thousands of edits. No per-document-type tuning, and the
pathological case — frequent compaction of an expensive snapshot — is
unreachable by construction, since expense and threshold both scale with the
same quantity.

`MAX_REPLAY` exists for a different reason than the byte rule: it bounds how
many changes a restore has to replay, which is a latency budget at attach
rather than a storage one.

Restore inverts it: `Document.fromBytes(snapshot)`, then replay the appended
changes as pending local changes — the same machinery `restoreFromBytes`
already applies to the pending changes embedded in today's envelope, so the
replay path is not new code so much as relocated code.

`maxPersistBytes` / `maxPersistMillis` guard **every snapshot write** — at
attach, at compaction, on a poisoned-log repair, and on a pulling sync — since
those are the operations whose cost scales with the document. Appends are
constant-size and need no budget. Exceeding either latches that document's
persistence off with a `DocEventType.PersistDisabled` event (reason
`too-large` / `too-slow`) so a consumer can tell the user rather than failing
silently.

The latch is **sticky and per store key**, not merely a torn-down
subscription. A sync or a repair does not go through the edit loop, so without
a sticky flag those keep writing a header over a snapshot that can never be
updated again — the same divergence, with no route back. It is cleared on
detach, so a re-attach gets a fresh decision.

Two more behaviours the implementation needs and this document originally
omitted. `meta` carries the **epoch and docID** as well as the checkpoint and
changeID: both are learned from sync responses, and omitting the epoch turned a
server-side compaction into an `ErrEpochMismatch` re-anchor that discarded every
un-pushed edit. And a **failed append poisons the log**: the next write
compacts instead of appending, because a hole cannot be replayed and a snapshot
loses nothing. `appendChange` is an **upsert keyed by `clientSeq`**, so a
retried write is safe.

Compression stays **out of the SDK**: `DocStore` takes opaque bytes, so a
backend that wants gzip applies it in its own `save`/`load`. Browsers ship
`CompressionStream` with no dependency, which is why the SDK does not need to
take one.

### Consumer-visible changes

- `DocStore` is a breaking interface change. It is pre-1.0 and has one known
  consumer shape (an app-side IndexedDB backend), so it is replaced rather than
  widened; `MemoryDocStore` and the `IndexedDBDocStore` test fixture move with
  it and remain the reference implementations.
- The session-lock failure needs a **distinct error code**. It currently throws
  `Code.ErrInvalidArgument` with an explanatory message, which leaves a consumer
  matching on message text to distinguish "open in another tab" from any other
  invalid argument.

### Migration

Migration is close to free, because **an envelope written by the shipped
version is already a valid snapshot**: `toBytes()` embeds the pending changes
inside itself, so an existing store entry restores under the new layout with
no conversion at all.

```
existing entry (one envelope)  →  { snapshot: <that same envelope>, changes: [] }
```

The envelope format does not change, and `Document.fromBytes` is untouched. A
backend migrates by relocating values between object stores, not by rewriting
them.

Rolling _back_ is also safe: an older build meeting the new layout finds no
entry where it expects one, and falls through to a fresh attach. The offline
state is lost, which returns the user to the behavior they had before this
feature existed — not to a corrupt one.

The envelope's own extension rule is already established and should be kept:
trailing blobs are optional and nil-guarded, so any future field is appended
last and older envelopes stay decodable (`document.ts`). Nothing in this
revision needs a new blob.

### Failure handling

One invariant governs the whole surface: **the store may trail the document,
never lead it.** Appends happen after the change is applied locally, so the
worst case is losing the most recent changes — the same bounded exposure a
debounced full-snapshot design has — and never a store that claims state the
document never reached.

| Failure                                                | Handling                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store unavailable (private browsing, storage disabled) | Detected at configuration; the client runs unpersisted, exactly as with no `store`                                                                                                                                                                                                                                                                                                                                               |
| `load` fails, or the entry is unreadable               | Discard the entry, attach fresh, emit `LocalChangesDropped` — with no change structs, since what was lost cannot be read                                                                                                                                                                                                                                                                                                         |
| `appendChange` fails                                   | **Treat the whole log as poisoned.** Clear it and force a `saveSnapshot` at the next opportunity rather than retrying into a hole. A gap is silently wrong in a way a missing log is not                                                                                                                                                                                                                                         |
| `saveSnapshot` fails                                   | The write is poisoned, so the next edit retries the snapshot rather than appending into a log the store may not have cleared. A standing backoff and a hard log ceiling are **not** implemented; the budget latch is the only ceiling today                                                                                                                                                                                      |
| Quota exceeded                                         | Surfaced to the backend, which evicts and retries. A store-write failure **does not** latch persistence off — the only latch is the size/time budget. It poisons the log instead, so the next edit retries with a fresh snapshot; a store that never accepts a write therefore retries indefinitely rather than giving up, which is deliberate (a quota can clear) but means the app learns of it only through `DocStore` errors |
| Torn write: snapshot replaced but log not cleared      | Log entries carry their `clientSeq`, so a load drops every entry at or below the snapshot's. Replay is idempotent, and the clear need not be atomic with the write                                                                                                                                                                                                                                                               |
| `clientSeq` discontinuity in the log                   | Restore from the snapshot alone and emit `LocalChangesDropped` carrying the changes that could not be replayed                                                                                                                                                                                                                                                                                                                   |
| The log cannot reach the header's position             | Same handling: undo the header, restore from the snapshot's own self-consistent position, emit `LocalChangesDropped`. See below — the header carries _two_ positions and the log has to reach the further one                                                                                                                                                                                                                    |

**The log must reach the counter `meta` carries, not merely its checkpoint.**
`meta` records both the acked checkpoint and `changeID` — how many changes this
client has minted — and they differ whenever an edit is minted while a sync is
in flight: the response acks _N_ while the counter reaches _N+1_. Validating the
log against the checkpoint alone accepts the loss of exactly that trailing
entry, because the log still reaches _N_. The restore then leaves the counter at
_N+1_ over a root holding _N_ — `restoreAppendedChanges` deliberately refuses to
pull the counter back below the header's — and the next edit mints _N+2_. The
server rejects that gap with `ErrInvalidClientSeq` on every push from then on,
and because it is not `ErrEpochMismatch`, nothing re-anchors: the document never
syncs again, and the app's only escape is clearing its own store. So the
comparison is against `max(checkpoint.clientSeq, changeID.clientSeq)`. With
`meta` absent it reduces to the checkpoint, since a `toBytes` envelope's counter
never leads the pending changes it carries.

No failure on this surface may propagate into the editing path: the shipped
version already logs rather than throws, and that stays true.

### Risks and Mitigation

| Risk                                                                    | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replaying appended changes diverges from the state the snapshot implies | Changes are appended in `clientSeq` order and `saveSnapshot` clears them atomically, so a snapshot and its trailing changes can never overlap. Assert `clientSeq` contiguity on load; a gap degrades to snapshot-only restore plus a `LocalChangesDropped` event                                                                                                                                                  |
| A crash between `appendChange` and the in-memory apply                  | The append happens after the change is applied locally, so the store can only ever trail the document — never lead it. A trailing store loses the last change, which is the same exposure the debounced full-snapshot design had                                                                                                                                                                                  |
| Compaction still blocks the main thread                                 | Unchanged in kind, but amortized: bounded by the compaction threshold rather than by the edit rate. The `maxPersistMillis` latch remains the backstop                                                                                                                                                                                                                                                             |
| Unbounded change growth if compaction never fires                       | Compaction triggers on count **or** bytes. Note this is the one place the correctness fix costs footprint: because only compaction trims, an always-online client's log now grows to `max(MinLogBytes, snapshot x LogRatio)` or `MaxReplay` entries before being folded away, where an earlier design kept it near empty by dropping acked entries — which is exactly what made a push-ack orphan its own content |
| An `appendChange` fails while later ones succeed                        | Treat any append failure as poisoning the change list: clear it and force a `saveSnapshot` at the next opportunity, rather than persisting a list with a hole                                                                                                                                                                                                                                                     |

## Tasks

Track execution plans in `docs/tasks/active/` as separate task documents. The
server-side stable actor and resumable checkpoint this design depends on are
specified in the yorkie repo: `docs/design/offline-resumable-attach.md`.
