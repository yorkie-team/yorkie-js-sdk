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

/**
 * `SessionLockHandle` represents an acquired, held session lock. It is held for
 * the lifetime of a document attachment and released on detach/deactivate.
 */
export interface SessionLockHandle {
  /**
   * `release` releases the held lock so a later tab can acquire it. It must be
   * idempotent: calling it more than once is a no-op.
   */
  release(): void;
}

/**
 * `SessionLock` is a pluggable, single-active-session guard used by the offline
 * persistence path. Offline persistence derives a *stable* actor from the app's
 * clientKey, so two browser tabs of the same app+user share that actor. Two live
 * tabs would then share one server checkpoint and mint colliding `clientSeq`
 * values — silent edit loss. The guard elects a single active session per
 * document key so the second tab fails fast instead of corrupting the store.
 *
 * The abstraction is injectable so it can be tested without a real browser: the
 * default {@link WebLocksSessionLock} is backed by the Web Locks API, and tests
 * pass an in-memory fake.
 */
export interface SessionLock {
  /**
   * `acquire` tries to acquire the lock named `name` without waiting. It
   * resolves with a {@link SessionLockHandle} when the lock was acquired, or
   * `undefined` when it is already held elsewhere (e.g. by another tab) — the
   * caller treats `undefined` as fail-fast.
   */
  acquire(name: string): Promise<SessionLockHandle | undefined>;
}

/**
 * `hasWebLocks` reports whether the Web Locks API is available in the current
 * runtime. It is absent in Node, workers without the API, and older browsers.
 */
function hasWebLocks(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.locks &&
    typeof navigator.locks.request === 'function'
  );
}

/**
 * `WebLocksSessionLock` is the default {@link SessionLock}, backed by the Web
 * Locks API (`navigator.locks.request` with `{ ifAvailable: true }`).
 *
 * A Web Lock is held for as long as the promise returned from the request's
 * callback stays pending. To hold the lock for the whole attachment lifetime,
 * `acquire` keeps that callback pending on a promise that only resolves when the
 * returned handle's `release` is called. When the lock is already held (another
 * tab), `ifAvailable` invokes the callback with a `null` lock and `acquire`
 * resolves `undefined` — the fail-fast signal.
 *
 * When the Web Locks API is unavailable (non-browser runtimes), this is a no-op:
 * `acquire` always resolves a handle whose `release` does nothing, so it never
 * breaks non-browser usage. Multi-tab safety simply does not apply there.
 */
export class WebLocksSessionLock implements SessionLock {
  /**
   * `acquire` acquires the named lock without waiting, or resolves `undefined`
   * when it is already held elsewhere.
   */
  public acquire(name: string): Promise<SessionLockHandle | undefined> {
    if (!hasWebLocks()) {
      // No Web Locks in this runtime: treat as always available (no-op guard).
      return Promise.resolve({ release: () => {} });
    }

    return new Promise<SessionLockHandle | undefined>(
      (resolveAcquire, reject) => {
        // `releaseHeld` resolves the callback's held promise, which is what
        // releases the underlying Web Lock. Set once the callback runs.
        let releaseHeld: (() => void) | undefined;
        let released = false;

        navigator
          .locks!.request(name, { ifAvailable: true }, (lock) => {
            if (!lock) {
              // Held by another tab: fail fast.
              resolveAcquire(undefined);
              return;
            }

            // Hold the lock until `release` is called on the returned handle.
            return new Promise<void>((resolveHeld) => {
              releaseHeld = resolveHeld;
              resolveAcquire({
                release: () => {
                  if (released) {
                    return;
                  }
                  released = true;
                  releaseHeld?.();
                },
              });
            });
          })
          .catch(reject);
      },
    );
  }
}
