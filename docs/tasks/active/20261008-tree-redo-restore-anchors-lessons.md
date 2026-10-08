# Lessons — tree redo restore anchors

## Reproduction

The issue reports two rows. Only the first — "synced between undos, nodes
garbage-collected, both replicas agree on the WRONG position" — reproduces in
an in-process unit harness (two `Document`s exchanging change packs through
`converter.toChangePack`/`fromChangePack`, then `garbageCollect` with a max
version vector). It lands `aXYZ` where `XYZa` is expected.

The second row — "not synced, nodes still tombstones, replicas DIVERGE" — does
not reproduce in-process: with the tombstone still present both replicas take
the identity branch of `CRDTTree.restore` and `unremove` the same node, so both
end at `XYZa`. Divergence there needs a replica that has lost the tombstone,
which in the reporter's run is the server's own garbage collection. The fix
here is the same root cause either way: whichever replica has to RECREATE the
node is the one that reads the stale anchors.

## Why the anchors were stale

`removedSpans` (the delete path) captures anchors at the delete, so they are
fresh. `insertedSpans` captures at the insert — and that span is not used for
placement until the redo, which can be arbitrarily far in the future. The two
capture sites are character-for-character identical, which hid the difference
in *when* they run.

## Review rounds

`/self-review` was not run: this autonomous run is granted no tool that can
dispatch the reviewer subagent it requires.
