# PR 1522 lifecycle review

Baseline: `7f9c92c7ba5a9c28f5d2b0c8bd4d5d6f56a8814e`, base `0343acc0`.

## Findings and evidence

The final panel blocker is reproducible, but a single pending heartbeat alone
holds the task queue. The public-API reproduction needs two heartbeats: one
rejects Promise.all, releasing the queue while the other remains pending.
Keepalive teardown followed by activate clears deactivating before that old
response arrives. It must not mark the removed channel Attached or open Watch.

Use a teardown generation and exact attachment identity, not active status
alone. The initial channel-first lifecycle also owns its errors: requiring
isActive unconditionally suppresses ErrClientNotFound cleanup before the first
successful refresh. Generation invalidation additionally handles an id being
reused, without assuming the server actually reuses it today.

Document attach must validate ownership before queue execution, after async
storage work, before applying the response, and after Watch startup. The old
pre-registration check ran after the document id/checkpoint had been applied.
The strengthened regressions failed at PR head, then passed after the guards.

## Independent review

Round 1: a separate reviewer found three additional reproducible races:

- Attached status subscribers can synchronously deactivate. Register the
  attachment before publishing Attached, then recheck before installing
  persistence subscriptions or starting Watch.
- A late keepalive DetachDocument success can remove a new attachment of the
  same document. Validate both the lifecycle and exact attachment before
  sending, applying the response, or processing errors. This race was also
  possible before the PR, but is relevant to the restored-session contract.
- ErrPresenceBaseUnavailable can trigger a second RPC after teardown. Check
  lifecycle ownership inside the shared fallback before restoring/resending.

All three independent reproductions are now regression tests and pass.

Round 2 found one more blocker: a late document PushPull removal response
could delete a replacement attachment after another sync released the queue.
Document sync now checks lifecycle and attachment ownership before sending,
applying a response, and publishing an error. It deliberately still accepts
an in-flight sync while ordinary detach waits for its final flush. The public
sync-loop regressions wait for RPC dispatch before observing sync completion.

Round 3 reran all four independent reproductions: all passed, with no further
reproducible blocker found in the full PR plus local diff. This ends the
three-round local independent review; it is not a Claude CI-panel approval.

## Review dispositions

- The issue intentionally requires ignoring late keepalive errors, including
  401. Preserve ordinary deactivate's refresh/rejection behavior and clarify
  the API docs; resolution does not confirm server acceptance.
- Current connect-web 2.1.1 Connect and gRPC-Web transports both pass Headers.
  The proposed marker leak was not reproduced. Real transport tests check
  positive and negative keepalive flags, shard headers, and marker removal,
  including keepalive detach and asynchronous fetch rejection.
- `detach({keepalive:true})` still awaits its response; changing that contract
  is outside #1521. Only ownership of late results is corrected here.
- The panel's relocated/pre-existing classifications are not all reliable:
  captureSession was introduced after base 0343acc0, despite the rendered
  claim that 7f9c92c predates the base.
- The existing beforeunload listener accumulation and lazy reactivation of a
  previously deactivated channel-only client remain separate lifecycle work.
- Node/jsdom window.unhandledrejection alone is insufficient evidence; the
  new tests also exercise actual fetch rejection under Vitest's error checks.

## Verification

- Original added regressions: 8 failures at PR head, then passes.
- Additional queued/Watch attach regressions: 2 failures before fixing.
- Independent round 1: 3 failures before fixing.
- Focused keepalive/auth suites: 49 passed after the round 2 fix.
- Client, channel, channel polling, document polling and offline persistence
  integration suites: 48 passed on official Yorkie v0.7.26, memory backend.
- Full ProseMirror suite: 282 passed against that server.
- Published-package exports passed (ESM, CJS, mixed, bundlers and types).
- Final verify:fast after the round 2 fix: passed. SDK 1,258 passed
  (3 expected failures, 4 skipped, 1 todo); ProseMirror unit 274, React 108,
  DevTools 20, Schema 40, and scripts 119 passed. ESLint, documentation links,
  license headers, TypeScript and SDK build passed.
