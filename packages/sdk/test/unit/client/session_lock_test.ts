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
// offline persistence path. They exercise the `SessionLock` abstraction and
// `acquireSessionLock` — the guard decision itself — directly (acquire → held →
// fail-fast → release → re-acquire), plus the no-op fallback when
// `navigator.locks` is absent.
//
// `acquireSessionLock` is the *same function* `attach()` calls, not a model of
// it. That matters more here than the usual preference: these tests used to
// re-state the decision inline, which is a shape that keeps passing while the
// real path regresses, and a regression in this particular guard means two tabs
// sharing one checkpoint and silently losing edits. What still needs a running
// server is the surrounding attach() plumbing (the RPC, the handle's lifetime
// across detach), which stays integration-level.

import { afterEach, describe, it, assert, expect, vi } from 'vitest';
import {
  SessionLock,
  SessionLockHandle,
  WebLocksSessionLock,
  acquireSessionLock,
} from '@yorkie-js/sdk/src/client/session-lock';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

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

describe('single-active-session guard decision', () => {
  const name = 'yorkie-session:api/clientKey/docKey';
  const docKey = 'docKey';

  it('first attach-path acquisition succeeds and holds', async () => {
    const lock = new FakeSessionLock();
    const handle = await acquireSessionLock(lock, name, docKey);
    assert.isDefined(handle);
    assert.isTrue((lock as FakeSessionLock).isHeld(name));
  });

  it('second attach-path acquisition fails fast while the first holds', async () => {
    const lock = new FakeSessionLock();
    await acquireSessionLock(lock, name, docKey);
    await expect(acquireSessionLock(lock, name, docKey)).rejects.toThrow(
      /already open in another tab/,
    );
  });

  it('names the document and its own error code on fail-fast', async () => {
    // The code is what a consumer branches on — wafflebase falls back to a
    // non-persisting client on exactly this rejection — so it must be
    // distinguishable from any other invalid argument without matching on
    // message text.
    const lock = new FakeSessionLock();
    await acquireSessionLock(lock, name, docKey);
    try {
      await acquireSessionLock(lock, name, docKey);
      assert.fail('expected the second acquisition to reject');
    } catch (err) {
      assert.instanceOf(err, YorkieError);
      assert.equal((err as YorkieError).code, Code.ErrDocumentOpenElsewhere);
      assert.match((err as YorkieError).message, /"docKey"/);
    }
  });

  it('a new acquisition succeeds after the first releases (detach)', async () => {
    const lock = new FakeSessionLock();
    const first = await acquireSessionLock(lock, name, docKey);
    first.release();
    const second = await acquireSessionLock(lock, name, docKey);
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
