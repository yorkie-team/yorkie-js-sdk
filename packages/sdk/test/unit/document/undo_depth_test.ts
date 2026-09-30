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
import { MaxUndoRedoStackDepth } from '@yorkie-js/sdk/src/document/history';
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

  it('bounds the redo stack by the same depth', () => {
    const doc = typed(3, 3);

    undoAll(doc);
    let redone = 0;
    while (doc.history.canRedo()) {
      doc.history.redo();
      redone++;
    }

    assert.equal(redone, 3);
    assert.equal(doc.getRoot().t.toString(), 'aaa');
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