- The final five selected SDK integration suites again passed all 48 tests.
- Temporary server stopped after testing. The PR head remained 7f9c92c;
  the current main contains one additional unrelated tree-bounds commit.

Node 22.16.0 and pnpm 9.15.9 were used with the unchanged lockfile. A temporary
server on port 18080 avoids altering the user's server installation. The complete GitHub Actions workflow and Safari bfcache behavior are not
claimed; the additional local validations below cover Chrome and MongoDB.
Repository write permission is unavailable; no push, rerun comment, promotion
or merge has been performed.


## Additional browser and MongoDB validation

The earlier limitation was partly environmental and partly incomplete setup:
Docker was not running, but a native MongoDB alternative had not been tried.
The earlier browser limitation meant no actual browser attempt had been made.

- Official MongoDB 8.0.32 ran with a dedicated temporary data directory and
  loopback port 27027; Yorkie v0.7.26 used that backend on port 18080.
- The full SDK Vitest collection ran with Istanbul coverage and the CI default
  5-second test timeout: 141 files passed, 1 skipped; 3,900 tests passed,
  3 expected failures, 14 skipped and 1 todo. Statement coverage was 92.16%,
  branch coverage 86.7%, function coverage 93.72%, line coverage 92.27%.
- This was the full SDK test command on native macOS, not the entire GitHub
  Ubuntu/Docker workflow. Native webhook addresses were retained instead of
  the Docker-specific CI environment flag. No assertion was disabled.
- Real Chrome 157.0.8103.38 ran in a separate temporary profile. A page using
  the built SDK navigated away and returned with Back. Both pagehide and
  pageshow reported persisted=true and the in-memory nonce was unchanged.
  The trace showed immediate inactive/Detached state, deactivate settlement,
  activation with a new client id, reattachment and successful sync. There
  were no page errors. The test runner's default bfcache-disabling argument
  was omitted; no existing browser profile or security setting was changed.
- Safari 18.6 WebDriver refused session creation because Allow Remote
  Automation was disabled. It was not enabled. The alternate computer-use
  permission request was aborted, so Safari remains unverified.
- All temporary MongoDB, Yorkie and WebDriver processes were confirmed stopped.

These results do not provide a Claude panel verdict, remote CI result or
repository write permission, and do not change the Draft/blocked PR state.

## Follow-up after the first external rerun

The panel on f2d8d2d9 passed five lenses and failed correctness. Its remove
finding was unverified: review-execution.json records `error_max_turns`,
21 turns, and "Reached maximum number of turns (20)". There was no recorded
API error status; the generic comment's possible 429 explanation was not
this run's cause. No credentials, quota settings or verifier limits changed.

The Watch finding was confirmed by its verifier but classified as outside
the frozen review surface. We nevertheless reproduced and fixed it: the
Attachment must own the AbortController before initialization. Cancellation
settles the pending watch even if the transport does not unwind its read.
Intentional disconnect is published synchronously, and late stream responses,
errors and disconnect callbacks cannot mutate the successor's state.

The remove finding's claimed reattachment-before-response order is prevented
by the task queue. The underlying stale mutation is real: a late success
marks the detached Document Removed before the queued activation can finish,
preventing that same instance's later reattachment. Capture ownership before
enqueueing and check it again before applying success; obsolete removes do
not send requests or apply server state. Live removal is unchanged.

Six new regression cases failed on f2d8d2d9; the five focused suites passed
72 tests with the final fix, including existing auth refresh and idle reconnect
coverage. The tests exercise the actual Watch loop rather than mocking it.
The successor test also proves duplicate opening is suppressed while init
is pending, and cancelled initialization cannot replace a new stream.

Independent follow-up review found two additional cancellation boundaries:
a user initialization callback may cancel before the watchdog is armed, and
an error recovery await may finish after cancellation. Both have explicit
post-callback/await cancellation checks and regression tests; synchronous
cancellation from an error callback also prevents recovery from starting.
The auth reconnect fixture now uses Attachment's owned controller.
