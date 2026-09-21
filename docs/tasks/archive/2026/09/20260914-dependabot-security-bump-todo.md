# Dependabot Security Bump (2026-09)

**Created**: 2026-09-14

Resolve the 84 open Dependabot alerts on `yorkie-team/yorkie-js-sdk`.
Follows the same shape as #1240: bump direct dependencies where the
vulnerable package is declared, and pin transitive ones through the root
`pnpm.overrides` block.

## Direct dependency bumps

- [x] `next` / `eslint-config-next` 16.2.6 → 16.3.5 in the three `examples/nextjs-*`
      (2 critical RCEs, 8 high/medium in 16.2.x)
- [x] `axios` ^1.17.0 → ^1.20.0 in `packages/sdk` (7 alerts, patched at 1.18.0)
- [x] `vite` ^7.3.2 → ^7.3.6 everywhere (patched at 7.3.5)
- [x] `vitest` + `@vitest/coverage-*` ^4.1.8 → ^4.1.11
      (also closes the `@vitest/mocker` path-traversal alert)

## Transitive overrides

Add to the root `pnpm.overrides`, one entry per advisory range:

- [x] `@babel/core`, `@humanfs/node`, `@isaacs/brace-expansion`, `ajv`,
      `baseline-browser-mapping`, `bn.js`, `body-parser`, `brace-expansion`,
      `browserslist`, `devalue`, `diff`, `esbuild`, `fflate`, `form-data`,
      `immutable`, `js-yaml`, `linkify-it`, `markdown-it`, `minimatch`,
      `nanoid`, `postcss`, `qs`, `rollup`, `sharp`, `svelte`, `svgo`, `tsup`, `ws`
- [x] Widen the existing `esbuild`, `postcss`, `svelte` entries — their old
      ranges no longer cover the current advisories
- [x] Bound every replacement range to the advisory's own major. The inherited
      open-ended entries were resolving across majors and landing on *other*
      open advisories — see the lessons file.
- [x] Add `yaml@>=2.0.0 <2.8.3`, which the old unbounded `yaml@<1.10.3` entry
      had created by pushing yaml 1.x up to 2.8.2

## Verification

- [x] `pnpm i` resolves without peer-dependency errors
- [x] `pnpm lint`
- [x] `pnpm build:packages`
- [x] `pnpm build:examples`
- [x] `pnpm sdk test` against a local server — 81 files, 3009 passed,
      10 skipped, 1 todo, 60.6s. Must be run as `CI=true vitest run`; see below.
- [x] `pnpm audit` reports no remaining fixable advisories

## Known unfixable

No patched release exists for these, and all three are dev/example-only:

- `elliptic <= 6.6.1` — via `vite-plugin-node-polyfills` (`packages/schema`, dev)
- `image-size <= 2.0.2` — via `vite` (dev)
- `quill = 2.0.3` — direct dep of `examples/vanilla-quill`, 2.0.3 is latest

## Deliberately not overridden

- `@parcel/reporter-dev-server >=1.6.1 <=2.16.3` (moderate). A patched 2.16.4
  exists, but plasmo 0.90.5 pins `@parcel/core@2.9.3`, and forcing the reporter
  forward makes the devtools build emit
  `The plugin "@parcel/reporter-dev-server" is not compatible with the current
  version of Parcel`. Parcel degrades rather than failing, so the exit code stays
  0 while the plugin is dropped. Revisit when plasmo moves to Parcel 2.16.

## Review

`pnpm audit` went from 84 open Dependabot alerts to 5, with **0 critical and 0
fixable** remaining — the 5 are the four no-patch-available packages above plus
the Parcel reporter we chose to leave.

The interesting part was not the bump itself but the inherited override style.
Writing `"yaml@<1.10.3": ">=1.10.3"` reads like "take the nearest patched 1.x",
but pnpm resolves it to the highest version satisfying the *replacement* range,
so it silently became yaml 2.8.2 — itself inside a newer advisory. The same
pattern had given `minimatch@3.1.5` a `brace-expansion@5.0.5` and `ts-node` a
`diff@8.0.2`. After the first pass 15 advisories were still open; bounding each
replacement range to the advisory's own major closed 10 of them with no further
dependency changes.

Two entries must stay unbounded or loosely bounded, both found through `pnpm i`
output rather than audit: `esbuild@<=0.24.2` (pnpm rewrites `peerDependencies`
too, so a bound there broke an unrelated peer) and `@humanfs/node` (0.17.0
requires Node >= 24, which fails the repo's Node 22).
