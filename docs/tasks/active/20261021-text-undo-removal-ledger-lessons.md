# Lessons: Keep a removal the undo never saw

- The reproduction needs the protobuf round trip: an in-process exchange keeps
  `removedBy` on the operation objects even when the converter drops it.
- "The deleter knew the node" (creation in its version vector) was the old
  rule for a remote deletion. Once an undo can revive a tombstone, the rule has
  to be "the node was live in the deleter's view", or a deletion removes text
  its author never saw.
- The first version of the redo test expected the deleter's range to take a
  tombstone inside it. It must not: the deleter saw that piece removed, which is
  exactly the yorkie#2237 case.
- A stock server does not pass unknown fields through: it decodes the pack and
  encodes it again, so `removed_by` vanished between the undoer and everyone
  else, and three `history_text` reconcile cases diverged against it. A new
  wire field that changes what an operation does needs a server capability,
  like `presence-patch`.
- Recreating a purged run as one node made the collected replica's node
  partition differ from an uncollected one, which later edits addressed by
  offset exposed. Recreate along the purged pieces' own boundaries.
- (2026-10-31, port of yorkie#2310) A field naming the undone removal was
  the wrong shape: it needed a server capability, and the purged-ledger side
  table it implied grew with every collected piece. Deriving the removal
  from the undo's actor makes the rule local, and holding the tombstone
  until its ledger is stable lets a recreated piece say all it needs with a
  lamport-0 stand-in.
- A reverse that names only recorded pieces can come out empty. Encoded as
  is, it lost its restore mode and went out as a positional edit of its
  stale range, so it degrades to an empty undo edit at the head instead.
- JS `refinePos` snaps a stale offset to the end where Go's errors, so
  Go's seed 152 (an empty undo past the end of an emptied text) never failed
  here; the CRDT test of the empty undo pins the rule instead.
- The test config swallows `console.log`; the fuzz harness reports its
  counts on stderr.
