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
function createMockView(initialDoc = doc(p('hello'))) {
  let state = EditorState.create({ doc: initialDoc, schema: testSchema });
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

/**
 * Mirror an `EditorView` that was destroyed first: `isDestroyed` is set, and
 * everything that runs into the nulled `docView` — `state`, `dispatch`,
 * `setProps` — throws.
 */
function markViewDestroyed(view: ReturnType<typeof createMockView>): void {
  const destroyed = () => {
    throw new TypeError('view is destroyed');
  };
  Object.defineProperty(view, 'state', { get: destroyed });
  Object.assign(view, {
    isDestroyed: true,
    dispatch: destroyed,
    updateState: destroyed,
    setProps: destroyed,
  });
}

/**
 * Yorkie document stand-in holding a tree that mirrors the PM doc. `text` is
 * the paragraph content the tree serializes, so a test can swap it out before
 * emitting a snapshot.
 */
function createMockDoc() {
  const handlers: Array<(event: unknown) => void> = [];
  const tree = {
    text: 'hello',
    /**
     * A second paragraph, serialized only once set. It lets a test produce a
     * remote diff that lands outside the block being composed in the first.
     */
    tailText: undefined as string | undefined,
    /** Serialize the tree, matching the mock view's initial PM doc. */
    toJSON() {
      const paragraphs = [yElem('paragraph', [yText(tree.text)])];
      if (tree.tailText !== undefined) {
        paragraphs.push(yElem('paragraph', [yText(tree.tailText)]));
      }
      return JSON.stringify(yElem('doc', paragraphs));
    },
    /** Presence writes go through this; the value itself is not asserted. */
    indexRangeToPosRange(range: [number, number]) {
      return range;
    },
  };
  const root = { tree };

  return {
    tree,
    /** Deliver a document event to every subscriber. */
    emit(event: unknown) {
      for (const handler of handlers) handler(event);
    },
    /** Return the document root. */
    getRoot() {
      return root;
    },
    update(fn: (root: unknown, presence: unknown) => void) {
      fn(root, { set: () => undefined });
    },
    /** Record a subscriber so `emit` can reach it. */
    subscribe(topicOrHandler: unknown) {
      if (typeof topicOrHandler === 'function') {
        handlers.push(topicOrHandler as (event: unknown) => void);
      }
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
  function setup(client = createMockClient(), syncMode?: SyncMode) {
    const view = createMockView();
    const yorkieDoc = createMockDoc();
    const binding = new YorkieProseMirrorBinding(
      view as any,
      yorkieDoc,
      'tree',
      {
        client,
        syncMode,
      },
    );
    binding.initialize();
    return { view, yorkieDoc, client, binding };
  }

  /**
   * Build a binding over a two-paragraph document, with the caret — and so the
   * composing block — in the first one. Editing `tree.tailText` then produces a
   * remote diff that misses the composing block.
   */
  function setupTwoBlocks(syncMode?: SyncMode) {
    const view = createMockView(doc(p('hello'), p('world')));
    const yorkieDoc = createMockDoc();
    yorkieDoc.tree.tailText = 'world';
    const client = createMockClient();
    const binding = new YorkieProseMirrorBinding(
      view as any,
      yorkieDoc,
      'tree',
      { client, syncMode },
    );
    binding.initialize();
    return { view, yorkieDoc, client, binding };
  }

  /** Emit a remote tree edit, as the document subscription would see it. */
  function emitTreeEdit(yorkieDoc: ReturnType<typeof createMockDoc>) {
    yorkieDoc.emit({
      type: 'remote-change',
      value: { operations: [{ type: 'tree-edit' }] },
    });
  }

  it('should apply a remote change outside the composing block while paused', async () => {
    const { view, yorkieDoc } = setupTwoBlocks();

    view.fire('compositionstart');
    await tick();

    // Realtime parks the document in push-only for the composition, so only
    // the stragglers that beat `changeSyncMode` reach here. Applying one that
    // misses the composing block keeps the view from falling behind.
    yorkieDoc.tree.tailText = 'world!';
    emitTreeEdit(yorkieDoc);

    assert.equal(view.state.doc.textContent, 'helloworld!');
  });

  it('should defer a remote change outside the composing block when unpaused', async () => {
    const { view, yorkieDoc } = setupTwoBlocks(SyncMode.Polling);

    view.fire('compositionstart');
    await tick();

    // Polling is left in its own mode, so remote packs keep arriving for the
    // whole composition. Applying each one — even outside the composing block
    // — would redraw the view under the browser's composing text node.
    yorkieDoc.tree.tailText = 'world!';
    emitTreeEdit(yorkieDoc);
    assert.equal(view.state.doc.textContent, 'helloworld');

    view.fire('compositionend');
    await flushFrames();
    assert.equal(view.state.doc.textContent, 'helloworld!');
  });

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

  it('should leave the sync mode of a polling document alone', async () => {
    // Polling is a stream-less mode: `Client.changeSyncMode` awaits
    // `runWatchLoop()` on the way into RealtimePushOnly and cancels the
    // stream on the way back, so pausing here would open and tear down a
    // watch stream on every composition. The deferral in `onRemoteChange`
    // guards the composing text node without any of that.
    const { view, client } = setup(createMockClient(), SyncMode.Polling);

    view.fire('compositionstart');
    await new Promise((resolve) => setTimeout(resolve, 0));
    view.fire('compositionend');
    await flushFrames();

    assert.deepEqual(client.modes, []);
  });

  it('should leave the sync mode of a manual document alone', async () => {
    // Nothing arrives under Manual unless the host syncs, and parking it in
    // RealtimePushOnly would start pushing on a schedule it opted out of.
    const { view, client } = setup(createMockClient(), SyncMode.Manual);

    view.fire('compositionstart');
    await new Promise((resolve) => setTimeout(resolve, 0));
    view.fire('compositionend');
    await flushFrames();

    assert.deepEqual(client.modes, []);
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

  it('should apply a snapshot to the view right away when not composing', () => {
    const { view, yorkieDoc } = setup();

    yorkieDoc.tree.text = 'hello world';
    yorkieDoc.emit({ type: 'snapshot', source: 'remote' });

    assert.equal(view.state.doc.textContent, 'hello world');
  });

  it('should defer a snapshot applied mid-composition until it ends', async () => {
    const { view, yorkieDoc } = setup();

    view.fire('compositionstart');
    await tick();
    // An explicit client.sync(doc) pulls even in push-only mode, so a
    // snapshot can land mid-composition; the view must not change under it.
    yorkieDoc.tree.text = 'hello world';
    yorkieDoc.emit({ type: 'snapshot', source: 'remote' });
    assert.equal(view.state.doc.textContent, 'hello');

    view.fire('compositionend');
    await flushFrames();
    assert.equal(view.state.doc.textContent, 'hello world');
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

  it('should not touch a view destroyed before the binding', () => {
    const { view, binding } = setup();
    markViewDestroyed(view);

    assert.doesNotThrow(() => binding.destroy());
  });

  it('should ignore document events between view.destroy and binding.destroy', () => {
    const { view, yorkieDoc, binding } = setup();
    const dispatchedOnSetup = view.dispatched.length;
    markViewDestroyed(view);

    // The subscriptions stay live until binding.destroy() runs, so anything
    // arriving in this window must not reach the view.
    assert.doesNotThrow(() => yorkieDoc.emit({ type: 'snapshot' }));
    assert.doesNotThrow(() =>
      yorkieDoc.emit({
        type: 'remote-change',
        value: { operations: [{ type: 'tree-edit' }] },
      }),
    );
    assert.lengthOf(view.dispatched, dispatchedOnSetup);

    binding.destroy();
  });

  it('should still resume sync when the view dies mid-composition', async () => {
    const { view, client, binding } = setup();
    const dispatchedOnSetup = view.dispatched.length;

    view.fire('compositionstart');
    await tick();
    view.fire('compositionend');
    markViewDestroyed(view);

    // The deferred frame cannot apply anything into a destroyed view, but it
    // is also the only thing that takes the document back out of push-only.
    await flushFrames();

    assert.deepEqual(client.modes, [
      SyncMode.RealtimePushOnly,
      SyncMode.Realtime,
    ]);
    assert.lengthOf(view.dispatched, dispatchedOnSetup);

    binding.destroy();
  });

  it('should leave a consumer dispatch alone when destroy() never initialized', () => {
    const view = createMockView();
    const consumerDispatch = () => undefined;
    view.setProps({ dispatchTransaction: consumerDispatch });
    const binding = new YorkieProseMirrorBinding(
      view as any,
      createMockDoc(),
      'tree',
      { client: createMockClient() },
    );

    // No initialize(), so the binding never installed an override and has no
    // prop of its own to hand back — writing one would erase the consumer's.
    binding.destroy();

    assert.equal(view.props.dispatchTransaction, consumerDispatch);
  });

  it('should not clobber a dispatch reinstalled after the first destroy', () => {
    const { view, binding } = setup();

    binding.destroy();
    const consumerDispatch = () => undefined;
    view.setProps({ dispatchTransaction: consumerDispatch });

    binding.destroy();

    assert.equal(view.props.dispatchTransaction, consumerDispatch);
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
