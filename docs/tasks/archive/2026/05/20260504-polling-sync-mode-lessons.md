# Polling Sync Mode — Lessons

**Created**: 2026-05-04
**Branch**: `feat/polling-sync-mode`
**Design**: `docs/design/polling-sync-mode.md`
**Plan**: `20260504-polling-sync-mode-todo.md` (this directory)

## What Shipped

Channel and Document attach options now accept `syncMode: SyncMode.Polling`,
an opt-in mode that runs the existing `runSyncLoop` without opening a watch
stream. Defaults stay `Realtime` for both resources, so no caller is broken.
Per-attachment `pollInterval` and `pollIntervalPinned` state live on
`Attachment`. `changeSyncMode` is overloaded to accept `Channel` and now
handles transitions in and out of `Polling` for both resources.

## Plan vs. Reality

### What turned out simpler than the design

The design described a new `runHeartbeatLoop` channel-side. Reading the SDK
revealed that `runSyncLoop` already drives both channel heartbeats (via
`syncInternal` → `refreshChannel`) and document syncs at a 50 ms tick gated
by `attachment.needSync()`. Polling reuses the same loop on both sides:

- For channels, `needSync()` returns `true` at the per-attachment poll
  interval; `syncInternal` already calls `refreshChannel` for `Channel`
  resources.
- For documents, `needRealtimeSync()` gained a `Polling` branch that
  returns `true` at the poll interval; `syncInternal` already calls
  `pushPullChanges`.

The internal-flow section of the design doc was corrected in commit
`580c7b7b7` to match the actual implementation (no dedicated heartbeat
loop).

### What turned out harder than expected

The "failing test first" step in Task 4 didn't actually fail. Before the
watch-loop guard for `Polling` landed (Step 7), the existing guard
(`syncMode !== Manual`) still opened a watch stream for a `Polling`
document, so `changeEventReceived` fired and the test passed via the wrong
code path. The correct time-based path was only exercised once the guard
was tightened. The implementer flagged this honestly. Lesson: when the
spec adds a new value to an existing branch, the failing-test step needs
to also assert on the *mechanism* (e.g., "no watch stream opened"), not
just on the user-observable outcome.

The Task 5 reviewer caught a real ordering race in
`changeDocumentSyncMode`: `attachment.changeSyncMode(syncMode)` was called
before `cancelWatchStream()`, so an in-flight stream event could observe
`syncMode === Polling` while the stream was still live. The same bug had
existed pre-Polling for the `Realtime → Manual` transition; the plan
copied it, the reviewer caught it, and the fix in `4fea1e902` reorders
both helpers to tear down before mutating mode.

## Naming and Convention Surprises

The project's ESLint `@typescript-eslint/naming-convention` rule rejects
SCREAMING_SNAKE_CASE for variables and constants — only camelCase and
PascalCase pass. The shared poll interval default became
`DefaultPollingIntervalMs` (PascalCase) rather than the more conventional
`DEFAULT_POLLING_INTERVAL_MS`. Worth noting before reaching for ALL_CAPS
on a future SDK constant.

## Pre-Existing Items We Did Not Touch

- **`detach` vs `detachChannel` in tests**: the test file
  `channel_polling_test.ts` mixes both forms (some tests use `detach()`
  with a `Channel` argument, others call `detachChannel()` directly). The
  Task 5/6 reviewer flagged this as a file-wide style inconsistency. Both
  forms work — `detach()` with a Channel dispatches to `detachChannel()`
  internally — so this is a stylistic cleanup deferred for a future pass.
- **`changeSyncMode` is not wrapped in `enqueueTask`**: every other
  mutating public Client method serializes through `enqueueTask`.
  `changeSyncMode` does not, so concurrent calls with `sync` or `detach`
  can interleave. This pre-dates Polling, but Polling makes the method
  more consequential (it now adds RPC via `runWatchLoop` on transitions
  back into Realtime). Worth filing as follow-up work.
- **Document `Attachment.changeEventReceived` reset for Polling docs**:
  the sync loop resets this field every tick whether or not the
  attachment can ever set it. Harmless waste; pre-existing pattern.

## Test Environment Note

`webhook_test.ts` boots an Express server on host port 3004 and the
Yorkie container calls back via `host.docker.internal:3004` to validate
auth tokens. On dev machines where this callback is not reachable, all 9
webhook tests fail with `connect: connection refused`. Two of them retry
for the full 60 s `testTimeout`, which makes `pnpm sdk test` look like
it's hanging near the end of the run. This is unrelated to Polling work
and was not introduced by this branch.

## Next Step (Out of Scope, Tracked)

The design doc's primary acceptance criterion for the broader rollout is
the 200 K even-mode benchmark using
`web-media-tool/devops/docs/benchmarks/scenarios/presence/v075-even-200k.yaml`,
configured to run with `syncMode: 'polling'` (3 s default). That run
determines pod sizing and validates that the SDK change actually clears
the bottleneck in production-shaped traffic. It requires the k6
infrastructure and is out of scope for this SDK PR.

## Commit Trail

Within this branch, in order:

| SHA | Subject |
|---|---|
| `02216b4b1` | Add SyncMode.Polling enum value |
| `ad83740ce` | Add pollInterval and pollIntervalPinned fields to Attachment |
| `9822d5c20` | Rename pinned flag to pollIntervalPinned in design doc |
| `35705c95c` | Support SyncMode.Polling for channels |
| `580c7b7b7` | Correct internal flow description in design doc |
| `2c6811313` | Support SyncMode.Polling for documents |
| `e6b10ea00` | Overload changeSyncMode to handle Channel and Polling transitions |
| `4fea1e902` | Fix changeDocumentSyncMode mode/stream ordering race |
| `55b365d07` | Verify Polling channel does not receive broadcast |
| `a3004cac2` | Verify isRealtime back-compat and syncMode precedence |
