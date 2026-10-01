# Sync the protos with Go and harden crafted tree payloads

**Created**: 2026-09-27

Two parity gaps with the Go SDK, which is the source of truth for both the
wire format and tree semantics. Stacked on #1404, whose `findMergeNode`
exact lookup this task extends.

## Gaps

- [x] **J8. `.proto` files lag Go.** yorkie `73139d01` added
      `ChangePack.capabilities = 9`, `restore_mode = 5` on
      `Operation.Set`/`Add`/`ArraySet`, `revived_at` on every `JSONElement`
      subtype, and `channel_session_ttl` on `Project` /
      `UpdatableProjectFields`, plus comments. Copy Go's `resources.proto`
      and `yorkie.proto` verbatim and regenerate with `pnpm sdk build:proto`.
      The fields are dormant in Go (no converter reads or writes them), so
      the JS converter does not either.
- [x] **J7a. Merge pointers resolve by exact element ID.** yorkie `96bcb779`
      resolves every merge-lineage read through `findMergeNode`:
      `rebuildMergeState` (plus a text-parent guard), `resolveMergeTarget`,
      `mergeNodes`, `propagateMergeDeletes` and the §1.1 redirect. JS still
      uses `findFloorNode` at those five sites.
- [x] **J7b. TreeEdit content drops engine-only state.** Go
      `FromTreeNodesWhenEdit` rejects an empty content group, and clears
      `insPrev`/`insNext`, `mergedFrom`/`mergedAt`/`mergedInto` and every
      tombstone on the content. JS drops only the split links and pushes
      `undefined` for an empty group.

## Plan

1. J8: sync the protos, regenerate, `pnpm verify:fast`. One commit.
2. J7a: Red tests mirroring Go's `tree_merge_lineage_test.go` (forged offset,
   text node, genuine lineage), then the five call sites. One commit.
3. J7b: Red tests mirroring Go's `tree_content_tombstone_test.go` and
   `tree_edit_content_missing_test.go` plus a crafted `mergedFrom`, then
   `dropEngineOnlyLinks` / `clearTombstones` and the empty-group error.
   One commit.
4. Full `pnpm sdk test` against a local server; self-review (max 3 rounds);
   open the PR against `fix/tree-convergence-go-ports`.

## Review

- J8: both `.proto` files are byte-identical to yorkie `origin/main`; the
  only differences were the additive fields above and comments. JS carries
  no copy of `admin.proto` or `cluster.proto`, so nothing else to sync.
  yorkie's converter references none of the new fields (`restore_mode` is
  read only on `Edit`/`TreeEdit`, which JS already had), so neither does JS.
- J7a: 8 cases in `tree_merge_lineage_test.ts`; 7 were Red before the fix
  (the genuine-lineage case passes on both sides by design). The §1.1
  redirect case threw `Text node cannot have children`.
- J7b: 4 cases in `tree_edit_content_sanitize_test.ts`; tombstone, lineage
  and empty-group were Red; split links already passed.
- `pnpm verify:fast` green on every commit; `pnpm sdk test` against
  `yorkieteam/yorkie:latest`: 104 files, 3266 passed, 15 skipped.
- Not ported from 96bcb779: the `GCPairs` root guard (JS books a pair for
  a removed root, but its `purge` uses `node.parent?.` so it cannot crash)
  and `NormalizeStoredOperations` (server-only replay path).
