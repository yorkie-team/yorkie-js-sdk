# Skip every remote Increase that Go skips — lessons

**Created**: 2026-11-06

- The value of an `Increase` is any `CRDTElement` on the wire. The
  `as Primitive` cast hid that: a non-primitive value did not fail with a
  readable error but with `target.isNumericType is not a function`, thrown
  from inside `CRDTCounter.increase`.
- Go's `skipUnlessLocal` returns the error for `Local` and `UndoRedo` and
  skips for every other source. The JS `OpSource` has only those two and
  `Remote`, so `source === OpSource.Remote` is the same rule.
- One `try` around everything that depends on the delta replaces the two
  separate skips #1502 added for the dedup counter; the dedup tests from #1502
  pass unchanged.

## Self review

- Round 1: no blocking findings. Checked each branch of Go's
  `Increase.Execute` against the new code: a missing or non-counter target
  still throws for every source; a non-primitive value, a dedup increase
  without an actor or by more than one, and a refused plain delta are skipped
  only on `Remote`.
- `pnpm verify:fast` fails locally only in
  `test/unit/client/offline_persist_sync_test.ts` and
  `test/unit/client/persist_disabled_test.ts` (23 tests, "already open in
  another tab"), the same on `main` under Node 24; CI runs Node 22.
