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
import { JSONArray } from '@yorkie-js/sdk/src/document/json/array';
import { Text } from '@yorkie-js/sdk/src/document/json/text';
import { Tree } from '@yorkie-js/sdk/src/document/json/tree';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTArray } from '@yorkie-js/sdk/src/document/crdt/array';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { TimeTicketSize } from '@yorkie-js/sdk/src/document/time/ticket';
import { totalDocSize } from '@yorkie-js/sdk/src/util/resource';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

// Ports of Go's gc_rga_barrier_test.go and gc_rga_barrier_cost_test.go
// (yorkie ba82ed91). A collecting replica must not reorder the elements that
// survive collection: an insert whose RGA forward skip stopped at a node on
// one replica must not run past that node on a replica that has already
// collected it.
//
// Every version vector that authorises a purge here is one the server could
// genuinely compute: the element-wise min of the replicas' own vectors, as
// UpdateMinVersionVector does. `maxVectorOf` is used only at the end, to
// assert that nothing is retained forever.

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

type ArrDoc = { arr: JSONArray<string> } & Record<string, unknown>;
type TextDoc = { t: Text } & Record<string, unknown>;
type TreeDoc = { t: Tree } & Record<string, unknown>;

/**
 * `newReplicas` builds two in-process documents with distinct actors.
 */
function newReplicas<T>(): [Document<T>, Document<T>] {
  const d1 = new Document<T>('test-doc');
  const d2 = new Document<T>('test-doc');
  d1.setActor(A1);
  d2.setActor(A2);
  return [d1, d2];
}

/**
 * `pull` applies the given changes to `d`, as a pull from the server would.
 */
function pull<T>(d: Document<T>, changes: Array<Change<any>>): void {
  d.applyChangePack(
    ChangePack.create(
      d.getKey(),
      Checkpoint.of(0n, 0),
      false,
      changes,
      InitialVersionVector,
    ),
  );
}

/**
 * `push` hands `d`'s pending changes to the server and acks them at `d`. If
 * `rows` is given, it records `d`'s version vector as its row, which is what
 * the server stores and computes the min version vector from.
 */
