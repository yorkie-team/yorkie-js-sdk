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

import { describe, it, assert, afterEach } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTTree } from '@yorkie-js/sdk/src/document/crdt/tree';

/**
 * These drive a real undo through the copy-reinsert reverse — the one that
 * re-inserts the nodes a deletion removed instead of reviving them by
 * identity. `CRDTTree.edit` only fills the identity spans when the edit was
 * merge- and split-free, so the copy path is what remains for merge
 * propagation and for reverse operations older SDKs left on an undo stack.
 * Neither is reachable through ordinary editing, so the spans are blanked here
 * to reproduce it faithfully.
 */
describe('undo through the copy-reinsert reverse', function () {
  const original = CRDTTree.prototype.edit;

  afterEach(() => {
    CRDTTree.prototype.edit = original;
  });

  /**
   * `forceCopyPath` makes `edit` report no identity spans, which is what
   * `toReverseOperation` reads as "this deletion cannot be described by
   * identity" before falling back to copying the removed nodes.
   */
  function forceCopyPath(): void {
    CRDTTree.prototype.edit = function (
      this: CRDTTree,
      ...args: Parameters<CRDTTree['edit']>
    ) {
      const result = original.apply(this, args);
      result[7] = [];
      result[8] = [];
      return result;
    } as CRDTTree['edit'];
  }

  /**
   * `treeOf` returns the CRDTTree behind the document's "t" key.
   */
  function treeOf(doc: Document<{ t: Tree }>): CRDTTree {
    return doc.getRootObject().get('t') as unknown as CRDTTree;
  }

  /**
   * `duplicatedIDs` returns the ids naming more than one node.
   */
  function duplicatedIDs(tree: CRDTTree): Array<string> {
    const counts = new Map<string, number>();
    tree.getIndexTree().traverseAll((node) => {
      const id = node.id.toIDString();
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    return [...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id);
  }

  /**
   * `buildDoc` returns a document holding <r><p>abcdef</p></r>.
   */
  function buildDoc(): Document<{ t: Tree }> {
    const doc = new Document<{ t: Tree }>('doc');
    doc.update((r) => {
      r.t = new Tree({
        type: 'r',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'abcdef' }] },
        ],
      });
    });
    return doc;
  }

  it('restores the text without duplicating an id', function () {
    const doc = buildDoc();
    const before = doc.getRoot().t.toXML();

    forceCopyPath();
    doc.update((r) => r.t.edit(2, 5));
    assert.equal(doc.getRoot().t.toXML(), '<r><p>aef</p></r>');

    doc.history.undo();

    assert.equal(doc.getRoot().t.toXML(), before, 'the undo restores the text');
    assert.deepEqual(
      duplicatedIDs(treeOf(doc)),
      [],
      'the re-inserted copy must not reuse the tombstone it came from',
    );
  });

  it('does not splice the copy into the chain it came from', function () {
    const doc = buildDoc();

    forceCopyPath();
    doc.update((r) => r.t.edit(2, 5));
    const before = new Set<string>();
    treeOf(doc)
      .getIndexTree()
      .traverseAll((node) => before.add(node.id.toIDString()));

    doc.history.undo();

    const inserted: Array<string> = [];
    treeOf(doc)
      .getIndexTree()
      .traverseAll((node) => {
        const id = node.id.toIDString();
        if (before.has(id)) {
          return;
        }
        inserted.push(id);
        // The copy came from a deepcopy of a node the deletion removed, which
        // carries that node's split chain and merge lineage. A fresh identity
        // has to be fresh in those too, or the copy is spliced into a chain it
        // never belonged to.
        assert.isUndefined(node.insPrevID, `${id} kept a split chain`);
        assert.isUndefined(node.insNextID, `${id} kept a split chain`);
        assert.isUndefined(node.mergedFrom, `${id} kept a merge lineage`);
        assert.isUndefined(node.mergedAt, `${id} kept a merge lineage`);
      });
    assert.isNotEmpty(inserted, 'the undo re-inserted the removed content');
  });

  it('returns to the deleted state on redo', function () {
    const doc = buildDoc();

    forceCopyPath();
    doc.update((r) => r.t.edit(2, 5));
    const deleted = doc.getRoot().t.toXML();

    doc.history.undo();
    doc.history.redo();

    assert.equal(doc.getRoot().t.toXML(), deleted);
    assert.deepEqual(duplicatedIDs(treeOf(doc)), []);
  });
});
