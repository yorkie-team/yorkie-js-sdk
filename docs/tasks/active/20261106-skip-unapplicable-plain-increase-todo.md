# Skip every remote Increase that Go skips

**Created**: 2026-11-06
Tracked as #1508

#1502 made `IncreaseOperation.execute` skip an unapplicable dedup increase on
the pull path, as Go does. Go's `skipUnlessLocal`
(`pkg/document/operations/increase.go`) also covers two remote cases this SDK
still throws for, and a throw on the pull path aborts the pack and leaves the
checkpoint where it was, so the stored change wedges the document (#1500):

- an increase whose value is not a `Primitive` (Go:
  `value, ok := o.value.(*crdt.Primitive)` → `skipUnlessLocal`). Here the
  value is cast without a check, and `CRDTCounter.increase` throws
  `target.isNumericType is not a function`.
- a non-dedup increase whose delta `CRDTCounter.increase` refuses (a
  non-numeric primitive; Go: `cnt.Increase` error → `skipUnlessLocal`).

## Scope

1. Check that the value is a `Primitive` before using it as one.
2. Skip both cases when `source` is `OpSource.Remote`, through the same path
   as the dedup ones: `skipUnlessLocal`, named after Go's, returns no
   execution result on a remote failure and throws on any other.

A local `update`, an undo or a redo keeps throwing the error the counter
threw, as before.

## Out of scope

- A missing target or one that is not a counter. Go returns
  `ErrNotApplicableDataType` for every source (`increase.go`), so it keeps
  throwing here; a test pins it.
- The other operations (the separate sweep #1502 left open).

## Steps

- [x] Failing tests first: a pulled pack whose plain-counter increase carries
      a string delta (the later change in the pack still applies, the
      checkpoint advances), a remote increase whose value is an object, a
      local or undo/redo one still throwing, and a non-counter target still
      throwing on the pull path.
- [x] `IncreaseOperation.execute`: the type check returns through
      `skipUnlessLocal`, and one `try` around the dedup and the plain increase
      catches into it.
- [x] `pnpm verify:fast`.
