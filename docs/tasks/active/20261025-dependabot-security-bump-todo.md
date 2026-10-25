# Dependabot Security Bump (2026-10)

**Created**: 2026-10-25

Resolve the 91 open Dependabot alerts on `yorkie-team/yorkie-js-sdk`. Same
shape as #1348: bump direct dependencies where the vulnerable package is
declared, pin transitive ones through bounded root `pnpm.overrides`, and fix the
two npm sub-projects (`scripts/agent`, `scripts/fixtures/package-exports`)
through their own lockfiles.

None of the alerts reach a published package at runtime. `@yorkie-js/sdk`
ships only `@bufbuild/protobuf` and `@connectrpc/*`; every `packages/sdk` path
in the alert list is a devDependency (express, axios, typedoc), and
`prosemirror-view` is a peer of `@yorkie-js/prosemirror`.

## Direct dependency bumps

- [x] `next` / `eslint-config-next` 16.3.5 → 16.4.3 in the three
      `examples/nextjs-*` (3 critical RCEs, SSRF, DoS, cache poisoning)
- [x] `vite` ^7.3.6 → ^7.3.7 everywhere (launch-editor, `server.fs.allow`)
- [x] `vitest` + `@vitest/coverage-*` ^4.1.11 → ^4.1.12 (`@vitest/mocker`)
- [x] `prosemirror-view` devDependency → ^1.42.8 (paste XSS), with
      `prosemirror-model` → ^1.25.12 so only one model copy is installed

## Transitive overrides

- [x] Raise the existing `body-parser`, `brace-expansion` (×3), `devalue`,
      `follow-redirects`, `markdown-it`, `sharp` entries to the new patched
      versions
- [x] Add `fast-uri`, `pbkdf2`, `proxy-addr`, `source-map-js`, `vue`, `zod`,
      each bounded to the advisory's own major
- [x] `vue@<3.5.42` rather than `@vue/server-renderer`: plasmo's
      `@plasmohq/parcel-transformer-vue` pins `vue@3.3.4`, and the renderer must
      match the `vue` version it ships with

## npm sub-projects

- [x] `scripts/agent`: `zod` 4.4.3 → 4.6.7, `fast-uri` override → ^3.1.9,
      `npm audit fix` for `@modelcontextprotocol/sdk`, `hono`, `proxy-addr`,
      `ip-address`, `body-parser`. `@anthropic-ai/claude-agent-sdk` stays at
      0.3.217 to match yorkie's vendored copy.
- [x] `scripts/fixtures/package-exports`: `vite` 7.3.7, `prosemirror-view`
      1.42.3, `prosemirror-model` 1.25.12. Lockfile regenerated with npm 11,
      which wrote the original.

## Verification

- [x] `pnpm i --frozen-lockfile`
- [x] `pnpm lint:check` (excluding the untracked local `.claude/worktrees/`)
- [x] `pnpm verify:license`, `verify:doc-links`, `test:scripts` (119 passed)
- [x] Unit suites: sdk 1159 passed, prosemirror 274, react 104, devtools 20,
      schema 40
- [x] `pnpm build:packages`, `pnpm build:examples`, `pnpm verify:exports`
- [x] `scripts/agent`: `npm test` 989 passed, `npm audit` 0
- [x] `scripts/fixtures/package-exports`: `npm audit` 0
- [ ] SDK integration suite against a server — left to CI; no matching local
      server was running

## Known unfixable / deliberately left

- `elliptic <= 6.6.1`, `quill = 2.0.3`, `http-cache-semantics <= 4.2.0`: no
  patched release; dev- or example-only
- `@parcel/reporter-dev-server`: plasmo 0.90.5 pins `@parcel/core@2.9.3`
  (see the 2026-09 bump)
- `braces <= 3.0.3`: the advisory was withdrawn; dismiss the alert

## Review

`pnpm audit` went from 56 advisories (4 critical) to 4, none critical and none
fixable. The two npm sub-projects audit clean.

The one surprise was `prosemirror-view` 1.42.x requiring
`prosemirror-model ^1.25.8`: bumping the view alone installed a second model
copy, and `tsc` rejected passing a `Node` between the two. The fixture hit the
same thing.
