**Created**: 2026-09-27

# Lessons — diagnosable failure for a change that cannot be applied (#1367)

## Notes

- The companion defect the issue mentions ("`applyChange` mutates the clone
  before the root with no rollback") is already fixed: `Document.applyChange`
  drops the clone in its catch. That catch was the natural place to hang the
  annotation, so this change reuses it instead of adding a second try block.
- `applyChange` is reached from remote packs, from replayed stored/local
  changes and from devtools replay — but *not* from `Document.update` or from
  `history.undo`, which have their own rollback paths. So wrapping there does
  not change the error surface of user-facing edits.
- The failing operation's identity is only known inside `Change.execute`, and
  the document key is only known in `Document`. `ChangeApplyError.withDocKey`
  lets the inner throw site name the operation and the outer catch name the
  document without a second error class.

## Self review

Not run: this branch was produced by an autonomous run that is not granted the
reviewer subagent `/self-review` dispatches. Review is left to CI, `@claude
review` and a human on the PR.
