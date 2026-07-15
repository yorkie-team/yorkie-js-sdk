import { describe, it, assert } from 'vitest';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { converter } from '@yorkie-js/sdk/src/api/converter';

/**
 * Exchanges pending local changes between two in-process documents,
 * mimicking a server round-trip without serialization (so prototype-only
 * fields like restoreSpans survive).
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();

  // Deliver with a neutral checkpoint (clientSeq 0) so the receiver's own
  // pending local changes are not dropped. Empty version vector keeps GC
  // out of the exchange (GC interaction is tested separately, e.g. E4).
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
  // queue so the next crossSync doesn't re-send them (re-applying a change
  // twice corrupts state).
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
 * Builds two replicas where d1 deletes "el" (splitting the text node) and
 * d2 concurrently deletes the whole <p> (tombstoning it unsplit). When
 * d1's delete arrives at d2, it splits d2's tombstoned text node, creating
 * pieces that are born already-removed.
 */
function buildTombstoneSplitReplicas(): [
  Document<{ t: Tree }>,
  Document<{ t: Tree }>,
] {
  const d1 = new Document<{ t: Tree }>('test-doc');
  const d2 = new Document<{ t: Tree }>('test-doc');
  d1.setActor(A1);
  d2.setActor(A2);

  d1.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [{ type: 'text', value: 'hello' }] }],
    });
  });
  crossSync(d1, d2);

  d1.update((root) => root.t.edit(2, 4));
  d2.update((root) => root.t.edit(0, 7));
  crossSync(d1, d2);

  return [d1, d2];
}

// Regression tests for tombstone-split GC leaks: a piece split off an
// already-tombstoned node inherits `removedAt` without passing through
// `remove()`, so it used to miss GC pair registration and stay in the
// tree forever.

describe('GC tombstone-split leak', () => {
  it('purges the same nodes on both replicas when a tombstone is split remotely', () => {
    const [d1, d2] = buildTombstoneSplitReplicas();

    // Identical converged state on both replicas:
    assert.equal(d1.getRoot().t.toXML(), '<doc></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());

    // Same full vector, same logical tombstones → purge counts must match.
    // Before the fix, the replica whose tombstone was split by the remote
    // delete leaked the born-dead pieces (d1=4, d2=2).
    const purged1 = d1.garbageCollect(maxVectorOf([A1, A2]));
    const purged2 = d2.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(
      purged1,
      purged2,
      `asymmetric purge for identical state: d1=${purged1} d2=${purged2}`,
    );

    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);
  });

  it('registers GC pairs for tree tombstones after snapshot round-trip', () => {
    const [, d2] = buildTombstoneSplitReplicas();

    // Snapshot-encode d2's root (tombstones included) and rebuild a root
    // from it, as a client receiving a snapshot would. The rebuilt root
    // must see and purge the same garbage as the live one — including the
    // pieces split off the tombstoned text node. Before the fix,
    // `CRDTTree.getGCPairs` traversed only visible nodes, so a
    // snapshot-loaded root registered no tree tombstones at all.
    const bytes = converter.objectToBytes(d2.getRootObject());
    const rebuilt = new CRDTRoot(converter.bytesToObject(bytes));

    assert.isAbove(d2.getGarbageLen(), 0);
    assert.equal(rebuilt.getGarbageLen(), d2.getGarbageLen());

    const purgedLive = d2.garbageCollect(maxVectorOf([A1, A2]));
    const purgedRebuilt = rebuilt.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(purgedRebuilt, purgedLive);
    assert.equal(rebuilt.getGarbageLen(), 0);
  });
});
