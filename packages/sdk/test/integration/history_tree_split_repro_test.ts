import { describe, it, expect } from 'vitest';
import yorkie, { Document, Tree } from '@yorkie-js/sdk/src/yorkie';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import { traverseAll } from '@yorkie-js/sdk/src/util/index_tree';
import type { Operation } from '@yorkie-js/sdk/src/document/operation/operation';

/**
 * Repro for the wafflebase docs split-redo content accumulation.
 *
 * Production observation (decoded from wafflebase yorkie-meta changes):
 *   cycle 1 redo of "block insert" wire op contents = [inline, block]
 *   cycle 2 redo wire op contents = [text:"a", text:"s", inline, block]
 *   cycle 3 redo wire op contents = [text*4, inline, block]
 *   cycle 4 redo wire op contents = [text*5, inline, block]
 *
 * The "wire op" at redo time is the op popped from the redoStack and
 * executed — that op's `contents` is what gets serialized to the
 * server. We must inspect redoStack BEFORE calling history.redo(), not
 * after; after the redo, undoStack's top is the new reverseOp (which
 * is a delete-range with empty contents).
 */

function summarizeOp(op: Operation | undefined): string {
  if (!(op instanceof TreeEditOperation)) return '<not-tree-edit>';
  const contents = op.getContents();
  if (!contents || contents.length === 0) return '(empty)';
  const parts: Array<string> = [];
  for (const root of contents) {
    traverseAll(root, (n) => {
      const created = n.id.getCreatedAt();
      const id = `L${created.getLamport()}/${created.getDelimiter()}`;
      const removed = n.removedAt ? `(R@L${n.removedAt.getLamport()})` : '';
      const val = n.isText ? `:"${n.value}"` : '';
      parts.push(`${n.type}${val}@${id}${removed}`);
    });
  }
  return `[${parts.length}] ${parts.join(' | ')}`;
}

function topRedoTreeEdit(
  doc: Document<{ t: Tree }>,
): TreeEditOperation | undefined {
  const stack = doc.getRedoStackForTest() as Array<Array<unknown>>;
  if (stack.length === 0) return undefined;
  const top = stack[stack.length - 1];
  for (let i = top.length - 1; i >= 0; i--) {
    const op = top[i];
    if (op instanceof TreeEditOperation) return op;
  }
  return undefined;
}

function initDoc(): Document<{ t: Tree }> {
  const doc = new Document<{ t: Tree }>('split-repro');
  doc.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: [{ type: 'inline', children: [] }],
        },
      ],
    });
  }, 'init');
  return doc;
}

function insertSiblingBlock(doc: Document<{ t: Tree }>) {
  doc.update((root) => {
    root.t.editByPath([1], [1], {
      type: 'p',
      children: [{ type: 'inline', children: [] }],
    });
  }, 'insert-block');
}

function typeInSecondBlock(doc: Document<{ t: Tree }>, ch: string) {
  doc.update((root) => {
    const xml = root.t.toXML();
    const m = xml.match(/<inline>([^<]*)<\/inline><\/p><\/doc>$/);
    const cur = m ? m[1].length : 0;
    root.t.editByPath([1, 0, cur], [1, 0, cur], {
      type: 'text',
      value: ch,
    });
  }, `type-${ch}`);
}

