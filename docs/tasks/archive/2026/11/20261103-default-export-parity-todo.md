**Created**: 2026-11-03
Tracked as #1519

# Restore the full default export lost with the exports map in 0.7.26

## Problem

`import yorkie from '@yorkie-js/sdk'` changed shape in v0.7.26 for every
consumer that is not Vite/Rollup. Before the `exports` map (#1431) only
`main: ./dist/yorkie-js-sdk.js` was published, and Node, esbuild and webpack
ignore the `__esModule` flag that the UMD sets: they took the whole
`module.exports` as the default, so the default carried every named export.
With the `exports` map those consumers now resolve the ES or Node entry and
get the 14-member object literal in `packages/sdk/src/yorkie.ts`, so
`yorkie.SyncMode`, `yorkie.DocEventType`, `yorkie.YorkieError` and the rest
read `undefined`.

## Plan

- [x] Build the default object in `packages/sdk/src/yorkie.ts` from the
      module's runtime named exports, so UMD, ES and Node entries agree and
      Vite users gain the members instead of anyone losing them. Keep the
      current 14 members.
- [x] Leave `scripts/node-esm-entry.mjs`'s `export default cjs.default` as
      is — it then forwards the complete object.
- [x] Pin the default against the named exports in a unit test
      (`packages/sdk/test/unit/yorkie_test.ts`), so `pnpm verify:fast`
      catches drift on every commit.
- [x] Pin it on the packed tarball too, in
      `scripts/verify-package-exports.mjs`: under Node ESM, Node `require`
      and from the browser ES build, for every packed package that has a
      default export (react and prosemirror have none, so the check is a
      no-op there and stays correct if they gain one).
- [x] CHANGELOG: an Unreleased `Fixed` entry, and a known-issue note on
      v0.7.26.

## Out of scope

- The `globalThis.yorkie` shim in `yorkie.ts`. It is a separate TODO in the
  source and no consumer reported a missing member through it.
- Adding a default export to `@yorkie-js/react` or `@yorkie-js/prosemirror`.
  Neither has ever had one; the issue only asks that they be checked.

## Verification

- `pnpm verify:fast`
- `pnpm verify:exports` (not run here: it packs tarballs and installs them
  from the network; CI runs it on the PR)
