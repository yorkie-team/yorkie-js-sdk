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
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import {
  CRDTTreeNodeID,
  TreeRestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/tree';

type TreeDoc = Document<{ t: Tree }>;
type Changes = Array<Change<Indexable>>;
type SpansOf = (
  at: TimeTicket,
  pID: CRDTTreeNodeID,
  textID: CRDTTreeNodeID,
) => Array<TreeRestoreSpan>;

const docKey = 'tree-restore-text-parent';
const sender = '000000000000000000000001';
const receiver = '000000000000000000000002';

/**
 * `newReplica` returns a document with the given actor.
 */
function newReplica(actor: string): TreeDoc {
  const doc: TreeDoc = new Document(docKey);
  doc.setActor(actor);
  return doc;
}

/**
 * `seed` sets `<r><p>hello</p></r>` on the given replica.
 */
function seed(doc: TreeDoc): void {
  doc.update((root) => {
    root.t = new Tree({
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: 'hello' }] }],
    });
  });
}

/**
 * `roundTrip` passes the given changes through the protobuf encoding a push
 * and a pull take.
 */
function roundTrip(changes: Changes): Changes {
  const pack = ChangePack.create<Indexable>(
    docKey,
    Checkpoint.of(0n, 0),
    false,
    changes,
    InitialVersionVector,
  );
  return converter
    .fromChangePack<Indexable>(converter.toChangePack(pack))
    .getChanges();
}

/**
 * `deliver` applies the given changes to a replica as a pull would. The
 * neutral checkpoint keeps its pending changes, and `InitialVersionVector`
 * keeps garbage collection out of the delivery.
 */
function deliver(to: TreeDoc, changes: Changes): void {
  to.applyChangePack(
    ChangePack.create(
      docKey,
      Checkpoint.of(0n, 0),
      false,
      changes,
      InitialVersionVector,
    ),
  );
}

/**
 * `pendingChanges` returns every change the replica has not had acknowledged.
 */
function pendingChanges(doc: TreeDoc): Changes {
  return doc.createChangePack().getChanges() as Changes;
}

/**
 * `craft` makes `from` insert a text node, then replaces that change's
 * operation with a restore TreeEdit carrying `spansOf(...)`, and returns all
 * of `from`'s changes after the protobuf round trip a push takes. `pID` and
 * `textID` name the seeded `<p>` and its `hello` text node, read before the
 * insertion lands in front of `hello`. The span's
 * own ID reuses the replaced insertion's ticket: it is causally known to the
 * change, and no node holds it on a replica that never saw the insertion, so
 * restore falls through to recreateFromSpan.
 */
function craft(from: TreeDoc, spansOf: SpansOf): Changes {
  const p = from.getRoot().t.getIndexTree().getRoot().children[0];
  const [pID, textID] = [p.id, p.children[0].id];
  assert.isTrue(p.children[0].isText);
  from.update((root) => root.t.edit(1, 1, { type: 'text', value: 'x' }));

  const changes = pendingChanges(from);
  const last = changes[changes.length - 1];
  const ops = last.getOperations();
  assert.lengthOf(ops, 1);
  const valid = ops[0] as TreeEditOperation;
  assert.instanceOf(valid, TreeEditOperation);

  const spans = spansOf(valid.getExecutedAt(), pID, textID);
  const crafted = TreeEditOperation.create(
    valid.getParentCreatedAt(),
    valid.getFromPos(),
    valid.getToPos(),
    undefined,
    0,
    valid.getExecutedAt(),
    true,
    undefined,
    undefined,
    spans,
    'restore',
  );
  changes[changes.length - 1] = Change.create<Indexable>({
    id: last.getID(),
    operations: [crafted],
    presenceChange: last.getPresenceChange(),
    message: last.getMessage(),
  });

  const decoded = roundTrip(changes);
  assert.lengthOf(
    (
      decoded[decoded.length - 1].getOperations()[0] as TreeEditOperation
    ).getRestoreSpans()!,
    spans.length,
    'decoding cannot tell a text parent from an element',
  );
  return decoded;
}

