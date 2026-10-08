# ESM Entry via `exports` (#1334)

**Created**: 2026-10-01
Fixes #1334

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
      CJS build (the UMD bundle; react's own `.cjs`), and other import
      resolvers retain the actual ES bundle
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

## Review follow-ups (#1431)

- [x] Make the sdk wrapper pick module.exports whether the importer hands it over
      whole (Node, esbuild, webpack) or honours `__esModule` (Rollup, Vite SSR
      `noExternal` left `converter` and the default export undefined)
- [x] Unit-test `nodeEsmEntry` in `scripts/test`, so CI covers the generator
- [x] Bundle the tarballs with Vite SSR and esbuild in `verify:exports`
- [x] Type-check under `moduleResolution: bundler` and assert the plain `.d.mts`
      twins are the declarations it loads
- [x] Add a trailing `default` condition (the UMD build) to the exports maps
- [x] Fail when a tarball is missing, install with `--ignore-scripts`, pin ATTW
- [x] Updated verification passes on Node 20.19.0, 22.23.2, 24.1.0 and 24.21.0
- [x] Keep `@yorkie-js/sdk` external in the react build (it inlined a whole SDK
      copy, so react's `Text`/`Tree`/`Counter` were foreign to the user's SDK),
      and assert in `verify:exports` that react re-exports the SDK's own values

## Review follow-ups, round 2 (#1431)

- [x] Accept only identifier export names in the generated wrapper, alias them
      onto fixed locals, and JSON-quote every generated path
- [x] Make `@yorkie-js/sdk` a react peer (and devDependency), as in
      prosemirror, so a host on another SDK version gets a peer conflict
      instead of a nested second SDK
- [x] Ship react's Node and bundler entries (`.cjs`, `.es.mjs`) with the SDK
      external, and build the script-tag UMD separately with the SDK bundled.
      `unpkg`/`jsdelivr` fields and an `unpkg` export condition keep CDNs on it
- [x] Emit the `.d.cts` for a `.cjs` entry from the generator, forwarding to
      the `.d.ts` (and its default export, if any)
- [x] Copy the `.d.mts` twins through one helper, from config-relative paths
- [x] Type-check the generated declarations with `skipLibCheck: false` in
      `scripts/test`; cover assets, multiple entries and `.cjs` entries
- [x] Install the verification consumer from a committed lockfile
      (`scripts/fixtures/package-exports`), the tarballs offline, and run its
      tools from there: no `npx`, no `overrides`
- [x] Load react's UMD in a bare `vm` context to prove it needs no SDK global
- [x] Run `verify:exports` in CI on Node 20, 22 and 24
- [x] Updated verification passes on Node 20.19.0, 22.23.2 and 24.21.0

## Follow-ups

- [ ] prosemirror's rolled-up `.d.ts` imports `../../sdk/src/yorkie.ts`, which does
      not resolve for consumers (ATTW `InternalResolutionError`). Pre-existing and
      independent of this change; the script skips that one rule for prosemirror.
- [ ] prosemirror's UMD reads the SDK from a `YorkieSdk` global, which the SDK
      UMD does not register (it registers `yorkie-js-sdk`). Pre-existing;
      renaming it would break pages that set `YorkieSdk` today.
- [ ] `@yorkie-js/schema` keeps its UMD-only `publishConfig` while
      `"type": "module"`. The sdk only uses its types.
- [ ] yorkie.dev's React guide installs only `@yorkie-js/react`. With the SDK
      now a peer, Yarn users also need `@yorkie-js/sdk` (the package README
      says so).
