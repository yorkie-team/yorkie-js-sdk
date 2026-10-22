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
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { TreeStyleOperation } from '@yorkie-js/sdk/src/document/operation/tree_style_operation';
import { OpInfo } from '@yorkie-js/sdk/src/document/operation/operation';

/**
 * A `tree.style()` that overwrites some attributes and adds others reverses
 * into a single operation carrying both halves: the overwritten keys' previous
 * values and the added keys. Encoding, decoding and executing it all have to
 * keep both halves, or the undoing replica applies one half and its peers the
 * other, and they never reconcile.
 */
const docKey = 'tree-style-combined';

type TreeDoc = { t: Tree };
type Replica = Document<TreeDoc>;
type Changes = ReturnType<
  ReturnType<Replica['createChangePack']>['getChanges']
>;

/** `actorOf` renders an actor number as a 24-hex-digit actor id. */
function actorOf(n: number): string {
  return `0000000000000000000000${String(n).padStart(2, '0')}`;
}

/** `newReplica` returns a document with a distinct actor id. */
function newReplica(n: number): Replica {
  const doc = new Document<TreeDoc>(docKey);
  doc.setActor(actorOf(n));
  return doc;
}

/** `recordChanges` drains a replica's pending local changes. */
function recordChanges(from: Replica, what: string): Changes {
  const pack = from.createChangePack();
  const changes = pack.getChanges();
  assert.isNotEmpty(changes, `${what} produced no change to deliver`);

  const lastSeq = changes[changes.length - 1].getID().getClientSeq();
  from.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
  return changes;
}

/**
 * `deliver` applies recorded changes to a replica, routing them through the
 * protobuf encoding on the way. A peer only ever sees what the wire carried,
 * so handing it the sender's in-memory operations would hide a field the
 * encoder drops.
 */
function deliver(to: Replica, changes: Changes): void {
  const pb = converter.toChangePack(
    ChangePack.create(
      docKey,
      Checkpoint.of(0n, 0),
      false,
      changes,
      InitialVersionVector,
    ),
  );
  to.applyChangePack(converter.fromChangePack(pb));
}

/**
 * `opInfosOf` runs `what` and returns the operations the document published
 * for it on the undo/redo path. Editor bindings replay these rather than
 * re-reading the tree, so a half that executes without reporting itself
 * leaves the binding showing the pre-undo attributes.
 */
function opInfosOf(doc: Replica, what: () => void): Array<OpInfo> {
  const opInfos: Array<OpInfo> = [];
  const unsub = doc.subscribe((event) => {
    if (event.type !== 'local-change' || event.source !== 'undoredo') {
      return;
    }
    opInfos.push(...event.value.operations);
  });
  what();
  unsub();
  return opInfos;
}

describe('Tree style carrying both attributes and attributesToRemove', () => {
  it('converges after undoing a style that overwrote and added attributes', () => {
    const a = newReplica(1);
    const b = newReplica(2);

    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', attributes: { b: 'x' }, children: [] }],
      });
    });
    deliver(b, recordChanges(a, 'initial tree'));

    // `b` is overwritten and `c` is added, so the reverse operation has to
    // restore the one and remove the other.
    a.update((root) => root.t.style(0, 1, { b: 'y', c: 'z' }));
    deliver(b, recordChanges(a, 'combined style'));
    assert.equal(a.getRoot().t.toXML(), '<doc><p b="y" c="z"></p></doc>');
    assert.equal(b.getRoot().t.toXML(), a.getRoot().t.toXML());

    a.history.undo();
    deliver(b, recordChanges(a, 'undo the combined style'));

    assert.equal(a.getRoot().t.toXML(), '<doc><p b="x"></p></doc>');
    assert.equal(b.getRoot().t.toXML(), a.getRoot().t.toXML());
  });

  it('reports both halves of the undo as separate tree-style operations', () => {
    const a = newReplica(1);
    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', attributes: { b: 'x' }, children: [] }],
      });
    });
    a.update((root) => root.t.style(0, 1, { b: 'y', c: 'z' }));

    // Both halves run, so both have to be reported, and each one tagged for
    // what it did: the removal of `c` as `attributesToRemove`, the restore of
    // `b` as `attributes`. Tagging either half the other way would tell a
    // binding to set the key it just dropped, or drop the key it just set.
    const undone = opInfosOf(a, () => a.history.undo());
    assert.deepEqual(
      undone,
      [
        {
          type: 'tree-style',
          path: '$.t',
          from: 0,
          to: 1,
          fromPath: [0],
          toPath: [0, 0],
          value: { attributesToRemove: ['c'] },
        },
        {
          type: 'tree-style',
          path: '$.t',
          from: 0,
          to: 1,
          fromPath: [0],
          toPath: [0, 0],
          value: { attributes: { b: 'x' } },
        },
      ],
      'the undo reported its removal half and its restore half',
    );
    assert.equal(a.getRoot().t.toXML(), '<doc><p b="x"></p></doc>');

    // Redoing re-applies what the undo took away. The undo op executed both
    // halves, so its own reverse has to carry what both of them displaced.
    const redone = opInfosOf(a, () => a.history.redo());
    assert.deepEqual(
      redone,
      [
        {
          type: 'tree-style',
          path: '$.t',
          from: 0,
          to: 1,
          fromPath: [0],
          toPath: [0, 0],
          value: { attributes: { b: 'y', c: 'z' } },
        },
      ],
      'the redo reported the attributes it put back',
    );
    assert.equal(a.getRoot().t.toXML(), '<doc><p b="y" c="z"></p></doc>');
  });

  it('converges after redoing a style that overwrote and added attributes', () => {
    const a = newReplica(1);
    const b = newReplica(2);

    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', attributes: { b: 'x' }, children: [] }],
      });
    });
    deliver(b, recordChanges(a, 'initial tree'));

    a.update((root) => root.t.style(0, 1, { b: 'y', c: 'z' }));
    deliver(b, recordChanges(a, 'combined style'));

    a.history.undo();
    deliver(b, recordChanges(a, 'undo the combined style'));
    assert.equal(b.getRoot().t.toXML(), '<doc><p b="x"></p></doc>');

    // The redo undoes the combined undo, which means executing both of its
    // halves and reversing both: `b` back to `y` and `c` back on the node.
    a.history.redo();
    deliver(b, recordChanges(a, 'redo the combined style'));

    assert.equal(a.getRoot().t.toXML(), '<doc><p b="y" c="z"></p></doc>');
    assert.equal(b.getRoot().t.toXML(), a.getRoot().t.toXML());
  });

  it('keeps both halves across the protobuf round trip', () => {
    const a = newReplica(1);
    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', attributes: { b: 'x' }, children: [] }],
      });
    });
    recordChanges(a, 'initial tree');

    a.update((root) => root.t.style(0, 1, { b: 'y', c: 'z' }));
    recordChanges(a, 'combined style');
    a.history.undo();

    const [change] = recordChanges(a, 'undo the combined style');
    const [op] = change.getOperations();
    assert.instanceOf(op, TreeStyleOperation);

    const decoded = converter.fromChangePack(
      converter.toChangePack(
        ChangePack.create(
          docKey,
          Checkpoint.of(0n, 0),
          false,
          [change],
          InitialVersionVector,
        ),
      ),
    );
    const [decodedOp] = decoded.getChanges()[0].getOperations();
    assert.instanceOf(decodedOp, TreeStyleOperation);

    const styleOp = decodedOp as TreeStyleOperation;
    assert.deepEqual([...styleOp.getAttributes()], [['b', 'x']]);
    assert.deepEqual(styleOp.getAttributesToRemove(), ['c']);
  });
});
