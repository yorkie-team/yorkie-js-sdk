# Lessons: Reject indexes that split a UTF-16 surrogate pair

**Created**: 2026-10-05

- yorkie-js-sdk#1441 was filed on 2026-10-02, before yorkie#2085's later
  rounds added `FindPosUnchecked` for undo/reverse indexes. Porting from the
  issue text alone would have checked those paths too; port from the merged
  Go diff, not from the issue that predates it.
- Go's `TestTreeSplitReverseAfterRemoteSplitHistory` does not build in JS:
  its setup deletes across a level-2 split boundary, where Go is a no-op and
  JS merges (the known parity gap), so the tree differs before the step under
  test. Search for a JS-native reproduction instead of bending the
  expectation: a seeded two-replica fuzz over emoji text with splits and
  undo/redo, recording a surrogate rejection from an undo, a redo, a remote
  apply or a valid caller index, found three in seconds.
- The sharpest one is JS-only in shape: `execute` builds the reverse for
  remote changes too, from the receiver's own indexes. With the check in
  `findPos`, a remote change made only of valid indexes failed to apply
  (`ChangeApplyError`). In Go the same builders already used
  `FindPosUnchecked`.
- Before pinning a document-level undo repro, replay it with ASCII of the same
  lengths. Two of the fuzz's undo repros also break with ASCII (an undo after
  a delete across a level-2 split), so they would have pinned an unrelated
  defect; the Case 5 operation-level test covers the undo index path instead.
- vitest here swallows `console.log`, and `YorkieError.stack` came back
  undefined through the change-apply wrapper. Putting `new Error().stack` in
  the thrown message temporarily was the fastest way to get the frame.

## Self review

Reviewer: `superpowers:requesting-code-review` (a general-purpose subagent
over `origin/main...HEAD`), not the CI lens panel.

- Round 1 (correctness, test adequacy): one blocking finding. The ProseMirror
  binding's `diffText` compared code units, so replacing an emoji with one
  that shares a surrogate (U+1F600 -> U+1F603, or U+1F600 -> U+1FA00) put
  `from` or `to` inside the pair; `tree.edit` now threw and the binding
  rolled the user's edit back. Fixed: snap the common prefix and suffix to
  character boundaries (Red: 4 new tests failed first). Before this branch
  the same diff inserted lone halves into separate nodes, so the binding was
  itself a source of the yorkie#2065 divergence. Minor: the
  `isUTF16Boundary` oracle restated the implementation; rebuilt it from a
  code-point walk. Not taken: the fuzz's `'ab😀가'.slice(0, 3)` lone high
  predates this branch and acts as old-client data, and `findNode(...)!` in
  `validateUTF16Boundary` cannot miss because `indexToPos` returns the node
  it resolved. Declined by the reviewer and agreed: the Quill/CodeMirror
  demos in `packages/sdk/public` are examples, not shipped packages.
- Lesson: a check added in the SDK turns every caller that computes indexes
  itself into a possible regression. Grep the other packages for the entry
  points before calling the SDK change done.
- Round 2 (design fit, simplification, blast radius): no blocking finding,
  so the loop stopped. Took the JSDoc throw notes and the
  `createRangeForTest` comment; left the error message as Go's and the
  binding's local surrogate predicates (sharing them needs a public export).
