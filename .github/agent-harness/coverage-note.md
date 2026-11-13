## What the mechanical lanes cover on this branch

These run on this PR and must pass before it can be promoted. A finding whose
whole content is "this would fail CI" costs a review round and tells the author
nothing they were not about to be told anyway.

ENFORCED — you may rely on these:
- `pnpm lint:check`: eslint with zero warnings allowed over the repository
  except examples/ and the vendored scripts/agent — typescript-eslint's
  non-type-checked `recommended` set, `prettier/prettier` as an error
  (formatting of linted source is covered; markdown, JSON and YAML are not),
  and in TypeScript files `jsdoc/require-jsdoc` on classes and non-private
  methods plus the naming-convention, no-null-type and generic-array-type
  rules in `eslint.config.mjs` (jsdoc and no-null-type are off under
  packages/sdk/test).
- `tsc` inside `pnpm sdk build` (src and test), `pnpm react build`,
  `pnpm prosemirror build`, `pnpm schema build` and `pnpm devtools
  typecheck`; `pnpm build:examples` builds every example.
- `pnpm verify:exports` on Node 20, 22 and 24: the packed sdk, react and
  prosemirror tarballs load as ESM and CJS from one SDK copy, bundle with
  Vite SSR and esbuild, type-check under NodeNext and bundler resolution,
  and pass ATTW.
- The SDK's whole vitest suite, unit and integration, with coverage, against a
  real Yorkie server and MongoDB from `docker/docker-compose-ci.yml`; the
  prosemirror, react and schema vitest suites; `node --test` over
  scripts/test.
- `node scripts/verify-license.mjs`: every source file under packages/*/src,
  packages/*/test and scripts/ (except the vendored scripts/agent) must open
  with a comment carrying the Apache 2.0 grant clause.
- `node scripts/verify-doc-links.mjs`: a markdown link reachable from
  CLAUDE.md, AGENTS.md or README.md must resolve on disk.
- No path filter: all of the above runs on every PR against main,
  documentation-only ones included.

NOT ENFORCED BY ANYTHING — a real finding here is worth MORE than one the lanes
above would have caught, because nothing else in the pipeline will catch it:
- Type-aware lint: no-floating-promises, no-misused-promises and the rest of
  `recommendedTypeChecked` are not configured. An unawaited promise passes.
- Lint of examples/ (the root eslint ignores it) and tests of any example.
- Generated-code freshness. No lane regenerates `*_pb.ts` or the ANTLR
  output, so a hand edit there is caught by nothing.
- Compatibility with any Yorkie server but `yorkieteam/yorkie:latest`.
- Coverage. It is uploaded, and both Codecov status checks are off.
- Performance. `pnpm sdk test:bench` runs with no threshold.
- Whether a passing test asserts anything. The lanes prove the suite is GREEN,
  never that it is ADEQUATE — a test that asserts nothing passes just as loudly.
