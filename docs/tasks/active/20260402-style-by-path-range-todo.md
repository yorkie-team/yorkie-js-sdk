**Created**: 2026-04-02

# Add range-based styleByPath and removeStyleByPath

Related issue: https://github.com/yorkie-team/yorkie-js-sdk/issues/1197

## Summary

Overload `styleByPath` to support both single-path and range signatures.
Add new `removeStyleByPath` with range signature. The CRDT layer is unchanged —
the JSON layer converts paths to positions via `pathToPos` and delegates to the
existing `style`/`removeStyle` operations.

## Tasks

- [ ] Overload `styleByPath`: support both `(path, attrs)` and `(fromPath, toPath, attrs)`
      in `packages/sdk/src/document/json/tree.ts`
- [ ] Add `removeStyleByPath(fromPath, toPath, keys)` to the same file
- [ ] Add integration tests in `packages/sdk/test/integration/tree_test.ts`
- [ ] Verify existing single-path `styleByPath` tests still pass
- [ ] Verify `pnpm lint && pnpm sdk build && pnpm sdk test` passes
