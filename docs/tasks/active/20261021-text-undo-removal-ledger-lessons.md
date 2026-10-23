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
