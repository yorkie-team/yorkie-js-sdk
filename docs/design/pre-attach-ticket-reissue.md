---
created: 2026-10-05
updated: 2026-10-05
tags: [actor, attach, identity, offline]
---

# Pre-Attach Ticket Re-issue

This is the JS port of the server repository's
`docs/design/pre-attach-ticket-reissue.md` (yorkie#2111). The design is the
same; this document records the parts that differ in this SDK.

## Problem

A `Document` has no actor until a client attaches it. Every edit made before
`Client.attach` runs under `InitialActorID`, so every ticket it mints -- an
element's `createdAt`, a text or tree node's ID -- names the initial actor.

`Client.attach` used to call `setActor`, which rewrites only the change IDs
and each operation's `executedAt`. The root and the tickets inside the
operations kept the initial actor. Two clients that fill the same key before
attaching therefore push values with the same `createdAt`:

```ts
doc1.update((r) => {
  r.k1 = new Text(); // value createdAt = 1:000...:1
  r.k1.edit(0, 0, 'one');
});
doc2.update(...);    // value createdAt = 1:000...:1 too
```

`createdAt` is an element's identity, so the replicas diverge: against a real
server the two clients of the first round already disagree on the winner.
The local root also disagrees with the server's on node IDs, because the
Edit's `executedAt` was rewritten but the text nodes in the root were not; the
server cannot even replay such a pack on a fresh document.

### Goals

- After attach, every ticket a document minted before it names the client's
  actor, in the pushed changes and in the local root alike.
- The local root after the re-issue is the root the server builds from the
  pushed changes.
- No change for a document that has synced, was restored from a store, or is
  set up by any other `setActor` caller.

### Non-Goals

- Repairing documents already stored with colliding `createdAt`s.
- Undo/redo of edits made before the attach.
- Collisions with tickets an earlier session of the same client key pushed
  (see "One actor, many sessions").

## Design

`Client.attach` calls `doc.setActor(actor, { reissue })`, where `reissue` is
what `claimReissue` allows. Without the option `setActor` is unchanged, so the
re-anchor paths, `remove`, channels and devtools replay keep their behavior.

```text
setActor(actor, { reissue: true }):
  prev := current actor
  if prev == actor || no local changes || !neverSynced():
      plain setActor(actor)
      return
  for each local change:
      ops := reissueOperations(ops, prev, actor)
      id  := id with actor, version vector entry prev -> actor
  root, presences := replay the new changes on a fresh CRDTRoot
  swap in changes, root, presences, online clients, changeID
      (all or nothing; nothing is written in place)
  drop the clone, clear the undo/redo stacks
```

### When re-issuing is sound

`neverSynced` holds when the document is detached, its checkpoint is
`InitialCheckpoint`, its version vector names no actor but its own, and it has
not absorbed state it did not mint (`absorbedRemote`). Then every ticket naming
the current actor was minted by a local change still in `localChanges`.

`absorbedRemote` is set by `applySnapshot`, by a change applied with
`OpSource.Remote`, and by the restore paths (`fromBytes`, `restoreFromBytes`,
`restoreAppendedChanges`); `resetForReanchor` clears it. Unlike Go, it is not
set by `applyChanges` as a whole, because this SDK also replays its own local
changes through `applyChanges` (`applySnapshot`, `restoreAppendedChanges`).

A restored document never re-issues. Its state was persisted after an attach,
under the actor it already carries.

### Re-issuing the operations

`api/reissue.ts` converts each operation to protobuf, rewrites the actor of
every `TimeTicket` with lamport > 0 through `@bufbuild/protobuf/reflect`, and
converts it back, as the Go walk does with `protoreflect`. Object, Array and
Tree values travel as the bytes of a `JSONElement`; the walk decodes, rewrites
and re-encodes them. A Set/Add/ArraySet whose value is a Text goes through the
Text's full element encoding instead, because the wire drops a Text value's
content and an undo that restores a removed Text carries it there.

Map keys are left alone. Go also renames a string map key that reads like the
old actor, which reaches node attribute maps: a style attribute named after
the actor would be renamed. The only actor-keyed map, the deprecated
`created_at_map_by_actor`, is never written, so this SDK does not re-key.

### Rebuilding the root

The root and presences are rebuilt by replaying the re-issued changes with
`OpSource.Local` on `CRDTRoot.create()`, the same replay `applySnapshot` does
for pending changes. Rewriting tickets inside the root would mean re-keying
the element map, GC pairs, split and tree node indexes.

### One actor, two never-synced documents of one key

The re-issue keeps each lamport, which starts at 1 in every fresh document, so
a second never-synced document of a key re-issued to the same actor would mint
the tickets the first one already pushed. `claimReissue` records each
`(actor, document key)` it has seen and declines a repeat; those tickets keep
the initial actor, as before this design.

The claims live at module scope, not on the `Client` as in Go. The actor here
is the stable actor of the client key, shared by every `Client` of that key in
the page, so a per-`Client` record would miss a new `Client` created after a
sign-out.

### One actor, many sessions

Go attaches under the per-session client id. This SDK attaches under the
stable actor, which every session of a client key shares. A reload starts with
no claims, so a fresh pre-attach document re-issued after a reload can mint
tickets an earlier session already pushed under the same actor.

That collision is narrower than the one this design removes: before, every
client collided with every other under the initial actor; now only sessions of
one client key on one document key can. Closing it needs state the client does
not hold before the attach round trip (the actor's lamport on the server) and
belongs with the client identity work in yorkie#2114. An app that gives each
session a fresh key, which is the default, does not meet it.

### A failed attach

There is no rollback, as in Go: a re-issued document is a valid detached
document, a retry under the same client re-issues nothing, and a retry under
another client re-issues to that actor.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| A reload with an explicit client key re-issues to an actor an earlier session already used | Narrower than before; documented above and left to yorkie#2114 |
| Undo of a pre-attach edit is no longer possible after attach | A successful attach clears the history already |
| An editor binding or devtools holds a position or raw change from before the attach | Content is unchanged; positions minted before the attach go stale, as they would across any `setActor` |
| A pre-attach Undo that restored a removed Text pushes that Text empty | Existing wire gap; the local root keeps the content |
| A conversion or replay error | The document is left untouched and `attach` rejects before any RPC |
| The server trusts a pushed change's actor | Out of scope, yorkie#2114 |

### Design Decisions

| Decision | Reason |
|----------|--------|
| `setActor(actor, { reissue })` rather than a new method | Keeps the `Attachable` interface; every other caller is unchanged |
| Guard on "never synced", with an absorbed flag set on the remote and restore paths only | `applyChanges` also replays local changes in this SDK |
| Claims at module scope | The actor is per client key, not per `Client` |
| No map re-keying | Only attribute maps would be reached, and renaming one changes user data |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Rewrite tickets in place in the root and the operations | Touches every index and operation type; a miss is silent divergence |
| Re-issue to the per-session client id | Changes after the attach carry the stable actor; one document would author under two actors |
| Persist the claims in the `DocStore` | Covers only apps with a store, and still not a store that was cleared |
| Shift lamports past what the actor already used | Needs the server's lamport for the actor before the attach, a protocol change |

## Tasks

- `docs/tasks/active/20261005-reissue-pre-attach-tickets-todo.md`