function push<T>(
  d: Document<T>,
  rows?: Map<string, VersionVector>,
): Array<Change<any>> {
  // The row the server writes is the VV the client had BEFORE this round
  // trip's pull. Nothing is pulled here, so it is simply the current VV.
  rows?.set(d.getChangeID().getActorID(), d.getVersionVector().deepcopy());

  const pack = d.createChangePack();
  const changes = pack.getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  d.applyChangePack(
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
 * `oneWayDeliver` hands one replica's pending local changes to the other and
 * acks them at the sender: a push followed by the other side's pull.
 */
function oneWayDeliver<T>(from: Document<T>, to: Document<T>): void {
  pull(to, push(from));
}

/**
 * `crossSync` exchanges pending changes both ways.
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const c1 = push(d1);
  const c2 = push(d2);
  pull(d2, c1);
  pull(d1, c2);
}

/**
 * `minVV` is Go's `time.MinVersionVector`: element-wise min, and 0 for an
 * actor any vector does not carry.
 */
function minVV(...vectors: Array<VersionVector>): VersionVector {
  const actors = new Set<string>();
  for (const v of vectors) {
    for (const [actor] of v) {
      actors.add(actor);
    }
  }

  const out = new VersionVector(new Map());
  for (const actor of actors) {
    let min: bigint | undefined;
    for (const v of vectors) {
      const l = v.get(actor) ?? 0n;
      min = min === undefined || l < min ? l : min;
    }
    out.set(actor, min!);
  }
  return out;
}

/**
 * `arrayOf` returns the CRDT array under `arr`.
 */
function arrayOf(d: Document<ArrDoc>): CRDTArray {
  return d.getRootObject().get('arr') as unknown as CRDTArray;
}

/**
 * `arrJSON` renders the array under `arr`.
 */
function arrJSON(d: Document<ArrDoc>): string {
  return arrayOf(d).toJSON();
}

/**
 * `createdAtOf` returns the createdAt of the array element holding `value`,
 * tombstoned or not.
 */
function createdAtOf(d: Document<ArrDoc>, value: string): TimeTicket {
  for (const n of arrayOf(d).getAllRGANodes()) {
    const elem = n.getElement();
    if (elem && elem.toJSON() === JSON.stringify(value)) {
      return elem.getCreatedAt();
    }
  }
  throw new Error(`element not found: ${value}`);
}

/**
 * `removedAtOf` returns the removal ticket of the array element holding
 * `value`.
 */
function removedAtOf(d: Document<ArrDoc>, value: string): TimeTicket {
  for (const n of arrayOf(d).getAllRGANodes()) {
    const elem = n.getElement();
    if (elem && elem.toJSON() === JSON.stringify(value)) {
      const at = elem.getRemovedAt();
      assert.isDefined(at, `element ${value} is not removed`);
      return at!;
    }
  }
  throw new Error(`element not found: ${value}`);
}

/**
 * `movedPositionTicket` returns the position ticket of the only position node
 * in `arr` that a move stamped.
 */
function movedPositionTicket(d: Document<ArrDoc>): TimeTicket {
  for (const n of arrayOf(d).getAllRGANodes()) {
    const movedAt = n.getPositionMovedAt();
    if (n.getElement() && movedAt) {
      return movedAt;
    }
  }
  throw new Error('no moved position node found');
}

/**
 * `assertMatchesRebuild` asserts the running docSize and garbage count equal
 * what a root rebuilt from the same content computes.
 */
function assertMatchesRebuild<T>(d: Document<T>, msg: string): void {
  const r = new CRDTRoot(d.getRootObject().deepcopy());
  assert.deepEqual(d.getDocSize(), r.getDocSize(), `${msg}: docSize`);
  assert.equal(d.getGarbageLen(), r.getGarbageLen(), `${msg}: garbage`);
}

describe('GC successor barrier', function () {
  // Port of Go TestConcurrentRemoveAndMoveThenGCKeepsInsertOrder. A moved
  // element lives in the position node its move created, stamped with the
  // move's ticket, and that node is what the forward skip reads. Purging the
  // element unlinks that node, but the purge used to be gated only on the
  // element's removedAt. With the remove and the move concurrent, a vector can
  // cover the remove while the move is still in flight.
  it('keeps insert order when a removed element was concurrently moved', function () {
    const [remover, mover] = newReplicas<ArrDoc>();

    remover.update((r) => {
      r.arr = ['a', 'w'] as unknown as JSONArray<string>;
    });
    crossSync(remover, mover);
    assert.equal(mover.toSortedJSON(), '{"arr":["a","w"]}');

    // Concurrent branch 1 (remover): remove "a".
    remover.update((r) => r.arr.delete(0));

    // Concurrent branch 2 (mover): move "a" after "w", then -- after a few
    // unrelated changes, so its ticket outruns the insert below -- append "s"
    // anchored on "a"'s new position.
    mover.update((r) => r.arr.moveAfterByIndex(1, 0));
    assert.equal(arrJSON(mover), '["w","a"]');
    for (let i = 0; i < 3; i++) {
      mover.update((r) => (r[`mover-${i}`] = i));
    }
    mover.update((r) =>
      r.arr.insertAfter(r.arr.getElementByIndex(1).getID!(), 's'),
    );
    assert.equal(arrJSON(mover), '["w","a","s"]');

    // The remover pushes only the removal. Both replicas have now seen it, so
    // it is causally stable; the move and the append are not.
    oneWayDeliver(remover, mover);
    assert.equal(arrJSON(mover), '["w","s"]');
    const vv = minVV(remover.getVersionVector(), mover.getVersionVector());

    // The remover keeps editing without pulling: one filler change, then an
    // insert anchored on "w". Its ticket sits strictly between the move and
    // the mover's append.
    remover.update((r) => (r['remover-0'] = 0));
    remover.update((r) =>
      r.arr.insertAfter(r.arr.getElementByIndex(0).getID!(), 'x'),
    );
    assert.equal(arrJSON(remover), '["w","x"]');

    const moveAt = movedPositionTicket(mover);
    const insertAt = createdAtOf(remover, 'x');
    const appendAt = createdAtOf(mover, 's');
    assert.isTrue(insertAt.after(moveAt), 'insert must be newer than move');
    assert.isTrue(appendAt.after(insertAt), 'append must be newer than insert');
    assert.isTrue(vv.afterOrEqual(removedAtOf(remover, 'a')));
    assert.isFalse(vv.afterOrEqual(moveAt));

    // The mover collects with that vector: the only difference between them.
    mover.garbageCollect(vv);

    oneWayDeliver(remover, mover);
    crossSync(remover, mover);
    assert.equal(
      arrJSON(mover),
      arrJSON(remover),
      'collecting an element whose position node was created by a ' +
        'concurrent move reordered a later concurrent insert',
    );

    // Holding the purge back must be a delay, not a leak.
    remover.garbageCollect(maxVectorOf([A1, A2]));
    mover.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(remover.getGarbageLen(), 0, 'remover leaked garbage');
    assert.equal(mover.getGarbageLen(), 0, 'mover leaked garbage');
    crossSync(remover, mover);
    assert.equal(arrJSON(mover), arrJSON(remover));
    assertMatchesRebuild(remover, 'remover');
    assertMatchesRebuild(mover, 'mover');
  });

  // Port of Go TestConcurrentMovesOfSameElementServerMinVV. The element is
  // moved twice, concurrently, by two actors. The slot the second move
  // abandons was created by the FIRST move, so the ticket that must stay
  // covered is the first move's, not the element's insert.
  for (const collect of [true, false]) {
    it(`keeps concurrent moves of one element converged (collect=${collect})`, function () {
      const [dA, dB] = newReplicas<ArrDoc>();
      const rows = new Map<string, VersionVector>();

      dA.update((r) => {
        r.arr = ['a', 'w', 'v'] as unknown as JSONArray<string>;
      });
      pull(dB, push(dA, rows));
      push(dB, rows);
      assert.equal(arrJSON(dB), '["a","w","v"]');

      // A (local, unpushed): move "a" after "w" (m1), filler, then insert "s"
      // anchored on "a"'s new (m1) position.
      dA.update((r) => r.arr.moveAfterByIndex(1, 0));
      for (let i = 0; i < 2; i++) {
        dA.update((r) => (r[`fa-${i}`] = i));
      }
      dA.update((r) =>
        r.arr.insertAfter(r.arr.getElementByIndex(1).getID!(), 's'),
      );
      assert.equal(arrJSON(dA), '["w","a","s","v"]');

      // B (concurrently, from base): move "a" after "v" (m2). B pushes.
      dB.update((r) => r.arr.moveAfterByIndex(2, 0));
      assert.equal(arrJSON(dB), '["w","v","a"]');
      const fromB = push(dB, rows);

      // A pulls m2, then pushes its own backlog.
      pull(dA, fromB);
      const fromA = push(dA, rows);

      // A collects with the server's minVV. This is the only asymmetry.
      if (collect) {
        dA.garbageCollect(minVV(...rows.values()));
      }

      // B, which has not pulled A's backlog yet, inserts "x" after "w".
      dB.update((r) =>
        r.arr.insertAfter(r.arr.getElementByIndex(0).getID!(), 'x'),
      );
      const fromB2 = push(dB, rows);

      pull(dB, fromA);
      pull(dA, fromB2);

      dA.garbageCollect(maxVectorOf([A1, A2]));
      dB.garbageCollect(maxVectorOf([A1, A2]));
      assert.equal(
        arrJSON(dA),
        arrJSON(dB),
        'replicas diverged permanently under a server-computed minVV',
      );
      assert.equal(dA.getGarbageLen(), 0, 'A leaked garbage');
      assert.equal(dB.getGarbageLen(), 0, 'B leaked garbage');
    });
  }

  // Port of Go TestConcurrentDeleteAndInsertThenGCKeepsTextOrder: the same
  // defect in RGATreeSplit, with no move anywhere in it. The tombstone left by
  // the delete is what stops the skip in findNodeWithSplit.
  it('keeps text order after collecting a concurrently deleted node', function () {
    const [remover, mover] = newReplicas<TextDoc>();

    remover.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'A');
      r.t.edit(0, 0, 'W');
    });
    crossSync(remover, mover);
    assert.equal(mover.getRoot().t.toString(), 'WA');

    // mover: bump its clock, then append "S" anchored right after "A".
    for (let i = 0; i < 3; i++) {
      mover.update((r) => (r[`mover-${i}`] = i));
    }
    mover.update((r) => r.t.edit(2, 2, 'S'));
    assert.equal(mover.getRoot().t.toString(), 'WAS');

    // remover: delete "A". It reaches the mover, so it is causally stable.
    remover.update((r) => r.t.edit(1, 2, ''));
    oneWayDeliver(remover, mover);
    assert.equal(mover.getRoot().t.toString(), 'WS');
    const vv = minVV(remover.getVersionVector(), mover.getVersionVector());

    // remover keeps editing without pulling: insert "X" right after "W".
    remover.update((r) => (r['remover-0'] = 0));
    remover.update((r) => r.t.edit(1, 1, 'X'));
    assert.equal(remover.getRoot().t.toString(), 'WX');

    mover.garbageCollect(vv);
    oneWayDeliver(remover, mover);
    crossSync(remover, mover);
    assert.equal(
      mover.getRoot().t.toString(),
      remover.getRoot().t.toString(),
      'text replicas diverged after collecting a tombstone',
    );

    remover.garbageCollect(maxVectorOf([A1, A2]));
    mover.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(remover.getGarbageLen(), 0, 'remover leaked garbage');
    assert.equal(mover.getGarbageLen(), 0, 'mover leaked garbage');
    assertMatchesRebuild(remover, 'remover');
    assertMatchesRebuild(mover, 'mover');
  });

  // Port of Go TestConcurrentDeleteAndInsertThenGCKeepsTreeOrder: the same
  // defect in CRDTTree, whose sibling skip in findNodesAndSplitText reads the
  // parent's children with the removed ones included.
  it('keeps tree order after collecting a concurrently deleted node', function () {
    const [remover, mover] = newReplicas<TreeDoc>();

    remover.update((r) => {
      r.t = new Tree({ type: 'doc', children: [{ type: 'p', children: [] }] });
      r.t.edit(1, 1, { type: 'text', value: 'A' });
      r.t.edit(1, 1, { type: 'text', value: 'W' });
    });
    crossSync(remover, mover);
    assert.equal(mover.getRoot().t.toXML(), '<doc><p>WA</p></doc>');

    for (let i = 0; i < 3; i++) {
      mover.update((r) => (r[`mover-${i}`] = i));
    }
    mover.update((r) => r.t.edit(3, 3, { type: 'text', value: 'S' }));
    assert.equal(mover.getRoot().t.toXML(), '<doc><p>WAS</p></doc>');

    remover.update((r) => r.t.edit(2, 3));
    oneWayDeliver(remover, mover);
    assert.equal(mover.getRoot().t.toXML(), '<doc><p>WS</p></doc>');
    const vv = minVV(remover.getVersionVector(), mover.getVersionVector());

    remover.update((r) => (r['remover-0'] = 0));
    remover.update((r) => r.t.edit(2, 2, { type: 'text', value: 'X' }));
    assert.equal(remover.getRoot().t.toXML(), '<doc><p>WX</p></doc>');

    mover.garbageCollect(vv);
    oneWayDeliver(remover, mover);
    crossSync(remover, mover);
    assert.equal(
      mover.getRoot().t.toXML(),
      remover.getRoot().t.toXML(),
      'tree replicas diverged after collecting a tombstone',
    );

    remover.garbageCollect(maxVectorOf([A1, A2]));
    mover.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(remover.getGarbageLen(), 0, 'remover leaked garbage');
    assert.equal(mover.getGarbageLen(), 0, 'mover leaked garbage');
    assertMatchesRebuild(remover, 'remover');
    assertMatchesRebuild(mover, 'mover');
  });
});

