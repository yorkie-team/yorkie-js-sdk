import { describe, it, assert } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import { diffDocs, applyDocDiff } from '../../src/sync';
import { doc, p, strong, heading, testSchema } from './helpers';

describe('diffDocs', () => {
  it('should return undefined for identical docs', () => {
    const d = doc(p('hello'), p('world'));
    assert.isUndefined(diffDocs(d, d));
  });

  it('should return undefined for structurally equal docs', () => {
    const d1 = doc(p('hello'));
    const d2 = doc(p('hello'));
    assert.isUndefined(diffDocs(d1, d2));
  });

  it('should detect a single block text change', () => {
    const oldDoc = doc(p('hello'));
    const newDoc = doc(p('world'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    assert.equal(diff.toPos, oldDoc.child(0).nodeSize);
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(0)));
  });

  it('should detect a middle block change with unchanged blocks on both sides', () => {
    const oldDoc = doc(p('aaa'), p('bbb'), p('ccc'));
    const newDoc = doc(p('aaa'), p('XXX'), p('ccc'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    // fromPos should skip past the first block
    const firstBlockSize = oldDoc.child(0).nodeSize;
    const secondBlockSize = oldDoc.child(1).nodeSize;
    assert.equal(diff.fromPos, firstBlockSize);
    assert.equal(diff.toPos, firstBlockSize + secondBlockSize);
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(1)));
  });

  it('should detect a block insertion at the end', () => {
    const oldDoc = doc(p('aaa'));
    const newDoc = doc(p('aaa'), p('bbb'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    const firstBlockSize = oldDoc.child(0).nodeSize;
    assert.equal(diff.fromPos, firstBlockSize);
    assert.equal(diff.toPos, firstBlockSize); // empty range in old doc
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(1)));
  });

  it('should detect a block insertion at the beginning', () => {
    const oldDoc = doc(p('bbb'));
    const newDoc = doc(p('aaa'), p('bbb'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    assert.equal(diff.toPos, 0); // insert before existing content
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(0)));
  });

  it('should detect a block deletion', () => {
    const oldDoc = doc(p('aaa'), p('bbb'), p('ccc'));
    const newDoc = doc(p('aaa'), p('ccc'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    const firstBlockSize = oldDoc.child(0).nodeSize;
    const secondBlockSize = oldDoc.child(1).nodeSize;
    assert.equal(diff.fromPos, firstBlockSize);
    assert.equal(diff.toPos, firstBlockSize + secondBlockSize);
    assert.equal(diff.newNodes.length, 0);
  });

  it('should detect first block change', () => {
    const oldDoc = doc(p('aaa'), p('bbb'));
    const newDoc = doc(p('XXX'), p('bbb'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    assert.equal(diff.toPos, oldDoc.child(0).nodeSize);
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(0)));
  });

  it('should detect last block change', () => {
    const oldDoc = doc(p('aaa'), p('bbb'));
    const newDoc = doc(p('aaa'), p('XXX'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    const firstBlockSize = oldDoc.child(0).nodeSize;
    assert.equal(diff.fromPos, firstBlockSize);
    assert.equal(diff.toPos, firstBlockSize + oldDoc.child(1).nodeSize);
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(1)));
  });

  it('should detect mark changes within a block', () => {
    const oldDoc = doc(p('plain text'));
    const newDoc = doc(p(strong('plain text')));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    assert.equal(diff.toPos, oldDoc.child(0).nodeSize);
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(0)));
  });

  it('should detect complete document replacement', () => {
    const oldDoc = doc(p('aaa'), p('bbb'));
    const newDoc = doc(heading(1, 'Title'), p('ccc'), p('ddd'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    // toPos should be the entire old content
    assert.equal(
      diff.toPos,
      oldDoc.child(0).nodeSize + oldDoc.child(1).nodeSize,
    );
    assert.equal(diff.newNodes.length, 3);
  });

  it('should detect multiple blocks changing simultaneously', () => {
    const oldDoc = doc(p('aaa'), p('bbb'), p('ccc'), p('ddd'));
    const newDoc = doc(p('aaa'), p('XXX'), p('YYY'), p('ddd'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    const firstBlockSize = oldDoc.child(0).nodeSize;
    const secondBlockSize = oldDoc.child(1).nodeSize;
    const thirdBlockSize = oldDoc.child(2).nodeSize;
    assert.equal(diff.fromPos, firstBlockSize);
    assert.equal(diff.toPos, firstBlockSize + secondBlockSize + thirdBlockSize);
    assert.equal(diff.newNodes.length, 2);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(1)));
    assert.isTrue(diff.newNodes[1].eq(newDoc.child(2)));
  });

  it('should handle empty paragraph changes', () => {
    const oldDoc = doc(p('hello'));
    const newDoc = doc(p());
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    assert.equal(diff.toPos, oldDoc.child(0).nodeSize);
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(0)));
  });

  it('should handle insertion in the middle', () => {
    const oldDoc = doc(p('aaa'), p('ccc'));
    const newDoc = doc(p('aaa'), p('bbb'), p('ccc'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    const firstBlockSize = oldDoc.child(0).nodeSize;
    assert.equal(diff.fromPos, firstBlockSize);
    assert.equal(diff.toPos, firstBlockSize); // insert point
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(1)));
  });

  it('should handle deletion of all blocks', () => {
    const oldDoc = doc(p('aaa'), p('bbb'));
    const newDoc = doc(p());
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    assert.equal(
      diff.toPos,
      oldDoc.child(0).nodeSize + oldDoc.child(1).nodeSize,
    );
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(0)));
  });

  it('should handle different block types (paragraph vs heading)', () => {
    const oldDoc = doc(p('title'));
    const newDoc = doc(heading(1, 'title'));
    const diff = diffDocs(oldDoc, newDoc)!;
    assert.isDefined(diff);
    assert.equal(diff.fromPos, 0);
    assert.equal(diff.toPos, oldDoc.child(0).nodeSize);
    assert.equal(diff.newNodes.length, 1);
    assert.isTrue(diff.newNodes[0].eq(newDoc.child(0)));
  });
});

