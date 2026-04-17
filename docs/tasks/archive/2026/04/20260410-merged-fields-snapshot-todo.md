**Created**: 2026-04-10

# Mirror JS SDK merge fields snapshot encoding

Port the Go-side fix from [yorkie-team/yorkie#1729](https://github.com/yorkie-team/yorkie/pull/1729)
to the JS SDK so snapshot roundtrip preserves the merge-time causal
state needed by Fix 3 (redirect), Fix 4 (mergedInto), Fix 5
(propagation) and Fix 8 (SplitElement VV check).

## Background

The JS SDK `CRDTTreeNode` currently mirrors the original Go design
with four runtime-only merge fields: `mergedInto`, `mergedChildIDs`,
`mergedFrom`, `mergedAt`. Because none of them are written to the
snapshot encoding, a JS replica that loads the document from a
server-built snapshot between a remote merge and a concurrent op
silently drops the insert (or makes a wrong split-skip decision).
The Go PR lands three commits:

1. Persist `MergedFrom` in proto, add `rebuildMergeState` on load.
2. Simplify: drop `mergedChildIDs`, derive from target children.
3. Persist `MergedAt` (required because `source.removedAt` is mutable
   under LWW and cannot substitute for the merge-time ticket).

This task mirrors that final state into the JS SDK.

## Final design target

| Field on `CRDTTreeNode` | Storage | Set when | Read where |
|---|---|---|---|
| `mergedFrom?: CRDTTreeNodeID` | **persisted** (proto `merged_from`) | merge-time, on the moved child, immutable | rebuild, Fix 8 check, redirect scans |
| `mergedAt?: TimeTicket` | **persisted** (proto `merged_at`) | merge-time, on the moved child, immutable | Fix 8 version-vector check |
| `mergedInto?: CRDTTreeNodeID` | runtime cache | set on source parent locally or rebuilt on load | `FindTreeNodesWithSplitText` hot-path nil check + redirect |
| ~~`mergedChildIDs`~~ | **removed** | — | derived on demand from `target.children` filter |

## Plan

### Phase 1 — Proto + converter wiring

- [ ] Add `merged_from` (field 9) and `merged_at` (field 10) to
      `packages/sdk/src/api/yorkie/v1/resources.proto` `TreeNode` message
- [ ] Run `pnpm sdk build:proto` and verify `resources_pb.ts` picks up
      `mergedFrom?: TreeNodeID` and `mergedAt?: TimeTicket`
- [ ] `converter.ts` `toTreeNodes`: write `mergedFrom` and `mergedAt`
- [ ] `converter.ts` `fromTreeNode`: read `mergedFrom` and `mergedAt`

### Phase 2 — Load-time reconstruction + simplification

- [ ] Add `CRDTTree.rebuildMergeState()` method that walks the tree
      (after `nodeMapByID` is populated), looks up each moved child's
      source via `mergedFrom`, and sets `source.mergedInto` on the
      source parent. Fall back `mergedAt = source.removedAt` only when
      the loaded node has no persisted `mergedAt` (back-compat with
      snapshots written before this change).
- [ ] Call `rebuildMergeState()` from the `CRDTTree` constructor
      (`packages/sdk/src/document/crdt/tree.ts` L897) right after the
      existing `nodeMapByID` population loop.
- [ ] Remove `mergedChildIDs?: Array<CRDTTreeNodeID>` field from
      `CRDTTreeNode` and every read/write site:
    - `clone()` / `cloneText()` merge-field copies
    - `mergeNodes` Edit Step 03 `src.mergedChildIDs.push(node.id)` block
    - `propagateMergeDeletes` Edit Step 03-1 loop — rewrite to filter
      `mergeTarget.children(true)` by `mergedFrom === node.id`
    - `FindTreeNodesWithSplitText` redirect branch
      (`packages/sdk/src/document/crdt/tree.ts` L1003-1013) — same
      filter, find first child in target order

### Phase 3 — Regression tests

- [ ] Add a `CRDTTree` unit test asserting the `mergedAt` immutability
      invariant: after a merge, the moved child's `mergedAt` equals
      the merge ticket (not the source parent's later `removedAt`)
- [ ] Add a converter-level snapshot roundtrip test covering the
      `contained-merge-and-insert` convergence scenario: three
      documents (`docA` runs the merge, `docB` loads via
      `SnapshotToBytes`-equivalent, `docC` performs the concurrent
      insert) all converge to the same XML after sync
- [ ] Add a sibling `merge-and-merge` variant for Fix 4 coverage

### Phase 4 — Verification + docs

- [ ] `pnpm lint && pnpm sdk build && pnpm sdk test` — all green
- [ ] Update `docs/design/concurrent-merge-split.md` (if mirrored in
      this repo) or leave a pointer to the Go design doc
- [ ] Archive this todo + write lessons file

## Non-Goals

- ProseMirror binding changes (separate repo concern).
- React package changes.
- Devtools/MCP changes.

## Related

- Upstream Go PR: https://github.com/yorkie-team/yorkie/pull/1729
- Concurrent merge/split design: yorkie-team/yorkie `docs/design/concurrent-merge-split.md`
