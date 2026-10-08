# Stop retrying size-limit rejections and report them to the app

**Created**: 2026-10-08
Tracked as #1459

## Problem

Since server v0.7.24 a push to a document over its size limit is rejected with
`ResourceExhausted` carrying `ErrDocumentSizeExceedsLimit` (and `ErrChangeTooLarge`
for a single change too large to store). The JS SDK treats every
`ResourceExhausted` as transient (`handleConnectError`, `client.ts`), so:

- the sync loop resends the same change pack forever;
- because push and pull share one `PushPull` RPC, the client also stops
  receiving other peers' changes for that document;
- the app only sees `sync-status: sync-failed` with no reason, so it cannot
  tell "the document is full" from a network blip.

Neither rejection can succeed on retry: the pack is re-evaluated against the
server-side size gate every time, and nothing the client does changes it.

## Plan

1. `util/error.ts` — add `Code.ErrChangeTooLarge` (the server code has no SDK
   counterpart yet). `ErrDocumentSizeExceedsLimit` already exists.
2. `document/document.ts` — add a `write-rejected` document event
   (`DocEventType.WriteRejected`) carrying `{ code, reason, method: 'PushPull' }`,
   wired through the `DocEvent` union, the callback map, the `subscribe`
   overload and its dispatch, mirroring `epoch-mismatch`.
3. `client/client.ts`
   - `handleConnectError`: return `false` for `ErrDocumentSizeExceedsLimit`
     and `ErrChangeTooLarge` **before** the generic `ResourceExhausted` retry
     branch, so the sync loop stops the way it does for `ErrEpochMismatch`.
   - `syncInternal`'s PushPull catch: publish `WriteRejected` alongside the
     existing `SyncFailed`, so both the sync loop and an explicit `sync(doc)`
     report it.
4. Devtools — accept the new event in `devtools/types.ts`, `devtools/index.ts`
   and the extension's `Notifications.tsx`, as the other doc events are.
5. `yorkie.ts` — export `WriteRejectedEvent`.
6. Unit test (`test/unit/client/write_rejected_test.ts`): a stubbed PushPull
   that fails with each code must publish `write-rejected` with that code and
   must not be retried.

## Out of scope

- Recovery in place (re-anchor without re-creating the client) — that is #1458.
- A local pre-check against the server's measurement; apps already have
  `doc.getDocSize()` / `doc.getMaxSizePerDocument()`.
- The pre-existing dead `ErrTooManyAttachments` branch, which sits after the
  generic `ResourceExhausted` retry and so never runs for a server error that
  uses that Connect code.

## Acceptance criteria

- [ ] `ErrDocumentSizeExceedsLimit` and `ErrChangeTooLarge` from `PushPull`
      are not retried.
- [ ] The sync loop stops for that client, as with `ErrEpochMismatch`.
- [ ] An event carrying the error code reaches the app.
- [ ] `pnpm verify:fast` green.
