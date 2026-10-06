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
- Round 2 (PR review panel: blast radius, correctness, test adequacy): three
  blocking findings.
  - The new `toIndex`/`toPath` ran unguarded on a path the codebase documents
    as must-not-throw (`visibleRangeOf` wraps the identical calls because a
    throw inside `TreeEditOperation.execute` aborts a remote pack and wedges
    the document). Fixed: measuring now degrades to the requested position,
    and it reads the last *live* child, since a tombstone measures the same
    boundary but is not a position the walk can resolve.
  - Only the first split level is corrected. Confirmed with a new case:
    `<t>XY</t>` inserted at the paragraph boundary against a `splitLevel: 2`
    edit converges to `<p><t>abc</t><t>XY</t></p><p><t></t></p>`, i.e. the two
    children reordered as well as split. Left open as `it.fails` — this is
    the reorder the first-level comment already calls out, and no split
    position at any level describes a reorder. Closing it needs the change to
    carry a move, which is a bigger change than this one.
  - Split-vs-split at the same boundary, the case the `parent`-not-`target`
    branch is written for, had no test. Added at both the text and the
    paragraph level; both already pass.
- A reviewer asked whether measuring after step 02/03 mixes coordinate spaces
  with the deletion changes of the same edit. It does not: those changes are
  applied before this one, so post-delete/post-merge *is* the space a binding
  replaying them in order is in, and nothing this edit removes or moves sits
  left of `fromIdx`. Written down at the measurement instead of re-derived.
