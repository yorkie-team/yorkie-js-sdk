# Skip a remote change this SDK cannot apply, as Go does

**Created**: 2026-10-22
Tracked as #1500

The server stores changes that this SDK refuses to decode or execute. Because
a throw on the pull path aborts the whole pack and the checkpoint never
advances past the offending change, the server redelivers it forever: the
document fails on every pull from then on. Go treats a stored change that
cannot be applied as unrecoverable and skips it on a remote source
(`pkg/document/operations/increase.go`, `skipUnlessLocal`).

Two places in this SDK do not follow that.

## Scope

1. **Dedup `Increase` that the dedup counter refuses.**
   `IncreaseOperation.execute` throws `ErrInvalidArgument` when the counter is
   dedup and `this.actor` is empty; `CRDTCounter.increaseDedup` throws for a
   delta other than 1. Go skips both for a remote change
   (`increase.go:115-125`). Skip them here too when `source` is
   `OpSource.Remote`, by returning no execution result — the path
   `Change.execute` already has for an operation that did not run.

2. **Presence changes of type `UNSPECIFIED` or `DELETE`.**
   `fromPresenceChange` throws `ErrInvalidType` for anything but PUT, PATCH or
   CLEAR. Go decodes both defined-but-unused types into a change with no type
   and no presence (`api/converter/from_pb.go`, `FromPresenceChange` default
   branch), which `Change.Execute` stores as an empty presence for the actor.
   Decoding both as a `Put` of `{}` to match was rejected in review: this
   SDK's `Change.execute` makes a `Put` *replace* the presence the actor
   holds, so it would wipe a peer's presence (or this client's own, on an echo
   of a pushed change) and leave a phantom online peer that `removeOnlineClient`
   never reaches. Decode `DELETE` as `Clear` — which is what "the presence is
   gone" means here — and `UNSPECIFIED`, protobuf's zero value and therefore no
   stated intent, as no presence change at all. A PATCH or a PUT with no
   `presence` decodes as an empty one rather than throwing. Keep the throw for
   a value outside the enum.

A local `update`, an undo or a redo keeps throwing: the wedged-document
problem is specific to the pull path, and a caller that asked for the mutation
must hear that it failed with the code the operation threw. This mirrors the
reasoning already written down in `Change.execute` for `ChangeApplyError`.

## Out of scope

- The rest of the operations. Only `Increase` has a Go-side `skipUnlessLocal`
  comment cited by the issue; auditing every operation for the same treatment
  is a separate sweep.
- Any `.proto` change. The two enum values already exist on the wire.
- Anything Go does not do *and* that nothing here needs. Reverted from earlier
  fix rounds: skipping a missing or non-counter target (Go returns
  `ErrNotApplicableDataType` for every source, `increase.go:63-66`), the
  JS-only `isReplay` flag, and the CI MongoDB healthcheck (moved to #1505).
  Review put two of the reverts back, because they are not generalizations of
  Go but consequences of how *this* SDK decodes and applies: tolerating a PUT
  without `presence`, and keeping a non-JSON presence value as a raw string.
  Both are `fromChangePack` throwing on peer-written input, which wedges the
  pull loop — the very failure this task exists to remove.

## Steps

- [x] `IncreaseOperation.execute` takes `source` and skips an unapplicable
      dedup increase when it is `Remote`.
- [x] `fromPresenceChange` maps `DELETE` → `Clear` and `UNSPECIFIED` → no
      presence change, and tolerates a PUT or PATCH with no `presence`.
- [x] `fromPresence` keeps an unparsable value as the raw string.
- [x] Unit tests: a pulled pack with each shape applies, and the later
      changes in the same pack still apply.
- [x] Revert every change that goes beyond Go's behavior.
- [x] `pnpm verify:fast`.
