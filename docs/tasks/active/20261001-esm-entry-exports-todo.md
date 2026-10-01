# ESM Entry via `exports` (#1334)

**Created**: 2026-10-01

Published `@yorkie-js/{sdk,react,prosemirror}` only exposed the UMD build through
`main`, so Node ESM treated it as CommonJS and named imports failed. Expose named
exports through a Node ESM wrapper of the existing CJS implementation, while
preserving the actual ES bundle for browser bundlers.

## Build output

- [x] Emit the ES bundle as `<name>.es.mjs` in the three vite configs
- [x] Copy the rolled-up `<name>.d.ts` to `<name>.d.mts` in `dts({ afterBuild })`
- [x] Generate `<name>.node.mjs` from the UMD entry's public exports, so Node
      import and require share implementations and constructors
- [x] Generate `<name>.node.d.mts` re-exporting the CJS declarations, so NodeNext
      consumers also share class types across ESM and CJS

## Published metadata

- [x] Add `module` and conditional `exports` (`import` / `require`, each with its
      own `types`) to `publishConfig` in the three `package.json` files
- [x] Put `node` first: Node import uses the wrapper, Node require keeps the
      UMD bundle, and other import resolvers retain the actual ES bundle
- [x] Expose `./package.json` (react's test imports `@yorkie-js/sdk/package.json`)

## Verification

- [x] `scripts/verify-package-exports.mjs` (`pnpm verify:exports`): pack with
      `pnpm pack`, install the tarballs in a consumer outside the workspace, load
      as ESM and CJS, type-check `.mts` / `.cts` under NodeNext with
      `skipLibCheck: true`, run ATTW
- [x] Verify mixed ESM/CJS in both load orders, all public export identities,
      and bidirectional Document/Text/Tree/Counter operations
- [x] Verify SDK default imports, actual API usage, cross-format class type
      assignments, and matching browser ES export names
- [x] Updated verification passes on Node 20.19.0, 22.23.2 and 24.21.0
- [x] No `.es.js` or `@yorkie-js/sdk/<subpath>` consumers outside workspace aliases
- [x] Updated `pnpm verify:fast` passes on Node 22 (what CI uses)
- [x] On Node 24, `offline_persist_sync_test` and `persist_disabled_test` fail with
      "already open in another tab"; the same happens on `main` without this
      change, and both pass on Node 22

## Follow-ups

- [ ] prosemirror's rolled-up `.d.ts` imports `../../sdk/src/yorkie.ts`, which does
      not resolve for consumers (ATTW `InternalResolutionError`). Pre-existing and
      independent of this change; the script skips that one rule for prosemirror.
- [ ] Run `verify:exports` in CI
      (left to the maintainers; no CI change in this branch)
