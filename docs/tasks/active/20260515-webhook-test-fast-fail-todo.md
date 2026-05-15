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

- [ ] **Step 1: Update the first `UpdateProject` call (line 121)**

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

- [ ] **Step 2: Update the four per-test `UpdateProject` calls**

Apply the same two-key extension to the calls at lines 367 (`RemoveDocument`),
427 (`PushPull`), 497 (`Watch`), and 590 (`Broadcast`). The
`auth_webhook_url` and `auth_webhook_methods` keys remain. No other
test code changes.

- [ ] **Step 3: Lint**

Run: `pnpm lint`

Expected: zero warnings.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/test/integration/webhook_test.ts
git commit -m "Speed up webhook test failures with per-project retry overrides"
```

Commit body should explain: server-side retry adds no test value, and the
existing defaults made unreachable webhook calls hang the suite for ~60 s.

---

## Task 2: Verify with a reachable webhook (golden path)

- [ ] **Step 1: Boot the test environment**

```bash
docker compose -f docker/docker-compose.yml up --build -d
```

- [ ] **Step 2: Run only the webhook suite**

```bash
pnpm sdk test test/integration/webhook_test.ts
```

Expected: all webhook tests pass. The change is additive — when the
webhook IS reachable, the server still gets a successful response well
within the 1 s timeout and `max_retries=0` is irrelevant.

- [ ] **Step 3: Run the full integration suite**

```bash
pnpm sdk test
```

Expected: no regression in non-webhook tests.

---

## Task 3: Verify fast-fail when the webhook is unreachable

The point of this work is the unreachable case. We confirm it by
simulating the failure mode.

- [ ] **Step 1: Force the callback address to be wrong**

In `webhook_test.ts`, temporarily change `webhookServerAddress` to a
known-bad host (e.g. `127.0.0.1` from inside the container — which the
container cannot reach back through). Do NOT commit this change.

- [ ] **Step 2: Run the webhook suite and time it**

```bash
time pnpm sdk test test/integration/webhook_test.ts
```

Expected: every webhook test fails, suite completes in well under 60 s
(target: ≤15 s end-to-end). Before this change the same scenario hung
near the `testTimeout` boundary.

- [ ] **Step 3: Revert the temporary edit**

Restore `webhookServerAddress` to its original value. Confirm with
`git diff` that only the Task 1 edits remain.

---

## Task 4: Capture lessons and archive

- [ ] **Step 1: Write `20260515-webhook-test-fast-fail-lessons.md`**

Companion lessons file in this directory. Capture: the 60 s hang root
cause, why server-side retry is irrelevant to the SDK tests, and the
unresolved network question (host-gateway reachability across dev
environments) as deferred follow-up.

- [ ] **Step 2: Open the PR against `yorkie-js-sdk`**

Branch: `fix/webhook-test-fast-fail`. PR body should reference this
todo and the lessons file, and explicitly note the deferred network
work so a reviewer does not expect a broader fix.

- [ ] **Step 3: After merge, archive both files**

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
