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
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text, Tree } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';

/**
 * `canStyle` decides whether a style may land on a node that has been removed.
 * The answer it gives is a convergence decision, not a rendering preference,
 * because a style is applied unconditionally on the replica that issues it —
 * the node is still live there — and can never be retracted afterwards. So
 * either every replica applies it or the replicas hold different attributes on
 * the same node forever, invisible while it is a tombstone and rendered the
 * moment the removal is undone.
 *
 * The contract these tests pin, shared with the server:
 *
 * - a removal the styling change had already SEEN wins, so a user never styles
 *   text they already deleted (a local change has seen every removal in its own
 *   replica, which is the whole of the local case);
 * - a removal CONCURRENT with the style does not, so the style lands on the
 *   tombstone everywhere.
 *
 * This SDK used to refuse every removed node, which diverges in both
 * orderings; the server decided it on `editedAt.after(removedAt)`, which made
 * it turn on an actor-ID tie-break.
 */
const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

type TextDoc = Document<{ t: Text }>;
type TreeDoc = Document<{ t: Tree }>;

/**
 * `crossSync` exchanges pending local changes between two in-process
 * documents, mimicking a server round trip. `VersionVector.max` returns a new
 * map, so the receiver's `syncClocks` cannot mutate a delivered change's
 * vector — unlike the Go side, where the same helper has to go through the
 * protobuf converter for a causality check to read what the sender knew.
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
 * `nodeAttrs` dumps every node of the text, live and tombstoned, with its
 * attributes. Two replicas are compared on this rather than on rendered
 * content because the whole disagreement is invisible in the rendering until
 * something revives the tombstone.
 */
function nodeAttrs(d: TextDoc): Array<string> {
  const text = d.getRootObject().get('t') as unknown as CRDTText;
  const out: Array<string> = [];

  for (const node of text.getRGATreeSplit()) {
    const attrs: Array<string> = [];
    for (const attr of node.getValue().getAttrs()) {
      attrs.push(
        `${attr.getKey()}=${attr.getValue()}${attr.isRemoved() ? '*' : ''}`,
      );
    }
    attrs.sort();

    out.push(
      `"${node.getValue().toString()}"${
        node.isRemoved() ? ' (removed)' : ''
      } [${attrs.join(',')}]`,
    );
  }
  return out;
}

/**
 * `assertLedgerExact` pins both halves of `docSize` against a rebuild of the
 * same content, then collects and pins that nothing is left over. `live` and
 * `gc` are running accumulators that cannot detect their own drift; a rebuild
 * recomputes them from the content, and collection is what turns a gc charge
 * that no longer matches its node into a visible residue.
 */
function assertLedgerExact<T>(
  d: Document<T>,
  msg: string,
  actors: Array<string> = [A1, A2],
): void {
  const rebuilt = new CRDTRoot(d.getRootObject().deepcopy());
  assert.deepEqual(
    d.getDocSize().live,
    rebuilt.getDocSize().live,
    `${msg}: live`,
  );
  assert.deepEqual(d.getDocSize().gc, rebuilt.getDocSize().gc, `${msg}: gc`);

  d.garbageCollect(maxVectorOf(actors));
  assert.equal(d.getGarbageLen(), 0, `${msg}: garbage left behind`);
  assert.deepEqual(
    d.getDocSize().gc,
    { data: 0, meta: 0 },
    `${msg}: collection left gc residue`,
  );
}

