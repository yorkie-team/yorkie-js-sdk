# ESM Entry via `exports` (#1334)

**Created**: 2026-10-01

Published `@yorkie-js/{sdk,react,prosemirror}` only exposed the UMD build through
`main`, so Node ESM treated it as CommonJS and named imports failed. Expose the
ES build to Node and ship a matching declaration file for each module format.

## Build output

- [x] Emit the ES bundle as `<name>.es.mjs` in the three vite configs
- [x] Copy the rolled-up `<name>.d.ts` to `<name>.d.mts` in `dts({ afterBuild })`

## Published metadata

- [x] Add `module` and conditional `exports` (`import` / `require`, each with its
      own `types`) to `publishConfig` in the three `package.json` files
- [x] Expose `./package.json` (react's test imports `@yorkie-js/sdk/package.json`)

## Verification

- [x] `scripts/verify-package-exports.mjs` (`pnpm verify:exports`): pack with
      `pnpm pack`, install the tarballs in a consumer outside the workspace, load
      as ESM and CJS, type-check `.mts` / `.cts` under NodeNext, run ATTW
- [x] Passes on Node 20.19.0, 22.23.2 and 24.1.0
- [x] No `.es.js` or `@yorkie-js/sdk/<subpath>` consumers outside workspace aliases
- [x] `pnpm verify:fast` passes on Node 22 (what CI uses)
- [x] On Node 24, `offline_persist_sync_test` and `persist_disabled_test` fail with
      "already open in another tab"; the same happens on `main` without this
      change, and both pass on Node 22

## Follow-ups

- [ ] prosemirror's rolled-up `.d.ts` imports `../../sdk/src/yorkie.ts`, which does
      not resolve for consumers (ATTW `InternalResolutionError`). Pre-existing and
      independent of this change; the script skips that one rule for prosemirror.
- [ ] Run `verify:exports` in CI
