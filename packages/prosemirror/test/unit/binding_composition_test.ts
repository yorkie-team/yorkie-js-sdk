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

import { describe, it, assert, beforeEach, afterEach } from 'vitest';
import { EditorState, type Transaction } from 'prosemirror-state';
import { SyncMode } from '@yorkie-js/sdk';
import { YorkieProseMirrorBinding } from '../../src/binding';
import { doc, p, testSchema, yElem, yText } from './helpers';

/**
 * Minimal `EditorView` stand-in: enough state, DOM event registration and
 * transaction plumbing for the binding to attach to without a real DOM.
 */
function createMockView() {
  let state = EditorState.create({ doc: doc(p('hello')), schema: testSchema });
  const listeners = new Map<string, () => void>();
  const props: Record<string, unknown> = {};
  const dispatched: Array<Transaction> = [];

  return {
    props,
    /** Every transaction the binding pushed into the view. */
    dispatched,
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      dispatched.push(tr);
      state = state.apply(tr);
    },
    updateState(next: EditorState) {
      state = next;
    },
    setProps(next: Record<string, unknown>) {
      Object.assign(props, next);
    },
    dom: {
      addEventListener(type: string, handler: () => void) {
        listeners.set(type, handler);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    },
    /** Fire a composition event the binding subscribed to. */
    fire(type: 'compositionstart' | 'compositionend') {
      listeners.get(type)?.();
    },
  };
}

/** Yorkie document stand-in holding a tree that mirrors the PM doc. */
function createMockDoc() {
  const tree = {
    /** Serialize the tree, matching the mock view's initial PM doc. */
    toJSON() {
      return JSON.stringify(
        yElem('doc', [yElem('paragraph', [yText('hello')])]),
      );
    },
    /** Presence writes go through this; the value itself is not asserted. */
    indexRangeToPosRange(range: [number, number]) {
      return range;
    },
  };
  const root = { tree };

  return {
    /** Return the document root. */
    getRoot() {
      return root;
    },
    update(fn: (root: unknown, presence: unknown) => void) {
      fn(root, { set: () => undefined });
    },
    /** Remote-change subscription; the tests never emit one. */
    subscribe() {
      return () => undefined;
    },
  };
}

/**
 * Client stand-in recording every sync-mode transition the binding asks for.
 *
 * `failures` rejects that many `changeSyncMode` calls (optionally only for
 * `failMode`), and `deferred` holds every request in flight until `settle()`
 * is called — the state a short composition ends in.
 */
function createMockClient(
  options: { failures?: number; failMode?: SyncMode; deferred?: boolean } = {},
) {
  const { failures = 0, failMode, deferred = false } = options;
  const modes: Array<SyncMode> = [];
  const pending: Array<() => void> = [];
  let remainingFailures = failures;
  return {
    modes,
    /** Resolve every request left in flight by `deferred` mode. */
    settle() {
      for (const resolve of pending.splice(0)) resolve();
    },
    changeSyncMode(_doc: unknown, syncMode: SyncMode) {
      modes.push(syncMode);
      if (
        remainingFailures > 0 &&
        (failMode === undefined || syncMode === failMode)
      ) {
        remainingFailures--;
        return Promise.reject(new Error('network down'));
      }
      if (!deferred) return Promise.resolve(_doc);
      return new Promise<void>((resolve) => pending.push(() => resolve()));
    },
  };
}

