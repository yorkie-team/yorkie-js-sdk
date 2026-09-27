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
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTTree } from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

/**
 * The tickets an element split consumes are carried by the operation rather
 * than reconstructed from it: a reconstruction advancing by the number of
 * top-level contents cannot account for the ticket each descendant also took.
 * See yorkie's docs/design/tree-content-identity.md.
 */
describe('split tickets', function () {
  /**
   * `duplicatedIDs` returns the ids naming more than one node.
   */
  function duplicatedIDs(doc: Document<{ t: Tree }>): Array<string> {
    const tree = doc.getRootObject().get('t') as unknown as CRDTTree;
    const counts = new Map<string, number>();
    tree.getIndexTree().traverseAll((node) => {
      const id = node.id.toIDString();
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    return [...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id);
  }

  it('does not land on the content the same edit inserts', function () {
    const doc = new Document<{ t: Tree }>('doc');
    doc.update((r) => {
      r.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });

    doc.update((r) => {
      r.t.edit(2, 2, { type: 'text', value: 'q' }, 1);
      r.t.edit(1, 1, { type: 'text', value: 'z' }, 0);
    });

    assert.deepEqual(duplicatedIDs(doc), []);
  });

  it('survives the round trip to the wire', function () {
    const doc = new Document<{ t: Tree }>('doc');
    doc.update((r) => {
      r.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });
    doc.update((r) => r.t.edit(2, 2, { type: 'text', value: 'q' }, 1));

    const pack = doc.createChangePack();
    const restored = converter.fromChangePack<Indexable>(
      converter.toChangePack(pack),
    );

    const sent = pack
      .getChanges()
      .flatMap((change) => change.getOperations())
      .filter((op) => op instanceof TreeEditOperation)
      .flatMap((op) => (op as TreeEditOperation).getSplitTickets());
    const received = restored
      .getChanges()
      .flatMap((change) => change.getOperations())
      .filter((op) => op instanceof TreeEditOperation)
      .flatMap((op) => (op as TreeEditOperation).getSplitTickets());

    assert.isNotEmpty(sent, 'the edit split an element, so it issued tickets');
    assert.deepEqual(
      received.map((t) => t.toTestString()),
      sent.map((t) => t.toTestString()),
      'a replica reads back the tickets the originator issued',
    );
  });
  /**
   * `threeBlockDoc` returns `<r><d><p>ab</p></d><d><p>cd</p></d><d><p>ef</p></d></r>`,
   * the shape two successive L2 merges need, and so the shape that puts two
   * splitLevel 2 reverses into one undo entry.
   */
  function threeBlockDoc(): Document<{ t: Tree }> {
    const doc = new Document<{ t: Tree }>('doc');
    doc.setActor('000000000000000000000001');
    doc.update((r) => {
      r.t = new Tree({
        type: 'r',
        children: ['ab', 'cd', 'ef'].map((value) => ({
          type: 'd',
          children: [{ type: 'p', children: [{ type: 'text', value }] }],
        })),
      });
    });
    return doc;
  }

  /**
   * `liveIDs` lists the ids of the live nodes under `t`, in document order.
   */
  function liveIDs(doc: Document<{ t: Tree }>): Array<string> {
    const tree = doc.getRootObject().get('t') as unknown as CRDTTree;
    const ids: Array<string> = [];
    tree.getIndexTree().traverseAll((node) => {
      if (!node.isRemoved) ids.push(node.id.toIDString());
    });
    return ids;
  }

  // An undo issues one ticket per operation, but a splitLevel N reverse
  // mints N elements. Left to reconstruct those from its own executedAt, a
  // level 2 reverse walks two delimiters past the ticket it was issued --
  // onto the ticket of the NEXT operation in the same undo entry. The change
  // carries both operations, so every replica and the server land two live
  // nodes under one id. Mirrors yorkie's TestTreeSplitUndo.
  it('gives each split reverse in one undo entry its own tickets', function () {
    const doc = threeBlockDoc();
    const before = doc.getRoot().t.toXML();
    doc.update((r) => {
      r.t.edit(4, 8);
      r.t.edit(6, 10);
    });
    assert.equal(doc.getRoot().t.toXML(), '<r><d><p>abcdef</p></d></r>');

    doc.history.undo();
    assert.equal(doc.getRoot().t.toXML(), before);
    assert.deepEqual(duplicatedIDs(doc), []);

    // A redo replays the merges and a second undo mints the splits again,
    // each from its own tickets.
    doc.history.redo();
    assert.equal(doc.getRoot().t.toXML(), '<r><d><p>abcdef</p></d></r>');
    doc.history.undo();
    assert.equal(doc.getRoot().t.toXML(), before);
    assert.deepEqual(duplicatedIDs(doc), []);
  });

  it('applies such an undo entry on a replica across the wire', function () {
    const doc = threeBlockDoc();
    doc.update((r) => {
      r.t.edit(4, 8);
      r.t.edit(6, 10);
    });
    doc.history.undo();

    const pack = converter.fromChangePack<Indexable>(
      converter.toChangePack(doc.createChangePack()),
    );
    const replica = new Document<{ t: Tree }>('doc');
    replica.setActor('000000000000000000000002');
    replica.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        pack.getChanges(),
        InitialVersionVector,
      ),
    );

    assert.equal(replica.getRoot().t.toXML(), doc.getRoot().t.toXML());
    assert.deepEqual(liveIDs(replica), liveIDs(doc));
    assert.deepEqual(duplicatedIDs(replica), []);
  });
});
