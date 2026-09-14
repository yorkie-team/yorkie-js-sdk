import { describe, it, assert } from 'vitest';
import { toBinary, fromBinary } from '@bufbuild/protobuf';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
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

        for (const [i, order] of permute(pbObj.nodes).entries()) {
          const shuffled = fromBinary(PbJSONElementSchema, encoded);
          (shuffled.body.value as PbJSONElement_JSONObject).nodes = order;

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
  });
});
