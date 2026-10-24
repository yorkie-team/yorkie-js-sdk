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
- …and copying that was still wrong, which is the other half of the parity
  lesson: the same wire value means different things in the two
  implementations. Go's `Change.Execute` stores the decoded presence as-is;
  this SDK's `Change.execute` makes a `Put` *replace* what the actor holds and
  routes `Clear` to `removeOnlineClient`. So "`Put` of `{}`, as Go does" wipes
  a peer's presence and leaves a phantom online peer. Match the *meaning* of
  the wire value in the local model, not the remote implementation's
  statement-for-statement behavior.
- A revert for the right reason can still be wrong. Two of the fix-round
  changes reverted as "beyond Go" — tolerating a PUT with no `presence`,
  keeping a non-JSON presence value as a raw string — were reinstated in
  review: both are `fromChangePack` throwing on input a peer wrote, which is
  the wedge this task set out to remove, not a generalization of Go.
- Keep CI workarounds out of a behavior PR; the MongoDB healthcheck went to
  its own PR (#1505).
