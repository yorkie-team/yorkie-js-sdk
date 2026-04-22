# Fix Detach/Sync Race Condition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Created**: 2026-04-22

**Goal:** Prevent `document not attached` error caused by race condition between detach and sync loop (yorkie-team/yorkie-js-sdk#856)

**Architecture:** Add a `detaching` flag to `Attachment` that is set immediately when detach is requested. The sync loop checks this flag before issuing sync RPCs. The detach flow awaits any in-progress sync before sending the detach RPC, eliminating the race window entirely.

**Tech Stack:** TypeScript, Vitest, Yorkie JS SDK

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/sdk/src/client/attachment.ts` | Modify | Add `detaching` flag and in-progress sync tracking |
| `packages/sdk/src/client/client.ts` | Modify | Set `detaching` before enqueue; skip sync for detaching docs; await in-progress sync in detach |
| `packages/sdk/test/integration/client_test.ts` | Modify | Add race condition integration test |

---

### Task 1: Add `detaching` flag to Attachment

**Files:**
- Modify: `packages/sdk/src/client/attachment.ts:39-65`

- [ ] **Step 1: Add `detaching` flag and sync promise tracking to Attachment**

In `packages/sdk/src/client/attachment.ts`, add two new fields to the `Attachment` class:

```typescript
// Add after line 50 (private watchAbortController)
private syncPromise?: Promise<any>;
private _detaching = false;
```

Add methods to manage them:

```typescript
/**
 * `markDetaching` marks this attachment as being in the process of detaching.
 * Once marked, the sync loop will skip this attachment.
 */
public markDetaching(): void {
  this._detaching = true;
}

/**
 * `isDetaching` returns whether this attachment is being detached.
 */
public isDetaching(): boolean {
  return this._detaching;
}

/**
 * `setSyncPromise` sets the in-progress sync promise for this attachment.
 */
public setSyncPromise(promise: Promise<any>): void {
  this.syncPromise = promise;
}

/**
 * `clearSyncPromise` clears the in-progress sync promise.
 */
public clearSyncPromise(): void {
  this.syncPromise = undefined;
}

/**
 * `waitForSyncComplete` waits for any in-progress sync to complete.
 */
public async waitForSyncComplete(): Promise<void> {
  if (this.syncPromise) {
    try {
      await this.syncPromise;
    } catch {
      // Ignore sync errors — we just need it to finish
    }
  }
}
```

- [ ] **Step 2: Run build to verify compilation**

Run: `cd packages/sdk && pnpm build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/client/attachment.ts
git commit -m "Add detaching flag and sync tracking to Attachment

The sync loop and detach can race when both send RPCs concurrently.
Add a detaching flag so the sync loop can skip attachments being
detached, and a sync promise so detach can await in-progress syncs."
```

---

### Task 2: Wire detaching flag into detachDocument

**Files:**
- Modify: `packages/sdk/src/client/client.ts:632-689`

- [ ] **Step 1: Set detaching flag before enqueue in detachDocument**

In `client.ts`, modify `detachDocument()`. Right after getting the attachment (line 644), mark it as detaching. Inside the task, await any in-progress sync before sending the detach RPC:

```typescript
private detachDocument<R, P extends Indexable>(
  doc: Document<R, P>,
  opts: {
    keepalive?: boolean;
  } = { keepalive: false },
): Promise<Document<R, P>> {
  if (!this.isActive()) {
    throw new YorkieError(
      Code.ErrClientNotActivated,
      `${this.key} is not active`,
    );
  }
  const attachment = this.attachmentMap.get(doc.getKey());
  if (!attachment) {
    throw new YorkieError(
      Code.ErrNotAttached,
      `${doc.getKey()} is not attached`,
    );
  }

  // Mark as detaching immediately so the sync loop skips this document.
  attachment.markDetaching();

  doc.update((_, p) => p.clear());

  const task = async () => {
    try {
      // Wait for any in-progress sync to finish before detaching.
      await attachment.waitForSyncComplete();

      const res = await this.rpcClient.detachDocument(
        {
          clientId: this.id!,
          documentId: attachment.resourceID,
          changePack: converter.toChangePack(doc.createChangePack()),
        },
        { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
      );

      const pack = converter.fromChangePack<P>(res.changePack!);
      doc.applyChangePack(pack);

      if (doc.getStatus() !== DocStatus.Removed) {
        doc.applyStatus(DocStatus.Detached);
      }

      this.detachInternal(doc.getKey());
      logger.info(`[DD] c:"${this.getKey()}" detaches d:"${doc.getKey()}"`);
      return doc;
    } catch (err) {
      logger.error(`[DD] c:"${this.getKey()}" err :`, err);
      await this.handleConnectError(err);
      throw err;
    }
  };

  if (opts.keepalive) {
    this.keepalive = true;
    const resp = task();
    this.keepalive = false;
    return resp;
  }

  return this.enqueueTask(task);
}
```

- [ ] **Step 2: Run build to verify compilation**

Run: `cd packages/sdk && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/client/client.ts
git commit -m "Set detaching flag and await in-progress sync before detach RPC

Mark attachment as detaching immediately when detachDocument is called,
before the task is enqueued. Inside the detach task, wait for any
in-progress sync to complete before sending the detach RPC to the
server."
```

---

### Task 3: Skip detaching documents in sync loop

**Files:**
- Modify: `packages/sdk/src/client/client.ts:1378-1445` (runSyncLoop)
- Modify: `packages/sdk/src/client/client.ts:1796-1894` (syncInternal)

- [ ] **Step 1: Add detaching check in runSyncLoop**

In `runSyncLoop()`, add a check after `needSync` to skip detaching attachments. Also track the sync promise on the attachment:

```typescript
// In runSyncLoop, inside the for loop (around line 1389-1426):
for (const [, attachment] of this.attachmentMap) {
  if (!attachment.needSync(this.channelHeartbeatInterval)) {
    continue;
  }

  // Skip documents that are being detached.
  if (attachment.isDetaching()) {
    continue;
  }

  // Reset changeEventReceived for Document resources
  if (attachment.changeEventReceived !== undefined) {
    attachment.changeEventReceived = false;
  }

  const syncPromise = this.syncInternal(attachment, attachment.syncMode!)
    .catch((e) => {
      if (isErrorCode(e, Code.ErrUnauthenticated)) {
        attachment.resource.publish([
          {
            type: DocEventType.AuthError,
            value: {
              reason: errorMetadataOf(e).reason,
              method: 'PushPull',
            },
          },
        ]);
      }

      if (isErrorCode(e, Code.ErrEpochMismatch)) {
        attachment.resource.publish([
          {
            type: DocEventType.EpochMismatch,
            value: {
              method: 'PushPull',
            },
          },
        ]);
      }

      throw e;
    })
    .finally(() => {
      attachment.clearSyncPromise();
    });

  attachment.setSyncPromise(syncPromise);
  syncs.push(syncPromise);
}
```

- [ ] **Step 2: Run build to verify compilation**

Run: `cd packages/sdk && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `cd packages/sdk && pnpm test test/integration/client_test.ts`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/client/client.ts
git commit -m "Skip detaching documents in sync loop

Check the detaching flag before issuing sync RPCs. Track the sync
promise on the attachment so detach can await it."
```

---

### Task 4: Write integration test for detach/sync race condition

**Files:**
- Modify: `packages/sdk/test/integration/client_test.ts`

- [ ] **Step 1: Write the failing test (verify setup works without fix)**

Add a new test at the end of the `describe.sequential('Client', ...)` block in `client_test.ts`:

```typescript
it('Should not produce document not attached error on detach during sync', async function ({
  task,
}) {
  // Use a short sync loop to increase the chance of overlap.
  const c1 = new yorkie.Client({
    rpcAddr: testRPCAddr,
    syncLoopDuration: 50,
    reconnectStreamDelay: 1000,
  });
  await c1.activate();

  const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
  const doc = new yorkie.Document(docKey);
  await c1.attach(doc, { syncMode: SyncMode.Realtime });

  // Make a local change so the sync loop has something to push.
  doc.update((root) => {
    root.key = 'value';
  });

  // Detach immediately — the sync loop may be trying to sync concurrently.
  // Before the fix, this could cause "document not attached" from the server
  // if the sync RPC arrives after the detach RPC is processed.
  await c1.detach(doc);

  // Verify the document is properly detached without errors.
  assert.equal(doc.getStatus(), 'detached');

  await c1.deactivate();
});
```

- [ ] **Step 2: Run the test**

Run: `cd packages/sdk && pnpm test test/integration/client_test.ts`
Expected: PASS — the test should pass with the fix applied in Tasks 1-3. If running without the fix, this test may intermittently fail with "document not attached".

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/client_test.ts
git commit -m "Add test for detach/sync race condition

Verify that detaching a document while the sync loop is running does
not produce a 'document not attached' error. Covers issue #856."
```

---

### Task 5: Run full test suite and lint

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: No errors or warnings

- [ ] **Step 2: Run SDK build**

Run: `pnpm sdk build`
Expected: Build succeeds

- [ ] **Step 3: Run full SDK test suite**

Run: `pnpm sdk test`
Expected: All tests pass

- [ ] **Step 4: Fix any issues found**

If lint or test failures occur, fix them before proceeding.

---

### Task 6: Final commit and cleanup

- [ ] **Step 1: Verify git status**

Run: `git status`
Expected: Clean working tree (all changes committed in Tasks 1-4)

- [ ] **Step 2: Review all changes**

Run: `git log --oneline -5`
Expected: 4 commits from this work, each focused on one concern

- [ ] **Step 3: If needed, squash into a single commit for PR**

Run: `git log --oneline` to count commits since branching.
If the team prefers a single commit per PR, squash. Otherwise leave as-is.
