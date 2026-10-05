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
- Documents attached by a client with an explicit key: they keep the initial
  actor, as before (see "One actor, many sessions"). A runtime with no Web
  Crypto has to pass such a key, since the constructor will not generate a
  guessable one.

## Design

`Client.attach` calls `doc.setActor(actor, { reissue })`, where `reissue` is
what `claimReissue` allows: only a client whose key was generated, and only
once per document key. The option is marked `@internal`, though the typings
still carry it. Without it `setActor` is unchanged, so the re-anchor paths,
`remove`, the detach in `applyStatus` and devtools replay keep their
behavior.

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

The root and presences are rebuilt by replaying the re-issued changes on
`CRDTRoot.create()`, the same replay `applySnapshot` does for pending changes.
Rewriting tickets inside the root would mean re-keying the element map, GC
pairs, split and tree node indexes.

Each change is replayed under the source it originally ran with
(`replaySourceOf`): a change an undo or a redo produced ran as
`OpSource.UndoRedo`, which is the only source `SetOperation`/`RemoveOperation`
consult to skip an operation whose target now sits under a removed parent.
Replaying it as `Local` runs an operation that never ran. The mark lives on
the `Change` and is serialized, so the persisted-log replay
(`restoreAppendedChanges`) honours it after a reload too.

The devtools recording is dropped, because it holds the changes as they were
minted. The panel replays a history onto a freshly built empty document, so a
recording that merely started over would be missing its beginning; the
re-issued root is handed to `resetDevtoolsRecording` as a snapshot event that
becomes the recording's first entry.

### What the round trip must keep

The replay sees only what the wire carries, so anything a later edit relies
on has to survive the element encoding. A Text that an undo restored resolves
later Edits through its insertion links (`insPrev`/`insNext`): `abxef` edited
to `xxef` replays as `xef` without them. The Go converter writes a text node's
`insPrevId`; this SDK's `toTextNodes` did not, which also dropped the links
from every snapshot and every Text nested in a pushed Object or Array value.
It writes them now. The decoders link a node to an earlier node of the same
insertion and Go rejects a link it cannot find; a single replica's history
keeps that order, and every value a change pushes is a deepcopy, which links
only to nodes already copied. `fromText` enforces exactly that invariant --
the link must resolve by exact id to an already-decoded node of the same
insertion at a lower offset -- because a Text travels inside client-supplied
payloads: a forged link would otherwise make a later Edit compute an
out-of-range or negative offset, and `splitNode` now rejects a negative one
rather than letting `substring` clamp it into a silent divergence. A seeded test replays random pre-attach
histories -- text, tree, array and object edits, removals, undo and redo --
and checks that the content is unchanged after the re-issue.

### Positions held outside the document

A position is a ticket. A `TextPosStructRange`, an array element's ID or a
`CRDTTreePos` that the app or a presence took before the attach names the
initial actor; after a re-issue the root no longer holds that ticket, and
converting the position back to an index throws. A presence set before the
attach is pushed with the stale position. Under the plain `setActor` these
stayed valid locally, because the root kept the initial actor. An app that
binds an editor before attaching should take positions again after the
attach.

### One actor, many sessions

Go attaches under the per-session client id. This SDK attaches under the
stable actor derived from the client key. With a generated key, the default,
that actor is the `Client`'s alone. With an explicit key every session of the
key -- a reload, another tab, a new `Client` after a sign-out -- shares it.

The re-issue keeps each lamport, which starts at 1 in every fresh document. A
pre-attach document re-issued in a second session of an explicit key would
mint the tickets the first session's first edits carry when that session
attached a fresh document: `1:A:1` twice. The server keeps one of the two
elements, so the first session's edit disappears -- data that survived on
`main`, where the pre-attach tickets kept the initial actor. No record the
client holds can rule this out: the earlier session may be another tab or a
previous launch.