describe('applyDocDiff – intra-block cursor preservation', () => {
  /**
   * Helper: create a minimal EditorView-like object that applyDocDiff can
   * dispatch to. We only need `state` (with `tr` and `doc`) and `dispatch`.
   */
  function createMockView(d: ReturnType<typeof doc>) {
    let currentState = EditorState.create({ doc: d, schema: testSchema });
    let lastTr: ReturnType<typeof currentState.tr> | undefined;
    return {
      get state() {
        return currentState;
      },
      dispatch(tr: ReturnType<typeof currentState.tr>) {
        lastTr = tr;
        currentState = currentState.apply(tr);
      },
      get lastTransaction() {
        return lastTr;
      },
    };
  }

  it('should preserve cursor after text insertion before cursor', () => {
    // "hello world" → "hello beautiful world"
    // Cursor at position 8 (between 'w' and 'o' in "world": "w|o-r-l-d")
    // After insert, cursor should shift to 18, not jump to end
    const oldDoc = doc(p('hello world'));
    const newDoc = doc(p('hello beautiful world'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    // Place cursor at position 8 (inside "world": "w|o-r-l-d")
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 8),
    );
    view.dispatch(tr);
    assert.equal(view.state.selection.from, 8);

    applyDocDiff(view as any, diff);

    // Cursor should have shifted right by 10 chars ("beautiful " = 10)
    assert.equal(view.state.selection.from, 18);
    assert.equal(view.state.doc.textContent, 'hello beautiful world');
  });

  it('should preserve cursor after text insertion after cursor', () => {
    // "hello world" → "hello world!"
    // Cursor at position 4 (inside "hello": "h-e-l|l-o")
    const oldDoc = doc(p('hello world'));
    const newDoc = doc(p('hello world!'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 4),
    );
    view.dispatch(tr);

    applyDocDiff(view as any, diff);

    // Cursor should stay at same position — change was after it
    assert.equal(view.state.selection.from, 4);
  });

  it('should preserve cursor in second paragraph when first paragraph changes', () => {
    // Two paragraphs, cursor in second, first gets edited
    const oldDoc = doc(p('aaa'), p('bbb'));
    const newDoc = doc(p('aaa XXX'), p('bbb'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    // Place cursor in second paragraph
    // First p: nodeSize = 5 (1 + 3 + 1), so second p starts at pos 5
    // Cursor at pos 7 (inside "bbb": "b|b-b")
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 7),
    );
    view.dispatch(tr);

    applyDocDiff(view as any, diff);

    // First paragraph grew by 4 chars (" XXX"), cursor should shift by 4
    assert.equal(view.state.selection.from, 11);
  });

  it('should produce correct document after intra-block diff with marks', () => {
    const oldDoc = doc(p('hello ', strong('world')));
    const newDoc = doc(p('hello ', strong('world'), '!'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    applyDocDiff(view as any, diff);

    assert.isTrue(view.state.doc.eq(newDoc));
  });

  it('should fall back to block replacement for different block types', () => {
    const oldDoc = doc(p('title'));
    const newDoc = doc(heading(1, 'title'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    applyDocDiff(view as any, diff);

    // Should still produce correct document even with fallback
    assert.isTrue(view.state.doc.eq(newDoc));
  });

  it('should handle block deletion correctly', () => {
    const oldDoc = doc(p('aaa'), p('bbb'), p('ccc'));
    const newDoc = doc(p('aaa'), p('ccc'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    applyDocDiff(view as any, diff);

    assert.isTrue(view.state.doc.eq(newDoc));
  });

  it('should handle text deletion within a block', () => {
    // "hello beautiful world" → "hello world"
    // Cursor at position 3 (inside "hello")
    const oldDoc = doc(p('hello beautiful world'));
    const newDoc = doc(p('hello world'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 3),
    );
    view.dispatch(tr);

    applyDocDiff(view as any, diff);

    assert.equal(view.state.selection.from, 3);
    assert.equal(view.state.doc.textContent, 'hello world');
  });

  it('should handle multi-block merge into single block correctly', () => {
    // Two paragraphs merged into one — must not leave the second paragraph behind.
    // This exercises the toPos guard: tryIntraBlockPMDiff must bail out because
    // the diff covers two old blocks, not one.
    const oldDoc = doc(p('aaa'), p('bbb'));
    const newDoc = doc(p('aaabbb'));
    const diff = diffDocs(oldDoc, newDoc)!;

    const view = createMockView(oldDoc);
    applyDocDiff(view as any, diff);

    assert.isTrue(view.state.doc.eq(newDoc));
    assert.equal(view.state.doc.childCount, 1);
    assert.equal(view.state.doc.textContent, 'aaabbb');
  });
});
