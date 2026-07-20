/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { DocSize } from '@yorkie-js/sdk/src/util/resource';

/**
 * Exchanges pending local changes between two in-process documents,
 * mimicking a server round-trip without serialization (so prototype-only
 * fields like restoreSpans survive). Mirrors the helper in
 * gc_split_leak_test.ts; kept local so the restore-convergence and
 * GC-leak suites stay independent.
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();

  // Neutral checkpoint (clientSeq 0) so the receiver's own pending local
  // changes are not dropped; empty version vector keeps GC out of the swap.
  d2.applyChangePack(
    ChangePack.create(
      p1.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      p1.getChanges(),
      InitialVersionVector,
    ),
  );
  d1.applyChangePack(
    ChangePack.create(
      p2.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      p2.getChanges(),
      InitialVersionVector,
    ),
  );
  // Self-ack: drop exactly the delivered changes from each sender's local
  // queue so the next crossSync doesn't re-send them.
  const ack = (pack: ReturnType<Document<T>['createChangePack']>) => {
    const changes = pack.getChanges();
    const lastSeq = changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
    return ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    );
  };
  d1.applyChangePack(ack(p1));
  d2.applyChangePack(ack(p2));
}

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

/**
 * Builds two replicas that both hold "0123456789", then concurrently
 * delete overlapping ranges — d1 deletes "45" (indices 4..6), d2 deletes
 * the superset "234567" (indices 2..8) — and cross-sync to the converged
 * "0189". Each replica keeps its own delete on its undo stack.
 */
function buildOverlappingDeletes(): [
  Document<{ text: Text }>,
  Document<{ text: Text }>,
] {
  const d1 = new Document<{ text: Text }>('test-doc');
  const d2 = new Document<{ text: Text }>('test-doc');
  d1.setActor(A1);
  d2.setActor(A2);

  d1.update((root) => {
    root.text = new Text();
    root.text.edit(0, 0, '0123456789');
  });
  crossSync(d1, d2);

  d1.update((root) => root.text.edit(4, 6, '')); // delete "45"
  d2.update((root) => root.text.edit(2, 8, '')); // delete "234567"
  crossSync(d1, d2);

  assert.equal(d1.getRoot().text.toString(), '0189');
  assert.equal(d2.getRoot().text.toString(), d1.getRoot().text.toString());
  return [d1, d2];
}

describe('identity-preserving restore convergence', () => {
  // The feature's motivating case: two clients concurrently undo overlapping
  // deletions. The undos are identity-addressed, so restoring both must
  // revive the original insertion exactly once (a set union of the two
  // restored ranges), converging to identical content and identical node
  // ids on both replicas regardless of the order the restores are applied.
  const runBothUndos = (undoD1First: boolean) => {
    const [d1, d2] = buildOverlappingDeletes();
    if (undoD1First) {
      d1.history.undo();
      crossSync(d1, d2);
      d2.history.undo();
    } else {
      d2.history.undo();
      crossSync(d1, d2);
      d1.history.undo();
    }
    crossSync(d1, d2);
    return [d1, d2] as const;
  };

  it('converges when both replicas undo overlapping deletes (d1 first)', () => {
    const [d1, d2] = runBothUndos(true);
    assert.equal(d1.getRoot().text.toString(), '0123456789');
    assert.equal(
      d1.getRoot().text.toTestString(),
      d2.getRoot().text.toTestString(),
      'both replicas must converge to identical content AND node ids',
    );
  });

  it('converges to the same state under the opposite undo order (d2 first)', () => {
    const [a1, a2] = runBothUndos(true);
    const [b1, b2] = runBothUndos(false);
    assert.equal(a1.getRoot().text.toString(), '0123456789');
    assert.equal(b1.getRoot().text.toString(), '0123456789');
    assert.equal(
      a1.getRoot().text.toTestString(),
      a2.getRoot().text.toTestString(),
    );
    assert.equal(
      b1.getRoot().text.toTestString(),
      b2.getRoot().text.toTestString(),
    );
  });

  it('purges symmetrically with docSize.gc drained after both undos', () => {
    const [d1, d2] = runBothUndos(true);
    const vector = maxVectorOf([A1, A2]);

    const purged1 = d1.garbageCollect(vector);
    const purged2 = d2.garbageCollect(vector);
    assert.equal(purged1, purged2, 'both replicas must purge the same count');
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    for (const d of [d1, d2]) {
      const gc = d.getDocSize().gc;
      assert.deepEqual(
        gc,
        { data: 0, meta: 0 },
        'every revived node must leave docSize.gc empty',
      );
    }
  });
});

describe('identity-preserving restore GC accounting', () => {
  const snapshot = (size: DocSize): DocSize => ({
    live: { ...size.live },
    gc: { ...size.gc },
  });

  // unregisterGCPair (revive) must reverse registerGCPair (tombstone) bit for
  // bit, including the TimeTicketSize meta term, or docSize drifts across
  // undo/redo cycles. The anchor is the post-delete state, NOT the pristine
  // pre-delete one: deleting "45" splits the insertion into "0123"|"45"|"6789"
  // and reviving un-tombstones "45" without re-merging the splits, so the
  // extra fragment metadata legitimately persists. That fragmentation is
  // orthogonal to GC accounting; what must be exactly reversible is the
  // gc<->live movement, which this pins by round-tripping the cycle.
  it('reverses GC accounting exactly across delete/undo/redo/undo', () => {
    const doc = new Document<{ text: Text }>('test-doc');
    doc.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, '0123456789');
    });

    doc.update((root) => root.text.edit(4, 6, '')); // tombstone -> registerGCPair
    const deleted = snapshot(doc.getDocSize());
    assert.notDeepEqual(
      deleted.gc,
      { data: 0, meta: 0 },
      'delete registers GC',
    );

    doc.history.undo(); // revive -> unregisterGCPair
    const revived = snapshot(doc.getDocSize());
    assert.deepEqual(
      revived.gc,
      { data: 0, meta: 0 },
      'revive must drain the tombstoned size out of gc, including the meta term',
    );

    doc.history.redo(); // re-tombstone -> registerGCPair again
    assert.deepEqual(
      doc.getDocSize(),
      deleted,
      'redo must reproduce the tombstoned docSize exactly, including meta',
    );

    doc.history.undo(); // revive again
    assert.deepEqual(
      doc.getDocSize(),
      revived,
      'the revived docSize is bit-identical across cycles, including meta',
    );
  });
});
