# Sync the protos with Go and harden crafted tree payloads

**Created**: 2026-09-27

Two parity gaps with the Go SDK, which is the source of truth for both the
wire format and tree semantics. Stacked on #1404, whose `findMergeNode`
exact lookup this task extends.

## Gaps

- [ ] **J8. `.proto` files lag Go.** yorkie `73139d01` added
      `ChangePack.capabilities = 9`, `restore_mode = 5` on
      `Operation.Set`/`Add`/`ArraySet`, `revived_at` on every `JSONElement`
      subtype, and `channel_session_ttl` on `Project` /
      `UpdatableProjectFields`, plus comments. Copy Go's `resources.proto`
      and `yorkie.proto` verbatim and regenerate with `pnpm sdk build:proto`.
      The fields are dormant in Go (no converter reads or writes them), so
      the JS converter does not either.
- [ ] **J7a. Merge pointers resolve by exact element ID.** yorkie `96bcb779`
      resolves every merge-lineage read through `findMergeNode`:
      `rebuildMergeState` (plus a text-parent guard), `resolveMergeTarget`,
      `mergeNodes`, `propagateMergeDeletes` and the §1.1 redirect. JS still
      uses `findFloorNode` at those five sites.
- [ ] **J7b. TreeEdit content drops engine-only state.** Go
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

(filled in at the end)
