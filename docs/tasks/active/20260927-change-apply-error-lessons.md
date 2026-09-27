**Created**: 2026-09-27

# Lessons — diagnosable failure for a change that cannot be applied (#1367)

## Notes

- The companion defect the issue mentions ("`applyChange` mutates the clone
  before the root with no rollback") is already fixed: `Document.applyChange`
  drops the clone in its catch. That catch was the natural place to hang the
  annotation, so this change reuses it instead of adding a second try block.
- `applyChange` is reached from remote packs, from replayed stored/local
  changes and from devtools replay — but *not* from `Document.update` or from
  `history.undo`, which have their own rollback paths. That reasoning was
  wrong about the *inner* throw site: the first cut put the wrapping in
  `Change.execute`, which `Document.update` and undo/redo call directly, so
  every local edit started reporting `ErrChangeApplyFailed` instead of the
  code its operation threw. Both the inner wrap and `applyChange`'s outer
  wrap are now gated on `source === OpSource.Remote`, which is the only path
  where the checkpoint stalls and the server redelivers.
- The error message must stay metadata-only. `operation.toTestString()` is a
  debug serializer that embeds the operation's payload (`...SET.k=<value>`),
  and this message is thrown to application code and logged at the default
  level on every redelivery — so it named plaintext document content. The
  operation is now named by type and target ticket instead.
- `ChangeApplyError extends YorkieError`, and `client.ts`'s offline-restore
  handler classified *any* `YorkieError` as `'actor-mismatch'`. A replay that
  fails to apply says nothing about client identity, so that branch now
  excludes `ChangeApplyError` explicitly.
- The failing operation's identity is only known inside `Change.execute`, and
  the document key is only known in `Document`. `ChangeApplyError.withDocKey`
  lets the inner throw site name the operation and the outer catch name the
  document without a second error class.

## Self review

Not run: this branch was produced by an autonomous run that is not granted the
reviewer subagent `/self-review` dispatches. Review is left to CI, `@claude
review` and a human on the PR.
