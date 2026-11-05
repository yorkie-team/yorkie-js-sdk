# Reject `styleByPath(path)` for a path that names no node

**Created**: 2026-11-05
Tracked as #1523

## Problem

`Tree.styleByPath(path, attrs)` — the single-path form — styles the *parent*
element when `path` is the position one past the parent's last child, instead
of failing.

```
<root><p><t>ab</t></p><p></p></root>

styleByPath([1, 0], {bold: true})  // the empty <p> has no child 0
  → no error, <root><p><t>ab</t></p><p bold="true"></p></root>
styleByPath([0, 1], {bold: true})  // <p> has only child 0
  → no error, <root><p bold="true"><t>ab</t></p><p></p></root>
```

Paths further out of range (`[1, 5]`, `[0, 3]`) already throw
`ErrInvalidArgument: unacceptable path`, and so does the range form
`styleByPath(from, to, attrs)` with the same paths. Only the single-path form
is wrong, and only at exactly one offset past the end.

## Cause

`json/tree.ts` `styleByPath` single-path mode calls
`CRDTTree.pathToPosRange(path)`, which is `[findPos(pathToIndex(path)),
findPosUnchecked(pathToIndex(path) + 1)]`.

`IndexTree.pathToTreePos` deliberately accepts an offset equal to
`node.children.length` (`if (node.children.length < path[last]) throw`) —
that is a valid place to *insert*. For a single-path *style* it names no
node: the index it maps to is the parent's closing tag, so the derived
`+1` range covers the parent and the style lands there.

## Plan

- [x] `CRDTTree.pathToPosRange` resolves the path to a `TreePos` and rejects
      it when it names no node — an element parent with
      `offset >= children.length`. The text case (`findTextPos` returning a
      text node) keeps its current behaviour: a path into text names an
      offset, not a node, and the existing surrogate-pair test
      (`surrogate_index_test.ts`, "styles a single path whose derived end
      lands inside a pair") styles `[0, 0]` on a text parent and must keep
      passing.
- [x] Unit test `packages/sdk/test/unit/document/tree_style_path_bounds_test.ts`
      with the issue's three cases: the control path styles, and both
      no-such-node paths throw `ErrInvalidArgument` and leave the tree
      unchanged.
- [x] `pnpm verify:fast`.

## Scope

- `pathToPosRange` has no caller other than the single-path `styleByPath`, so
  the fix is contained to that form. The range form and `pathToPos` are
  untouched.
- JS only. Go's `StyleByPath` has only the range form, so there is nothing to
  mirror on the server side and no protocol change.

## Out of scope

- yorkie-team/yorkie#2240 (the empty inline piece moving to the next
  paragraph), which the reporter hits together with this. Separate issue, in
  the server repo.
