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

import { describe, it, assert } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { YorkieProseMirrorBinding } from '../../src/binding';
import { buildMarkMapping } from '../../src/defaults';
import { pmToYorkie } from '../../src/convert';
import type { YorkieProseMirrorOptions } from '../../src/types';
import { doc, p, testSchema } from './helpers';

/**
 * Minimal stand-in for `EditorView`. The package's vitest config declares no
 * `environment`, so these tests run in node with no DOM, while
 * `prosemirror-state` itself is DOM-free.
 */
function createFakeView(editable = true) {
  const state = EditorState.create({
    schema: testSchema,
    doc: doc(p('hello')),
  });
  const view = {
    state,
    editable,
    dom: {
      /** No-op listener registration. */
      addEventListener() {},
      /** No-op listener removal. */
      removeEventListener() {},
    },
    props: {} as Record<string, unknown>,
    /** Record props the binding installs, like ProseMirror's `setProps`. */
    setProps(props: Record<string, unknown>) {
      Object.assign(view.props, props);
    },
    /** Replace the current state. */
    updateState(next: EditorState) {
      view.state = next;
    },
    /** Route through the installed `dispatchTransaction`, if any. */
    dispatch(tr: Transaction) {
      const dispatchTransaction = view.props.dispatchTransaction as
        | ((tr: Transaction) => void)
        | undefined;
      if (dispatchTransaction) {
        dispatchTransaction(tr);
      } else {
        view.updateState(view.state.apply(tr));
      }
    },
  };
  return view;
}

/**
 * Yorkie document stand-in that records every presence write and every
 * subscription topic.
 */
function createFakeDoc(pmDoc = doc(p('hello'))) {
  const markMapping = buildMarkMapping(testSchema);
  const treeJSON = pmToYorkie(pmDoc, markMapping, 'span');
  const tree = {
    /** Serialize the fixed tree. */
    toJSON() {
      return JSON.stringify(treeJSON);
    },
    /** Return an opaque position range for the given index range. */
    indexRangeToPosRange(range: [number, number]) {
      return [{ idx: range[0] }, { idx: range[1] }];
    },
  };
  const presenceUpdates: Array<Record<string, unknown>> = [];
  const topics: Array<string> = [];
  const root = { content: tree };

  return {
    presenceUpdates,
    topics,
    /** Return the fake root holding the tree. */
    getRoot() {
      return root;
    },
    /** Run the updater with a presence recorder. */
    update(fn: (root: unknown, presence: unknown) => void) {
      fn(root, {
        /** Record a presence write. */
        set(value: Record<string, unknown>) {
          presenceUpdates.push(value);
        },
      });
    },
    /** Record the subscribed topic and hand back a no-op unsubscribe. */
    subscribe(topicOrHandler: unknown) {
      topics.push(
        typeof topicOrHandler === 'string' ? topicOrHandler : 'document',
      );
      return () => {};
    },
  };
}

/** Build and initialize a binding over the fakes. */
function bind(
  view: ReturnType<typeof createFakeView>,
  yorkieDoc: ReturnType<typeof createFakeDoc>,
  options: YorkieProseMirrorOptions = {},
) {
  const binding = new YorkieProseMirrorBinding(
    view as unknown as EditorView,
    yorkieDoc,
    'content',
    options,
  );
  binding.initialize();
  return binding;
}

/** Dispatch a selection-only transaction, as a click in the editor would. */
function moveCaret(view: ReturnType<typeof createFakeView>, pos: number) {
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, pos),
  );
  assert.equal(tr.steps.length, 0, 'caret move must carry no steps');
  view.dispatch(tr);
}

describe('YorkieProseMirrorBinding presence publishing', function () {
  it('publishes the local selection by default', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc();
    bind(view, yorkieDoc);

    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    moveCaret(view, 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
    assert.isDefined(yorkieDoc.presenceUpdates[1].selection);
  });

  it('publishes nothing when publishSelection is false', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc();
    bind(view, yorkieDoc, { publishSelection: false });

    assert.equal(yorkieDoc.presenceUpdates.length, 0);

    moveCaret(view, 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 0);
  });

  it('publishes nothing for a non-editable view by default', function () {
    const view = createFakeView(false);
    const yorkieDoc = createFakeDoc();
    bind(view, yorkieDoc);

    assert.equal(yorkieDoc.presenceUpdates.length, 0);

    moveCaret(view, 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 0);
  });

  it('publishes for a non-editable view when asked explicitly', function () {
    const view = createFakeView(false);
    const yorkieDoc = createFakeDoc();
    bind(view, yorkieDoc, { publishSelection: true });

    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    moveCaret(view, 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
  });

  it('follows the editable prop as it changes', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc();
    bind(view, yorkieDoc);
    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    view.editable = false;
    moveCaret(view, 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    view.editable = true;
    moveCaret(view, 4);
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
  });

  it('keeps receiving others presence while publishing is off', function () {
    const view = createFakeView(false);
    const yorkieDoc = createFakeDoc();
    bind(view, yorkieDoc, {
      publishSelection: false,
      cursors: {
        enabled: true,
        overlayElement: {} as HTMLElement,
      },
    });

    assert.include(yorkieDoc.topics, 'others');
    assert.equal(yorkieDoc.presenceUpdates.length, 0);
  });
});
