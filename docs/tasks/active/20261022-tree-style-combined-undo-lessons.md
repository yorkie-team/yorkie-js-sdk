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
