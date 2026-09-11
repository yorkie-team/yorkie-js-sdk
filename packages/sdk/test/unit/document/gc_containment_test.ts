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
