# Lessons: sync the protos with Go and harden crafted tree payloads

**Created**: 2026-09-27

## Diff every proto file, not the ones the commit names

yorkie `73139d01` names the element-restore fields, but the diff against
`origin/main` also turned up `channel_session_ttl` on two project messages
and several comment-only hunks. Copying Go's files verbatim and letting
`buf generate` produce the bindings is the only way to be sure the drift is
zero rather than "the fields I knew about".

## A guard with no reachable Red still gets a test

Go's text-parent guard in `rebuildMergeState` protects a shape JS `prepend`
already refuses to build. The test plants the child under a text node by
hand, as a decoder that did not check would, so the guard is pinned rather
than left as dead-looking code someone deletes later.

## Check the local side of every decode-time strip

Stripping `mergedFrom` on decode would diverge if the replica that authored
the content kept it. The only local path that sends copied content is the
copy-reinsert undo, and `reissueContentIDs` already clears the same five
fields there, so both sides agree.

## Self-review

- Round 1: no blocking findings. Checked that the new `findMergeNode`
  sites cannot drop a genuine pointer (every writer stores a node's own ID,
  always an element), that `clearTombstones` restores sizes in post-order,
  and that the new decode error cannot fire on a change a Go server would
  accept (Go rejects the same empty group). Noted but left out: the
  `GCPairs` root guard (no crash in JS) — see the todo review.
