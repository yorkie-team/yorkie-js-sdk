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
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

/**
 * `deliver` pushes the sender's pending changes into the receiver, then acks
 * them back to the sender so the next call does not re-send them. The
 * receiver applies with `OpSource.Remote`, which is also how the server
 * replays a change log to build a snapshot.
 */
function deliver<T>(from: Document<T>, to: Document<T>): void {
  const pack = from.createChangePack();
  const changes = pack.getChanges();
  to.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      changes,
      InitialVersionVector,
    ),
  );
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  from.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
}

/**
 * `collect` runs garbage collection with every actor at its maximum lamport,
 * so nothing is held back by an unsynced peer.
 */
function collect(doc: Document<any>): number {
  return doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));
}

describe('Garbage collection containment', () => {
  it('collects an array element replaced by an array set', () => {
    const doc = new Document<any>('array-set-then-remove');
    doc.update((r) => {
      r.arr = [{ a: 1 }];
    });
    doc.update((r) => {
      r.arr[0] = { b: 2 };
    });
    doc.update((r) => {
      r.arr.splice(0, 1);
    });

    // No undo anywhere. The value an array set installs has to be registered
    // with its parent, or garbage collection cannot reach it to purge it and
    // throws on the missing parent instead -- inside `applyChangePack`, which
    // is what stops the client from syncing again.
    assert.doesNotThrow(() => collect(doc));
    assert.equal(doc.getGarbageLen(), 0);
    assert.equal(doc.toSortedJSON(), '{"arr":[]}');
  });

  it('collects the element an array assignment displaces', () => {
    const doc = new Document<any>('array-set-leak');
    doc.update((r) => {
      r.arr = [0];
    });

    const set = (v: number) => {
      doc.update((r) => {
        r.arr[0] = v;
      });
      collect(doc);
    };

    // One cycle establishes the steady state: an array holding one number,
    // with the element it displaced collected.
    set(1);
    const steady = JSON.parse(JSON.stringify(doc.getDocSize()));
    assert.equal(doc.getGarbageLen(), 0);

    for (let i = 2; i <= 10; i++) {
      set(i);
    }

    // The displaced elements used to stay charged to live with nothing able
    // to reach them, so an ordinary assignment loop grew the document without
    // bound. No undo is involved.
    assert.equal(doc.toSortedJSON(), '{"arr":[10]}');
    assert.equal(doc.getGarbageLen(), 0);
    assert.deepEqual(doc.getDocSize(), steady);
  });

  it('collects the tombstone an undone object remove leaves on a peer', () => {
    // `SetOperation` restores the member under its original createdAt, and
    // the object re-keys onto the restored node. The removal's member in the
    // gc set then resolves to that live element, whose removedAt is
    // undefined, so collection can never take it. Deregistering the stale
    // registration is what clears it, and that has to happen wherever the
    // operation is applied -- not only on the replica that performed the undo.
    const d1 = new Document<any>('undone-object-remove');
    const d2 = new Document<any>('undone-object-remove');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.obj = { k: 1 };
      r.keep = 0;
    });
    deliver(d1, d2);

    d1.update((r) => {
      delete r.obj;
    }, 'remove obj');
    d1.history.undo();
    deliver(d1, d2);

    assert.equal(d1.toSortedJSON(), '{"keep":0,"obj":{"k":1}}');
    assert.equal(d2.toSortedJSON(), '{"keep":0,"obj":{"k":1}}');

    const vector = maxVectorOf([A1, A2]);
    d1.garbageCollect(vector);
    d2.garbageCollect(vector);

    assert.equal(d1.toSortedJSON(), '{"keep":0,"obj":{"k":1}}');
    assert.equal(d2.toSortedJSON(), '{"keep":0,"obj":{"k":1}}');
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(
      d2.getGarbageLen(),
      0,
      'the peer holds a worklist entry that can never be collected',
    );
  });

  it('survives a gc set member left behind by an older client', () => {
    const doc = new Document<any>('legacy-orphan');
    doc.update((r) => {
      r.items = [{ a: 1 }];
    });

    // A document written by an SDK that left two elements under one createdAt
    // holds a gc set member the pair map cannot resolve. The state is not
    // reachable through this SDK's public API, so it is staged directly: what
    // is pinned is that a client meeting such a document keeps syncing
    // instead of throwing inside `applyChangePack`.
    const root = doc.getRootCRDT() as CRDTRoot;
    const stale = new Set<string>(
      (root as unknown as { gcElementSetByCreatedAt: Set<string> })
        .gcElementSetByCreatedAt,
    );
    stale.add('1:000000000000000000000000:999');
    (
      root as unknown as { gcElementSetByCreatedAt: Set<string> }
    ).gcElementSetByCreatedAt = stale;

    const before = JSON.parse(JSON.stringify(doc.getDocSize()));
    assert.doesNotThrow(() => root.getGarbageLen());
    assert.doesNotThrow(() => collect(doc));

    // The member is skipped, not forgotten: its size is still charged to
    // `docSize.gc`, and only `deregisterElement` releases that, so dropping
    // it would leave the charge with nothing reporting it as garbage.
    assert.deepEqual(doc.getDocSize(), before);
    assert.isAbove(doc.getGarbageLen(), 0);
    assert.equal(doc.toSortedJSON(), '{"items":[{"a":1}]}');
  });

  it('survives a gc set member whose element has no parent', () => {
    const doc = new Document<any>('legacy-parentless');
    doc.update((r) => {
      r.items = [{ a: 1 }];
    });
    doc.update((r) => {
      r.items.splice(0, 1);
    });

    // `ArraySetOperation` used to register its value without a parent, so the
    // pair resolves but `purge` has nothing to call. Re-register the tombstone
    // that way to reproduce what such a document carries.
    const root = doc.getRootCRDT() as CRDTRoot;
    let tombstone: CRDTElement | undefined;
    doc.getRootObject().getDescendants((elem) => {
      if (elem.getRemovedAt()) {
        tombstone = elem;
        return true;
      }
      return false;
    });
    assert.isDefined(tombstone);
    root.registerElement(tombstone!);

    const before = JSON.parse(JSON.stringify(doc.getDocSize()));
    assert.doesNotThrow(() => collect(doc));
    assert.deepEqual(doc.getDocSize(), before);
    assert.equal(doc.toSortedJSON(), '{"items":[]}');
  });
});

