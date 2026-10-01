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

import { describe, it, assert, afterEach, beforeEach } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import {
  EditorState,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { YorkieProseMirrorBinding } from '../../src/binding';
import { pmToYorkie } from '../../src/convert';
import { defaultMarkMapping, invertMapping } from '../../src/defaults';
import { syncToYorkie } from '../../src/diff';
import { buildDocFromYorkieTree } from '../../src/sync';
import { doc, p, testSchema } from './helpers';

type TestDoc = Document<{ t: Tree }>;

/**
 * Exchange the pending local changes of two in-process replicas, as a server
 * round trip would.
 */
function crossSync(d1: TestDoc, d2: TestDoc): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();
  const deliver = (to: TestDoc, pack: typeof p1) =>
    to.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        pack.getChanges(),
        InitialVersionVector,
      ),
    );
  deliver(d2, p1);
  deliver(d1, p2);
  const ack = (from: TestDoc, pack: typeof p1) => {
    const changes = pack.getChanges();
    const lastSeq = changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
    from.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        [],
        InitialVersionVector,
      ),
    );
  };
  ack(d1, p1);
  ack(d2, p2);
}

/** Two replicas that both hold `initial`. */
function replicas(initial: PMNode): [TestDoc, TestDoc] {
  const d1: TestDoc = new Document('test-doc');
  const d2: TestDoc = new Document('test-doc');
  d1.setActor('000000000000000000000001');
  d2.setActor('000000000000000000000002');
  d1.update((root) => {
    root.t = new Tree(pmToYorkie(initial, defaultMarkMapping) as any);
  });
  crossSync(d1, d2);
  return [d1, d2];
}

/** Push the PM edit `before → after` into `d`, as the peer's binding would. */
function remoteEdit(d: TestDoc, before: PMNode, after: PMNode): void {
  d.update((root) => {
    syncToYorkie(root.t as any, before, after, defaultMarkMapping);
  });
}

/** The text a replica's tree renders as. */
function text(d: TestDoc): string {
  return buildDocFromYorkieTree(
    d.getRoot().t,
    testSchema,
    invertMapping(defaultMarkMapping),
  ).textContent;
}

/**
 * `EditorView` stand-in over a real `EditorState`, with the composition
 * events the binding listens for.
 */
function createView(initialDoc: PMNode) {
  let state = EditorState.create({ doc: initialDoc, schema: testSchema });
  const listeners = new Map<string, () => void>();
  const props: Record<string, any> = {};
  return {
    props,
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      if (props.dispatchTransaction) props.dispatchTransaction(tr);
      else state = state.apply(tr);
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
    fire(type: 'compositionstart' | 'compositionend') {
      listeners.get(type)?.();
    },
    /** Type as the user would: through the binding's dispatch. */
    type(tr: Transaction) {
      props.dispatchTransaction(tr);
    },
  };
}

// The blocking case behind #1372's review: a remote change reaches the tree
// mid-composition (a pack that beat the push-only pause, or a document that is
// never paused) and touches the very block being composed. It is applied to
// the view at once, so the local edits that follow are measured on a view in
// step with the tree and the CRDT merges both.
describe('YorkieProseMirrorBinding – a remote change mid-composition', () => {
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

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** A binding over `d1`, composing with the caret at `caret`. */
  async function composeAt(base: PMNode, d1: TestDoc, caret: number) {
    const view = createView(base);
    const errors: Array<string> = [];
    const binding = new YorkieProseMirrorBinding(view as any, d1, 't', {
      client: { changeSyncMode: (d: unknown) => Promise.resolve(d) },
      onLog: (type, message) => {
        if (type === 'error') errors.push(message);
      },
    });
    binding.initialize();
    view.updateState(
      view.state.apply(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)),
      ),
    );
    view.fire('compositionstart');
    await tick();
    return { view, binding, errors };
  }

  /** End the composition and run the flush frame it schedules. */
  async function endComposition(view: ReturnType<typeof createView>) {
    view.fire('compositionend');
    for (const frame of frames.splice(0)) frame();
    await tick();
  }

  it('should keep the local edit that follows it in the same block', async () => {
    const base = doc(p('hello'));
    const [d1, d2] = replicas(base);
    const { view, binding, errors } = await composeAt(base, d1, 6);

    remoteEdit(d2, base, doc(p('Hey hello')));
    crossSync(d1, d2);
    // Applied to the view straight away, not held until compositionend.
    assert.equal(view.state.doc.textContent, 'Hey hello');

    view.type(view.state.tr.insertText('!', view.state.doc.content.size - 1));
    await endComposition(view);
    crossSync(d1, d2);

    assert.equal(text(d1), 'Hey hello!');
    assert.equal(text(d2), 'Hey hello!');
    assert.equal(view.state.doc.textContent, 'Hey hello!');
    assert.deepEqual(errors, []);
    binding.destroy();
  });

  it('should not touch the remote word when the composing syllable repeats it', async () => {
    // The composing syllable "한" next to a remote "한글" typed just before
    // it: telling the two apart takes CRDT identity, not text.
    const base = doc(p('한'));
    const [d1, d2] = replicas(base);
    const { view, binding } = await composeAt(base, d1, 2);

    remoteEdit(d2, base, doc(p('한글한')));
    crossSync(d1, d2);
    assert.equal(view.state.doc.textContent, '한글한');

    // The IME turns the composing "한" (now the last character) into "핟".
    const end = view.state.doc.content.size - 1;
    view.type(view.state.tr.insertText('핟', end - 1, end));
    await endComposition(view);
    crossSync(d1, d2);

    assert.equal(text(d1), '한글핟');
    assert.equal(text(d2), '한글핟');
    binding.destroy();
  });

  it('should keep both sides when they type at the same spot', async () => {
    const base = doc(p('가나'));
    const [d1, d2] = replicas(base);
    const { view, binding } = await composeAt(base, d1, 3);

    // Both type right after "나"; neither has seen the other's yet.
    view.type(view.state.tr.insertText('다', 3));
    remoteEdit(d2, base, doc(p('가나라')));
    crossSync(d1, d2);
    await endComposition(view);
    crossSync(d1, d2);

    const result = text(d1);
    assert.equal(text(d2), result);
    assert.include(['가나다라', '가나라다'], result);
    assert.equal(view.state.doc.textContent, result);
    binding.destroy();
  });
});