/**
 * Port of the Go `TestRestoreSpanUnderTextParentStaysApplicable`
 * (yorkie#2175). A TreeEdit restore span names its node's parent by ID, and
 * the ID can name a text node; its isText flag can also disagree with its
 * nodeType. No honest replica produces such a span, but any client with
 * write access can send one, and the server stores a pushed change before it
 * applies it. The change must therefore apply, both on a replica that pulls
 * it and on one replaying every change from scratch, and leave the tree as it
 * was: the span's node is left unplaced, as it is when its parent is
 * missing. Go and JS skip the same spans, so their replicas converge.
 */
describe('Tree restore span under a text parent', function () {
  const cases: Array<[string, SpansOf]> = [
    [
      'element span under a text parent',
      (at, pID, textID) => [
        {
          id: CRDTTreeNodeID.of(at, 0),
          nodeType: 'p',
          isText: false,
          length: 0,
          parentID: textID,
        },
      ],
    ],
    [
      'text span under a text parent',
      (at, pID, textID) => [
        {
          id: CRDTTreeNodeID.of(at, 0),
          nodeType: 'text',
          isText: true,
          length: 1,
          value: 'x',
          parentID: textID,
        },
      ],
    ],
    [
      'element span typed as text',
      (at, pID) => [
        {
          id: CRDTTreeNodeID.of(at, 0),
          nodeType: 'text',
          isText: false,
          length: 0,
          parentID: pID,
        },
      ],
    ],
    [
      'text span typed as an element, twice',
      (at, pID) => {
        const span = (): TreeRestoreSpan => ({
          id: CRDTTreeNodeID.of(at, 0),
          nodeType: 'p',
          isText: true,
          length: 1,
          value: 'x',
          parentID: pID,
        });
        return [span(), span()];
      },
    ],
  ];

  for (const [name, spansOf] of cases) {
    it(name, function () {
      const a = newReplica(sender);
      seed(a);
      const b = newReplica(receiver);
      deliver(b, roundTrip(pendingChanges(a)));

      const changes = craft(a, spansOf);

      // A replica that pulls the change.
      deliver(b, changes.slice(-1));
      assert.equal(b.getRoot().t.toXML(), '<r><p>hello</p></r>');

      // A replica replaying every stored change, as a snapshot rebuild does.
      const built = newReplica('000000000000000000000003');
      deliver(built, changes);
      assert.equal(built.toSortedJSON(), b.toSortedJSON(), 'replicas converge');

      // The tree stays editable after the skipped span.
      b.update((root) => root.t.edit(6, 6, { type: 'text', value: '!' }));
      assert.equal(b.getRoot().t.toXML(), '<r><p>hello!</p></r>');
    });
  }

  // The honest path: undo after GC recreates a purged text node under its
  // element parent, and the pulling replica agrees. Redo removes it again.
  it('honest undo after GC', function () {
    const a = newReplica(sender);
    seed(a);
    a.update((root) => root.t.edit(1, 6));
    assert.isAbove(a.garbageCollect(maxVectorOf([sender])), 0);
    a.history.undo();
    assert.equal(a.getRoot().t.toXML(), '<r><p>hello</p></r>');

    const changes = roundTrip(pendingChanges(a));
    const undo = changes[changes.length - 1].getOperations()[0];
    assert.instanceOf(undo, TreeEditOperation);
    assert.isNotEmpty(
      (undo as TreeEditOperation).getRestoreSpans() ?? [],
      'the undo takes the restore path',
    );

    const b = newReplica(receiver);
    deliver(b, changes);
    assert.equal(b.getRoot().t.toXML(), '<r><p>hello</p></r>');
    assert.equal(b.toSortedJSON(), a.toSortedJSON());

    a.history.redo();
    assert.equal(a.getRoot().t.toXML(), '<r><p></p></r>');
    deliver(b, roundTrip(pendingChanges(a)).slice(-1));
    assert.equal(b.getRoot().t.toXML(), '<r><p></p></r>');
  });
});
