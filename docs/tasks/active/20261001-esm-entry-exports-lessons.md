# ESM Entry via `exports` — Lessons

**Created**: 2026-10-01

## "Node can't import it" is three problems, not one

1. **Entry selection** — nothing routed Node's `import` to the ES bundle. `module`
   is read by bundlers only; Node needs `exports.import`.
2. **Format detection** — `.es.js` in a package without `"type": "module"` is
   `.js`, so Node falls back to syntax detection (a reparse, default only from
   Node 20.19 / 22.7). A `.mjs` extension states the format outright.
3. **Types** — TypeScript assigns a module format to each declaration file under
   NodeNext, so the ESM entry needs its own `.d.mts` next to the CJS `.d.ts`.

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
