import { describe, it, assert } from 'vitest';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text, Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

/**
 * Exchanges pending local changes between two in-process documents, mimicking
 * a server round-trip. Same shape as the helper in gc_split_leak_test.ts.
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();

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

/**
 * Checks the invariant the whole of docSize rests on: a document's garbage is
 * a function of its content, so a root rebuilt from that content reports the
 * same size and the same count. A rebuilt root is what every client joining
 * an existing document holds.
 *
 * The rebuild is in-memory rather than through the snapshot converter because
 * the converter does not carry `isRemoved` for *text* node attributes
 * (`toTextNodes` omits it), so a tombstoned text attribute does not survive a
 * snapshot at all — a separate defect, tracked on its own.
 */
function assertRebuildsSame<T>(d: Document<T>, msg: string): void {
  const rebuilt = new CRDTRoot(d.getRootObject().deepcopy());
  assert.deepEqual(rebuilt.getDocSize().gc, d.getDocSize().gc, `${msg}: gc`);
  assert.equal(rebuilt.getGarbageLen(), d.getGarbageLen(), `${msg}: count`);
}

/**
 * `splitElement` deep-copies the node's RHT, tombstones included — it has to,
 * or the two halves of what was one node would resolve a concurrent style
 * differently and never reconverge. `RHT.deepcopy` preserves `updatedAt` and
 * `key`, which are exactly what `RHTNode.toIDString` is made of, so the copy
 * was indistinguishable by id from the original. Registering it was missing,
 * and the shared id made the two collide in the GC map.
 */
