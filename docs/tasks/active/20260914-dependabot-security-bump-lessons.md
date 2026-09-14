# Dependabot Security Bump — Lessons

**Created**: 2026-09-14

## Always bound a pnpm override to the target major

The overrides inherited from #1240 were written as open-ended ranges:

```json
"yaml@<1.10.3": ">=1.10.3"
```

pnpm resolves an override to the **highest version satisfying the replacement
range**, ignoring what the parent originally asked for. So `>=1.10.3` did not
mean "the nearest patched 1.x" — it meant "whatever `yaml@latest` is", and the
tree silently jumped `yaml@1.x → 2.8.2`. Three concrete failures came out of
that pattern in this task:

- `yaml@<1.10.3: ">=1.10.3"` → landed on 2.8.2, which is inside the *newer*
  `yaml >=2.0.0 <2.8.3` advisory. The override was manufacturing the next alert.
- `brace-expansion@<1.1.16: ">=1.1.16"` → gave `minimatch@3.1.5` (which declares
  `^1.1.7`) a `brace-expansion@5.0.5`, a different major with a different API.
- `diff@>=4.0.0 <4.0.4: ">=4.0.4"` → gave `ts-node` (which declares `^4.0.1`) a
  `diff@8.0.2`, again inside another open advisory.

The first `pnpm audit` after the bump still showed 15 advisories, and most were
self-inflicted this way. Bounding every entry to its own major closed 10 of
them without touching a single direct dependency:

```json
"yaml@<1.10.3": ">=1.10.3 <2.0.0",
"yaml@>=2.0.0 <2.8.3": ">=2.8.3 <3.0.0"
```

**Rule**: an override's replacement range must stay inside the major that the
advisory patched. One advisory range → one override entry → one major.

## Two exceptions where the bound must be relaxed

- `esbuild@<=0.24.2`: bounding it to `<0.26.0` broke an *unrelated* peer
  declaration, because pnpm applies overrides to `peerDependencies` too. A
  package peer-depending on esbuild had its peer range rewritten to
  `>=0.25.0 <0.26.0` while the installed esbuild was 0.28.2. Left open-ended.
- `@humanfs/node@<0.16.8`: the patched release is on the 0.16 line, but 0.17.0
  requires Node >=24 and `pnpm i` hard-failed with `ERR_PNPM_UNSUPPORTED_ENGINE`
  on the repo's Node 22. Pinned to `<0.17.0`.

Both were caught by `pnpm i` / the peer-warning output, not by audit. Read the
install output, not just the exit code.

## Not every alert is fixable by an override

`@parcel/reporter-dev-server` has a patched 2.16.4, but plasmo 0.90.5 pins
`@parcel/core@2.9.3`. Forcing the reporter to 2.16.4 installed fine and even
printed `🟢 DONE`, yet the build log carried a `ThrowableDiagnostic`:

```
The plugin "@parcel/reporter-dev-server" is not compatible with the current
version of Parcel. Requires "^2.16.4" but the current version is "2.9.3".
```

Parcel degraded instead of failing, so the exit code stayed 0. Grepping build
output for `error` mattered more than the exit status. The override was dropped.

## Verifying: grep the build log, and clear `.plasmo` first

`pnpm lint` failed with 7 errors in `packages/devtools/.plasmo/static/...`.
That directory is a plasmo build artifact — gitignored, but *not* in the ESLint
ignore list — so it only exists after `pnpm devtools build`. CI never sees it.
Run `rm -rf packages/devtools/.plasmo` before linting locally, or the failure
looks like a regression from the dependency bump.

## A bare `pnpm sdk test` can hang forever locally

`packages/sdk/vitest.config.ts` sets:

```ts
testTimeout: isCI ? 5000 : Infinity,
```

Locally `CI` is unset, so a test that blocks — on a server response, an
unresolved promise, anything — stalls the whole run with nothing to kill it.
Two runs sat at ~0% CPU for 75 and 89 minutes before this was noticed, and a
vitest process from an *earlier session that day* had been hung for 11 hours in
the same checkout. The suite finishes in **60 seconds** when it doesn't stall.

Verify with the same semantics CI uses:

```sh
cd packages/sdk && CI=true npx vitest run
```

That run passed 81 files / 3009 tests, so nothing legitimately needs more than
the 5s timeout — the local stall is intermittent, not a slow test.

Diagnostic mistakes worth not repeating:

- Piping to `tail -30` meant zero output until the process ended, so there was
  nothing to read while it hung. Redirect to a file instead and tail the file.
- `cmd; echo "EXIT=$?"` makes the shell's exit status that of the `echo`. The
  harness dutifully reported "exit code 0" for a run that had failed. Record the
  real status inside the log and read it back.
- A second test run was started while the first was still alive, so two suites
  were hitting the same server. Kill stale `vitest` processes before re-running.
- `--reporter=basic` no longer exists in vitest 4 and fails with `ERR_LOAD_URL`
  before any test executes.

## See Also

- [20260914-dependabot-security-bump-todo.md](20260914-dependabot-security-bump-todo.md) — the plan and results for this bump
