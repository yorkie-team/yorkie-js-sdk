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
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { TreeStyleOperation } from '@yorkie-js/sdk/src/document/operation/tree_style_operation';
import {
  OpInfo,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTTree } from '@yorkie-js/sdk/src/document/crdt/tree';

/**
 * A `tree.style()` that overwrites some attributes and adds others has two
 * things to reverse: the overwritten keys' previous values, and the added
 * keys. This SDK sends that reverse as two single-purpose operations, because
 * that is the shape every released SDK and the server decode, and because two
 * tickets let a key named by both halves be dropped and then set again. But a
 * peer may send ONE operation carrying both fields, so encoding, decoding and
 * executing all have to keep both halves, or the undoing replica applies one
 * half and its peers the other and they never reconcile.
 */
const docKey = 'tree-style-combined';

type TreeDoc = { t: Tree };
type Replica = Document<TreeDoc>;
type Changes = ReturnType<
  ReturnType<Replica['createChangePack']>['getChanges']
>;

/** `treeOf` returns the tree a root object holds under `t`. */
function treeOf(obj: CRDTObject): CRDTTree {
  return obj.get('t') as unknown as CRDTTree;
}

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

    // Redoing re-applies what the undo took away. The undo ran as two
    // operations, so the redo reverses both: `c` back on the node and `b`
    // back to the value the undo overwrote.
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
          value: { attributes: { b: 'y' } },
        },
        {
          type: 'tree-style',
          path: '$.t',
          from: 0,
          to: 1,
          fromPath: [0],
          toPath: [0, 0],
          value: { attributes: { c: 'z' } },
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

    // The undo travels as two single-purpose operations, which is the shape
    // every released SDK decodes: one that drops the key the style added and
    // one that restores the value it overwrote. A single operation carrying
    // both fields would be read by an older peer as only one of them.
    const ops = decoded.getChanges()[0].getOperations();
    assert.equal(ops.length, 2, 'the undo travels as two operations');
    for (const op of ops) {
      assert.instanceOf(op, TreeStyleOperation);
    }

    const [remove, restore] = ops as Array<TreeStyleOperation>;
    assert.deepEqual(remove.getAttributesToRemove(), ['c']);
    assert.isEmpty([...remove.getAttributes()]);
    assert.deepEqual([...restore.getAttributes()], [['b', 'x']]);
    assert.isEmpty(restore.getAttributesToRemove());
  });

  it('keeps both halves of a peer operation that carries them at once', () => {
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
    const [undone] = recordChanges(a, 'undo the combined style');
    const [remove, restore] =
      undone.getOperations() as Array<TreeStyleOperation>;

    // A peer that does not split its reverse sends the same undo as ONE
    // operation holding both fields. Encoding has to write both and decoding
    // has to read both: whichever one a field-shadowing encoder dropped, `b`
    // would stay at `y` or `c` would stay on the node, and the two replicas
    // would hold different documents for good.
    const combined = new TreeStyleOperation(
      remove.getParentCreatedAt(),
      remove.getFromPos(),
      remove.getToPos(),
      new Map([...restore.getAttributes()]),
      [...remove.getAttributesToRemove()],
      remove.getExecutedAt(),
    );
    const decoded = converter.bytesToOperation(
      converter.operationToBinary(combined),
    ) as TreeStyleOperation;
    assert.deepEqual(
      [...decoded.getAttributes()],
      [['b', 'x']],
      'the wire kept the half that restores a value',
    );
    assert.deepEqual(
      decoded.getAttributesToRemove(),
      ['c'],
      'the wire kept the half that drops a key',
    );

    // And executing it runs both halves, so the peer lands where the sender
    // landed by splitting the same reverse in two.
    deliver(b, [
      Change.create<Indexable>({ id: undone.getID(), operations: [combined] }),
    ]);
    assert.equal(b.getRoot().t.toXML(), '<doc><p b="x"></p></doc>');
    assert.equal(b.getRoot().t.toXML(), a.getRoot().t.toXML());
  });

  it('reverses a combined operation from what each half found', () => {
    const a = newReplica(1);
    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', attributes: { b: 'x', c: 'z' }, children: [] }],
      });
    });

    const copy = a.getRootObject().deepcopy() as CRDTObject;
    const root = new CRDTRoot(copy);
    const tree = treeOf(copy);
    const [from, to] = tree.pathToPosRange([0]);

    // One operation that drops `b` and `c` and writes `c` and `d`. The two
    // halves overlap on `c`, so the reverse has to be assembled from both:
    // the previous values the REMOVE half saw -- it ran first, so `c`'s `z`
    // is its to report, not the set half's -- and only those added keys that
    // have no previous value to restore.
    const combined = new TreeStyleOperation(
      tree.getCreatedAt(),
      from,
      to,
      new Map([
        ['c', 'q'],
        ['d', 'w'],
      ]),
      ['b', 'c'],
      TimeTicket.of(1000n, 0, actorOf(2)),
    );
    const result = combined.execute(
      root,
      OpSource.Remote,
      InitialVersionVector,
    );

    // Both halves share one ticket, so the `c` the remove half dropped stays
    // dropped: RHT refuses a set that is not strictly newer. That is why
    // `buildReverseOps` never mints an operation of this shape -- but a peer
    // may, and the reverse recorded for it still has to undo what it did.
    assert.equal(tree.toXML(), '<doc><p d="w"></p></doc>');

    const reverseOps = result.reverseOps as Array<TreeStyleOperation>;
    assert.equal(reverseOps.length, 2, 'the reverse is a drop and a restore');
    assert.deepEqual(
      reverseOps[0].getAttributesToRemove(),
      ['d'],
      'only the added key with nothing to restore is dropped',
    );
    assert.isEmpty([...reverseOps[0].getAttributes()]);
    assert.deepEqual(
      [...reverseOps[1].getAttributes()],
      [
        ['b', 'x'],
        ['c', 'z'],
      ],
      'the values the remove half saw are the ones restored',
    );
    assert.isEmpty(reverseOps[1].getAttributesToRemove());
  });

  it('splits the text on the root that the clone split for an empty style', () => {
    const a = newReplica(1);
    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });

    // `json/tree.ts` runs the whole style machinery on the clone whatever the
    // attribute map holds, and splitting the text at the range's ends is part
    // of it. An operation carrying neither half still has to do that to the
    // root, or the clone holds nodes the root never minted and every position
    // taken from the clone afterwards names something the root cannot find.
    a.update((root) => root.t.style(1, 2, {}));

    assert.deepEqual(
      treeOf(a.getRootObject()).toJSInfoForTest(),
      treeOf(a.getCloneRoot()!).toJSInfoForTest(),
      'the root and the clone agree on what nodes exist',
    );
  });

  it('restores each node its own previous value over a multi-node range', () => {
    const a = newReplica(1);
    const b = newReplica(2);

    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', attributes: { b: 'x' }, children: [] },
          { type: 'p', attributes: { b: 'w' }, children: [] },
        ],
      });
    });
    deliver(b, recordChanges(a, 'initial tree'));

    // The two paragraphs hold different values for `b`, so one reverse over
    // the whole range cannot restore both: undoing has to put `x` back on the
    // first and `w` on the second.
    a.update((root) => root.t.style(0, 4, { b: 'y' }));
    deliver(b, recordChanges(a, 'style across both paragraphs'));
    assert.equal(
      a.getRoot().t.toXML(),
      '<doc><p b="y"></p><p b="y"></p></doc>',
    );

    a.history.undo();
    deliver(b, recordChanges(a, 'undo the multi-node style'));

    assert.equal(
      a.getRoot().t.toXML(),
      '<doc><p b="x"></p><p b="w"></p></doc>',
    );
    assert.equal(b.getRoot().t.toXML(), a.getRoot().t.toXML());
  });
});
