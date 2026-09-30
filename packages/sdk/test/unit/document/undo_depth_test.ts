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
import { Document } from '@yorkie-js/sdk/src/document/document';
import {
  History,
  HistoryOperation,
  MaxUndoRedoStackDepth,
} from '@yorkie-js/sdk/src/document/history';
import { Text } from '@yorkie-js/sdk/src/yorkie';

type TestDoc = { t: Text };

/** Types `count` characters, one `update` each, after an initial Text. */
function typed(count: number, maxUndoDepth?: number): Document<TestDoc> {
  const doc = new Document<TestDoc>(
    'undo-depth',
    maxUndoDepth === undefined ? undefined : { maxUndoDepth },
  );
  doc.update((root) => {
    root.t = new Text();
  });
  doc.clearHistory();
  for (let i = 0; i < count; i++) {
    doc.update((root) => root.t.edit(i, i, 'a'));
  }
  return doc;
}

/** Undoes until `canUndo` is false and returns how many steps it took. */
function undoAll(doc: Document<TestDoc>): number {
  let steps = 0;
  while (doc.history.canUndo()) {
    doc.history.undo();
    steps++;
  }
  return steps;
}

describe('Document maxUndoDepth', () => {
  it('keeps the default depth when the option is not given', () => {
    const doc = typed(MaxUndoRedoStackDepth + 10);

    assert.equal(undoAll(doc), MaxUndoRedoStackDepth);
    assert.equal(doc.getRoot().t.toString(), 'a'.repeat(10));
  });

  it('keeps as many undo entries as the option allows', () => {
    const doc = typed(120, 100);

    assert.equal(undoAll(doc), 100);
    assert.equal(doc.getRoot().t.toString(), 'a'.repeat(20));
  });

  it('drops the oldest entries first when the depth is small', () => {
    const doc = typed(5, 2);

    assert.equal(undoAll(doc), 2);
    assert.equal(doc.getRoot().t.toString(), 'aaa');
  });

  it('bounds the redo stack by the same depth, not the default one', () => {
    // The depth is deliberately above `MaxUndoRedoStackDepth`: undoing all 60
    // changes pushes 60 redo entries, so a redo stack still bounded by the
    // hard-coded default would have dropped the 10 oldest of them.
    const doc = typed(60, 60);

    assert.equal(undoAll(doc), 60);
    assert.equal(doc.getRoot().t.toString(), '');

    let redone = 0;
    while (doc.history.canRedo()) {
      doc.history.redo();
      redone++;
    }

    assert.equal(redone, 60);
    assert.equal(doc.getRoot().t.toString(), 'a'.repeat(60));
  });

  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`rejects a maxUndoDepth of ${value}`, () => {
      assert.throws(
        () => new Document('undo-depth', { maxUndoDepth: value }),
        /maxUndoDepth must be a positive integer/,
      );
    });
  }
});

type Marked = { n: number };

/** Builds a history entry that carries `n` so eviction order is observable. */
function entry(n: number): Array<HistoryOperation<Marked>> {
  return [{ type: 'presence', value: { n } }];
}

/** Reads back the `n` of each entry on a stack. */
function marks(stack: Array<Array<HistoryOperation<Marked>>>): Array<number> {
  return stack.map((ops) => (ops[0] as { value: Marked }).value.n);
}

describe('History depth', () => {
  it('falls back to the default depth when constructed without one', () => {
    assert.equal(new History<Marked>().getMaxDepth(), MaxUndoRedoStackDepth);
  });

  it('reports the depth it was constructed with', () => {
    assert.equal(new History<Marked>(7).getMaxDepth(), 7);
  });

  it('drops the oldest redo entry once the depth is exceeded', () => {
    const history = new History<Marked>(3);
    for (let n = 0; n < 5; n++) {
      history.pushRedo(entry(n));
    }

    assert.deepEqual(marks(history.getRedoStackForTest()), [2, 3, 4]);
  });

  it('drops the oldest undo entry once the depth is exceeded', () => {
    const history = new History<Marked>(3);
    for (let n = 0; n < 5; n++) {
      history.pushUndo(entry(n));
    }

    assert.deepEqual(marks(history.getUndoStackForTest()), [2, 3, 4]);
  });

  it('bounds the redo stack independently of the default depth', () => {
    const history = new History<Marked>(MaxUndoRedoStackDepth + 5);
    for (let n = 0; n < MaxUndoRedoStackDepth + 5; n++) {
      history.pushRedo(entry(n));
    }

    assert.equal(
      history.getRedoStackForTest().length,
      MaxUndoRedoStackDepth + 5,
    );
    assert.equal(marks(history.getRedoStackForTest())[0], 0);
  });
});
