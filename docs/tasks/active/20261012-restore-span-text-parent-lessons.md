# Lessons: restore span with a text parent

## Red evidence

On unmodified `main` (c69e6bda), `vitest run` of the two new files:

```text
× skips a span under a text parent (isText=false)  Text node cannot have children
× skips a span under a text parent (isText=true)   Text node cannot have children
× skips a span whose kind disagrees (isText=false) recreated non-empty
× skips a span whose kind disagrees (isText=true)  cannot set value of element node: p
× element span under a text parent   ChangeApplyError ... Text node cannot have children
× text span under a text parent      ChangeApplyError ... Text node cannot have children
× text span typed as an element, twice
    ChangeApplyError ... cannot set value of element node: p
Tests  7 failed | 2 passed (9)
```

The two passing cases were `element span typed as text` (a zero-length text
node is recreated, invisible in XML) and the honest path. All 9 pass after
the fix.

## Notes

- JS and Go failed differently on `isText=true` with an element type. Go
  recreated an element carrying a value and duplicated it on re-apply; JS
  throws `cannot set value of element node` when building the node, which
  wedges the document instead. Both now skip the span, so both converge.
- First draft of the document test read the parent IDs from the sender's
  `<p>` after the crafted edit had inserted `x` in front of `hello`, so
  `children[0]` was the new node, absent on the receiver, and the span hit
  the missing-parent skip: the "red" cases passed on `main`. Capture IDs
  before the edit that shifts them, and make sure a red test fails for the
  reason it names.

## Self-review log

### Round 1 (parity and correctness)

An independent reviewer compared the diff with yorkie#2175 rule by rule.
Verdict: approve, no blocking findings.

- Parity: the text-parent check follows the same `findFloorNode` + exact-ID
  lookup as Go, and `restoreSpanKindAgrees` is the first statement of the
  `restore` and `retombstone` loops, where Go checks `kindAgrees`.
- Nothing dangles: both skips return before a node is built, registered or
  paired for GC.
- Re-ran the new tests against `main`'s `tree.ts`: 7 of 9 fail for the
  named reasons; the honest path and the zero-length text case pass, as
  expected. `pnpm verify:fast` and the tree/history integration suites pass.
- Non-blocking: yorkie#2175 is still open; if review moves the Go checks,
  re-sync this branch before merging.

### Round 2 (re-sync with yorkie#2175 c2460cd8)

The Go review loop added a third rule and corrected two tests; ported here.

- Rule: `recreateFromSpan` now goes through `recreateParent`, which also
  refuses when `findFloorNode(id)` returns a surviving holder whose offset
  equals `id`'s, or a text holder whose run covers it (`offset + length >
  id.offset`). Same order as Go: parentID, parent lookup/text check, then
  holder. JS `value.length` and Go `Length()` both count UTF-16 units.
- Red on fd10406e: `skips a text span naming a live element` (recreated a
  text node under `<p>`'s ID) and `skips an element span inside a live text
  run` (recreated a `<p>` at `hello`'s offset 2) fail; 2 of 9.
- The ported kind tests (`keeps a tombstone a mismatched span names`, and
  the corrected retombstone tests naming a LIVE node) pass on fd10406e,
  because the kind check is already there. With `restoreSpanKindAgrees`
  forced to `true` they fail (7 of 9), so they now bite. The old retombstone
  half used a fresh ticket and held with or without the check, the same
  flaw Go's reviewer found.
- Lesson: a skip test must name state the guarded code would otherwise
  touch; an ID no node holds proves nothing.

### Round 3 (review panel: span shape vs. replica state)

Four of the panel's five findings were about how much of a forged span the
guards cover; the fifth was refuted by running the tests.

- Split the guard in two by WHAT IT READS. `restoreSpanKindAgrees` became
  `restoreSpanIsWellFormed`: kind agreement, plus a text span carrying
  exactly its run (`length > 0`, `value.length === length`) and an element
  span carrying none (`length === 0`, `id.offset === 0`). All four are pure
  functions of the span, so every replica rejects alike -- which is the only
  reason to prefer a span-shape rule over a tree-state one.
- `isIdentityClaimed(createdAt, start, end)` replaces the start-offset-only
  holder test and is now shared with `dropDuplicateContents`: the ordinary
  insert path drops content landing inside a live run, not just content
  naming a node exactly. One floor probe at `end - 1` decides it, because
  that is the highest-offset node of the insertion that can start in range.
- No false positives on the honest path: a recreate gap is bounded by the
  next surviving piece's start, so the probe lands on the piece that ENDS at
  the gap's start and `end > start` is false.
- Finding kept open: the claim test reads replica-local GC state, so two
  replicas can act differently on a FORGED span. No state-independent rule
  exists -- "always recreate" is #1471 itself -- so the fix is to shrink
  what the state-dependent test has to decide, which the shape rules do.
  Rebuttal filed with that argument.
- Refuted: "the `isText=true` variants pass on pre-change code". Ran the
  file against `origin/main`'s `tree.ts`: 9 of 9 fail, 16 of 18 after this
  round. `findFloorNode` requires `createdAt` equality, so a span naming an
  insertion the tree does not have floor-resolves to nothing, not onto
  `hello` -- the cases do reach the guards.
- Lesson: before accepting "this test does not bite", run it against the
  base revision. It costs one checkout.