describe('a split that copies an attribute tombstone', () => {
  const styledAndRemoved = () => {
    const d = new Document<{ t: Tree }>('test-doc');
    d.setActor(A1);
    d.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'span',
                children: [{ type: 'text', value: 'abcdefghij' }],
              },
            ],
          },
        ],
      });
    });
    d.update((r) => r.t.styleByPath([0, 0], [0, 1], { color: 'red' }));
    d.update((r) => r.t.removeStyleByPath([0, 0], [0, 1], ['color']));
    return d;
  };

  it('counts and collects the tombstone a tree split copied', () => {
    const d = styledAndRemoved();
    assert.equal(d.getGarbageLen(), 1);
    assertRebuildsSame(d, 'before the split');

    d.update((r) => r.t.editByPath([0, 0, 1], [0, 0, 1], undefined, 1));

    assert.equal(
      d.getRoot().t.toXML(),
      '<doc><p><span>a</span><span>bcdefghij</span></p></doc>',
    );
    assert.equal(d.getGarbageLen(), 2);
    assertRebuildsSame(d, 'after the split');

    assert.equal(d.garbageCollect(maxVectorOf([A1])), 2);
    assert.equal(d.getGarbageLen(), 0);
    assert.deepEqual(d.getDocSize().gc, { data: 0, meta: 0 });
    assertRebuildsSame(d, 'after collecting');
  });

  it('counts a tombstone the second split copied from the first copy', () => {
    const d = styledAndRemoved();
    d.update((r) => r.t.editByPath([0, 0, 1], [0, 0, 1], undefined, 1));
    d.update((r) => r.t.editByPath([0, 1, 4], [0, 1, 4], undefined, 1));

    assert.equal(d.getGarbageLen(), 3);
    assertRebuildsSame(d, 'after splitting a split');

    assert.equal(d.garbageCollect(maxVectorOf([A1])), 3);
    assert.deepEqual(d.getDocSize().gc, { data: 0, meta: 0 });
  });

  it('drains when a later style revives the key on both halves', () => {
    const d = styledAndRemoved();
    d.update((r) => r.t.editByPath([0, 0, 1], [0, 0, 1], undefined, 1));
    assert.equal(d.getGarbageLen(), 2);

    // Re-setting the key supersedes both tombstones. Each un-registers
    // against its own parent; keyed on the child alone, the second
    // registration re-added the entry the first removed.
    d.update((r) => r.t.styleByPath([0, 0], [0, 2], { color: 'blue' }));
    assert.equal(d.getGarbageLen(), 0);
  });

  it('purges the same tree tombstones on both replicas', () => {
    const d1 = new Document<{ t: Tree }>('test-doc');
    const d2 = new Document<{ t: Tree }>('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'span',
                children: [{ type: 'text', value: 'abcdefghij' }],
              },
            ],
          },
        ],
      });
    });
    d1.update((r) => r.t.styleByPath([0, 0], [0, 1], { color: 'red' }));
    d1.update((r) => r.t.removeStyleByPath([0, 0], [0, 1], ['color']));
    crossSync(d1, d2);

    d1.update((r) => r.t.editByPath([0, 0, 1], [0, 0, 1], undefined, 1));
    crossSync(d1, d2);

    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
    // Both replicas leaked the copy before the fix, so agreeing with each
    // other is not enough — name the count they must agree on.
    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);
    assert.deepEqual(d2.getDocSize(), d1.getDocSize());

    const purged1 = d1.garbageCollect(maxVectorOf([A1, A2]));
    const purged2 = d2.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(purged2, purged1);
    assert.deepEqual(d1.getDocSize().gc, { data: 0, meta: 0 });
    assert.deepEqual(d2.getDocSize().gc, { data: 0, meta: 0 });
  });

  /**
   * `CRDTTextValue` copies its attributes on split the same way. Reaching the
   * case needs an undo: the reverse of a `setStyle` that introduced a key
   * carries `attributesToRemove`, the only route that tombstones a text
   * attribute today.
   */
  const textStyledAndRemoved = () => {
    const d = new Document<{ k: Text }>('test-doc');
    d.setActor(A1);
    d.update((r) => {
      r.k = new Text();
      r.k.edit(0, 0, 'abcdefghij');
    });
    d.update((r) => r.k.setStyle(0, 10, { b: '1' }));
    d.history.undo();
    return d;
  };

  it('counts and collects the tombstone a text split copied', () => {
    const d = textStyledAndRemoved();
    assert.equal(d.getGarbageLen(), 1);
    assertRebuildsSame(d, 'before the split');

    d.update((r) => r.k.edit(5, 5, 'X'));

    assert.equal(d.getGarbageLen(), 2);
    assertRebuildsSame(d, 'after the split');

    assert.equal(d.garbageCollect(maxVectorOf([A1])), 2);
    assert.equal(d.getGarbageLen(), 0);
    assert.deepEqual(d.getDocSize().gc, { data: 0, meta: 0 });
    // Counting is not collecting: assert the tombstones are gone from the
    // values themselves, not just from the ledger.
    assertRebuildsSame(d, 'after collecting');
  });

  it('keeps the left value collectable after a split', () => {
    const d = textStyledAndRemoved();
    d.update((r) => r.k.edit(5, 5, 'X'));
    d.garbageCollect(maxVectorOf([A1]));

    // The pair registered before the split names the left value as its
    // parent. A split that replaced that value with a new object left the
    // pair purging an orphan, and the tombstone stayed in the list forever
    // — visible only in a rebuild, since the ledger had already forgotten it.
    const rebuilt = new CRDTRoot(d.getRootObject().deepcopy());
    assert.equal(rebuilt.getGarbageLen(), 0);
    assert.deepEqual(rebuilt.getDocSize().gc, { data: 0, meta: 0 });
  });

  it('purges the same text tombstones on both replicas', () => {
    const d1 = new Document<{ k: Text }>('test-doc');
    const d2 = new Document<{ k: Text }>('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.k = new Text();
      r.k.edit(0, 0, 'abcdefghij');
    });
    d1.update((r) => r.k.setStyle(0, 10, { b: '1' }));
    d1.history.undo();
    crossSync(d1, d2);

    d1.update((r) => r.k.edit(5, 5, 'X'));
    crossSync(d1, d2);

    assert.equal(d2.getRoot().k.toJSON!(), d1.getRoot().k.toJSON!());
    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);
    assert.deepEqual(d2.getDocSize().gc, d1.getDocSize().gc);

    const purged1 = d1.garbageCollect(maxVectorOf([A1, A2]));
    const purged2 = d2.garbageCollect(maxVectorOf([A1, A2]));
    assert.equal(purged2, purged1);
    assert.deepEqual(d1.getDocSize().gc, { data: 0, meta: 0 });
    assert.deepEqual(d2.getDocSize().gc, { data: 0, meta: 0 });
  });
});