So `claimReissue` re-issues only for a generated key. A document attached
with an explicit key keeps its initial-actor tickets and can still collide
with another client's pre-attach tickets, which is the state `main` is in.
Closing that needs the actor's lamport on the server before the attach round
trip, which belongs with the client identity work in yorkie#2114.

A generated key only rules the collision out while it is unguessable. `uuid`
draws from the runtime's CSPRNG, but falls back to `Math.random` where no Web
Crypto exists, and the actor is derived from the key server-side -- so on such
a runtime another client of the project can land on this key and share this
actor, which is the explicit-key case again. A guessable key is worse than a
missed re-issue, though: it is the identity the server trusts verbatim, so the
constructor refuses to mint one at all (`ErrInvalidArgument`) when
`hasStrongRandomSource()` is false and no `opts.key` was passed. Such a runtime
has to supply its own key, and an explicit key does not re-issue -- so
`keyGenerated` is simply the absence of `opts.key`, and it implies the CSPRNG.

### One actor, two never-synced documents of one key

Within one client with a generated key, a second never-synced document of a
key re-issued to the same actor would mint the tickets the first one may
already have pushed. As in Go, `claimReissue` records per document key the
actor it was attached under and declines a repeat; those tickets keep the
initial actor. The mark is taken before the round trip, since an attach whose
response is lost may still have pushed, and is never cleared.

### A failed attach

There is no rollback, as in Go: a re-issued document is a valid detached
document, a retry under the same client re-issues nothing, and a retry under
another client re-issues to that actor.

When the first attach did reach the server and only its response was lost,
that retry pushes the pre-attach changes a second time under the other actor:
the content appears twice, as two distinct elements. The old path pushed it
twice too, with colliding tickets.

Option validation runs before the re-issue, so an attach rejected for a bad
option leaves the document and the claim alone. A re-issue that fails throws
from `attach` before any RPC, like the other pre-RPC checks. A failure after
the re-issue -- the session lock, the store, the RPC -- keeps the re-issued
document as above. A store-backed attach that restores an envelope replaces
the root anyway; the re-issue only matters when it finds none.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| A re-issue under an actor an earlier session already minted with would drop that session's element | Only a generated key re-issues; explicit keys keep the initial actor, as on `main` |
| Undo of a pre-attach edit is no longer possible after attach | A successful attach clears the history already |
| A position taken before the attach (app state, a presence) names the initial actor and throws when resolved | Documented above; take positions after the attach. Devtools raw changes from before the attach keep the old actor |
| The wire loses a value's in-memory state that a later edit relies on | Text node links are now encoded; a seeded test checks random histories keep their content |
| A pre-attach Undo that restored a removed Text pushes that Text empty | Existing wire gap; the local root keeps the content |
| A conversion or replay error | The document is left untouched and `attach` throws before any RPC; the claim is taken, so a retry on the same client attaches without a re-issue, as on `main` |
| The server trusts a pushed change's actor | Out of scope, yorkie#2114 |

### Design Decisions

| Decision | Reason |
|----------|--------|
| `setActor(actor, { reissue })`, marked `@internal`, rather than a new method | Every other caller is unchanged; only the client knows whether the re-issue is sound |
| Guard on "never synced", with an absorbed flag set on the remote and restore paths only | `applyChanges` also replays local changes in this SDK |
| Re-issue only for a generated client key | An explicit key's actor spans sessions the client cannot see |
| No map re-keying | Only attribute maps would be reached, and renaming one changes user data |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Rewrite tickets in place in the root and the operations | Touches every index and operation type; a miss is silent divergence |
| Re-issue to the per-session client id | Changes after the attach carry the stable actor; one document would author under two actors |
| Re-issue for explicit keys too, with claims shared across the page | A reload or another tab starts with no claims, and the server then drops an earlier session's element |
| Persist the claims in the `DocStore` | Covers only apps with a store, and still not a store that was cleared or another device |
| Shift lamports past what the actor already used | Needs the server's lamport for the actor before the attach, a protocol change |

## Tasks

- `docs/tasks/active/20261005-reissue-pre-attach-tickets-todo.md`
