# Skip a remote change this SDK cannot apply, as Go does — lessons

**Created**: 2026-10-22

- `Change.execute` already had the two halves of this fix written down: it
  wraps only remote failures in `ChangeApplyError` because the checkpoint does
  not advance past a change that throws, and it `continue`s past an operation
  whose `execute` returns nothing. Skipping an unapplicable remote operation
  needed no new mechanism, just the existing `undefined` return.
- Parity means Go's actual behavior, not a generalization of it. The fix
  rounds widened the skip to cases Go still rejects (a missing or non-counter
  target, `increase.go:63-66`; a PUT without presence) and added JS-only rules
  (raw-string presence values, an `isReplay` flag). All of them were reverted:
  read the Go code line by line before claiming "as Go does".
- Go has no `DELETE` → `Clear` mapping. Its default branch decodes both
  defined-but-unused types into an empty change that stores an empty presence.
- Keep CI workarounds out of a behavior PR; the MongoDB healthcheck went to
  its own PR (#1505).
