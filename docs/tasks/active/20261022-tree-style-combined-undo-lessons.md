# Lessons — Tree style with both halves must round-trip and apply as one

**Created**: 2026-10-22
Tracked as #1498

## Notes

- `StyleOperation` (Text) and `TreeStyleOperation` (Tree) build the same
  combined reverse op, but only the Text one ever executed both halves. The
  Tree side had the combined-reverse branch in `execute` already — it just had
  no code path that could apply what it built.
- The if/else in `toOperation` is what turns a convergent defect into a
  divergent one: every replica dropping the same half is survivable, but an
  encoder that drops a half the decoder would have read is not. Shape-switching
  on "which field is non-empty" is the pattern to distrust whenever both fields
  can be set at once.
- The `attributesToRemove` array is assigned onto the protobuf message, so it
  is copied rather than aliased from the operation.

## CI

- The integration lane failed once on this branch with the Yorkie container
  dumping cobra's usage text, which reads like a rejected flag. It is not: the
  server reports a *boot* error as one error line plus the full usage dump, and
  `wait-for-yorkie.sh` tailed too few lines to keep the error line. The lane
  waited only for Mongo's container to start, so the server could exit on a
  failed dial and be pushed past the wait window by `restart: always` backoff.
  Fixed by gating on a Mongo healthcheck and widening the log tail.

## Self review

Not run — this branch was produced by an autonomous run that is not granted the
reviewer subagent. CI, `@claude review` and a human review the PR.

## Review round 1

Three blocking findings, all taken:

- **A combined wire shape is not the only way to keep both halves.** The first
  cut put `attributes` and `attributesToRemove` on one `TreeStyle` operation.
  Every released SDK -- and, on the branch's own admission, the Go server --
  reads one field or the other, so the shape turns a convergent defect into a
  divergent one for a mixed-version document. The reverse is now split into two
  single-purpose operations instead, which is the shape every peer already
  decodes. It also gives the two halves separate tickets, so a key both halves
  touch is dropped and then set again rather than losing the set to RHT's
  same-ticket rule.
- **`prevAttributes` was sampled from the first target only.** A style over a
  range whose nodes held different previous values reversed into one operation
  carrying the first node's values, which it then stamped onto the rest.
  `CRDTTree.style`/`removeStyle` now report per target, and
  `TreeStyleOperation` reverses the whole range with one pair of operations
  only while the targets agree; when they differ each target gets its own pair
  over its own range (`CRDTTree.posRangeOfNode`).
- An operation can now need more than one operation to reverse it, so
  `ExecutionResult` grew `reverseOps` beside `reverseOp`.

## Review round 2

Two blocking findings, both taken:

- **A guard that reads as a no-op split the clone from the root.** Round 1's
  `execute` ran the remove half only when it carried keys and the set half only
  when it carried attributes, so an operation holding neither -- `style(from,
  to, {})` -- ran nothing on the root, while `json/tree.ts` had already run the
  whole style machinery on the clone for the same call. `styleTargets` splits
  the text at the range's ends, so the clone was left holding nodes the root
  never minted. The remove half now also runs when the operation carries
  nothing, which is what the pre-branch `else` branch did.
- **The headline converter change had no test.** The suite only ever built the
  two single-purpose operations this SDK emits, so nothing exercised encoding,
  decoding or executing an operation that carries both fields -- the shape the
  converter was rewritten for. Two tests now do: one round-trips a combined
  operation through `operationToBinary`/`bytesToOperation` and applies it to a
  peer, the other executes one whose halves overlap on a key and asserts the
  reverse is assembled from what the remove half saw. The file's header
  comment, which still described the round-1 single-operation shape, was
  rewritten to match.
