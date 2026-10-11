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