describe('a style over a tombstoned node', () => {
  /**
   * The six operations from the issue, single actor, no sync. Step 4 styles a
   * range that spans the node step 3 deleted, and it lands there — so step 5's
   * undo strips it, and step 6 brings "ef" back WITHOUT the attribute step 2
   * gave it.
   *
   * This is the cost of `canStyle` not reading `removedAt`, and it is
   * deliberate — and it is a behaviour change for this SDK, which used to
   * refuse every removed node. Skipping a removal the change already knew
   * about reads better here, but it makes the predicate depend on a field a
   * later concurrent removal overwrites, and then two clients deleting the
   * same run leave replicas disagreeing for good.
   */
  it('lands on a node the same actor already deleted', () => {
    const d: TextDoc = new Document('test-doc');
    d.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'abcdefghij');
    });
    d.update((r) => r.t.setStyle(4, 6, { b: 'OLD' }));
    d.update((r) => r.t.edit(4, 6, ''));
    d.update((r) => r.t.setStyle(0, 8, { b: 'NEW' }));
    assert.equal(
      d.getRoot().t.toJSON(),
      '[{"attrs":{"b":"NEW"},"val":"abcd"},{"attrs":{"b":"NEW"},"val":"ghij"}]',
    );
    assert.deepEqual(
      nodeAttrs(d),
      ['"abcd" [b=NEW]', '"ef" (removed) [b=NEW]', '"ghij" [b=NEW]'],
      'the dead node took the style too; RHT.set drops the value it held',
    );

    d.history.undo();
    assert.equal(d.getRoot().t.toJSON(), '[{"val":"abcd"},{"val":"ghij"}]');

    d.history.undo();
    assert.equal(
      d.getRoot().t.toJSON(),
      '[{"val":"abcd"},{"val":"ef"},{"val":"ghij"}]',
      'the restored run lost the attribute it carried: the cost of the contract',
    );

    // The local path now reaches a tombstone, so it also books through the gc
    // half of `accAttrWrite` — a branch no local history could reach before.
    assertLedgerExact(d, 'after the local style reached a tombstone', [
      d.getChangeID().getActorID(),
    ]);
  });

  /**
   * A style concurrent with a removal, on both ticket orderings. The only
   * difference between the two cases is which actor's ticket sorts higher,
   * which must not decide whether the replicas agree.
   */
  for (const styleOnD1 of [true, false]) {
    it(`lands on the tombstone everywhere, style on ${
      styleOnD1 ? 'd1' : 'd2'
    }`, () => {
      const d1: TextDoc = new Document('test-doc');
      const d2: TextDoc = new Document('test-doc');
      d1.setActor(A1);
      d2.setActor(A2);

      d1.update((r) => {
        r.t = new Text();
        r.t.edit(0, 0, 'abcdefghij');
      });
      crossSync(d1, d2);

      const styler = styleOnD1 ? d1 : d2;
      const deleter = styleOnD1 ? d2 : d1;
      styler.update((r) => r.t.setStyle(4, 6, { b: '1' }));
      deleter.update((r) => r.t.edit(4, 6, ''));
      crossSync(d1, d2);

      assert.deepEqual(nodeAttrs(d1), [
        '"abcd" []',
        '"ef" (removed) [b="1"]',
        '"ghij" []',
      ]);
      assert.deepEqual(
        nodeAttrs(d1),
        nodeAttrs(d2),
        'the replicas disagree on the tombstoned node’s attributes',
      );

      // The style grew a node whose gc charge was taken when it was removed.
      // Without moving those bytes through gc, the replica that received the
      // style reports a different size for the same document than the one
      // that issued it, and collection then subtracts more than registration
      // added.
      assertLedgerExact(d1, 'on d1');
      assertLedgerExact(d2, 'on d2');
    });
  }

  /**
   * The same, but the tombstoned node already holds the key being written and
   * the incoming value is much shorter. The write has to debit the superseded
   * value as well as credit the installed one, and both halves have to land
   * in gc: booking either to live walks it down by the signed difference
   * between the two sizes, which is how this first went negative.
   */
  it('shrinks an attribute on a tombstone without touching live', () => {
    const d1: TextDoc = new Document('test-doc');
    const d2: TextDoc = new Document('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'abcdefghij');
    });
    d1.update((r) => r.t.setStyle(4, 6, { b: 'L'.repeat(20) }));
    crossSync(d1, d2);

    d2.update((r) => r.t.setStyle(0, 8, { b: 'x' }));
    d1.update((r) => r.t.edit(4, 6, ''));
    crossSync(d1, d2);

    // The style's range ends inside "ghij", which the boundary split cuts.
    // "x" is stored unquoted where "1" is not: stringifyObjectValues leaves a
    // value that cannot be read back as a JSON scalar alone.
    assert.deepEqual(nodeAttrs(d1), [
      '"abcd" [b=x]',
      '"ef" (removed) [b=x]',
      '"gh" [b=x]',
      '"ij" []',
    ]);
    assert.deepEqual(nodeAttrs(d1), nodeAttrs(d2));
    assert.isAtLeast(d1.getDocSize().live.data, 0, 'live went negative');
    assertLedgerExact(d1, 'on the replica that deleted the node');
    assertLedgerExact(d2, 'on the replica that issued the style');
  });

  /**
   * A tombstoned node can also have an attribute REVIVED on it: a remote
   * removeStyle tombstones the key, a later remote style sets it again. The
   * pair the first one registered carried zero — the attribute's bytes were
   * still inside the node's charge at that point — but the revive replaces it
   * with a live node, so the node's charge no longer covers it and the map
   * entry has to give back its own size on the way out.
   *
   * A text removeStyle only reaches a tombstone as the reverse of a style, so
   * the sequence is: style, undo, style again, all concurrent with the
   * removal.
   */
  it('gives an attribute back its own size when a revive unregisters it', () => {
    const d1: TextDoc = new Document('test-doc');
    const d2: TextDoc = new Document('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'abcdefghij');
    });
    d1.update((r) => r.t.setStyle(4, 6, { b: 'L'.repeat(12) }));
    crossSync(d1, d2);

    d1.update((r) => r.t.edit(4, 6, ''));
    d2.update((r) => r.t.setStyle(0, 8, { b: 'x' }));
    d2.history.undo();
    d2.update((r) => r.t.setStyle(0, 8, { b: 'yy' }));

    crossSync(d1, d2);

    assert.deepEqual(nodeAttrs(d1), nodeAttrs(d2));
    assertLedgerExact(d1, 'on the replica that deleted the node');
    assertLedgerExact(d2, 'on the replica that issued the styles');
  });

  /**
   * The tree's `removeStyle` half of the same question. A remote
   * `removeStyle` whose range was decided before a concurrent split follows
   * `insNextID` to the split siblings, one of which is a tombstone by the
   * time it arrives. A live attribute on a tombstoned node is not in `live` —
   * `CRDTTree.getDataSize` excludes the node — so booking it out of `live`
   * walks `live` down by the attribute's size, without bound and into the
   * negative.
   */
  it('keeps the ledger exact for a remote removeStyle on a removed tree node', () => {
    const d1: TreeDoc = new Document('test-doc');
    const d2: TreeDoc = new Document('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'abcdefgh' }] },
        ],
      });
    });
    d1.update((r) => r.t.style(0, 10, { b: 'LONGLONGLONGLONG' }));
    crossSync(d1, d2);

    // d2 removes the style over a range decided before d1 splits.
    d2.update((r) => r.t.removeStyle(0, 10, ['b']));

    // d1 splits the paragraph and removes the right half.
    d1.update((r) => r.t.edit(5, 5, undefined, 1));
    d1.update((r) => r.t.edit(6, 11, undefined, 0));

    crossSync(d1, d2);

    assert.isAtLeast(d1.getDocSize().live.data, 0, 'live went negative');
    assertLedgerExact(d1, 'on the replica that removed the node');
    assertLedgerExact(d2, 'on the replica that issued the removeStyle');
  });

  /**
   * The tree half of the same contract. Reaching it needs a remote style,
   * because an index range cannot address a removed node locally: a style
   * whose range was decided before a concurrent split follows `insNextID` to
   * the split siblings, and one of those is removed by the time it arrives.
   */
  it('keeps the ledger exact for a remote style on a removed tree node', () => {
    const d1: TreeDoc = new Document('test-doc');
    const d2: TreeDoc = new Document('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'abcdefgh' }] },
        ],
      });
    });
    crossSync(d1, d2);

    // d2 styles a range decided before d1 splits.
    d2.update((r) => r.t.style(0, 10, { b: 'LONGLONGLONGLONG' }));

    // d1 splits the paragraph and removes the right half.
    d1.update((r) => r.t.edit(5, 5, undefined, 1));
    d1.update((r) => r.t.edit(6, 11, undefined, 0));

    crossSync(d1, d2);

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    assertLedgerExact(d1, 'on the replica that removed the node');
    assertLedgerExact(d2, 'on the replica that issued the style');
  });
  /**
   * Toggling a tree attribute on and off has to return the ledger to where it
   * started, on the CLONE as well as on the root — `Document.update` reads the
   * clone's total against `maxSizeLimit`. The server had a gap here:
   * `json.Tree`'s `RemoveStyle` registered its GC pairs without ever adjusting
   * the Live diff, so a rich-text editor toggling one key walked into the size
   * limit on a document nowhere near it. This SDK is spared because
   * `registerGCPair` does the live subtraction itself rather than leaving it
   * to a separate `AdjustDiffForGCPair`; pinned so the two stay that way.
   */
  it('does not drift the clone ledger when a tree attribute is toggled', () => {
    const d = new Document<{ t: Tree }>('test-doc');
    d.setMaxSizePerDocument(2000);
    d.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
      });
    });

    const val = 'v'.repeat(200);
    for (let i = 0; i < 40; i++) {
      d.update((r) => r.t.style(0, 6, { b: val }));
      assert.doesNotThrow(
        () => d.update((r) => r.t.removeStyle(0, 6, ['b'])),
        `toggle ${i} tripped maxSizeLimit; the document itself is ${JSON.stringify(
          d.getDocSize(),
        )}`,
      );
    }
  });
  /**
   * Two clients delete the same run concurrently; a third, which has seen only
   * one of the two deletions, styles a range covering it. This is the case
   * that forces `canStyle` not to read `removedAt`.
   *
   * `removedAt` is last-writer-wins and MUTABLE, while a style is evaluated
   * once, when it arrives — so any predicate over it answers differently
   * depending on which of the two removals has landed. All four replay orders
   * below are causally legal, so all four have to agree.
   */
  it('agrees across delivery orders when two removals are concurrent', () => {
    const grab = <T>(d: Document<T>) => {
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
    };
    const feed = <T>(d: Document<T>, changes: ReturnType<typeof grab>) =>
      d.applyChangePack(
        ChangePack.create(
          'test-doc',
          Checkpoint.of(0n, 0),
          false,
          changes,
          InitialVersionVector,
        ),
      );
    const actor = (hex: string) => {
      const d: TextDoc = new Document('test-doc');
      d.setActor(hex);
      return d;
    };

    const seed = actor('000000000000000000000009');
    seed.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'abcdefghij');
    });
    const p0 = grab(seed);

    const docB = actor('000000000000000000000001');
    const docC = actor('000000000000000000000002');
    const docX = actor('000000000000000000000003');
    for (const d of [docB, docC, docX]) feed(d, p0);

    docB.update((r) => r.t.edit(4, 6, ''));
    const pB = grab(docB);
    docC.update((r) => r.t.edit(4, 6, ''));
    const pC = grab(docC);

    // X knows B's removal but not C's.
    feed(docX, pB);
    docX.update((r) => r.t.setStyle(0, 8, { b: '1' }));
    const pS = grab(docX);

    const orders: Array<[string, Array<ReturnType<typeof grab>>]> = [
      ['C,B,S', [pC, pB, pS]],
      ['B,S,C', [pB, pS, pC]],
      ['B,C,S', [pB, pC, pS]],
      ['C,S,B', [pC, pS, pB]],
    ];

    let first: Array<string> | undefined;
    for (const [name, seq] of orders) {
      const d = actor('00000000000000000000000a');
      feed(d, p0);
      for (const batch of seq) feed(d, batch);

      const got = nodeAttrs(d);
      if (first === undefined) {
        first = got;
        continue;
      }
      assert.deepEqual(got, first, `delivery order ${name} diverges`);
    }
  });
  /**
   * Undoing a style whose range covers only a node another client removed
   * concurrently. The reverse style mutates the tombstone, but a tombstone has
   * no index, so it produces no `OpInfo` — and `Document.update`'s undo path
   * used to gate propagation on `opInfos.length`. The change was applied here
   * and never sent, leaving the replicas with different attributes on the same
   * node for good: the exact divergence `canStyle` was changed to prevent,
   * coming back through undo.
   */
  it('sends an undo whose style lands only on a tombstone', () => {
    const d1: TextDoc = new Document('test-doc');
    const d2: TextDoc = new Document('test-doc');
    d1.setActor(A1);
    d2.setActor(A2);

    d1.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'abcdefghij');
    });
    crossSync(d1, d2);

    d1.update((r) => r.t.setStyle(4, 6, { b: '1' }));
    d2.update((r) => r.t.edit(4, 6, ''));
    crossSync(d1, d2);
    assert.deepEqual(nodeAttrs(d1), nodeAttrs(d2), 'sanity: converged first');

    d1.history.undo();
    assert.isAtLeast(
      d1.createChangePack().getChanges().length,
      1,
      'the undo mutated the tombstone, so it has to reach the other replica',
    );

    crossSync(d1, d2);
    assert.deepEqual(
      nodeAttrs(d1),
      nodeAttrs(d2),
      'the replicas disagree after an undo that showed nothing',
    );
  });
  /**
   * A style range that opens on a tombstone: the reverse operation's prior
   * values must come from the first LIVE node, not from the dead run the user
   * had already deleted. Capturing from the tombstone made the undo write
   * `b="OLD"` onto `"efgh"`, which never carried the attribute at any point.
   */
  it('does not restore a tombstone’s attribute on undo', () => {
    const d: TextDoc = new Document('test-doc');
    d.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'abcdefghij');
    });
    d.update((r) => r.t.setStyle(0, 4, { b: 'OLD' }));
    d.update((r) => r.t.edit(0, 4, ''));
    assert.equal(d.getRoot().t.toJSON(), '[{"val":"efghij"}]');

    d.update((r) => r.t.setStyle(0, 4, { b: 'NEW' }));
    d.history.undo();
    assert.equal(
      d.getRoot().t.toJSON(),
      '[{"val":"efgh"},{"val":"ij"}]',
      'the undo restored an attribute the visible text never carried',
    );
  });
});