/**
 * `broadcast` is `deliver` for more than one receiver. The ack has to happen
 * once, after every receiver has the pack: it clears the sender's local
 * changes, so acking per receiver would leave the second one with nothing.
 */
function broadcast<T>(from: Document<T>, ...tos: Array<Document<T>>): void {
  const pack = from.createChangePack();
  const changes = pack.getChanges();
  for (const to of tos) {
    to.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        changes,
        InitialVersionVector,
      ),
    );
  }
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  from.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
}

describe('Restoring a container', function () {
  /**
   * The reverse of a remove is a set of `value.deepcopy()`, taken when the
   * removal was recorded. A peer that added a member into the container after
   * that copy was taken has a tombstone whose descendant set is a strict
   * superset of the copy's. Retiring the tombstone by deregistering it and its
   * descendants evicts those extra members from `elementPairMapByCreatedAt`,
   * and nothing puts them back -- so the next change addressed at one of them
   * throws `fail to find` inside `applyChangePack`, which is the permanent
   * desync this release exists to stop.
   *
   * It is not confined to the replica it happens on: the Go server rebuilds
   * documents and snapshots by replaying the stored change log, so a change
   * that cannot apply makes the document unloadable for everyone.
   *
   * This does not assert convergence. The restored container still diverges --
   * the copy never held the peer's member, so the edit lands on an orphaned
   * subtree and is invisible. That is the identity-preserving revive work this
   * release defers. What must hold is narrower: the change log stays
   * replayable.
   */
  it('keeps a member a peer added into it addressable', function () {
    const d1 = new Document<any>('restore-foreign');
    const d2 = new Document<any>('restore-foreign');
    const d3 = new Document<any>('restore-foreign');

    d1.update((r) => {
      r.obj = { k: 1 };
    });
    broadcast(d1, d2, d3);

    // d2 adds a member inside obj. d1 never sees it, so the copy its undo
    // carries will not contain it.
    d2.update((r) => {
      r.obj.n = { y: 1 };
    });
    broadcast(d2, d3);

    d1.update((r) => {
      delete r.obj;
    }, 'remove obj');
    d1.history.undo();
    deliver(d1, d3);

    // d2, which has not seen the removal, edits the member it added.
    d2.update((r) => {
      r.obj.n.x = 5;
    });
    const pack = d2.createChangePack();

    let thrown: unknown;
    try {
      d3.applyChangePack(
        ChangePack.create(
          pack.getDocumentKey(),
          Checkpoint.of(0n, 0),
          false,
          pack.getChanges(),
          InitialVersionVector,
        ),
      );
    } catch (e) {
      thrown = e;
    }
    assert.isUndefined(
      thrown,
      `the peer's change no longer applies, so the change log is unreplayable: ${thrown}`,
    );
  });

  /**
   * Each cycle leaves another tombstone answering to the same createdAt.
   * Collection that resolves an entry through a createdAt-keyed index rather
   * than through the element it was registered for will, on a later pass,
   * unlink a live member on a dead one's behalf or fail to find the node at
   * all -- and a throw inside `garbageCollect` inside `applyChangePack` is
   * exactly #1340.
   */
  it('survives being restored and removed repeatedly', function () {
    const doc = new Document<any>('restore-repeat');
    doc.update((r) => {
      r.o = { k: 1 };
    });

    for (let i = 0; i < 3; i++) {
      doc.update((r) => {
        delete r.o;
      }, 'remove o');
      doc.history.undo();
    }
    doc.update((r) => {
      delete r.o;
    }, 'remove o');

    let thrown: unknown;
    try {
      doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));
    } catch (e) {
      thrown = e;
    }
    assert.isUndefined(thrown, `collection threw: ${thrown}`);
    assert.equal(doc.toSortedJSON(), '{}');
    assert.equal(doc.getGarbageLen(), 0);
  });
});
