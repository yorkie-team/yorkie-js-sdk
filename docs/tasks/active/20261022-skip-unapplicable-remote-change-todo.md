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
   CLEAR. Both of the other defined enum values are reachable: Go's
   `ToPresenceChange` falls back to `UNSPECIFIED` and its `fromPresenceChange`
   decodes `DELETE`. Decode `DELETE` as `Clear` — both mean "drop this actor's
   presence", which is what `Change.execute` does for `Clear` — and decode
   `UNSPECIFIED` as no presence change at all, so the change still applies its
   operations. Keep the throw for a value outside the enum.

A local `update`, an undo or a redo keeps throwing: the wedged-document
problem is specific to the pull path, and a caller that asked for the mutation
must hear that it failed with the code the operation threw. This mirrors the
reasoning already written down in `Change.execute` for `ChangeApplyError`.

## Out of scope

- The rest of the operations. Only `Increase` has a Go-side `skipUnlessLocal`
  comment cited by the issue; auditing every operation for the same treatment
  is a separate sweep.
- Any `.proto` change. The two enum values already exist on the wire.

## Steps

- [x] `IncreaseOperation.execute` takes `source` and skips an unapplicable
      dedup increase when it is `Remote`.
- [x] `fromPresenceChange` maps `DELETE` → `Clear`, `UNSPECIFIED` → undefined.
- [x] Unit tests: a pulled pack with each of the three shapes applies, and the
      later changes in the same pack still apply.
- [x] `pnpm verify:fast`.
