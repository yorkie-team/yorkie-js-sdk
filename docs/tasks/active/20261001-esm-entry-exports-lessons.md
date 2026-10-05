# ESM Entry via `exports` — Lessons

**Created**: 2026-10-01

## Entry selection, explicit format, and matching declarations

1. **Entry selection** — nothing routed Node's `import` to an ESM entry. `module`
   is read by bundlers only; Node needs conditional `exports`.
2. **Format detection** — `.es.js` in a package without `"type": "module"` is
   `.js`, so Node falls back to syntax detection (a reparse, default only from
   Node 20.19 / 22.7). A `.mjs` extension states the format outright.
3. **Types** — TypeScript assigns a module format to each declaration file under
   NodeNext, so ESM entries need `.d.mts` declarations.

## Node import and require must share implementations

Routing import and require to independently built ES and UMD bundles makes
two copies of SDK classes. Mixing one bundle's Document with the other's Text
or Tree fails the SDK's instanceof checks: values become ordinary JSON objects.
Testing each format in a separate process does not expose this regression.

The Node import entry is now a generated `.node.mjs` wrapper that explicitly
re-exports the UMD bundle's public values. The default SDK export is the UMD
bundle's `default` property. Both load orders and both directions of CRDT value
exchange are tested in the consumer project.

The wrapper's `.node.d.mts` re-exports the existing CJS `.d.ts` instead of copying
it, preserving TypeScript class identity as well. The `node` export condition
comes before the generic import condition; browser bundlers still receive the
actual `.es.mjs` bundle and its `.d.mts` declarations.

## A CommonJS default import means different things to Node and Rollup

A Rollup UMD build of an entry with a default export flags `module.exports`
with `__esModule`. Node, esbuild and webpack (importing from `.mjs`) ignore the
flag: `import cjs from` yields `module.exports`. Rollup, and so Vite SSR with
`ssr.noExternal`, honours it: the same import yields `module.exports.default`.
The first wrapper used a default import, so a Vite SSR bundle saw `Document`
(it is also on the default object) but lost `converter` and the default export.

The wrapper now uses a namespace import and takes `ns.default` when it still
carries `__esModule`, `ns` otherwise. Entries without a default export are not
flagged, so every tool agrees on their default import and it stays as is.

Checking plain Node alone could not catch this: the export check now bundles
the tarballs with Vite SSR and esbuild, and the generator has unit tests for
both shapes.

## Verify the `pnpm pack` tarball, not the source tree

Unit tests resolve through aliases and `src`, so a wrong published `package.json`
passes them. Only an install of the packed tarball from outside the workspace
exercises `publishConfig`. `@arethetypeswrong/cli --pack` uses `npm pack`; hand it
the `.tgz` that `pnpm pack` made, since CI publishes with pnpm.

## `pnpm pack` rewrites `workspace:*`

Consumers of the sdk tarball would fetch `@yorkie-js/schema` from the registry.
The verification script uses npm `overrides` to point it at the local tarball.

## `skipLibCheck` in the type check

The rolled-up sdk `.d.ts` has declarations that fail a full `skipLibCheck: false`
pass (TS1183 "implementation in ambient context"). That is a separate issue, so
the NodeNext check relies on resolution plus ATTW rather than lib checking.

## One implementation must hold across packages, not only across formats

Making Node `import` and `require` share one sdk build was not enough: the
react build left `@yorkie-js/sdk` out of `external`, so it inlined a whole SDK
copy and re-exported that copy's `Text`/`Tree`/`Counter`. Calling it
pre-existing did not make it out of scope, because it breaks the invariant this
change exists for. `verify:exports` now compares react's re-exports with the
sdk's own (it failed with `react:esm:Text` before the fix). Code-review on the
fix: one round, no findings.
