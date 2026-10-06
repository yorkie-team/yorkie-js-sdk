# Lessons: Stop the split-sibling cascade at a sibling the editor saw alive

**Created**: 2026-10-06

- A walk that skips nodes and keeps going is only safe if nothing it reaches
  later depends on what it skipped. The `InsNextID` chain is in document
  order, so a sibling the editor saw alive is a boundary: what lies past it
  came out of that sibling, not out of the deleted element.
- "Known" is not "seen alive". The first version stopped at every known
  sibling and lost deletes when the editor had merged that sibling back into
  the element. The test is whether the editor saw the sibling removed, which
  the tombstone's ticket answers, or whether this delete covers it whole.
- The obvious other step, cascading also when the delete lost the element's
  LWW, made every #1408 shape converge and still lost text: an undone delete
  or a merge that turned into a delete reaches products whose content the
  editor never saw. Tests that only assert convergence would have accepted
  it; tests that assert nobody's text disappears caught it.
- Hand-picked races miss shapes. A random fuzz over split, Enter, merge,
  insert and delete on 2–3 replicas, compared seed by seed with `main`,
  showed both the gain and the few seeds that got worse.

## Self Review

- Round 1 (correctness, tests): an independent subagent tried to break the
  first version (stop at the first known sibling). Blocking: it lost deletes
  when the known sibling had been merged back into the deleted element
  (`main` converged); the residue was described wrongly in the doc and the
  tests; the "Enter + type vs Enter" case asserted one replica only; a JS
  test file failed lint. Non-blocking: the "its own cascade reaches it" claim
  fails when that cascade loses the LWW (a new empty-element residue); the
  editor-actor check is redundant; the swap did not exercise both ticket
  orders in symmetric cases; the residue check accepted any number of empty
  spans. All fixed here: the stop rule became "saw it gone or enclosed", which
  also covers the LWW-lost sibling; tests gained the reviewer's shapes, both
  actor orders, an exact one-empty-span residue check and GC on that path;
  the docs describe the residue as observed. Two shapes stay as known
  limitations above, with their reason.
- Round 2 (design fit, docs): no blocking findings. It confirmed the walk
  tombstones a subset of what `main` did for any tree state, the lazy
  `enclosed` traversal uses the outer range and is read-only, snapshots keep
  every field the rule reads (3000 seeds with undo, 0 mismatches), and Go and
  JS match. A 10,000-seed fuzz per setting (plain, undo, snapshot reload,
  both) found no seed where this change loses a letter that `main` kept
  without `main` already losing text. Fixed here: the residue count (12 of
  40, not 6, and not only same-boundary splits), the cost of the LWW gate
  (deleted text can survive with three replicas), both limitations' wording
  (Enter + Undo + delete against Enter; the merge-vs-split order count) and
  the version the cascade shipped in (v0.7.4). Out of scope, noted for a
  separate issue: Go's Phase 3 range narrowing lacks the `toLeft != toParent`
  guard that JS has (#1237).

## PR Review Panel

- Round 1 (blast radius): three blocking findings, all on the same point —
  the rework's comments called `mergedFrom`/`mergedAt` immutable and
  always-present, while out-of-diff code takes them away: `purge` unlinks a
  stamped child, `dissolveMerge` clears both on undo, `reissueContentIDs`
  strips them from reverse-op content, and `rebuildMergeState` back-fills
  `mergedAt` from the LWW-mutable `removedAt`. Correct: a witness one replica
  can lose and another keep makes the cascade answer by route, not by what
  the editor saw.
  Fixed by making each route answer the same way rather than by rewording:
  `purgeBarrierAt` holds a merge-moved child until its source is collectable
  too (once both go the walk skips the source, which is what a live witness
  decides); `sawMergedBack` stops on a live sibling first, so a revived
  source needs no stamp to be cleared; a back-filled `mergedAt` is flagged
  `mergedAtApproximated` and refused as a witness.
- Tried first and reverted: replacing the witness with "a tombstone holding
  no live child the editor knew". Fully route-independent, and wrong — it
  passes through a sibling tombstoned by a delete the editor never knew, so
  15 of the 46 cascade runs lost text (#1408 among them). Only a ticket the
  version vector can be asked about separates "the editor saw it gone" from
  "someone else deleted it", and the merge stamp is the only durable one.

- Round 3 (blast radius): one blocking finding, the other half of the
  approximation rule. Flagging a back-filled `mergedAt` and declining to
  encode it closed the `sawMergedBack` route but left the *other* reader of
  the ticket — Fix 8's split placement in `util/index_tree.ts` — comparing a
  value the snapshot route cannot reproduce: `rebuildMergeState` re-derives
  it from the source's LWW-mutable `removedAt`, or not at all when the source
  is no longer a tombstone in the tree. Correct, and the lesson is that
  "don't encode it" is only half a fix: a field the wire drops has to be
  declined by *every* reader, or the ones left reading it answer by route.
  Fixed by giving Fix 8 the same `!mergedAtApproximated` guard the witness
  has, with a positive control in `tree_merge_lineage_test.ts` so the
  unflagged path is still shown to keep the child at its level.
