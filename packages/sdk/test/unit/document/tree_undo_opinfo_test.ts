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
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';

/**
 * A Tree undo reports where it landed through its OpInfos. This covers the
 * one case where there is nothing to report: the undone nodes come back under
 * an ancestor a peer removed in the meantime, so they take no room in the
 * index and have no position an editor could be told about. The undo still
 * ran, so it still has to be published and delivered — an operation that
 * mutates this replica and reaches no other is divergence.
 */
const docKey = 'tree-undo-opinfo';

type TreeDoc = { t: Tree };
type Replica = Document<TreeDoc>;
type Changes = ReturnType<
  ReturnType<Replica['createChangePack']>['getChanges']
>;

/** `actorOf` renders an actor number as a 24-hex-digit actor id. */
function actorOf(n: number): string {
  return `0000000000000000000000${String(n).padStart(2, '0')}`;
}

/**
 * `newReplica` returns a document with a distinct actor id, so the two
 * replicas here are genuinely distinct peers.
 */
function newReplica(n: number): Replica {
  const doc = new Document<TreeDoc>(docKey);
  doc.setActor(actorOf(n));
  return doc;
}

/**
 * `recordChanges` drains a replica's pending local changes so they can be
 * delivered to the other one. The emptiness check matters here: a step that
 * silently produced nothing — an undo that found no entry — would make the
 * convergence assertions trivially true.
 */
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
 * `deliver` applies recorded changes to a replica. The neutral checkpoint
 * keeps the receiver's own pending local changes, and `InitialVersionVector`
 * keeps garbage collection out of the delivery.
 */
function deliver(to: Replica, changes: Changes): void {
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
 * `collect` garbage-collects both replicas off the min of their version
 * vectors, which is what a sync round does once every replica has seen the
 * removal. `deliver` keeps collection out of delivery, so a test that wants it
 * asks for it here.
 */
function collect(a: Replica, b: Replica): void {
  const min = new VersionVector();
  for (const [actorID, lamport] of a.getVersionVector()) {
    const other = b.getVersionVector().get(actorID);
    min.set(actorID, other === undefined || lamport < other ? lamport : other);
  }
  a.garbageCollect(min);
  b.garbageCollect(min);
}

describe('Tree undo OpInfo under a removed ancestor', () => {
  it('reports no position, and still publishes and delivers the undo', () => {
    const a = newReplica(1);
    const b = newReplica(2);

    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'ab' }] },
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    deliver(b, recordChanges(a, 'initial tree'));

    // A deletes the text in the first paragraph, then B removes the paragraph
    // itself. A's pending undo now has nowhere visible to put the text back.
    a.update((root) => root.t.editByPath([0, 0], [0, 2]));
    deliver(b, recordChanges(a, 'delete text'));
    b.update((root) => root.t.editByPath([0], [1]));
    deliver(a, recordChanges(b, 'remove paragraph'));
    assert.equal(a.getRoot().t.toXML(), '<doc><p>cd</p></doc>');

    // The undo publishes its change with no operation to report, rather than
    // publishing nothing: it is queued and consumes a clientSeq either way,
    // and offline persistence appends off this event.
    let published = 0;
    const opInfos: Array<unknown> = [];
    const unsub = a.subscribe((event) => {
      if (event.type !== 'local-change' || event.source !== 'undoredo') {
        return;
      }
      published++;
      opInfos.push(...event.value.operations);
    });
    a.history.undo();
    unsub();

    assert.equal(published, 1, 'the undo published its change');
    assert.deepEqual(opInfos, [], 'and reported no position in it');
    assert.equal(a.getRoot().t.toXML(), '<doc><p>cd</p></doc>');

    // Nothing was visible to report, but the restore still has to reach B.
    // Undoing B's own removal brings the paragraph back, and the text with it
    // only if A's restore landed there too.
    deliver(b, recordChanges(a, 'undo the text deletion'));
    b.history.undo();
    deliver(a, recordChanges(b, 'undo the paragraph removal'));

    assert.equal(b.getRoot().t.toXML(), '<doc><p>ab</p><p>cd</p></doc>');
    assert.equal(a.getRoot().t.toXML(), b.getRoot().t.toXML());
  });

  it('leaves a collected node tombstoned when its parent comes back', () => {
    const a = newReplica(1);
    const b = newReplica(2);

    a.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'ab' }] },
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    deliver(b, recordChanges(a, 'initial tree'));

    // Same run as above, except both replicas have seen the text deletion
    // before the undo, so collection purges its tombstone on both.
    a.update((root) => root.t.editByPath([0, 0], [0, 2]));
    deliver(b, recordChanges(a, 'delete text'));
    collect(a, b);
    assert.equal(a.getGarbageLen(), 0, 'the text tombstone is collected');
    assert.equal(b.getGarbageLen(), 0, 'on both replicas');

    b.update((root) => root.t.editByPath([0], [1]));
    deliver(a, recordChanges(b, 'remove paragraph'));
    assert.equal(a.getRoot().t.toXML(), '<doc><p>cd</p></doc>');

    a.history.undo();
    deliver(b, recordChanges(a, 'undo the text deletion'));
    b.history.undo();
    deliver(a, recordChanges(b, 'undo the paragraph removal'));

    // The undo recreates the purged text under a parent that is removed at
    // that moment, and `recreateFromSpan` births it tombstoned, so restoring
    // the paragraph does not bring the text back with it. Both replicas
    // collect off the same min version vector, so both land here: the outcome
    // differs from the uncollected run above, but never between peers.
    assert.equal(b.getRoot().t.toXML(), '<doc><p></p><p>cd</p></doc>');
    assert.equal(a.getRoot().t.toXML(), b.getRoot().t.toXML());
  });
});
