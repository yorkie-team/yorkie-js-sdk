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
- Review round 1 caught that bounding only the element case left the same
  symptom for text-only parents: `findTextPos` accepts
  `pathElement === parent.visibleSize`, which resolves to the end of the last
  text node and hence to the parent's closing tag. The bound in
  `pathToPosRange` now covers both shapes. For a text pos the end of one text
  node still names the first character of the next one, so the rejection has
  to be `offset >= node.visibleSize && !node.nextSibling` rather than the
  offset alone — a parent with two text children would otherwise lose the
  path naming the first character of the second child.
- The same round flagged negative path elements: a negative *last* element
  slips past `pathToTreePos` (`children.length < -1` is false, and
  `findTextPos` only checks the upper end), so `pathToPosRange` rejects
  `offset < 0` too. Negative elements earlier in the path already throw,
  because `node.children[-1]` is `undefined`.
- Review round 2 pointed out that fixing the negative element only in
  `pathToPosRange` left every other path-taking entry point (`splitByPath`,
  `mergeByPath`, `editByPath`, `editBulkByPath`, the range forms of
  `styleByPath`/`removeStyleByPath`, `pathToIndex`) silently resolving it one
  index early. Unlike the past-the-end bound, a negative element is not a
  legitimate "insert at the end" path for *any* caller, so that one belongs in
  `IndexTree.pathToTreePos` after all; `pathToPosRange` now only carries the
  upper bound.

## Self review

Not run: this branch was produced by the autonomous issue-to-PR run, which is
granted no tool that can dispatch the reviewer subagent. Review falls to CI,
`@claude review`, and a human on the PR.
