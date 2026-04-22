# Presence Event Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Created**: 2026-04-22

**Goal:** Unify presence event emission into a single `reconcilePresence()` function, eliminating scattered conditional logic across 7 emission points (plus `initialized` which stays separate).

**Architecture:** Each data channel handler (PushPull, Watch Stream, local update) updates only its own data store (`presences` Map or `onlineClients` Set), then calls `reconcilePresence()`. The reconcile function compares previous and current per-client state `(hasPresence, isOnline)` to determine which event to emit. Self client uses `status === Attached` as its "online" condition instead of `onlineClients`.

**Tech Stack:** TypeScript, Vitest, yorkie-js-sdk

**Design doc:** `yorkie/docs/design/doc-presence.md` — "Presence Event Reconciliation" section

---

### Task 1: Write failing test for #729 (initial presence)

**Files:**
- Modify: `packages/sdk/test/integration/doc_presence_test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `DocPresence` describe block:

```typescript
it('Should emit presence-changed event with initial presence value on attach', async function ({
  task,
}) {
  const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
  await c1.activate();
  const c1ID = c1.getID()!;

  const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
  type PresenceType = { key: string };
  const doc1 = new yorkie.Document<object, PresenceType>(docKey);
  const events1 = new EventCollector<DocEvent>();
  const unsub1 = doc1.subscribe('presence', (event) => events1.add(event));

  await c1.attach(doc1, {
    initialPresence: { key: 'val1' },
  });

  await events1.waitAndVerifyNthEvent(1, {
    type: DocEventType.PresenceChanged,
    value: { clientID: c1ID, presence: { key: 'val1' } },
  });

  unsub1();
  await c1.deactivate();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm sdk test test/integration/doc_presence_test.ts --testNamePattern="Should emit presence-changed event with initial presence value"`

Expected: FAIL — presence value is `undefined` or empty object `{}`

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/doc_presence_test.ts
git commit -m "Add failing test for initial presence event value (yorkie-team/yorkie#729)"
```

---

### Task 2: Add `reconcilePresence()` method

**Files:**
- Modify: `packages/sdk/src/document/document.ts:1757` (after `removeOnlineClient`)

- [ ] **Step 1: Add the reconcilePresence method**

Add after the `removeOnlineClient()` method (around line 1759):

```typescript
/**
 * `reconcilePresence` compares the previous and current state of a client's
 * presence/online status and returns the appropriate event to emit.
 *
 * For remote clients, "online" means the client is in onlineClients.
 * For self, "online" means the document status is Attached.
 *
 * State transition table:
 *   (!hadP || !wasOn) → (hasP && isOn)  : watched (remote) or presence-changed (self)
 *   (hadP && wasOn)   → (hasP && isOn)  : presence-changed
 *   (hadP && wasOn)   → (!hasP || !isOn): unwatched (remote only)
 *   otherwise                           : no event (waiting)
 */
private reconcilePresence(
  actorID: ActorID,
  prev: { hadPresence: boolean; wasOnline: boolean; presence?: P },
  source: OpSource,
): WatchedEvent<P> | UnwatchedEvent<P> | PresenceChangedEvent<P> | undefined {
  const isSelf = actorID === this.changeID.getActorID();
  const hasPresence = this.presences.has(actorID);
  const isOnline = isSelf
    ? this.status === DocStatus.Attached
    : this.onlineClients.has(actorID);

  if (!hasPresence || !isOnline) {
    // Transitioned from ready → not ready: unwatched (remote only)
    if (prev.hadPresence && prev.wasOnline && !isSelf) {
      return {
        type: DocEventType.Unwatched,
        source: OpSource.Remote,
        value: {
          clientID: actorID,
          presence: prev.presence!,
        },
      };
    }
    return undefined;
  }

  const presence = deepcopy(this.presences.get(actorID)!);

  if (!prev.hadPresence || !prev.wasOnline) {
    // Transitioned from not-ready → ready
    if (isSelf) {
      return {
        type: DocEventType.PresenceChanged,
        source,
        value: { clientID: actorID, presence },
      };
    }
    return {
      type: DocEventType.Watched,
      source: OpSource.Remote,
      value: { clientID: actorID, presence },
    };
  }

  // Both were ready and still are: presence value changed
  return {
    type: DocEventType.PresenceChanged,
    source,
    value: { clientID: actorID, presence },
  };
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm sdk build`
Expected: PASS (method added but not yet called)

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/document/document.ts
git commit -m "Add reconcilePresence method for unified presence event emission"
```

---

### Task 3: Refactor `update()` to use reconcile

**Files:**
- Modify: `packages/sdk/src/document/document.ts:726-735`

- [ ] **Step 1: Replace presence event emission in update()**

Replace lines 726-735:

```typescript
// Before:
if (change.hasPresenceChange()) {
  event.push({
    type: DocEventType.PresenceChanged,
    source: OpSource.Local,
    value: {
      clientID: actorID,
      presence: this.getPresence(actorID)!,
    },
  });
}
```

With:

```typescript
if (change.hasPresenceChange()) {
  const presenceEvent = this.reconcilePresence(
    actorID,
    prev,
    OpSource.Local,
  );
  if (presenceEvent) {
    event.push(presenceEvent);
  }
}
```

And capture prev state before the change is applied. Find where presences are modified in `update()`. The change is applied at line 668 (`change.execute()`). Add before that line:

```typescript
const prev = {
  hadPresence: this.presences.has(actorID),
  wasOnline: this.status === DocStatus.Attached,
  presence: this.presences.has(actorID)
    ? deepcopy(this.presences.get(actorID)!)
    : undefined,
};
```

Note: `prev` must be captured before `change.execute()` at line 668, which mutates `this.presences`. The `prev` variable is then used at line 726 in the presence event block.

- [ ] **Step 2: Run existing tests**

Run: `pnpm sdk test test/integration/doc_presence_test.ts`
Expected: PASS — behavior preserved for Attached documents; initial presence (pre-Attached) now correctly suppressed until reconcile sees Attached status.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/document/document.ts
git commit -m "Refactor update() to use reconcilePresence for event emission"
```

---

### Task 4: Refactor `applyChange()` to use reconcile

**Files:**
- Modify: `packages/sdk/src/document/document.ts:1434-1553`

- [ ] **Step 1: Capture prev state and remove old presence event block**

In `applyChange()`, the change is applied twice: first to the clone (line 1436), then to the real root (line 1489). Currently, presence events are constructed between these two executions (lines 1440-1487), before `this.presences` is updated.

Remove the entire presence event block (lines 1440-1487). Add prev capture before the second `change.execute()`:

```typescript
const events: DocEvents<P> = [];
const actorID = change.getID().getActorID();

// Capture prev state before execute updates this.presences
const prev = change.hasPresenceChange()
  ? {
      hadPresence: this.presences.has(actorID),
      wasOnline: this.onlineClients.has(actorID),
      presence: this.presences.has(actorID)
        ? deepcopy(this.presences.get(actorID)!)
        : undefined,
    }
  : undefined;

const { opInfos, operations } = change.execute(
  this.root,
  this.presences,
  source,
);
```

- [ ] **Step 2: Add reconcile after change events**

After the change events block (after line 1544), add the presence reconcile:

```typescript
if (prev && change.hasPresenceChange()) {
  const presenceChange = change.getPresenceChange()!;
  if (presenceChange.type === PresenceChangeType.Clear) {
    this.removeOnlineClient(actorID);
  }
  const presenceEvent = this.reconcilePresence(actorID, prev, source);
  if (presenceEvent) {
    events.push(presenceEvent);
  }
}
```

This places presence events after change events in the array, which aligns with the design doc: "a `remote-change` event occurs, and then the `presence-changed` event occurs." The current code had them in the opposite order.

- [ ] **Step 3: Run existing tests**

Run: `pnpm sdk test test/integration/doc_presence_test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/document/document.ts
git commit -m "Refactor applyChange() to use reconcilePresence for event emission"
```

---

### Task 5: Refactor `applyDocEvent()` to use reconcile

**Files:**
- Modify: `packages/sdk/src/document/document.ts:1593-1631`

- [ ] **Step 1: Replace the entire applyDocEvent method body**

Replace the method body (lines 1593-1631):

```typescript
public applyDocEvent(type: PbDocEventType, publisher: string) {
  const prev = {
    hadPresence: this.presences.has(publisher),
    wasOnline: this.onlineClients.has(publisher),
    presence: this.presences.has(publisher)
      ? deepcopy(this.presences.get(publisher)!)
      : undefined,
  };

  if (type === PbDocEventType.DOCUMENT_WATCHED) {
    if (this.onlineClients.has(publisher) && this.hasPresence(publisher)) {
      return;
    }
    this.addOnlineClient(publisher);
  } else if (type === PbDocEventType.DOCUMENT_UNWATCHED) {
    this.removeOnlineClient(publisher);
    this.presences.delete(publisher);
  }

  const event = this.reconcilePresence(publisher, prev, OpSource.Remote);
  if (event) {
    this.publish([event]);
  }
}
```

- [ ] **Step 2: Run existing tests**

Run: `pnpm sdk test test/integration/doc_presence_test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/document/document.ts
git commit -m "Refactor applyDocEvent() to use reconcilePresence for event emission"
```

---

### Task 6: Update `applyWatchInit()` to reconcile remote clients

**Files:**
- Modify: `packages/sdk/src/document/document.ts:1558-1588`

- [ ] **Step 1: Add reconcile calls for each remote client**

The `initialized` event stays as-is. But now that `setOnlineClients` changes `onlineClients`, we should reconcile each affected client. However, `applyWatchInit` already emits `initialized` which serves a different purpose (full snapshot of participants). The reconcile is not needed here because:

- New clients added to `onlineClients` will be reconciled when their presence arrives via PushPull
- Clients already in `onlineClients` with presence already had their `watched` event

No change needed. The `initialized` event remains the only event from `applyWatchInit`.

**BUT** — for self client, `applyWatchInit` is the signal that the watch stream is up. We need `applyStatus(Attached)` to trigger self reconcile (see Task 7).

- [ ] **Step 2: Verify no regression**

Run: `pnpm sdk test test/integration/doc_presence_test.ts`
Expected: PASS

- [ ] **Step 3: Commit (skip if no changes)**

---

### Task 7: Add self reconcile on `applyStatus(Attached)`

**Files:**
- Modify: `packages/sdk/src/document/document.ts` — `applyStatus()` method

- [ ] **Step 1: Find applyStatus method**

Read the `applyStatus` method (around line 1634).

- [ ] **Step 2: Add self reconcile when transitioning to Attached**

```typescript
public applyStatus(status: DocStatus) {
  const actorID = this.changeID.getActorID();
  const prev = {
    hadPresence: this.presences.has(actorID),
    wasOnline: this.status === DocStatus.Attached,
    presence: this.presences.has(actorID)
      ? deepcopy(this.presences.get(actorID)!)
      : undefined,
  };

  this.status = status;

  const event = this.reconcilePresence(actorID, prev, OpSource.Local);
  if (event) {
    this.publish([event]);
  }
}
```

This is the key fix for #729: when `applyStatus(Attached)` is called after attach completes, reconcile sees `hasPresence: true` (set during `update()`) and `isOnline: true` (status just became Attached), emitting `PresenceChanged` with the correct presence value.

- [ ] **Step 3: Run the #729 test**

Run: `pnpm sdk test test/integration/doc_presence_test.ts --testNamePattern="Should emit presence-changed event with initial presence value"`
Expected: PASS

- [ ] **Step 4: Run all presence tests**

Run: `pnpm sdk test test/integration/doc_presence_test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/document/document.ts
git commit -m "Add self reconcile on applyStatus to fix initial presence event (#729)"
```

---

### Task 8: Refactor `executeUndoRedo()` to use reconcile

**Files:**
- Modify: `packages/sdk/src/document/document.ts:2020-2029`

- [ ] **Step 1: Capture prev state and replace emission**

Find where the undo/redo change is executed (the `change.execute()` call in `executeUndoRedo`). Capture prev before it:

```typescript
const prev = {
  hadPresence: this.presences.has(actorID),
  wasOnline: this.status === DocStatus.Attached,
  presence: this.presences.has(actorID)
    ? deepcopy(this.presences.get(actorID)!)
    : undefined,
};
```

Replace lines 2020-2029:

```typescript
// Before:
if (change.hasPresenceChange()) {
  events.push({
    type: DocEventType.PresenceChanged,
    source: OpSource.UndoRedo,
    value: {
      clientID: actorID,
      presence: this.getPresence(actorID)!,
    },
  });
}
```

With:

```typescript
if (change.hasPresenceChange()) {
  const presenceEvent = this.reconcilePresence(
    actorID,
    prev,
    OpSource.UndoRedo,
  );
  if (presenceEvent) {
    events.push(presenceEvent);
  }
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm sdk test test/integration/doc_presence_test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/document/document.ts
git commit -m "Refactor executeUndoRedo() to use reconcilePresence for event emission"
```

---

### Task 9: Full test suite verification

**Files:** None (verification only)

- [ ] **Step 1: Run all SDK tests**

Run: `pnpm sdk test`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS with zero warnings

- [ ] **Step 3: Run build**

Run: `pnpm sdk build`
Expected: PASS

- [ ] **Step 4: Commit any test fixes if needed**

If any tests fail due to the intentional timing change (initial presence event now deferred to Attached), update those tests to expect the correct behavior.
