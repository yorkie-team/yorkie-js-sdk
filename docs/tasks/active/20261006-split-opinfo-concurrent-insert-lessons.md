# Lessons: Report a remote split where it landed, not where it was asked for

**Created**: 2026-10-06

- Two rules decide which side of a split a concurrent boundary insert ends
  up on: the RGA step that positions the edit (ticket order) and §7.3 in
  `splitElement` (version vector). The event followed the first, the tree the
  second. When an event is computed before the operation that can move
  things, measure it after.
- The defect only shows in the realistic ticket order: the peer who splits has
  usually seen the receiver's earlier text, so its lamport is ahead of the
  receiver's next keystroke. A test that lets the inserting replica bump its
  clock first passes on `main` — keep both orders.
- Replay the OpInfo on a separate document and compare trees, instead of
  asserting paths. That catches reorders the path assertion would not.

## Self review

Reviewer: an independent subagent that reproduced from scratch (own harness,
own tests, a local v0.7.24 server) and tried to break the change.

- Round 1 (correctness, test adequacy): no blocking finding. It confirmed the
  cause and the fix, found no scenario the change breaks (fuzz with GC rounds
  and undo/redo, and with #1435 applied: 0 regressions), and corrected two
  claims in the notes: the cited line numbers, and that the reported position
  also changes when the §7.5 advance moves to another parent, not only on a
  §7.3 move. Both fixed here. It also found pre-existing divergences outside
  this change (three replicas inserting at the same boundary, merge vs a
  boundary split); they are not addressed here.
