# Epoch Mismatch Handling in JS SDK

**Created**: 2026-03-27

**Goal:** Detect `ErrEpochMismatch` from the server and expose it as a document event so users can recover by detaching and reattaching.

**Context:** The Go server (PR #1714) now returns `ErrEpochMismatch` (FailedPrecondition, code `"ErrEpochMismatch"`) when a client's epoch doesn't match the document's epoch after compaction. The JS SDK needs to recognize this error, stop retrying, and notify the user so they can perform recovery (detach + reattach with a new Document instance).

**Architecture:** Add error code → detect in sync loop → publish event → user handles recovery.

---

## Task 1: Add ErrEpochMismatch to error Code enum

**Files:**
- Modify: `packages/sdk/src/util/error.ts`

- [ ] **Step 1: Add the error code**

Add `ErrEpochMismatch` to the `Code` enum:

```typescript
// ErrEpochMismatch is returned when the document has been compacted
// and the client's epoch no longer matches the server's epoch.
ErrEpochMismatch = 'ErrEpochMismatch',
```

---

## Task 2: Handle ErrEpochMismatch in handleConnectError

**Files:**
- Modify: `packages/sdk/src/client/client.ts`

- [ ] **Step 1: Add epoch mismatch handling**

In `handleConnectError()`, add a case for `ErrEpochMismatch` before the client state error block (~line 1912). This error is NOT retryable — retrying will produce the same result:

```typescript
// NOTE: If the error is 'ErrEpochMismatch', it means the document
// has been compacted and the client's checkpoint is stale.
// The sync loop should stop, and the user must detach and reattach.
if (errorCodeOf(err) === Code.ErrEpochMismatch) {
  return false;
}
```

---

## Task 3: Publish epoch mismatch event from sync loop

**Files:**
- Modify: `packages/sdk/src/client/client.ts` (sync loop, ~line 1378)

- [ ] **Step 1: Add event publishing in sync loop catch block**

In the sync loop's inner catch (where `ErrUnauthenticated` → `AuthError` is published), add epoch mismatch event publishing:

```typescript
syncs.push(
  this.syncInternal(attachment, attachment.syncMode!).catch((e) => {
    if (isErrorCode(e, Code.ErrUnauthenticated)) {
      attachment.resource.publish([{
        type: DocEventType.AuthError,
        value: { reason: errorMetadataOf(e).reason, method: 'PushPull' },
      }]);
    }

    if (isErrorCode(e, Code.ErrEpochMismatch)) {
      attachment.resource.publish([{
        type: DocEventType.EpochMismatch,
        value: { method: 'PushPull' },
      }]);
    }

    throw e;
  }),
);
```

---

## Task 4: Add EpochMismatch event type and subscription topic

**Files:**
- Modify: `packages/sdk/src/document/document.ts`

- [ ] **Step 1: Add DocEventType.EpochMismatch**

```typescript
/**
 * `EpochMismatch` indicates the document was compacted on the server
 * and this client must detach and reattach to recover.
 */
EpochMismatch = 'epoch-mismatch',
```

- [ ] **Step 2: Add EpochMismatchEvent interface**

```typescript
export interface EpochMismatchEvent extends BaseDocEvent {
  type: DocEventType.EpochMismatch;
  value: {
    method: 'PushPull';
  };
}
```

- [ ] **Step 3: Add to DocEvent union type**

```typescript
export type DocEvent<P extends Indexable = Indexable, T = OpInfo> =
  | StatusChangedEvent
  | ConnectionChangedEvent
  | SyncStatusChangedEvent
  | SnapshotEvent
  | LocalChangeEvent<T, P>
  | RemoteChangeEvent<T, P>
  | PresenceEvent<P>
  | AuthErrorEvent
  | EpochMismatchEvent;
```

- [ ] **Step 4: Add subscription topic to DocEventCallbackMap**

```typescript
'epoch-mismatch': NextFn<EpochMismatchEvent>;
```

- [ ] **Step 5: Add filter in subscribe dispatch logic**

Follow the same pattern as `'auth-error'` — route `DocEventType.EpochMismatch` events to the `'epoch-mismatch'` topic subscribers.

---

## Task 5: Add integration test

**Files:**
- Create: `packages/sdk/test/integration/epoch_mismatch_test.ts`

- [ ] **Step 1: Write test for epoch mismatch event**

Test flow:
1. Activate client, attach document, make edits, sync
2. Force compact via admin API (or test helper)
3. Trigger sync — expect `epoch-mismatch` event
4. Detach the old document
5. Attach a new Document instance with the same key
6. Verify the new document has compacted content

- [ ] **Step 2: Run tests**

```sh
pnpm sdk test test/integration/epoch_mismatch_test.ts
```

---

## Task 6: Update JSDOC / public API exports

**Files:**
- Modify: `packages/sdk/src/yorkie.ts` (if EpochMismatchEvent needs export)

- [ ] **Step 1: Export new types**

Ensure `EpochMismatchEvent` and `Code.ErrEpochMismatch` are accessible to consumers.

---

## Notes

- Recovery pattern for users:
  ```typescript
  doc.subscribe('epoch-mismatch', async () => {
    await client.detach(doc);
    const newDoc = new yorkie.Document(doc.getKey());
    await client.attach(newDoc);
    // Re-bindUI with newDoc
  });
  ```
- This follows the same pattern as `AuthError` event handling
- Server must be updated first (Go server PR #1714)
