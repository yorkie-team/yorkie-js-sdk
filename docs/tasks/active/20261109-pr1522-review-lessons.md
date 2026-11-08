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
server on port 18080 avoids altering the user's server installation. The full
MongoDB-backed suite and actual browser bfcache navigation are not claimed.
Repository write permission is unavailable; no push, rerun comment, promotion
or merge has been performed.
