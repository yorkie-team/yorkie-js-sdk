/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// These are pure unit tests for the single-active-session guard used by the
// offline persistence path. They exercise the `SessionLock` abstraction and the
// guard decision directly (acquire → held → fail-fast → release → re-acquire),
// plus the no-op fallback when `navigator.locks` is absent. Wiring the guard
// into the real `attach()` needs a running server (attach round-trips an RPC),
// so full attach() coverage is an integration-level gap noted in the design; the
// decision logic modeled here is exactly what `attach()` runs before that RPC.

import { afterEach, describe, it, assert, expect, vi } from 'vitest';
import {
  SessionLock,
  SessionLockHandle,
  WebLocksSessionLock,
} from '@yorkie-js/sdk/src/client/session-lock';

/**
 * `FakeSessionLock` is an in-memory `SessionLock` modeling one lock namespace
 * shared across "tabs": while a name is held, a second `acquire` of the same
 * name returns `undefined` (fail-fast). `release` frees it for a later
 * acquisition. It carries no timers or async so tests stay deterministic.
 */
class FakeSessionLock implements SessionLock {
  private held = new Set<string>();

  public acquire(name: string): Promise<SessionLockHandle | undefined> {
    if (this.held.has(name)) {
      return Promise.resolve(undefined);
    }
    this.held.add(name);
    let released = false;
    return Promise.resolve({
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.held.delete(name);
      },
    });
  }

  /**
   * `isHeld` reports whether the given name is currently held. Test-only.
   */
  public isHeld(name: string): boolean {
    return this.held.has(name);
  }
}

describe('SessionLock (fake, in-memory)', () => {
  const name = 'yorkie-session:api/clientKey/docKey';

  it('acquires the lock and holds it (models the first tab)', async () => {
    const lock = new FakeSessionLock();
    const handle = await lock.acquire(name);
    assert.isDefined(handle);
    assert.isTrue(lock.isHeld(name));
  });

  it('fails fast on a second acquire while held (models a second tab)', async () => {
    const lock = new FakeSessionLock();
    const first = await lock.acquire(name);
    assert.isDefined(first);

    // A second tab acquiring the same key while the first holds it fails fast.
    const second = await lock.acquire(name);
    assert.isUndefined(second);
  });

  it('hands back to a later tab after release (detach then re-attach)', async () => {
    const lock = new FakeSessionLock();
    const first = await lock.acquire(name);
    assert.isDefined(first);

    first!.release();
    assert.isFalse(lock.isHeld(name));

    // A later tab can now acquire the freed lock.
    const second = await lock.acquire(name);
    assert.isDefined(second);
    assert.isTrue(lock.isHeld(name));
  });

  it('release is idempotent', async () => {
    const lock = new FakeSessionLock();
    const handle = await lock.acquire(name);
    handle!.release();
    // A second release must not free a lock re-acquired by someone else.
    const other = await lock.acquire(name);
    assert.isDefined(other);
    handle!.release();
    assert.isTrue(lock.isHeld(name));
  });

  it('isolates distinct document keys', async () => {
    const lock = new FakeSessionLock();
    const a = await lock.acquire('yorkie-session:api/clientKey/docA');
    const b = await lock.acquire('yorkie-session:api/clientKey/docB');
    assert.isDefined(a);
    assert.isDefined(b);
  });
});

/**
 * `simulateGuard` models exactly the decision `attach()` makes on the
 * store-backed path: acquire the lock; an absent result is the fail-fast signal
 * translated into a rejected attach. It returns the held handle on success or
 * throws on fail-fast, so the guard behavior is tested without a server.
 */
async function simulateGuard(
  lock: SessionLock,
  name: string,
): Promise<SessionLockHandle> {
  const handle = await lock.acquire(name);
  if (!handle) {
    throw new Error('already open in another tab under offline persistence');
  }
  return handle;
}

describe('single-active-session guard decision', () => {
  const name = 'yorkie-session:api/clientKey/docKey';

  it('first attach-path acquisition succeeds and holds', async () => {
    const lock = new FakeSessionLock();
    const handle = await simulateGuard(lock, name);
    assert.isDefined(handle);
    assert.isTrue((lock as FakeSessionLock).isHeld(name));
  });

  it('second attach-path acquisition fails fast while the first holds', async () => {
    const lock = new FakeSessionLock();
    await simulateGuard(lock, name);
    await expect(simulateGuard(lock, name)).rejects.toThrow(
      /already open in another tab/,
    );
  });

  it('a new acquisition succeeds after the first releases (detach)', async () => {
    const lock = new FakeSessionLock();
    const first = await simulateGuard(lock, name);
    first.release();
    const second = await simulateGuard(lock, name);
    assert.isDefined(second);
  });
});

describe('WebLocksSessionLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op when navigator.locks is unavailable (non-browser)', async () => {
    // No `navigator` global (Node-like): acquire must resolve a usable handle,
    // never throw, so non-browser usage is unaffected.
    vi.stubGlobal('navigator', undefined);
    const lock = new WebLocksSessionLock();
    const handle = await lock.acquire('yorkie-session:api/clientKey/docKey');
    assert.isDefined(handle);
    // release is a no-op but must not throw.
    handle!.release();
  });

  it('is a no-op when navigator exists without the locks API', async () => {
    vi.stubGlobal('navigator', {} as Navigator);
    const lock = new WebLocksSessionLock();
    const handle = await lock.acquire('yorkie-session:api/clientKey/docKey');
    assert.isDefined(handle);
    handle!.release();
  });

  it('holds via Web Locks and fails fast when already held', async () => {
    // Minimal in-memory model of `navigator.locks.request(name, {ifAvailable},
    // cb)`: the callback runs with a truthy lock when free (holding it until the
    // returned promise resolves) or with `null` when already held.
    const held = new Set<string>();
    const request = (
      lockName: string,
      _opts: { ifAvailable?: boolean },
      cb: (lock: unknown) => unknown,
    ): Promise<void> => {
      if (held.has(lockName)) {
        return Promise.resolve(cb(null)).then(() => {});
      }
      held.add(lockName);
      const result = cb({ name: lockName });
      // Holding: the callback returned a pending promise; free on resolve.
      return Promise.resolve(result).then(() => {
        held.delete(lockName);
      });
    };
    vi.stubGlobal('navigator', { locks: { request } } as unknown as Navigator);

    const lock = new WebLocksSessionLock();
    const name = 'yorkie-session:api/clientKey/docKey';
    const first = await lock.acquire(name);
    assert.isDefined(first);
    assert.isTrue(held.has(name));

    // Second acquisition while held fails fast.
    const second = await lock.acquire(name);
    assert.isUndefined(second);

    // Release frees the underlying Web Lock; a later acquisition succeeds.
    // The mock frees on a microtask (matching the real API's async release), so
    // yield once before asserting the lock is free.
    first!.release();
    await Promise.resolve();
    assert.isFalse(held.has(name));
    const third = await lock.acquire(name);
    assert.isDefined(third);
  });
});