/**
 * The barrier delays a purge, so its cost is retention. These pin what
 * separates an acceptable delay from a leak: retention is bounded by how far
 * behind the collection vector is, not by the array's size; it drains
 * completely once the vector catches up; and an array under a byte limit
 * still accepts every move.
 *
 * A drained document does NOT cost what it cost before the moves: a moved
 * element carries a movedAt ticket it did not carry before, and a rebuild
 * charges it. That is content, not retention, so the residue is bounded by one
 * ticket per moved element and checked against a rebuild.
 */
describe('GC successor barrier cost', function () {
  const newStringArray = (d: Document<ArrDoc>, n: number) => {
    d.update((r) => {
      r.arr = Array.from(
        { length: n },
        (_, i) => `e${String(i).padStart(3, '0')}`,
      ) as unknown as JSONArray<string>;
    });
  };
  const dragToFront = (d: Document<ArrDoc>, idx: number) => {
    d.update((r) => r.arr.moveFront(r.arr.getElementByIndex(idx).getID!()));
  };

  // Port of Go TestBarrierRetentionIsBoundedByLagNotByArraySize.
  for (const lag of [1n, 5n, 50n]) {
    it(`bounds retention by the lag, not the array size (lag=${lag})`, function () {
      const n = 200;
      const doc = new Document<ArrDoc>('barrier-cost-lag');
      doc.setActor(A1);
      newStringArray(doc, n);

      const lagging = () => {
        const v = doc.getVersionVector().deepcopy();
        const cur = v.get(A1)!;
        if (cur > lag) {
          v.set(A1, cur - lag);
        }
        return v;
      };

      doc.garbageCollect(lagging());
      const baselineTotal = totalDocSize(doc.getDocSize());

      let peak = 0;
      for (let i = 1; i < n; i++) {
        dragToFront(doc, i);
        doc.garbageCollect(lagging());
        peak = Math.max(peak, doc.getGarbageLen());
      }
      assert.isAtMost(
        peak,
        Number(lag),
        'retention must be bounded by the lag, not by the array size',
      );

      doc.garbageCollect(doc.getVersionVector());
      assert.equal(doc.getGarbageLen(), 0, 'retention must drain');
      assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });
      assert.equal(
        totalDocSize(doc.getDocSize()),
        baselineTotal + (n - 1) * TimeTicketSize,
        'a fully synced document costs its content: one movedAt per move',
      );
      assertMatchesRebuild(doc, 'after dragging every element');
    });
  }

  // Port of Go TestBarrierKeepsAnArrayUnderItsSizeLimitMovable.
  it('keeps an array under its size limit movable', function () {
    const doc = new Document<ArrDoc>('barrier-cost-limit');
    doc.setActor(A1);
    doc.setMaxSizePerDocument(1000 + 19 * TimeTicketSize);
    newStringArray(doc, 20);
    doc.garbageCollect(doc.getVersionVector());

    for (let i = 1; i < 20; i++) {
      dragToFront(doc, i);
      doc.garbageCollect(doc.getVersionVector());
    }
    assert.equal(doc.getGarbageLen(), 0);
  });

  // Port of Go TestBarrierCostsNothingOnConcurrentMoves: two actors moving
  // elements concurrently, synced with a server-computed minVV.
  it('costs nothing lasting on concurrent moves', function () {
    const n = 60;
    const rounds = 25;
    const [d1, d2] = newReplicas<ArrDoc>();
    const rows = new Map<string, VersionVector>();

    newStringArray(d1, n);
    pull(d2, push(d1, rows));
    rows.set(A2, d2.getVersionVector().deepcopy());
    const syncedTotal = totalDocSize(d1.getDocSize());

    let peak = 0;
    for (let r = 0; r < rounds; r++) {
      // Concurrent: both move before either exchanges.
      dragToFront(d1, 1 + ((r * 7) % (n - 1)));
      dragToFront(d2, 1 + ((r * 13 + 3) % (n - 1)));

      const c1 = push(d1, rows);
      const c2 = push(d2, rows);
      pull(d2, c1);
      pull(d1, c2);

      const vv = minVV(...rows.values());
      d1.garbageCollect(vv);
      d2.garbageCollect(vv);
      peak = Math.max(peak, d1.getGarbageLen(), d2.getGarbageLen());
    }
    assert.isAtMost(peak, 2, 'concurrent moves must not accumulate retention');

    rows.set(A1, d1.getVersionVector().deepcopy());
    rows.set(A2, d2.getVersionVector().deepcopy());
    const final = minVV(...rows.values());
    d1.garbageCollect(final);
    d2.garbageCollect(final);

    assert.equal(d1.toSortedJSON(), d2.toSortedJSON(), 'replicas must agree');
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);
    assert.deepEqual(d1.getDocSize(), d2.getDocSize());

    const drained = totalDocSize(d1.getDocSize());
    assert.isAtLeast(drained, syncedTotal);
    assert.isAtMost(drained, syncedTotal + 2 * rounds * TimeTicketSize);
    assertMatchesRebuild(d1, 'd1 after concurrent moves');
    assertMatchesRebuild(d2, 'd2 after concurrent moves');
  });
});