describe('split-redo accumulation: minimal repro', () => {
  it('measures contents of the redoStack top right before each redo', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    const numCycles = 4;
    const redoOpSizes: Array<number> = [];

    for (let cycle = 0; cycle < numCycles; cycle++) {
      // Type "asdf" in the inserted block.
      for (const ch of 'asdf') typeInSecondBlock(doc, ch);

      // Undo each char.
      for (let i = 0; i < 4; i++) doc.history.undo();

      // Undo the block-insert. After this, redoStack's top is the
      // op that the next history.redo() will execute. That op's
      // contents == the wire payload we observed in production.
      doc.history.undo();

      const redoTop = topRedoTreeEdit(doc);
      const summary = summarizeOp(redoTop);
      let count = 0;
      const contents = redoTop?.getContents() ?? [];
      for (const root of contents) traverseAll(root, () => count++);
      redoOpSizes.push(count);

      process.stdout.write(
        `cycle ${cycle}:\n` +
          `  tree before redo: ${doc.getRoot().t.toXML()}\n` +
          `  redoStack top op (= wire op for next redo) = ${summary}\n`,
      );

      // Now actually redo.
      doc.history.redo();
    }

    process.stdout.write(
      `redo wire-op content sizes per cycle: ${JSON.stringify(redoOpSizes)}\n`,
    );
    expect(redoOpSizes).toStrictEqual(Array(numCycles).fill(redoOpSizes[0]));
  });

  // Regression for `cloneAndDropPreTombstoned` recomputing parent
  // `visibleSize` / `totalSize` after `filterChildren` drops descendants.
  // Without the recomputation, an element node carries stale sizes from
  // the deepcopy that include the dropped tombstoned descendants. The
  // wire payload itself does not encode sizes, but local index
  // calculations (e.g. `findPos`) rely on these fields, so a stale
  // total can shift positions on subsequent edits.
  //
  // For each surviving element node in `reverseContents`, assert
  // `totalSize === sum(child.paddedSize())`.
  it('reverseOp contents have consistent sizes after pre-tombstoned filtering', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    for (const ch of 'asdf') typeInSecondBlock(doc, ch);
    for (let i = 0; i < 4; i++) doc.history.undo();
    doc.history.undo();

    const redoTop = topRedoTreeEdit(doc);
    expect(redoTop).toBeDefined();
    const contents = redoTop!.getContents() ?? [];
    expect(contents.length).toBeGreaterThan(0);

    const violations: Array<string> = [];
    for (const root of contents) {
      traverseAll(root, (n) => {
        if (n.isText) return;
        const expected = n._children.reduce(
          (acc, child) => acc + child.paddedSize(),
          0,
        );
        if (n.totalSize !== expected || n.visibleSize !== expected) {
          violations.push(
            `${n.type}: totalSize=${n.totalSize} visibleSize=${n.visibleSize} ` +
              `expected=${expected} (children=${n._children.length})`,
          );
        }
      });
    }
    expect(violations).toStrictEqual([]);
  });

  // After running through the type-undo-undo-redo cycle the inserted
  // block must remain editable, with new typing landing at the correct
  // position. A stale `totalSize` on the cloned inline would shift
  // `findPos` results and cause the next character to land out of
  // place. End-to-end check: type "x" after redo and verify the tree
  // shape.
  it('typing after redo lands at the correct position', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    for (const ch of 'asdf') typeInSecondBlock(doc, ch);
    for (let i = 0; i < 4; i++) doc.history.undo();
    doc.history.undo();
    expect(doc.getRoot().t.toXML()).toBe('<doc><p><inline></inline></p></doc>');

    doc.history.redo();
    expect(doc.getRoot().t.toXML()).toBe(
      '<doc><p><inline></inline></p><p><inline></inline></p></doc>',
    );

    typeInSecondBlock(doc, 'x');
    expect(doc.getRoot().t.toXML()).toBe(
      '<doc><p><inline></inline></p><p><inline>x</inline></p></doc>',
    );
  });

  // Multi-cycle compounded scenario: 3 full cycles then resume editing
  // in the inserted block. Catches accumulation bugs where redoOp
  // contents carry over more than the immediate undo's worth of nodes.
  it('three cycles then resume editing yields the expected tree', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const ch of 'asdf') typeInSecondBlock(doc, ch);
      for (let i = 0; i < 4; i++) doc.history.undo();
      doc.history.undo();
      doc.history.redo();
      expect(doc.getRoot().t.toXML()).toBe(
        '<doc><p><inline></inline></p><p><inline></inline></p></doc>',
      );
    }

    typeInSecondBlock(doc, 'z');
    expect(doc.getRoot().t.toXML()).toBe(
      '<doc><p><inline></inline></p><p><inline>z</inline></p></doc>',
    );
  });
});

void yorkie;
