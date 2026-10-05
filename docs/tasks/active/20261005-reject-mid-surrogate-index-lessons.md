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
