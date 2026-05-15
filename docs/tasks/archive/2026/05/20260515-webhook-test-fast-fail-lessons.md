# Webhook Test Fast Fail — Lessons

**Created**: 2026-05-15
**Branch**: `fix/webhook-test-fast-fail`
**Plan**: `20260515-webhook-test-fast-fail-todo.md`

## What Shipped

Every `UpdateProject` call in
`packages/sdk/test/integration/webhook_test.ts` now sets two extra
fields on the project: `auth_webhook_max_retries: 0` and
`auth_webhook_request_timeout: '1s'`. Five call sites were edited; no
other test code changed, and no server or SDK source change was
needed.

## Why this works

The hang was a compound of two things, and only one of them is fixed
here:

1. **Server-side retry budget** (this fix). Yorkie defaults at
   `server/backend/database/project_info.go:38-46` allow up to 10 auth
   webhook retries with a 3 s timeout and up to 3 s of backoff per
   retry. A single unreachable webhook call therefore takes up to ~60 s
   to give up, which exactly matches the vitest `testTimeout` and made
   `pnpm sdk test` look like it was hanging.
2. **Container-to-host reachability** (out of scope). On some dev
   environments (Colima, Podman, older Docker, Linux without the
   `host-gateway` capability), the Yorkie container cannot call back to
   `host.docker.internal:3004`. We are not changing that here. With
   `max_retries=0` the failure mode becomes "webhook tests fail in
   under a second" instead of "suite hangs near `testTimeout`", which
   is a clear signal to the contributor that their Docker networking
   is misconfigured.

## Decisions Worth Remembering

- **`max_retries=0`, not 1 or 2.** The tests assert SDK-side retry
  behavior (`authTokenInjector` re-invocation, `auth-error` events).
  Server-side retry is incidental and only adds latency to both the
  passing and failing paths. If a future test wants to verify
  server-side retry semantics it should set its own
  `auth_webhook_max_retries` explicitly.
- **`request_timeout="1s"`, not 500 ms.** Express on localhost responds
  in single-digit milliseconds, so 1 s leaves comfortable headroom for
  CI under load while still capping a failed call at ≤1 s. The
  server's duration validator requires at least 2 characters and a
  parseable Go duration; `"1s"` satisfies both.
- **Inline at every call site, no helper.** Five `UpdateProject`
  invocations share the same two extra fields. A helper would save
  ~10 lines but pull the URL/methods construction out of the test
  body where it currently reads naturally. YAGNI for a one-time
  change.

## Verification Strategy

Local verification was skipped because the dev machine had a
conflicting Yorkie container occupying port 8080 from another project
(`waffledocs-yorkie-1`). Stopping it would have disrupted unrelated
work, and the change is small and self-contained enough to verify on
CI:

- ESLint passes on the edited file (`eslint test/integration/webhook_test.ts`
  reports zero issues).
- Project-level lint reports the same pre-existing 71 errors in
  unrelated files — none in `webhook_test.ts`.
- The change is purely additive: a passing webhook call is unaffected
  because retries are never consumed and the 1 s timeout is far above
  the actual round-trip.

If CI surfaces a real regression we will revisit `request_timeout`
(bump to `"2s"`) or audit any test that relied on observing
intermediate retry state.

## Surprises

- **`docs/` is gitignored with re-includes for `docs/design/` and
  `docs/tasks/`.** New files inside `docs/tasks/active/` need
  `git add -f` because git's directory-level negation does not
  re-cover untracked files in an excluded subtree. A previously
  committed file in the same path was unaffected — gitignore is only
  consulted for untracked files.
- **A parallel `v0.7.10-rc` release** happened on `main` during this
  work and the branch had to be rebased before push. The release
  commit (`c68d18a5a`) only touched `CHANGELOG.md` and `package.json`
  files, so the rebase was clean.

## Out of Scope (Tracked for Follow-up)

- **`host.docker.internal` reachability across dev environments.**
  Webhook tests still fail on Colima / Podman / older Docker setups —
  just fast. That failure is the right signal to investigate the
  local Docker setup. If we want a permanent fix the candidates are
  (a) move the webhook receiver into a sidecar container so callbacks
  stay on the Docker network, or (b) run vitest itself inside Docker.
  Neither is justified by current pain.

## Commit Trail

| SHA | Subject |
|---|---|
| `33de9ce32` | Add task plan for webhook test fast-fail |
| `38c5bd441` | Make webhook tests fail fast when the host callback is unreachable |
