import { describe, it, assert } from 'vitest';
import {
  Counter,
  Document,
  JSONObject,
  Text,
  Tree,
} from '@yorkie-js/sdk/src/yorkie';
import { CRDTTreeNode, toXML } from '@yorkie-js/sdk/src/document/crdt/tree';
import { InitialTimeTicket as ITT } from '@yorkie-js/sdk/src/document/time/ticket';
import { idT, maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';
import { RHT } from '@yorkie-js/sdk/src/document/crdt/rht';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { DataSize } from '@yorkie-js/sdk/src/util/resource';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { converter } from '@yorkie-js/sdk/src/api/converter';

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

type SizeDoc = { k?: any };

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
 * `crossSync` exchanges pending local changes between two in-process
 * documents, mimicking a server round-trip without serialization. Delivery
 * uses a neutral checkpoint (clientSeq 0) so the receiver's own pending local
 * changes are not dropped, and an empty version vector so GC stays out of the
 * exchange. Each sender then self-acks exactly the delivered changes so the
 * next crossSync does not re-send them.
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();

  type Pack = ReturnType<Document<T>['createChangePack']>;
  const deliver = (pack: Pack) =>
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges(),
      InitialVersionVector,
    );
  d2.applyChangePack(deliver(p1));
  d1.applyChangePack(deliver(p2));

  const ack = (pack: Pack) => {
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

describe('Node Size', () => {
  it('split tree node test', function () {
    const root = new CRDTTreeNode(idT, 'r', []);
    const para = new CRDTTreeNode(idT, 'p', []);
    root.append(para);
    para.append(new CRDTTreeNode(idT, 'text', 'helloworld'));

    const left = para.children[0];
    const [rightText, diffText] = left.splitText(5, 0);
    assert.deepEqual(diffText, { data: 0, meta: 24 });
    assert.deepEqual(left.getDataSize(), { data: 10, meta: 24 });
    assert.deepEqual(rightText!.getDataSize(), { data: 10, meta: 24 });

    const [rightElem, diffElem] = para.splitElement(1, () => ITT);
    assert.deepEqual(diffElem, { data: 0, meta: 24 });
    assert.equal(toXML(para), '<p>hello</p>');
    assert.equal(toXML(rightElem!), '<p>world</p>');
  });

  it('split tree node with attribute test', () => {
    const attributes = new RHT();
    attributes.set('bold', 'true', ITT);

    const root = new CRDTTreeNode(idT, 'r');
    const para = new CRDTTreeNode(idT, 'p', undefined, attributes);
    root.append(para);
    para.append(new CRDTTreeNode(idT, 'text', 'helloworld'));
    assert.equal(toXML(root), '<r><p bold="true">helloworld</p></r>');

    // split text node
    const left = para.children[0];
    left.splitText(5, 0);

    // split element node
    const [rightElem, diffElem] = para.splitElement(1, () => ITT);
    assert.deepEqual(diffElem, { data: 16, meta: 48 });
    assert.equal(toXML(para), '<p bold="true">hello</p>');
    assert.equal(toXML(rightElem!), '<p bold="true">world</p>');
  });
});

describe('Document Size', () => {
  it('primitive and object test', function () {
    const doc = new Document<{
      k0: null;
      k1: boolean;
      k2: number;
      k3: bigint;
      k4: number;
      k5: string;
      k6: Uint8Array;
      k7: Date;
      k8: undefined;
    }>('test-doc');

    // NOTE(hackerwins): O(Created) + P(CreatedAt, MovedAt)
    doc.update((root) => (root['k0'] = null));
    assert.deepEqual(doc.getDocSize().live, { data: 8, meta: 72 });

    // NOTE(hackerwins): O(Created) + P(CreatedAt, MovedAt) * 2
    doc.update((root) => (root['k1'] = true));
    assert.deepEqual(doc.getDocSize().live, { data: 12, meta: 120 });

    doc.update((root) => (root['k2'] = 2147483647));
    assert.deepEqual(doc.getDocSize().live, { data: 16, meta: 168 });

    doc.update((root) => (root['k3'] = 9223372036854775807n));
    assert.deepEqual(doc.getDocSize().live, { data: 24, meta: 216 });

    doc.update((root) => (root['k4'] = 1.79));
    assert.deepEqual(doc.getDocSize().live, { data: 32, meta: 264 });

    doc.update((root) => (root['k5'] = '4'));
    assert.deepEqual(doc.getDocSize().live, { data: 34, meta: 312 });

    doc.update((root) => (root['k6'] = new Uint8Array([65, 66])));
    assert.deepEqual(doc.getDocSize().live, { data: 36, meta: 360 });

    doc.update((root) => (root['k7'] = new Date()));
    assert.deepEqual(doc.getDocSize().live, { data: 44, meta: 408 });

    doc.update((root) => (root['k8'] = undefined));
    assert.deepEqual(doc.getDocSize().live, { data: 52, meta: 456 });
  });

  it('array test', function () {
    const doc = new Document<{ arr: Array<string> }>('test-doc');

    doc.update((root) => (root['arr'] = []));
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });

    doc.update((root) => root['arr'].push('a'));
    assert.deepEqual(doc.getDocSize().live, { data: 2, meta: 96 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => delete root['arr'][0]);
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });
    assert.deepEqual(doc.getDocSize().gc, { data: 2, meta: 48 });
  });

  it('counter test', function () {
    const doc = new Document<{ counter: Counter }>('test-doc');
    doc.update((root) => (root.counter = new Counter(0)));
    assert.deepEqual(doc.getDocSize().live, { data: 4, meta: 72 });
  });

  it('text test', function () {
    const doc = new Document<{ text: Text }>('test-doc');

    doc.update((root) => (root.text = new Text()));
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => root.text.edit(0, 0, 'helloworld'));
    assert.deepEqual(doc.getDocSize().live, { data: 20, meta: 96 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => root.text.edit(5, 5, ' '));
    assert.deepEqual(doc.getDocSize().live, { data: 22, meta: 144 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => root.text.edit(6, 11, ''));
    assert.deepEqual(doc.getDocSize().live, { data: 12, meta: 120 });
    assert.deepEqual(doc.getDocSize().gc, { data: 10, meta: 48 });

    doc.update((root) => root.text.setStyle(0, 5, { bold: true }));
    assert.deepEqual(doc.getDocSize().live, { data: 28, meta: 144 });
    assert.deepEqual(doc.getDocSize().gc, { data: 10, meta: 48 });

    doc.update((root) => root.text.edit(1, 1, ''));
    assert.equal(
      doc.toJSON(),
      `{"text":[{"attrs":{"bold":true},"val":"h"},{"attrs":{"bold":true},"val":"ello"},{"val":" "}]}`,
    );
    assert.deepEqual(doc.getDocSize().live, { data: 44, meta: 192 });
    assert.deepEqual(doc.getDocSize().gc, { data: 10, meta: 48 });
  });

  it('tree test', function () {
    const doc = new Document<{ tree: Tree }>('test-doc');

    doc.update((root) => {
      root.tree = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [] }],
      });

      assert.equal(root.tree.toXML(), `<doc><p></p></doc>`);
    });
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 120 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => {
      root.tree.edit(1, 1, {
        type: 'text',
        value: 'helloworld',
      });
    });
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>helloworld</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 20, meta: 144 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => {
      root.tree.edit(1, 7, {
        type: 'text',
        value: 'w',
      });
    });
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>world</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 168 });
    assert.deepEqual(doc.getDocSize().gc, { data: 12, meta: 48 });

    doc.update((root) => {
      root.tree.edit(7, 7, {
        type: 'p',
        children: [{ type: 'text', value: 'abcd' }],
      });
    });
    assert.equal(
      doc.getRoot().tree.toXML(),
      `<doc><p>world</p><p>abcd</p></doc>`,
    );
    assert.deepEqual(doc.getDocSize().live, { data: 18, meta: 216 });
    assert.deepEqual(doc.getDocSize().gc, { data: 12, meta: 48 });

    doc.update((root) => root.tree.edit(7, 13));
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>world</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 168 });
    assert.deepEqual(doc.getDocSize().gc, { data: 20, meta: 144 });

    doc.update((root) => {
      root.tree.style(0, 7, { bold: true });
    });
    assert.equal(
      doc.getRoot().tree.toXML(),
      `<doc><p bold="true">world</p></doc>`,
    );
    assert.deepEqual(doc.getDocSize().live, { data: 26, meta: 192 });
    assert.deepEqual(doc.getDocSize().gc, { data: 20, meta: 144 });

    doc.update((root) => {
      root.tree.removeStyle(0, 7, ['bold']);
    });
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>world</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 168 });
    assert.deepEqual(doc.getDocSize().gc, { data: 36, meta: 168 });
  });

  it('gc test', function () {
    const doc = new Document<JSONObject<{ num?: number; str: string }>>(
      'test-doc',
    );

    doc.update((root) => {
      root['num'] = 1;
      root['str'] = 'hello';
    });
    assert.deepEqual(doc.getDocSize().live, { data: 14, meta: 120 });

    doc.update((root) => {
      delete root['num'];
    });
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 72 });
    // NOTE(hackerwins): P(CreatedAt, MovedAt, RemovedAt)
    assert.deepEqual(doc.getDocSize().gc, { data: 4, meta: 72 });
  });

  it('removing a non-empty container test', function () {
    // Removing a container has to move its descendants into gc as well.
    // Booking only the container itself stranded their size in live and drove
    // gc negative once the collection subtracted them.
    const cases: Array<{
      name: string;
      build: (root: JSONObject<SizeDoc>) => void;
      built: DataSize;
    }> = [
      {
        name: 'object',
        build: (root) => (root.k = { a: '1' }),
        built: { data: 2, meta: 120 },
      },
      {
        name: 'array',
        build: (root) => (root.k = ['a']),
        built: { data: 2, meta: 96 },
      },
      {
        name: 'nested object',
        build: (root) => (root.k = { inner: { a: '1' } }),
        built: { data: 2, meta: 168 },
      },
    ];

    for (const { name, build, built } of cases) {
      const doc = new Document<SizeDoc>('test-doc');
      const empty = structuredClone(doc.getDocSize());
      assert.deepEqual(empty.live, { data: 0, meta: 24 }, name);

      doc.update((root) => build(root));
      assert.deepEqual(doc.getDocSize().live, built, name);
      assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 }, name);

      doc.update((root) => {
        delete root.k;
      });
      // Every descendant left live with the container, so live is back to the
      // empty document and the whole subtree now sits in gc.
      assert.deepEqual(doc.getDocSize().live, empty.live, name);
      assert.equal(doc.getDocSize().gc.data, built.data, name);
      assert.isAbove(doc.getDocSize().gc.meta, 0, name);

      doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));
      assert.deepEqual(doc.getDocSize(), empty, name);
    }
  });

  it('removing a container holding an earlier tombstone test', function () {
    // A descendant removed on its own already moved into gc through its own
    // registration. Removing its container must not book that subtree again.
    const doc = new Document<SizeDoc>('test-doc');
    const empty = structuredClone(doc.getDocSize());

    doc.update((root) => (root.k = { inner: { a: '1' } }));
    assert.deepEqual(doc.getDocSize().live, { data: 2, meta: 168 });

    doc.update((root) => {
      delete (root.k as JSONObject<{ inner?: unknown }>).inner;
    });
    const inner = structuredClone(doc.getDocSize().gc);

    doc.update((root) => {
      delete root.k;
    });
    assert.deepEqual(doc.getDocSize().live, empty.live);
    // "k" contributes only its own size on top of the subtree already in gc.
    assert.equal(doc.getDocSize().gc.data, inner.data);

    doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));
    assert.deepEqual(doc.getDocSize(), empty);
  });

  it('concurrently removing the same container test', function () {
    // A concurrent remove reports the element as removed once more when its
    // ticket wins the LWW comparison. Moving the size into gc again left the
    // two replicas reporting different sizes for the same document, and
    // DocSize is what gates the size limit.
    const [d1, d2] = newReplicas<SizeDoc>();
    const empty = structuredClone(d1.getDocSize());

    d1.update((root) => (root.k = { a: '1' }));
    crossSync(d1, d2);
    assert.deepEqual(d1.getDocSize(), d2.getDocSize());

    d1.update((root) => {
      delete root.k;
    });
    d2.update((root) => {
      delete root.k;
    });
    crossSync(d1, d2);

    assert.equal(d1.toSortedJSON(), '{}');
    assert.equal(d2.toSortedJSON(), '{}');
    assert.deepEqual(
      d1.getDocSize(),
      d2.getDocSize(),
      'DocSize must agree across replicas',
    );

    const vector = maxVectorOf([A1, A2]);
    d1.garbageCollect(vector);
    d2.garbageCollect(vector);
    assert.deepEqual(d1.getDocSize(), empty);
    assert.deepEqual(d2.getDocSize(), empty);
  });

  it('removing a member inside an already removed container test', function () {
    // d1 removes the container, d2 concurrently removes a member inside it, so
    // both removals report that member's size. It must move to gc once, and the
    // ticket its removedAt adds afterwards has to be charged too -- the
    // collection subtracts the size including that ticket.
    const [d1, d2] = newReplicas<SizeDoc>();
    const empty = structuredClone(d1.getDocSize());

    d1.update((root) => (root.k = { a: '1', b: '2' }));
    crossSync(d1, d2);

    d1.update((root) => {
      delete root.k;
    });
    d2.update((root) => {
      delete (root.k as JSONObject<{ a?: unknown }>).a;
    });
    crossSync(d1, d2);
    assert.deepEqual(
      d1.getDocSize(),
      d2.getDocSize(),
      'DocSize must agree across replicas',
    );

    const vector = maxVectorOf([A1, A2]);
    d1.garbageCollect(vector);
    d2.garbageCollect(vector);
    assert.deepEqual(d1.getDocSize(), empty);
    assert.deepEqual(d2.getDocSize(), empty);
  });

  it('restoring a container over a diverged tombstone test', function () {
    // An undo restores the copy its reverse captured, while the tombstone
    // registered under that createdAt has meanwhile grown a member from a peer.
    // Deregistering the copy rather than the tombstone would leave that member
    // registered forever and charge the wrong size to gc.
    const [d1, d2] = newReplicas<SizeDoc>();

    d1.update((root) => (root.k = { a: '1' }));
    crossSync(d1, d2);
    const built = structuredClone(d1.getDocSize());

    d1.update((root) => {
      delete root.k;
    });
    d2.update((root) => {
      (root.k as JSONObject<{ b?: string }>).b = '2';
    });
    crossSync(d1, d2);

    assert.isTrue(d1.history.canUndo());
    d1.history.undo();
    assert.equal(d1.toSortedJSON(), '{"k":{"a":"1"}}');
    // The restored document is exactly the one that was built, so it costs
    // exactly what it cost then, with nothing left over in gc.
    assert.deepEqual(d1.getDocSize(), built);
  });

  it('undoing the removal of an array container test', function () {
    // Single client, no concurrency: remove a container out of an array, undo,
    // collect. The document is the one that was built, so it has to cost what
    // it cost then.
    const doc = new Document<{ k: Array<{ a: string }> }>('test-doc');

    doc.update((root) => (root.k = [{ a: '1' }]));
    const built = structuredClone(doc.getDocSize());
    assert.deepEqual(built.live, { data: 2, meta: 144 });

    doc.update((root) => {
      delete root.k[0];
    });
    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"k":[{"a":"1"}]}');

    doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));
    assert.deepEqual(doc.getDocSize(), built);
  });

  it('restoring a container holding an earlier tombstone test', function () {
    // An undo restores the copy its reverse captured, and that copy keeps the
    // member that was tombstoned before the container was. It is registered at
    // its post-removal size, so that member's cost belongs to gc rather than
    // live, and it has to stay collectable -- booking it into live instead
    // strands it there with nothing left to collect it.
    const doc = new Document<SizeDoc>('test-doc');

    doc.update((root) => (root.k = { a: '1', b: '2' }));
    doc.update((root) => {
      delete (root.k as JSONObject<{ a: string; b?: string }>).b;
    });
    const beforeRemoval = structuredClone(doc.getDocSize());
    assert.deepEqual(beforeRemoval.live, { data: 2, meta: 120 });
    assert.deepEqual(beforeRemoval.gc, { data: 2, meta: 72 });

    doc.update((root) => {
      delete root.k;
    });
    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"k":{"a":"1"}}');

    // The restored document is the one that stood before the removal, so it
    // costs exactly what it cost then, tombstoned member included.
    assert.deepEqual(doc.getDocSize(), beforeRemoval);

    // And that member is still garbage.
    assert.equal(
      doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()])),
      1,
    );
    assert.deepEqual(doc.getDocSize().live, { data: 2, meta: 120 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });
  });

  it('applying the losing side of a concurrent set test', function () {
    // `ElementRHT.set` marks the losing value removed before the operation
    // registers it, so live is charged the post-removal size, removal ticket
    // included. Giving that ticket back would leave the replica that applied
    // the loser permanently larger than the one that never saw it.
    const [d1, d2] = newReplicas<SizeDoc>();

    d1.update((root) => (root.k = '1'));
    d2.update((root) => (root.k = '2'));
    crossSync(d1, d2);

    assert.equal(d1.toSortedJSON(), '{"k":"2"}');
    assert.equal(d2.toSortedJSON(), '{"k":"2"}');

    d1.garbageCollect(maxVectorOf([A1, A2]));
    d2.garbageCollect(maxVectorOf([A1, A2]));

    const fresh = new Document<SizeDoc>('test-doc');
    fresh.update((root) => (root.k = '2'));

    assert.deepEqual(d1.getDocSize(), d2.getDocSize());
    assert.deepEqual(d1.getDocSize(), fresh.getDocSize());
  });

  it('rebuilding a document that holds a tombstone test', function () {
    // A rebuild registers an already-tombstoned element at its post-removal
    // size, so a refund there over-credits live by one ticket per tombstone.
    // `Document.update` gates the size limit on the clone, which is built this
    // way, while `getDocSize` reports the incrementally kept figure -- the two
    // have to agree.
    const doc = new Document<SizeDoc>('test-doc');

    doc.update((root) => (root.k = { a: '1', b: '2' }));
    doc.update((root) => {
      delete (root.k as JSONObject<{ a: string; b?: string }>).b;
    });

    const bytes = converter.objectToBytes(doc.getRootObject());
    const rebuilt = new CRDTRoot(converter.bytesToObject(bytes));
    assert.deepEqual(rebuilt.getDocSize(), doc.getDocSize());
    assert.deepEqual(
      doc.getRootCRDT().deepcopy().getDocSize(),
      doc.getDocSize(),
    );

    // The tombstone has to arrive collectable too. The constructor no longer
    // registers it separately -- `registerElement` is what enters it for
    // collection -- so a rebuilt root that cannot collect would strand the
    // charge with nothing reporting it as garbage.
    assert.equal(rebuilt.getGarbageLen(), 1);
    assert.equal(
      rebuilt.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()])),
      1,
    );
    assert.deepEqual(rebuilt.getDocSize().gc, { data: 0, meta: 0 });
  });

  it('restoring an array container holding an earlier tombstone test', function () {
    // Undoing an array removal reissues a ticket for the restored container
    // alone, so its members come back sharing createdAts with the tombstoned
    // ones. Charging by element gives each of the two a slot of its own, so
    // the restored member is booked into gc on its own account and the charge
    // gc holds for the tombstone stays where it is. The restored document
    // therefore costs what it cost before the removal, and collecting the
    // tombstone drains gc rather than debiting live.
    const doc = new Document<{ k: Array<{ a: string; b?: string }> }>(
      'test-doc',
    );

    doc.update((root) => (root.k = [{ a: '1', b: '2' }]));
    doc.update((root) => {
      delete root.k[0].b;
    });
    const beforeRemoval = structuredClone(doc.getDocSize());
    assert.deepEqual(beforeRemoval.live, { data: 2, meta: 144 });

    doc.update((root) => {
      delete root.k[0];
    });
    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"k":[{"a":"1"}]}');

    // The restored document is the one that stood before the removal, so it
    // costs exactly what it cost then.
    assert.deepEqual(doc.getDocSize().live, beforeRemoval.live);

    doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));
    assert.deepEqual(doc.getDocSize().live, beforeRemoval.live);
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });
  });

  it('removing an array container that was restored test', function () {
    // Undoing an array removal reissues a ticket for the restored container
    // alone, so its members come back sharing createdAts with the tombstoned
    // ones. Both are registered, and both are charged -- one slot per createdAt
    // would let the second displace the first, and collecting the displaced one
    // would then take a size out of live that live was never holding.
    const doc = new Document<{ k: Array<{ a: string; b?: string }> }>(
      'test-doc',
    );

    doc.update((root) => (root.k = [{ a: '1', b: '2' }]));
    doc.update((root) => {
      delete root.k[0].b;
    });
    doc.update((root) => {
      delete root.k[0];
    });
    doc.history.undo();
    doc.update((root) => {
      delete root.k[0];
    });
    doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));

    assert.equal(doc.toSortedJSON(), '{"k":[]}');

    const empty = new Document<{ k: Array<unknown> }>('test-doc');
    empty.update((root) => (root.k = []));
    assert.deepEqual(doc.getDocSize(), empty.getDocSize());
  });

  it('deep copy test', function () {
    const doc = new Document<{ counter: Counter }>('test-doc');
    doc.update((root) => (root.counter = new Counter(0)));
    const clone = doc.getClone()!.root.deepcopy();
    assert.deepEqual(doc.getDocSize(), clone.getDocSize());
  });

  it('deep copy for nested element test', function () {
    const doc = new Document<{ arr: Array<Counter> }>('test-doc');

    doc.update((root) => (root['arr'] = []));
    doc.update((root) => root['arr'].push(new Counter(0)));

    const clone = doc.getClone()!.root.deepcopy();
    assert.deepEqual(clone.getDocSize(), doc.getDocSize());
  });
  // KNOWN LIMITATION (tracked, skipped): repeating a split and the merge that
  // undoes it drives `live.meta` negative. Every cycle returns the tree to
  // what it started as, so the live size should return to what it started as
  // too; instead it drops about 24 bytes per cycle, reaching -2208 after 100.
  //
  // Tracked as yorkie-team/yorkie#1998. Predates #1358 and is not about
  // `splitByPath`/`mergeByPath`: it
  // reproduces on main through `editByPath(p, p, undefined, 1)` and the
  // cross-boundary `editByPath` merge, which is what this case drives. What
  // #1358 changes is the reach — the two helpers lowered to a delete plus an
  // insert before it, which accounted correctly, so this is the one thing
  // they did better. A document cycling a split and a merge now reports a
  // live size that falls without bound, and that is the number the server's
  // document size limit reads.
  //
  // `getDocSize()` hands back the root's own DataSize rather than a copy, so
  // the "before" value has to be copied out or it changes along with it.
  it.skip('KNOWN: split and merge cycles drive the live size negative', function () {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = new Tree({
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
    const before = { ...doc.getDocSize().live };

    for (let i = 0; i < 100; i++) {
      doc.update((root) =>
        root.t.editByPath([0, 0, 1], [0, 0, 1], undefined, 1),
      );
      doc.update((root) => root.t.editByPath([0, 0, 1], [0, 1, 0]));
    }

    assert.equal(
      doc.getRoot().t.toXML(),
      '<doc><p><span>abcdefghij</span></p></doc>',
    );
    assert.deepEqual({ ...doc.getDocSize().live }, before);
  });
});