describe('YorkieProseMirrorBinding – composition sync mode', () => {
  /** Frames scheduled but not yet run, keyed by the handle rAF handed out. */
  let frames: Map<number, () => void>;
  let nextFrameHandle: number;
  let originalRAF: typeof globalThis.requestAnimationFrame | undefined;
  let originalCAF: typeof globalThis.cancelAnimationFrame | undefined;

  beforeEach(() => {
    frames = new Map();
    nextFrameHandle = 1;
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      const handle = nextFrameHandle++;
      frames.set(handle, cb);
      return handle;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) => {
      frames.delete(handle);
    }) as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame =
      originalRAF as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame =
      originalCAF as typeof globalThis.cancelAnimationFrame;
  });

  /** Let queued promises (the sync-mode queue) settle. */
  function tick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** Run the queued animation frames and let queued sync modes settle. */
  async function flushFrames() {
    const queued = Array.from(frames.values());
    frames.clear();
    for (const frame of queued) frame();
    await tick();
  }

  /** Build an initialized binding wired to the mocks above. */
  function setup(client = createMockClient()) {
    const view = createMockView();
    const binding = new YorkieProseMirrorBinding(
      view as any,
      createMockDoc(),
      'tree',
      { client },
    );
    binding.initialize();
    return { view, client, binding };
  }

  it('should keep pushing local changes while composing', async () => {
    const { view, client } = setup();

    view.fire('compositionstart');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(client.modes, [SyncMode.RealtimePushOnly]);
    assert.notInclude(client.modes, SyncMode.RealtimeSyncOff);
  });

  it('should return to realtime after composition ends', async () => {
    const { view, client } = setup();

    view.fire('compositionstart');
    await new Promise((resolve) => setTimeout(resolve, 0));
    view.fire('compositionend');
    await flushFrames();

    assert.deepEqual(client.modes, [
      SyncMode.RealtimePushOnly,
      SyncMode.Realtime,
    ]);
  });

  it('should stay push-only when a new composition starts before the flush', async () => {
    const { view, client } = setup();

    view.fire('compositionstart');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Korean IMEs fire compositionend/compositionstart back to back between
    // syllables; the pending frame must not resume sync in that window.
    view.fire('compositionend');
    view.fire('compositionstart');
    await flushFrames();

    assert.deepEqual(client.modes, [SyncMode.RealtimePushOnly]);
  });

  it('should resume realtime when the composition ends before the pause settles', async () => {
    const { view, client } = setup(createMockClient({ deferred: true }));

    view.fire('compositionstart');
    await tick();
    // The pause is in flight — requested but unresolved — so the binding's
    // `isSyncPaused` is still false. Unless the flush treats the *requested*
    // mode as paused too, it early-returns and the document is stranded in
    // push-only mode, never receiving another remote change.
    assert.deepEqual(client.modes, [SyncMode.RealtimePushOnly]);

    view.fire('compositionend');
    await flushFrames();
    client.settle();
    await tick();
    client.settle();
    await tick();

    assert.deepEqual(client.modes, [
      SyncMode.RealtimePushOnly,
      SyncMode.Realtime,
    ]);
  });

  it('should retry a failed resume instead of stranding push-only mode', async () => {
    // The first resume request rejects; nothing but the retry re-drives it.
    const { view, client } = setup(
      createMockClient({ failures: 1, failMode: SyncMode.Realtime }),
    );

    view.fire('compositionstart');
    await tick();
    view.fire('compositionend');
    await flushFrames();

    assert.deepEqual(client.modes, [
      SyncMode.RealtimePushOnly,
      SyncMode.Realtime,
      SyncMode.Realtime,
    ]);
  });

  it('should cancel the previous flush frame when another flush is scheduled', async () => {
    const { view } = setup();

    view.fire('compositionstart');
    await tick();
    view.fire('compositionend');
    assert.equal(frames.size, 1);

    // A second composition ends before the first frame ran: the stale frame
    // must be cancelled rather than left to fire twice.
    view.fire('compositionstart');
    view.fire('compositionend');
    assert.equal(frames.size, 1);
  });

  it('should cancel a pending flush frame on destroy', async () => {
    const { view, binding } = setup();

    view.fire('compositionstart');
    await tick();
    view.fire('compositionend');
    assert.equal(frames.size, 1);

    binding.destroy();
    assert.equal(frames.size, 0);
  });

  it('should not touch the view when a flush frame fires after destroy', async () => {
    const { view, binding } = setup();

    view.fire('compositionstart');
    await tick();
    view.fire('compositionend');

    // Grab the callback the browser already committed to running, so the
    // `isDestroyed` guard — not the cancellation — is what is under test.
    const [frame] = Array.from(frames.values());
    frames.clear();
    binding.destroy();
    await tick();
    const dispatchedBeforeFrame = view.dispatched.length;

    frame();

    assert.equal(view.dispatched.length, dispatchedBeforeFrame);
  });

  it('should stop syncing to the document after destroy', async () => {
    const { view, binding } = setup();

    binding.destroy();
    await tick();

    // The view had no dispatchTransaction of its own, so destroy() must hand
    // the prop back as undefined rather than leaving the override installed.
    assert.isUndefined(view.props.dispatchTransaction);
  });

  it('should resume realtime on destroy', async () => {
    const { view, client, binding } = setup();

    view.fire('compositionstart');
    await tick();
    binding.destroy();
    await tick();

    assert.deepEqual(client.modes, [
      SyncMode.RealtimePushOnly,
      SyncMode.Realtime,
    ]);
  });
});
