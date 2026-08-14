# Mirror the duplicate CRDTTreeNodeID rules

**Created**: 2026-08-15

Server-side counterpart: yorkie#1927. A production document became
unopenable because two `CRDTTreeNodeID`s named the same node: the server
panicked in `SplitText` while rebuilding the document from a snapshot,
which reset the HTTP/2 stream and surfaced as `AttachDocument 503`.

The duplicates came from this SDK. `TreeEditOperation.toReverseOperation`
reverses a deletion by deep-copying the removed nodes, and the copy keeps
each node's ID, so undoing a deletion re-inserts nodes under the IDs the
tombstones already hold. The affected client ran `@yorkie-js/react`
0.7.13, which has no identity-preserving restore path at all —
`restoreSpans` landed in fa6cc513, after that release.

## Problem

The rules now live on the server, but a rule that only one side applies
is worse than no rule: the client keeps the copied content, the server
drops it, and every position anchored at the shared ID means something
different on each side.

The failure is also quieter here. `String.slice` does not throw on an
out-of-range offset — it returns an empty right value, `splitText`
treats the split as a no-op, and the edit lands at the wrong position
with nothing logged.

## Tasks

- [x] Add regression tests that reproduce the corruption
      (`test/unit/document/crdt/tree_duplicate_id_test.ts`)
- [x] `CRDTTree.registerNode`: keep a live node over a tombstone, and
      route every `nodeMapByID.put` through it
- [x] `CRDTTree.purge`: remove only the entry the purged node holds
- [x] `CRDTTree.dropDuplicateContents`: drop content that reuses an ID
      from another change, keep content this change issued
- [x] `splitText`: throw `ErrInvalidArgument` past the end of the node
- [x] Write the rules into `docs/design/tree-node-id-identity.md`
- [x] `pnpm lint`, `pnpm sdk build`, unit suite, integration suite

## Follow-ups

- The origin is still here: reverse every deletion the restore path can
  express through it. Fresh IDs for the copies would stop the collision
  but keep the copy-based model, which duplicates content when undo
  ranges overlap. Until then these rules only contain it, and an undo
  that took the copy path no longer restores its text.
- Element splits simulate the delimiters the client consumed instead of
  replaying them, so ordinary editing can still issue two nodes one ID.
  That is why `dropDuplicateContents` has to keep same-change content,
  and why "one node per ID" is a goal rather than an invariant.
- Documents that already carry duplicate IDs keep them. They load, but
  nothing removes the duplicates.
