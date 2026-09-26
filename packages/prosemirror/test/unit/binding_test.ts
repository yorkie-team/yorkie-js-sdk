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
    props: { editable: () => editable } as Record<string, unknown>,
    /** Replace the props and recompute `editable`, as ProseMirror's does. */
    update(props: Record<string, unknown>) {
      view.props = props;
      const editableProp = props.editable as
        | ((state: EditorState) => boolean)
        | undefined;
      view.editable = editableProp ? editableProp(view.state) : true;
    },
    /** Merge in the given props and update, like ProseMirror's `setProps`. */
    setProps(props: Record<string, unknown>) {
      view.update({ ...view.props, ...props });
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
 * subscription topic. `getDoc` supplies the PM document the tree mirrors, so
 * a test driving content edits can hand in the live view state.
 */
function createFakeDoc(
  getDoc: () => ReturnType<typeof doc> = () => doc(p('hello')),
) {
  const markMapping = buildMarkMapping(testSchema);
  const edits: Array<Array<unknown>> = [];
  const tree = {
    /** Serialize the tree as it currently mirrors the PM document. */
    toJSON() {
      return JSON.stringify(pmToYorkie(getDoc(), markMapping, 'span'));
    },
    /** Record an edit; the mirrored PM document already reflects it. */
    edit(...args: Array<unknown>) {
      edits.push(args);
    },
    /** Record a bulk edit. */
    editBulk(...args: Array<unknown>) {
      edits.push(args);
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
    edits,
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

/** Dispatch a content-changing transaction, as typing would. */
function typeText(
  view: ReturnType<typeof createFakeView>,
  text: string,
  pos: number,
) {
  const tr = view.state.tr.insertText(text, pos);
  assert.isAbove(tr.steps.length, 0, 'content edit must carry steps');
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

    // Turning off retracts the published selection, then stays silent.
    view.editable = false;
    moveCaret(view, 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
    assert.isUndefined(yorkieDoc.presenceUpdates[1].selection);

    view.editable = true;
    moveCaret(view, 4);
    assert.equal(yorkieDoc.presenceUpdates.length, 3);
    assert.isDefined(yorkieDoc.presenceUpdates[2].selection);
  });

  it('publishes the selection after a content edit', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    const errors: Array<string> = [];
    bind(view, yorkieDoc, {
      /** Fail loudly if the upstream sync path reports an error. */
      onLog(type, message) {
        if (type === 'error') errors.push(message);
      },
    });
    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    typeText(view, 'x', 3);
    assert.deepEqual(errors, []);
    assert.isAbove(yorkieDoc.edits.length, 0, 'content must reach the tree');
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
    assert.isDefined(yorkieDoc.presenceUpdates[1].selection);
  });

  it('publishes no selection on a content edit when publishing is off', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    const errors: Array<string> = [];
    bind(view, yorkieDoc, {
      publishSelection: false,
      /** Fail loudly if the upstream sync path reports an error. */
      onLog(type, message) {
        if (type === 'error') errors.push(message);
      },
    });

    typeText(view, 'x', 3);
    assert.deepEqual(errors, []);
    assert.isAbove(yorkieDoc.edits.length, 0, 'content must reach the tree');
    assert.equal(yorkieDoc.presenceUpdates.length, 0);
  });

  it('retracts the published selection once publishing turns off', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    bind(view, yorkieDoc);
    assert.isDefined(yorkieDoc.presenceUpdates[0].selection);

    view.editable = false;
    moveCaret(view, 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
    assert.property(yorkieDoc.presenceUpdates[1], 'selection');
    assert.isUndefined(yorkieDoc.presenceUpdates[1].selection);

    // Already retracted — no further presence writes while it stays off.
    moveCaret(view, 4);
    typeText(view, 'x', 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
  });

  it('retracts when the editable prop flips with no transaction', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    bind(view, yorkieDoc);
    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    // Turning an editor read-only is a prop update, not a transaction, and a
    // view left alone afterwards never produces one — so the retraction has
    // to happen here rather than wait for an edit or caret move.
    view.setProps({ editable: () => false });
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
    assert.property(yorkieDoc.presenceUpdates[1], 'selection');
    assert.isUndefined(yorkieDoc.presenceUpdates[1].selection);

    // Flipping back republishes, again without any transaction.
    view.setProps({ editable: () => true });
    assert.equal(yorkieDoc.presenceUpdates.length, 3);
    assert.isDefined(yorkieDoc.presenceUpdates[2].selection);
  });

  it('writes no presence for prop updates that keep publishing on', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    bind(view, yorkieDoc);
    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    view.setProps({ editable: () => true });
    view.setProps({ attributes: { class: 'editor' } });
    assert.equal(yorkieDoc.presenceUpdates.length, 1);
  });

  it('ignores the editable prop once destroyed', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    const binding = bind(view, yorkieDoc);
    binding.destroy();
    // destroy() retracts, so the write count is 2 before the prop update.
    const afterDestroy = yorkieDoc.presenceUpdates.length;

    view.setProps({ editable: () => false });
    assert.equal(yorkieDoc.presenceUpdates.length, afterDestroy);
  });

  it('retracts the published selection on destroy', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    const binding = bind(view, yorkieDoc);
    assert.isDefined(yorkieDoc.presenceUpdates[0].selection);

    // Peers drop a remote cursor only on a presence event carrying no
    // selection, so a binding that tears down without one leaves a ghost.
    binding.destroy();
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
    assert.property(yorkieDoc.presenceUpdates[1], 'selection');
    assert.isUndefined(yorkieDoc.presenceUpdates[1].selection);
  });

  it('writes no retraction on destroy when it never published', function () {
    const view = createFakeView(false);
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    const binding = bind(view, yorkieDoc);

    binding.destroy();
    assert.equal(yorkieDoc.presenceUpdates.length, 0);
  });

  it('detaches dispatchTransaction on destroy without an original prop', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    // A view built the ordinary way carries no dispatchTransaction prop.
    assert.isUndefined(view.props.dispatchTransaction);

    const binding = bind(view, yorkieDoc);
    assert.isDefined(view.props.dispatchTransaction);
    binding.destroy();
    const afterDestroy = yorkieDoc.presenceUpdates.length;

    // Post-destroy edits must reach neither the tree nor presence.
    typeText(view, 'x', 3);
    moveCaret(view, 3);
    assert.equal(yorkieDoc.edits.length, 0);
    assert.equal(yorkieDoc.presenceUpdates.length, afterDestroy);
  });

  it('leaves a dispatchTransaction wrapper installed after it alone', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    const binding = bind(view, yorkieDoc);

    const later = (tr: Transaction) => {
      view.updateState(view.state.apply(tr));
    };
    view.setProps({ dispatchTransaction: later });
    binding.destroy();

    assert.equal(view.props.dispatchTransaction, later);
  });

  it('retracts on a content edit once publishing turns off', function () {
    const view = createFakeView();
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    bind(view, yorkieDoc);
    assert.equal(yorkieDoc.presenceUpdates.length, 1);

    view.editable = false;
    typeText(view, 'x', 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 2);
    assert.property(yorkieDoc.presenceUpdates[1], 'selection');
    assert.isUndefined(yorkieDoc.presenceUpdates[1].selection);
  });

  it('publishes nothing to retract when it never published', function () {
    const view = createFakeView(false);
    const yorkieDoc = createFakeDoc(() => view.state.doc);
    bind(view, yorkieDoc);

    moveCaret(view, 3);
    typeText(view, 'x', 3);
    assert.equal(yorkieDoc.presenceUpdates.length, 0);
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
