# Re-issue pre-attach tickets to the client's actor on attach

**Created**: 2026-10-05

## Problem

A `Document` edited before `Client.attach` mints every ticket under
`InitialActorID`. `Document.setActor` rewrites only the change IDs and each
operation's `executedAt` (it carries a TODO saying so); the root and the
tickets inside the operations keep the initial actor. Two clients that fill
the same key before attaching push values with identical `createdAt`s, and
the replicas diverge.

The Go SDK fixed this in yorkie#2111 (design:
`yorkie/docs/design/pre-attach-ticket-reissue.md`) and listed this port as a
JS follow-up. yorkie#2118 and yorkie#2125 (push-boundary `createdAt` rules)
need it before any collision rule is safe.

## Plan

- [x] Reproduce (Red): two documents fill the same key before attach and
      their pushed packs share a `createdAt`; the replicas diverge
- [x] `src/api/reissue.ts`: `reissueOperations(ops, from, to)` through the
      wire format, a `reflect` walk over every `TimeTicket` (lamport-0 kept),
      nested `JSONElement` bytes decoded/re-encoded, Set/Add/ArraySet of a
      Text through its full element encoding. Re-key only `TimeTicket`-valued
      maps -- dropped: the only actor-keyed map is deprecated and never
      written, and Go's `rekeyMap` also renames attribute keys (report
      upstream)
- [x] `Document`: `absorbedRemote` (snapshot, remote change, `fromBytes`,
      restores; reset in `resetForReanchor`), `neverSynced`, and
      `setActor(actor, { reissue: true })` that re-issues the local changes,
      re-keys version vectors, rebuilds root and presences by replay on a
      fresh `CRDTRoot`, renames the online-client entry, swaps all or
      nothing, drops the clone and clears history
- [x] `Client.attach`: claim registry per (actor, doc key) at module scope,
      re-issue only when the claim allows; error rejects the attach before
      any RPC
- [x] Unit tests: `unit/api/reissue_test.ts`,
      `unit/document/set_actor_reissue_test.ts` (local root byte-equal to a
      server-style rebuild, no initial-actor ticket left, synced/absorbed/
      restored documents untouched, failure leaves the document untouched,
      Text restored by undo, tree split/style, ArraySet, counter, presences),
      `unit/client/reissue_claim_test.ts`
- [x] Integration: `integration/pre_attach_test.ts` (3 rounds of two clients
      converge, the attach re-issues to the client actor, a second document
      of a key under one client key is declined). A failed attach keeping
      the re-issued state is in the unit claim test: a fake RPC fails it
- [x] Design doc `docs/design/pre-attach-ticket-reissue.md`, README index,
      update `offline-local-persistence.md` TODO references
- [ ] Verify: Red -> Green, `pnpm verify:fast`, `pnpm sdk test` against the
      compose server (`yorkieteam/yorkie:latest`; the change is client-only)
- [ ] Self review, PR

## Review

- Red: on `main` 11 of the 16 document tests fail, and the server-style
  rebuild of a pre-attach pack throws `ChangeApplyError` (the Edit names a
  text node the root never held). Against a real server the two clients of
  round 0 already disagree on the winner.
- Green: 23 unit tests and 3 integration tests. Mutations caught: no Text
  special case, no nested element walk, re-issuing lamport 0, no absorbed
  flag on `applySnapshot`/`fromBytes`, no claim.

## Open

- A client with an explicit key does not re-issue, so its pre-attach tickets
  can still collide with another client's, as on `main`. Closing it needs the
  actor's lamport before the attach round trip (yorkie#2114). File as a
  follow-up.
- Round 2 found, on `main` as well, two-replica histories with GC where a
  split piece's `insPrev` is later in list order or was purged. Go's decoder
  rejects such a Text (`insPrevNode should be presence`); pushes never carry
  one today because pushed values are deepcopies. File as a follow-up after
  reproducing it with real clients.
