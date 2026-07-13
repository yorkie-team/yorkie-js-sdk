import { describe, it, assert } from 'vitest';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

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

// Reproduction of suspected GC leak: pieces split off an already-tombstoned
// node never receive GC pairs, so incremental GC cannot purge them.
// Runs against unmodified src/ — the crossSync helper below is test-only
// plumbing to exchange changes between two in-process documents.

describe('GC tombstone-split leak', () => {
  it('purges fewer nodes on the replica whose tombstone was split remotely', () => {
    const A1 = '000000000000000000000001';
    const A2 = '000000000000000000000002';
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

    // Concurrent: d1 deletes "el" (splits the text live, at d1);
    // d2 deletes the whole <p> (tombstones it unsplit, at d2).
    // When d1's delete arrives at d2, it must split d2's TOMBSTONE —
    // creating born-dead pieces that never get GC pairs.
    d1.update((root) => root.t.edit(2, 4));
    d2.update((root) => root.t.edit(0, 7));
    crossSync(d1, d2);

    // Identical converged state on both replicas:
    assert.equal(d1.getRoot().t.toXML(), '<doc></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());

    // Same full vector, same logical tombstones → purge counts should match.
    const purged1 = d1.garbageCollect(maxVectorOf([A1, A2]));
    const purged2 = d2.garbageCollect(maxVectorOf([A1, A2]));

    // BUG (documents current behavior, not desired behavior):
    // identical logical state purges asymmetrically — the replica whose
    // tombstone was split by a concurrent remote delete leaks node(s)
    // that never received GC pairs. Observed: d1=4, d2=3.
    assert.equal(
      purged1,
      purged2,
      `asymmetric purge for identical state: d1=${purged1} d2=${purged2}`,
    );

    // Incremental GC believes it is done on both:
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);
  });
});
