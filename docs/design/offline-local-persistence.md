---
created: 2026-09-04
updated: 2026-09-04
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
- True concurrent multi-tab co-editing of the *same local store*. Bounded by a
  single-active-session lease.
- Shipping any concrete browser/remote backend. The SDK ships only the interface
  and `MemoryDocStore`; IndexedDB is app-implemented (a tested fixture is provided
  as a reference).

## Design

### Symmetric document serialization

Add the missing reverse direction so a full document round-trips:

```ts
class Document<T> {
  toBytes(): Uint8Array;              // root + presences + checkpoint
                                     // + changeID (lamport, VV, actor)
  static fromBytes<T>(bytes: Uint8Array): Document<T>;
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
  store: new MemoryDocStore(),  // or an app-provided IndexedDB store
  deactivateOnUnload: false,    // default is true — must be off for this path
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

```
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
  existing root elements. On restore this is benign *only* if `setActor` runs
  before any local element is rehydrated from the snapshot; otherwise restored
  elements keep a stale actor. Enforce set-actor-first ordering.
- **Reconcile `clientSeq`.** A resumed client must reconcile its serialized
  `clientSeq` to the post-attach checkpoint (the preserved value when the server
  honors resume intent, else `0`) or `validateClientSeqContinuity` rejects the
  first restored push. On `ErrInvalidClientSeq` or `ErrEpochMismatch`, fall back
  to a full re-attach-from-snapshot and replay local changes on top.
- **Guard against silent purge (Tier 3).** If the server GC'd or deleted the
  document, attach silently mints a fresh empty doc with **no error signal**.
  Persist `docID`/`epoch` alongside the offline snapshot and raise an
  app-visible data-loss event on re-attach when the returned `docID` differs or
  `serverSeq` regressed to `0` against a non-empty local snapshot.

`deactivateOnUnload: false` is required: the default `true` detaches on unload,
which triggers the server-side checkpoint reset and defeats persistence.

### Multi-tab safety

The stable actor is shared by every tab using the same persisted client
identity. Two live tabs would share one checkpoint and mint colliding
`clientSeq` values, and actor-based pull dedup would filter each other's
changes out — silent edit loss, not a merge conflict. With resumable checkpoints
this sharpens: racing attaches could *both* preserve and then diverge the
resumed `clientSeq`.

Guard with a **single-active-session lease**: elect one leader tab per document
(BroadcastChannel / Web Locks). The leader drives sync and holds the resume;
other tabs observe and surface an explicit "open in another tab" state instead
of corrupting the store.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Full-snapshot-per-keystroke is too expensive | Append encoded changes; compact to a snapshot periodically |
| `localStorage` is synchronous, ~5 MB, string-only | Apps should back the store with IndexedDB (async, large); `localStorage` only viable for tiny documents |
| `setActor` runs after elements are rehydrated → restored elements keep a stale actor (`document.ts:1246` TODO) | Enforce set-actor-first ordering on the restore path; validate no rehydrated element predates `setActor` |
| Resumed `clientSeq` misaligned with the server checkpoint → first push rejected | Reconcile `clientSeq` to the post-attach checkpoint; on `ErrInvalidClientSeq`/`ErrEpochMismatch` fall back to full re-attach-from-snapshot |
| Server GC'd or deleted the doc (Tier 3): attach silently mints a new empty doc, no error | Persist `docID`/`epoch`; raise a data-loss event on re-attach when `docID` differs or `serverSeq` regressed to `0` against a non-empty local snapshot |
| Two tabs share one store and corrupt/diverge `clientSeq` (worse with resumable checkpoints) | Single-active-session lease; non-leader tabs are read-only observers |
| App forgets to persist a stable client key | The SDK's default `key` is a random uuid per session (`client.ts`); persistence requires the app to pass a stable, stored key. Document this as a hard requirement |
| Fear that restore double-counts HLL dedup counters | Non-issue: dedup identity is the app-supplied actor arg (`DedupCounter.add(actor)` → `IncreaseOperation.actor`), independent of the client actor; reusing or re-minting the SDK actor cannot re-count |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Depend on a server-side stable actor instead of rebasing on the client | Rebase is unsound (below); a stable actor needs zero ticket rewriting and keeps the CRDT protocol intact |
| Ship only the `DocStore` interface + dependency-free `MemoryDocStore`; keep IndexedDB app-side | No browser-storage coupling in the core (works in Node/workers/RN); apps supply the backend. A tested `IndexedDBDocStore` fixture is the reference |
| Append changes + periodic compaction | Per-keystroke full snapshots are too heavy; append is cheap and bounded by compaction |
| Single-active-session lease over concurrent multi-tab | Converts a silent `clientSeq`-collision data-loss path into an explicit, recoverable UX state |
| Require `deactivateOnUnload: false` | The default detaches on unload and resets the server checkpoint, defeating persistence |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| **Rebase pending changes onto a new actor on restore** | The pushed/pending boundary is *per-embedded-ticket*, not per-change. A normal edit (insert/edit next to synced content) produces a pending op that **references** an already-pushed element — `prevCreatedAt` in `add_operation.ts`, `fromPos`/`toPos` in `edit_operation.ts` — whose ticket carries the old actor the server knows it by. Remapping that anchor makes it miss the actor-keyed element map (server `root.go`, `Ticket.Key() = lamport:delimiter:actorID`); leaving it makes the change mixed-actor. The only discriminator, a lamport watermark, is unsound: all tickets in one change share one lamport (`context.ts` `issueTimeTicket` bumps only the delimiter) and lamport is bumped non-monotonically on every remote pull (`change_id.ts` `syncLamport`). Also `Document.setActor` already carries a standing TODO noting it does not update root element actors. Misclassification is **silent divergence** — dropped or mis-anchored ops, duplicated pulled changes, and HLL dedup counters that cannot be un-counted — not a crash. Rejected |
| `localStorage` instead of IndexedDB | Synchronous, ~5 MB, string-only; unsuitable beyond tiny documents |
| Persist only the snapshot, drop pending changes | Loses exactly the un-pushed edits this feature exists to protect |
| Concurrent multi-tab co-editing on one store | Shared checkpoint → `clientSeq` collisions and self-filtered pull dedup → real edit loss |

## Tasks

Track execution plans in `docs/tasks/active/` as separate task documents. The
server-side stable actor and resumable checkpoint this design depends on are
specified in the yorkie repo: `docs/design/offline-resumable-attach.md`.
