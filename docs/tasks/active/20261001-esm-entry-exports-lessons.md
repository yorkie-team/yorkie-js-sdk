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

Each tarball names the others by exact version, so a consumer would fetch them
from the registry. The verification consumer installs all four tarballs in one
offline `npm install`, so those names resolve to the local copies. It used
npm `overrides` at first, but an override also hides a nested second SDK,
which is the very thing the react checks look for.

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
sdk's own (it failed with `react:esm:Text` before the fix).

## Externalizing a dependency is half the fix

Marking the SDK external stopped react from inlining it, but react still listed
it under `dependencies`, which `pnpm publish` pins to an exact version. A host
on another SDK version then gets a nested second SDK under react, and the
foreign classes are back. As a peer, a mismatch fails the install (`ERESOLVE`)
instead. `verify:exports` checks both: react resolves the host's SDK, and a
repacked SDK with another version is rejected.

## Changing `main` moves what CDNs serve

react's UMD bundle was its `main`, so unpkg and jsDelivr served it for a bare
package URL. With the SDK external, that bundle would need a new SDK global,
and pointing `main` at `.cjs` would hand CDNs a file that calls `require`. So
the UMD build stays self-contained (it bundles the SDK, as before) and is named
by the `unpkg` and `jsdelivr` fields. unpkg resolves `exports` with `default`
unless an `unpkg` condition exists, so the map has one.

## Generated code is source code

The wrapper spliced export names into JavaScript. ESM allows arbitrary string
export names, so `chunk.exports` is not guaranteed to hold identifiers. Names
are now validated and aliased onto fixed locals, and paths are JSON-quoted.

## A verification consumer needs a lockfile

`npx --yes` and floating ranges ran whatever the registry served that day. The
consumer now installs from `scripts/fixtures/package-exports/package-lock.json`
and runs its tools from there. That lockfile also pins the sdk's runtime
dependencies, because the tarballs install offline, so it has to be
regenerated when those change.

## A wrapper helps only when the package's dependencies are single-format

The wrapper gives Node one implementation of the package it wraps, but the
wrapped build is CommonJS, so everything it `require`s comes in as CommonJS
too. That is harmless for the sdk (it bundles its dependencies) and for react
(`react` ships only CommonJS). prosemirror's peers ship separate ESM and CJS
builds, so wrapping its UMD loaded `prosemirror-model/dist/index.cjs` next to
the ESM copy the app imports, and `Node`/`Fragment` existed twice.

It surfaced while checking a downstream app (rmf-block) whose spike had hit
exactly that in plain Node. prosemirror's Node import now takes its ES bundle,
which imports its peers as ESM and still reaches the one SDK through the sdk's
own entry. `verify:exports` fails when a Node import loads any `prosemirror-*`
CJS build; it failed on the wrapper before the change.

Before wrapping a package, check what its build loads, not only the package.

## Review rounds

- **Panel, round 2 (c480d2fb)**: 4 blocking — unvalidated export names in the
  generated wrapper, `verify:exports` in no CI lane, the SDK as react's regular
  dependency, react's UMD no longer self-contained. All four fixed, along with
  most suggestions. Left as they were, with reasons:
  - The exact peer pin (`workspace:*`) matches prosemirror.
  - prosemirror's `YorkieSdk` global predates this change, and renaming it
    breaks pages that set it.
  - schema's `publishConfig` is out of scope.
  - The wrapper's non-live bindings are fine, because UMD exports never change
    after load.
- **Self-review before re-requesting**: 4 findings, all fixed.
  - The strict type-check test hand-wrote a `.d.cts` with a default export
    that the shipped helper never emitted, so the generator now emits it
    (dropping the line fails the test).
  - One UMD assertion compared a value with itself.
  - The task docs still said CI was unchanged and that `overrides` were in use.
  - Nothing told users to install the now-peer SDK.
- **After the round-2 reply**: checking a downstream app found prosemirror's
  Node import loading CJS copies of its peers (above). Fixed in one commit on
  top of the reply's commits, without a rebase, so the hashes it cites still
  hold.
