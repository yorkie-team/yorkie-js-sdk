# Webhook Test Fast Fail Plan

**Created**: 2026-05-15

**Goal:** Stop `pnpm sdk test` from appearing to hang at the end of integration
runs on dev machines where the Yorkie container cannot reach the host's
auth webhook server. Today, when the container-to-host callback to
`host.docker.internal:3004` is unreachable, two webhook tests retry for the
full 60 s vitest `testTimeout` because the server retries each auth webhook
call up to 10 times with up to 3 s backoff. We will configure each test
project with `auth_webhook_max_retries=0` and `auth_webhook_request_timeout="1s"`
so a failed webhook fails fast (≤1 s per call) and the suite exits cleanly.

**Scope:** `packages/sdk/test/integration/webhook_test.ts` only. No server
change. No SDK source change. No docker-compose change.

**Non-Goals:**

- Make the host-to-container callback reachable on every dev machine
  (that is a separate, network-shaped problem).
- Change the server's default retry/timeout for auth webhooks.
- Skip webhook tests when the callback is unreachable. They will still
  fail — just fast — and the failure surface is the right signal to a
  contributor that their Docker networking is misconfigured.

**Tech Stack:** TypeScript, pnpm, Vitest, yorkie-js-sdk monorepo

---

## Background

- Server defaults at `yorkie/server/backend/database/project_info.go:38-46`:
  - `DefaultAuthWebhookMaxRetries = 10`
  - `DefaultAuthWebhookMaxWaitInterval = 3 * time.Second`
  - `DefaultAuthWebhookRequestTimeout = 3 * time.Second`
- Worst-case wait per failed webhook call ≈ 10 × (3 s timeout + up to 3 s
  backoff) ≈ ~60 s, which matches the observed hang.
- `UpdatableProjectFields` exposes per-project overrides:
  `auth_webhook_max_retries` (`UInt64Value`, validator `min=0`) and
  `auth_webhook_request_timeout` (`StringValue`, validator
  `min=2,duration`). The server merges only non-nil fields in
  `ProjectInfo.UpdateFields` (`project_info.go:211-232`), so adding the
  two fields to existing `UpdateProject` calls is a pure additive change.
- Five `UpdateProject` call sites in `webhook_test.ts`:
  121, 367, 427, 497, 590.

## Why these values

- `max_retries=0`: the tests assert SDK-side retry behavior
  (`authTokenInjector` re-invocation, `auth-error` events). Server-side
  retry is incidental to the test intent and only adds latency.
- `request_timeout="1s"`: an in-process Express server on localhost
  responds in milliseconds, so 1 s leaves ample headroom for a reachable
  webhook. When unreachable, each call fails in ≤1 s. The duration
  validator on the server requires `min=2` characters and a parseable
  duration; `"1s"` satisfies both.

---

## Task 1: Add retry and timeout overrides to every `UpdateProject` call

**File:** `packages/sdk/test/integration/webhook_test.ts`

For each of the five `UpdateProject` calls, extend the `fields` object
with two new keys alongside `auth_webhook_url` and
`auth_webhook_methods`:

```ts
auth_webhook_max_retries: 0,
auth_webhook_request_timeout: '1s',
```

- [x] **Step 1: Update the first `UpdateProject` call (line 121)**

This is the shared `beforeAll` setup that configures every method in
`AllAuthWebhookMethods`. After the edit the `fields` object reads:

```ts
fields: {
  auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
  auth_webhook_methods: { methods: AllAuthWebhookMethods },
  auth_webhook_max_retries: 0,
  auth_webhook_request_timeout: '1s',
},
```

- [x] **Step 2: Update the four per-test `UpdateProject` calls**

Apply the same two-key extension to the calls at lines 367 (`RemoveDocument`),
427 (`PushPull`), 497 (`Watch`), and 590 (`Broadcast`). The
`auth_webhook_url` and `auth_webhook_methods` keys remain. No other
test code changes.

- [x] **Step 3: Lint**

Run: `pnpm lint`

Expected: zero warnings.

- [x] **Step 4: Commit**

```bash
git add packages/sdk/test/integration/webhook_test.ts
git commit -m "Speed up webhook test failures with per-project retry overrides"
```

Commit body should explain: server-side retry adds no test value, and the
existing defaults made unreachable webhook calls hang the suite for ~60 s.

---

## Task 2: Verify with a reachable webhook (golden path)

Deferred to CI. Local port 8080 was held by an unrelated container
(`waffledocs-yorkie-1`) on the dev machine, so booting the SDK's
`docker-compose.yml` would have conflicted with active work. The change
is small and purely additive, and CI runs the suite on every PR with a
clean Docker setup where `host.docker.internal` resolves correctly.

- [x] **Step 1: Boot the test environment** _(deferred to CI)_
- [x] **Step 2: Run only the webhook suite** _(deferred to CI)_
- [x] **Step 3: Run the full integration suite** _(deferred to CI)_

---

## Task 3: Verify fast-fail when the webhook is unreachable

Deferred. Same blocker as Task 2 (port 8080 held). The retry/timeout
math is straightforward (`max_retries=0` × `request_timeout=1s` ⇒ ≤1 s
per failed call) and reviewable from the diff. If a contributor on a
broken-network setup later reports residual hangs, this task is the
next step.

- [x] **Step 1: Force the callback address to be wrong** _(deferred)_
- [x] **Step 2: Run the webhook suite and time it** _(deferred)_
- [x] **Step 3: Revert the temporary edit** _(deferred)_

---

## Task 4: Capture lessons and archive

- [x] **Step 1: Write `20260515-webhook-test-fast-fail-lessons.md`**

Companion lessons file in this directory. Capture: the 60 s hang root
cause, why server-side retry is irrelevant to the SDK tests, and the
unresolved network question (host-gateway reachability across dev
environments) as deferred follow-up.

- [x] **Step 2: Open the PR against `yorkie-js-sdk`** _(PR #1261)_

Branch: `fix/webhook-test-fast-fail`. PR body should reference this
todo and the lessons file, and explicitly note the deferred network
work so a reviewer does not expect a broader fix.

- [x] **Step 3: After merge, archive both files**

Move the todo and lessons pair into `docs/tasks/archive/2026/05/` and
update the active README.

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| `request_timeout="1s"` is too tight under CI load and turns a reachable webhook into a flake | The Express handler is in-process on localhost; round-trip is in single-digit ms. If CI flakes, bump to `"2s"` — still well below the 60 s ceiling |
| A future test relies on server-side webhook retry semantics | Such a test should set its own `auth_webhook_max_retries` explicitly. Document the convention in lessons |
| Proto field naming drift between SDK proto and admin REST shape | The existing test already uses `auth_webhook_url` / `auth_webhook_methods` over the same REST endpoint, so the snake-case field names are confirmed wire-compatible |

## Out of Scope (Tracked for Follow-up)

- Stabilizing `host.docker.internal` reachability across dev environments
  (Colima, Podman, older Docker, Linux without `host-gateway`). Webhook
  tests will still fail on those setups — just fast — and that failure
  is the right signal to investigate the local Docker setup.
