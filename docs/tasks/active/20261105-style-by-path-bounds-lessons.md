# Lessons: reject `styleByPath(path)` for a path that names no node

**Created**: 2026-11-05
Tracked as #1523

## Notes

- `IndexTree.pathToTreePos` is shared by insert-shaped callers (`pathToPos`,
  used by `editByPath` and the range form of `styleByPath`) and by the
  single-path `styleByPath`. Only the latter needs the offset to name an
  existing node, so the tightening belongs in `CRDTTree.pathToPosRange`, not
  in `pathToTreePos` — moving it down would break every legitimate
  "insert at the end" path.
- The text branch of `pathToTreePos` (`findTextPos`) is intentionally left
  alone. A path into a text-only parent names a character offset rather than
  a node, and `surrogate_index_test.ts` already pins that `styleByPath([0,0])`
  on such a parent succeeds.

## Self review

Not run: this branch was produced by the autonomous issue-to-PR run, which is
granted no tool that can dispatch the reviewer subagent. Review falls to CI,
`@claude review`, and a human on the PR.
