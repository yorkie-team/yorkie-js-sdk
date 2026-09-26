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

  return {
    props,
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
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

/** Client stand-in recording every sync-mode transition the binding asks for. */
function createMockClient() {
  const modes: Array<SyncMode> = [];
  return {
    modes,
    changeSyncMode(_doc: unknown, syncMode: SyncMode) {
      modes.push(syncMode);
      return Promise.resolve(_doc);
    },
  };
}

describe('YorkieProseMirrorBinding – composition sync mode', () => {
  let frames: Array<() => void>;
  let originalRAF: typeof globalThis.requestAnimationFrame | undefined;

  beforeEach(() => {
    frames = [];
    originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      frames.push(cb);
      return frames.length;
    }) as typeof globalThis.requestAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame =
      originalRAF as typeof globalThis.requestAnimationFrame;
  });

  /** Run the queued animation frames and let queued sync modes settle. */
  async function flushFrames() {
    const queued = frames;
    frames = [];
    for (const frame of queued) frame();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** Build an initialized binding wired to the mocks above. */
  function setup() {
    const view = createMockView();
    const client = createMockClient();
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

  it('should resume realtime on destroy', async () => {
    const { view, client, binding } = setup();

    view.fire('compositionstart');
    await new Promise((resolve) => setTimeout(resolve, 0));
    binding.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(client.modes, [
      SyncMode.RealtimePushOnly,
      SyncMode.Realtime,
    ]);
  });
});
