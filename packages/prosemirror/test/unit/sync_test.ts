import { describe, it, assert } from 'vitest';
import { diffDocs } from '../../src/sync';
import { doc, p, strong, heading } from './helpers';

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
