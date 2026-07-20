import { describe, it, assert } from 'vitest';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text, Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { CRDTTree } from '@yorkie-js/sdk/src/document/crdt/tree';
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

    // docSize must also stay symmetric: born-dead pieces were never live,
    // so registering them must not move sizes out of docSize.live, and a
    // full GC must drain docSize.gc to zero on both replicas.
    assert.deepEqual(d2.getDocSize(), d1.getDocSize());
    assert.deepEqual(d1.getDocSize().gc, { data: 0, meta: 0 });
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

    // The rebuilt root counts tombstones straight into docSize.gc (they
    // were never in its docSize.live), so a full GC must drain gc to zero
    // without pushing live negative.
    assert.deepEqual(rebuilt.getDocSize().gc, { data: 0, meta: 0 });
    assert.deepEqual(rebuilt.getDocSize().live, d2.getDocSize().live);
  });

  // Each range-conversion wrapper must independently drain the pending GC
  // pairs. Run every method against its own freshly tombstoned tree — the
  // first conversion splits the tombstone, so sharing one tree would leave
  // later conversions with nothing to split and never exercise their drain.
  const conversions: Array<
    (tree: Tree, range: ReturnType<Tree['indexRangeToPosRange']>) => void
  > = [
    (tree, range) => tree.posRangeToIndexRange(range),
    (tree, range) => tree.posRangeToPathRange(range),
  ];

  for (const [i, convert] of conversions.entries()) {
    it(`registers GC pairs split during read-path range conversion #${i}`, () => {
      const d1 = new Document<{ t: Tree }>('test-doc');
      const d2 = new Document<{ t: Tree }>('test-doc');
      d1.setActor(A1);
      d2.setActor(A2);

      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'hello' }] },
          ],
        });
      });
      crossSync(d1, d2);

      // Capture a selection that points into the middle of "hello", as a
      // stored cursor/selection would.
      const selection = d1.getRoot().t.indexRangeToPosRange([2, 4]);

      // A peer deletes the whole <p>, tombstoning "hello" on d1.
      d2.update((root) => root.t.edit(0, 7));
      crossSync(d1, d2);

      // Resolving the stored selection now lands inside the tombstoned text
      // and splits it — a read path that emits no operation. The born-removed
      // pieces must still be registered so a later GC can purge them.
      convert(d1.getRoot().t, selection);

      d1.garbageCollect(maxVectorOf([A1, A2]));

      // After GC the clone tree (mutated by the read-path split) and the
      // document root must hold the same physical nodes. A born-removed piece
      // that never registered a GC pair would linger in the clone's node map,
      // making it larger. Before the fix the clone kept the leaked piece(s).
      const cloneTree = d1.getCloneRoot()!.get('t') as unknown as CRDTTree;
      const rootTree = d1.getRootObject().get('t') as unknown as CRDTTree;
      assert.equal(cloneTree.getNodeSize(), rootTree.getNodeSize());
      assert.equal(d1.getGarbageLenFromClone(), 0);
    });
  }
});

type TextDoc = { k: Text };

/**
 * Counts tombstoned nodes still physically present in the text's RGATreeSplit.
 * After a full-vector garbage collection this must be zero; any remainder is
 * a node that was never registered (or was toggle-unregistered) for GC.
 */
function countTextTombstones(doc: Document<TextDoc>): number {
  const text = doc.getRootObject().get('k') as CRDTText;
  let count = 0;
  for (const node of text.getRGATreeSplit()) {
    if (node.isRemoved()) {
      count += 1;
    }
  }
  return count;
}

/**
 * `buildTextReplicas` creates two in-process replicas that share a Text
 * field seeded with "abcdef" and already converged.
 */
function buildTextReplicas(): [Document<TextDoc>, Document<TextDoc>] {
  const d1 = new Document<TextDoc>('test-doc');
  const d2 = new Document<TextDoc>('test-doc');
  d1.setActor(A1);
  d2.setActor(A2);

  d1.update((root) => {
    root.k = new Text();
    root.k.edit(0, 0, 'abcdef');
  });
  crossSync(d1, d2);

  return [d1, d2];
}

// Same class of leak in the Text CRDT: RGATreeSplitNode.split() copies
// `removedAt` into the new piece, so pieces split off an already-tombstoned
// text node are born removed without passing through remove() and miss GC
// pair registration. Additionally, a concurrent delete that overwrites an
// existing tombstone (LWW) used to re-push a GC pair for it, and
// CRDTRoot.registerGCPair's toggle semantics then deleted the existing
// registration.
describe('GC tombstone-split leak (Text)', () => {
  it('purges pieces split off a tombstoned text node', () => {
    const [d1, d2] = buildTextReplicas();

    // d1 tombstones the whole node; d2 concurrently deletes a middle slice.
    // When d2's delete arrives at d1, it splits d1's tombstone into three
    // pieces; the piece after the deleted range is born dead and used to
    // get no GC pair.
    d1.update((root) => root.k.edit(0, 6, ''));
    d2.update((root) => root.k.edit(2, 4, ''));
    crossSync(d1, d2);

    assert.equal(d1.getRoot().k.toString(), '');
    assert.equal(d2.getRoot().k.toString(), '');

    const purged1 = d1.garbageCollect(maxVectorOf([A1, A2]));
    const purged2 = d2.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(
      purged1,
      purged2,
      `asymmetric purge for identical state: d1=${purged1} d2=${purged2}`,
    );
    assert.equal(countTextTombstones(d1), 0);
    assert.equal(countTextTombstones(d2), 0);
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    // Same docSize invariants as the tree case.
    assert.deepEqual(d2.getDocSize(), d1.getDocSize());
    assert.deepEqual(d1.getDocSize().gc, { data: 0, meta: 0 });
  });

  it('keeps GC registration when a newer concurrent delete overwrites a tombstone', () => {
    const [d1, d2] = buildTextReplicas();

    // Bump d1's lamport so its whole-range delete is newer than d2's slice
    // delete. When d1's delete arrives at d2, canRemove() allows the LWW
    // overwrite of d2's own tombstone; re-pushing a GC pair for that node
    // used to toggle-unregister it.
    d1.update((root) => root.k.edit(6, 6, '!'));
    d1.update((root) => root.k.edit(0, 7, ''));
    d2.update((root) => root.k.edit(2, 4, ''));
    crossSync(d1, d2);

    assert.equal(d1.getRoot().k.toString(), '');
    assert.equal(d2.getRoot().k.toString(), '');

    const purged1 = d1.garbageCollect(maxVectorOf([A1, A2]));
    const purged2 = d2.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(
      purged1,
      purged2,
      `asymmetric purge for identical state: d1=${purged1} d2=${purged2}`,
    );
    assert.equal(countTextTombstones(d1), 0);
    assert.equal(countTextTombstones(d2), 0);
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);
  });
});
