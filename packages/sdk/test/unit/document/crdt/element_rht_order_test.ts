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
import { toBinary, fromBinary } from '@bufbuild/protobuf';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  JSONElementSchema as PbJSONElementSchema,
  JSONElement_JSONObject as PbJSONElement_JSONObject,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';

/**
 * Rebuilding an ElementRHT from a snapshot must not depend on the order the
 * members arrive in.
 *
 * `converter.fromObject` replays every decoded member through
 * `ElementRHT.set(key, value, value.getPositionedAt())`, in whatever order
 * the server's protobuf carried them. That order is protocol-visible, not an
 * implementation detail.
 *
 * It only becomes observable once a key holds a tombstone alongside a live
 * member whose `positionedAt` is newer than its `createdAt` — the shape an
 * undo of a `Set` leaves behind, since the reverse operation restores the
 * original element under a fresh `executedAt`.
 *
 * Mirrors `TestSnapshotDecodeIsOrderIndependent` in
 * yorkie/api/converter/snapshot_order_test.go, which is the behavior this
 * must match.
 */
describe('ElementRHT snapshot rebuild order', function () {
  /** Every ordering of `items`. */
  function permute<T>(items: Array<T>): Array<Array<T>> {
    if (items.length <= 1) return [[...items]];

    const out: Array<Array<T>> = [];
    for (let i = 0; i < items.length; i++) {
      const rest = [...items.slice(0, i), ...items.slice(i + 1)];
      for (const tail of permute(rest)) {
        out.push([items[i], ...tail]);
      }
    }
    return out;
  }

  describe('ElementRHT.set directly', function () {
    const T1 = TimeTicket.of(1n, 0, 'actorA'); // live member's createdAt
    const T3 = TimeTicket.of(3n, 0, 'actorB'); // tombstone's createdAt
    const T4 = TimeTicket.of(4n, 0, 'actorB'); // tombstone's removedAt
    const T5 = TimeTicket.of(5n, 0, 'actorA'); // live member's movedAt (undo restore)

    /** The two members one key carries after Set → Set → undo. */
    function members(): Array<CRDTElement> {
      const live = Primitive.of('kept', T1);
      live.setMovedAt(T5);
      const tomb = Primitive.of('displaced', T3);
      tomb.remove(T4);
      return [live, tomb];
    }

    it('resolves the key the same way in every arrival order', function () {
      for (const [i, order] of permute([0, 1]).entries()) {
        const rht = ElementRHT.create();
        const elems = members();
        for (const idx of order) {
          rht.set('frame', elems[idx], elems[idx].getPositionedAt());
        }

        const node = rht.get('frame');
        assert.isDefined(node, `order #${i} (${order}) lost the key entirely`);
        assert.equal(node!.getValue().toJSON(), '"kept"', `order #${i}`);
      }
    });

    it('never tombstones the member that goes on to win', function () {
      for (const order of permute([0, 1])) {
        const rht = ElementRHT.create();
        const elems = members();
        for (const idx of order) {
          rht.set('frame', elems[idx], elems[idx].getPositionedAt());
        }

        const nodes = Array.from(rht).map((n) => ({
          value: n.getValue().toJSON(),
          removed: n.isRemoved(),
        }));
        assert.isTrue(
          nodes.some((n) => n.value === '"kept"' && !n.removed),
          `order ${order}: live member must survive, got ${JSON.stringify(
            nodes,
          )}`,
        );
      }
    });

    /**
     * The same window reached by a live loser rather than a tombstone: a
     * concurrent remote `Set` landing against an undo-restored occupant.
     *
     * Worse than the missing key, because the object's three readers then
     * disagree — `getKeys` walks `nodeMapByCreatedAt` and reports the key
     * (yielding the loser), `toJSON` serves the loser's value under it, and
     * `toSortedJSON` looks it up through `nodeMapByKey`, gets the removed
     * occupant, and throws.
     */
    it('keeps the key readable when the loser is live', function () {
      for (const order of permute([0, 1])) {
        const rht = ElementRHT.create();
        const live = Primitive.of('kept', T1);
        live.setMovedAt(T5);
        const loser = Primitive.of('displaced', T3);
        const elems = [live, loser];
        for (const idx of order) {
          rht.set('frame', elems[idx], elems[idx].getPositionedAt());
        }

        assert.isFalse(live.isRemoved(), `order ${order}: winner tombstoned`);
        assert.isTrue(loser.isRemoved(), `order ${order}: loser left live`);
        assert.equal(
          new CRDTObject(InitialTimeTicket, rht).toSortedJSON(),
          '{"frame":"kept"}',
          `order ${order}`,
        );
      }
    });

    /**
     * `set` returns the element it evicted, and that return is what
     * `SetOperation` hands `registerRemovedElement` — so a wrong one is a
     * leaked tombstone (the element is never collected) or a live element
     * queued for collection.
     */
    it('returns the evicted occupant only when the incoming value wins', function () {
      const rht = ElementRHT.create();
      const first = Primitive.of('first', T1);
      assert.isUndefined(
        rht.set('frame', first, T1),
        'an empty key evicts nothing',
      );

      const restored = Primitive.of('kept', TimeTicket.of(2n, 0, 'actorB'));
      assert.strictEqual(
        rht.set('frame', restored, T5),
        first,
        'a winning set reports the occupant it tombstoned',
      );
      assert.isTrue(first.isRemoved());
      // `restored` now sits at the key with createdAt(2) < positionedAt(T5),
      // which is the window where the two gates used to disagree.

      const loser = Primitive.of('late', T3);
      assert.isUndefined(
        rht.set('frame', loser, T3),
        'a losing set evicts nothing, so it reports nothing',
      );
      assert.isFalse(restored.isRemoved(), 'the winner stays live');
      assert.isTrue(loser.isRemoved(), 'the loser marks itself removed');
    });

    /**
     * The losing branch marks the incoming value removed so `ownKeys` skips
     * it. A value that arrives already removed is already skipped, so the
     * marking has nothing to do — but `CRDTElement.remove` accepts any later
     * ticket, so ungated it is not a no-op: it moves the tombstone's
     * `removedAt` off the ticket of the removal that actually happened and
     * onto the occupant's `positionedAt`.
     *
     * That is the shape `converter.fromObject` replays on every snapshot load
     * (#1377): GC then waits for `minSyncedVersionVector >= M` instead of
     * `R`, and the replica's re-serialized snapshots and `docSize.gc` differ
     * from replicas that never reloaded.
     */
    it('leaves a losing tombstone removedAt alone', function () {
      for (const order of permute([0, 1])) {
        const rht = ElementRHT.create();
        const elems = members();
        const tomb = elems[1];
        for (const idx of order) {
          rht.set('frame', elems[idx], elems[idx].getPositionedAt());
        }

        assert.isTrue(tomb.isRemoved(), `order ${order}: tombstone revived`);
        assert.isTrue(
          tomb.getRemovedAt()!.equals(T4),
          `order ${order}: removedAt moved from ${T4.toTestString()} to ` +
            `${tomb.getRemovedAt()!.toTestString()}`,
        );
      }
    });

    it('resolves a key carrying more than two members, in every order', function () {
      const elems = [
        Primitive.of('kept', T1), // undo-restored: positionedAt T5
        Primitive.of('displaced', T3), // tombstone
        Primitive.of('late', TimeTicket.of(2n, 0, 'actorC')), // live loser
      ];
      elems[0].setMovedAt(T5);
      elems[1].remove(T4);

      for (const order of permute([0, 1, 2])) {
        const rht = ElementRHT.create();
        const copies = elems.map((e) => e.deepcopy());
        for (const idx of order) {
          rht.set('frame', copies[idx], copies[idx].getPositionedAt());
        }

        const node = rht.get('frame');
        assert.isDefined(node, `order ${order} lost the key`);
        assert.equal(node!.getValue().toJSON(), '"kept"', `order ${order}`);
      }
    });
  });

  describe('through the snapshot decoder', function () {
    /**
     * A document whose root key holds a live member restored by undo/redo
     * alongside the tombstones the superseded writes left behind.
     */
    function docWithRestoredKey(redo: boolean): Document<{ frame: string }> {
      const doc = new Document<{ frame: string }>('d1');
      doc.update((root) => {
        root.frame = 'v1';
      });
      doc.update((root) => {
        root.frame = 'v2';
      });
      doc.history.undo();
      assert.equal(doc.toSortedJSON(), '{"frame":"v1"}');

      if (redo) {
        doc.history.redo();
        assert.equal(doc.toSortedJSON(), '{"frame":"v2"}');
      }
      return doc;
    }

    for (const [name, redo] of [
      ['key restored by undo', false],
      ['key restored by undo then redo', true],
    ] as Array<[string, boolean]>) {
      it(`decodes identically in every member order — ${name}`, function () {
        const doc = docWithRestoredKey(redo);
        const want = doc.getRootObject().toSortedJSON();

        const encoded = converter.objectToBytes(doc.getRootObject());
        const pbElem = fromBinary(PbJSONElementSchema, encoded);
        const pbObj = pbElem.body.value as PbJSONElement_JSONObject;
        assert.isAtLeast(
          pbObj.nodes.length,
          2,
          'the key must carry a tombstone alongside the live member',
        );
        // `permute` is O(n!) with a full protobuf decode per permutation.
        // Today the key carries exactly two members; if that ever grows, fail
        // here rather than let the suite quietly become its own bottleneck.
        assert.isAtMost(pbObj.nodes.length, 3, 'permutation cost is factorial');

        const indices = pbObj.nodes.map((_, i) => i);
        for (const [i, order] of permute(indices).entries()) {
          const shuffled = fromBinary(PbJSONElementSchema, encoded);
          const body = shuffled.body.value as PbJSONElement_JSONObject;
          body.nodes = order.map((idx) => body.nodes[idx]);

          const rebuilt = converter.bytesToObject(
            toBinary(PbJSONElementSchema, shuffled),
          );
          assert.equal(
            rebuilt.toSortedJSON(),
            want,
            `permutation #${i} rebuilt a different object`,
          );
        }
      });
    }

    /**
     * A snapshot round-trip must be a fixpoint on the tombstones it carries.
     * `fromObject` replays every decoded member through `ElementRHT.set`, and
     * a tombstone that sorts after the live occupant takes the losing branch —
     * which used to bump its `removedAt` to the occupant's `positionedAt`.
     * The document then measures differently depending on whether it has been
     * through a snapshot load (#1377).
     */
    it('preserves each tombstone removedAt across a decode', function () {
      // `createdAt(live) < createdAt(tomb) < removedAt(tomb) < movedAt(live)`:
      // the tombstone loses to the undo-restored occupant, and its own
      // removal is strictly older than the ticket that restored the occupant.
      // An undo whose reverse `Set` both removes and restores under one ticket
      // leaves `removedAt == movedAt`, where the bump is invisible.
      // Actor IDs must be the wire's 24-hex form: anything else decodes back
      // as the initial actor and the comparison passes on a technicality.
      const actorA = '000000000000000000000001';
      const actorB = '000000000000000000000002';
      const rht = ElementRHT.create();
      const live = Primitive.of('kept', TimeTicket.of(1n, 0, actorA));
      const tomb = Primitive.of('displaced', TimeTicket.of(3n, 0, actorB));
      tomb.remove(TimeTicket.of(4n, 0, actorB));
      live.setMovedAt(TimeTicket.of(5n, 0, actorA));
      rht.set('frame', live, live.getPositionedAt());
      rht.set('frame', tomb, tomb.getPositionedAt());
      const root = new CRDTObject(InitialTimeTicket, rht);

      /** Every member of the root's `frame` key, by createdAt → removedAt. */
      const removedAts = (obj: CRDTObject) => {
        const out = new Map<string, string>();
        for (const node of obj.getRHT()) {
          const elem = node.getValue();
          out.set(
            elem.getCreatedAt().toTestString(),
            elem.getRemovedAt()?.toTestString() ?? '',
          );
        }
        return out;
      };

      const want = removedAts(root);
      assert.isTrue(
        Array.from(want.values()).some((at) => at !== ''),
        'the key must carry a tombstone for this to test anything',
      );

      const rebuilt = converter.bytesToObject(converter.objectToBytes(root));
      assert.deepEqual(
        Array.from(removedAts(rebuilt).entries()).sort(),
        Array.from(want.entries()).sort(),
      );
    });
  });
});
