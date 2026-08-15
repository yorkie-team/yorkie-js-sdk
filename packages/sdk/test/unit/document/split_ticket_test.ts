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
});
