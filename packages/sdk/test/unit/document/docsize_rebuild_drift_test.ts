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
import { Tree } from '@yorkie-js/sdk/src/document/json/tree';
import { Text } from '@yorkie-js/sdk/src/document/json/text';
import { JSONArray } from '@yorkie-js/sdk/src/document/json/array';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

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
 * documents. See the identical helper in `document_size_test.ts`.
 *
 * Because each replica applies its own change first, the pair covers BOTH
 * delivery orders of a concurrent pair in one exchange: d1 saw its own change
 * then the peer's, d2 the other way round. Asserting on both is what makes a
 * case "in both delivery orders".
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

/**
 * `assertMatchesRebuild` asserts the running `docSize` equals what a root
 * rebuilt from the same content computes.
 *
 * `docSize` is a running accumulator: every operation reports a diff which is
 * added, and nothing ever recomputes it. It therefore cannot notice its own
 * drift, and a rebuild is the only witness. It also has to agree with the Go
 * server, which rebuilds the document from its change log -- the size limit is
 * enforced client-side against each peer's own accounting, so a disagreement
 * is a different allowance per peer for the same document.
 */
function assertMatchesRebuild<T>(d: Document<T>, msg: string): void {
  const r = new CRDTRoot(d.getRootObject().deepcopy());
  assert.deepEqual(d.getDocSize().live, r.getDocSize().live, `${msg}: live`);
  assert.deepEqual(d.getDocSize().gc, r.getDocSize().gc, `${msg}: gc`);
}

type ArrDoc = { arr: JSONArray<string> };
type TreeDoc = { t: Tree };
type TextDoc = { k: Text };

/**
 * `seededTree` builds a two-paragraph tree.
 */
function seededTree(): Document<TreeDoc> {
  const d = new Document<TreeDoc>('test-doc');
  d.setActor(A1);
  d.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
        { type: 'p', children: [{ type: 'text', value: 'efgh' }] },
      ],
    });
  });
  return d;
}

describe('docSize rebuild drift', function () {
  /**
   * A rebuild through `deepcopy` cannot witness this one: it copies the
   * tombstone, value and all, so a running size that kept the value agrees
   * with it. What it disagrees with is a rebuild from the CHANGE LOG -- the
   * server's -- which replays the same removal and holds nothing. The
   * observable claim on this side is that the value's LENGTH stops mattering
   * once the attribute is removed, so styling with a long value and a short
   * one has to land on the same size.
   */
  it('charges nothing for the value of a removed tree attribute', function () {
    const sizeAfterRemoving = (value: string) => {
      const d = seededTree();
      d.update((root) => root.t.styleByPath([0], [1], { bold: value }));
      d.update((root) => root.t.removeStyleByPath([0], [1], ['bold']));
      return d.getDocSize();
    };

    assert.deepEqual(
      sizeAfterRemoving('x'.repeat(64)),
      sizeAfterRemoving('x'),
      'a removed attribute still charged its value',
    );
  });

  it('charges nothing for the value of a removed text attribute', function () {
    const sizeAfterRemoving = (value: string) => {
      const d = new Document<TextDoc>('test-doc');
      d.setActor(A1);
      d.update((root) => {
        root.k = new Text();
        root.k.edit(0, 0, 'abcdefghij');
      });
      d.update((root) => root.k.setStyle(0, 10, { bold: value }));
      // `CRDTText.removeStyle` has no proxy method; undoing the style is the
      // route the public API gives to it.
      d.history.undo();
      return d.getDocSize();
    };

    assert.deepEqual(
      sizeAfterRemoving('x'.repeat(64)),
      sizeAfterRemoving('x'),
      'a removed attribute still charged its value',
    );
  });

  it('charges nothing for the value dropped from a removed node', function () {
    // The node holding the attribute is itself a tombstone, so the container
    // never counted the attribute into live: the dropped value has to come out
    // of the gc charge taken when the node was removed.
    const sizeAfterRemoving = (value: string) => {
      const [d1, d2] = newReplicas<TreeDoc>();
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
            { type: 'p', children: [{ type: 'text', value: 'efgh' }] },
          ],
        });
        root.t.styleByPath([0], [1], { bold: value });
      });
      crossSync(d1, d2);

      d1.update((root) => root.t.editByPath([0], [1]));
      d2.update((root) => root.t.removeStyleByPath([0], [1], ['bold']));
      crossSync(d1, d2);
      return d2.getDocSize();
    };

    assert.deepEqual(
      sizeAfterRemoving('x'.repeat(64)),
      sizeAfterRemoving('x'),
      'a removed attribute on a tombstoned node still charged its value',
    );
  });

  it('charges the movedAt ticket of a moved array element', function () {
    const d = new Document<ArrDoc>('test-doc');
    d.setActor(A1);
    d.update((root) => {
      root.arr = ['a', 'b', 'c'] as unknown as JSONArray<string>;
    });
    assertMatchesRebuild(d, 'before any move');

    d.update((root) => root.arr.moveAfterByIndex(2, 0));
    assert.equal(d.toSortedJSON(), '{"arr":["b","c","a"]}');
    assertMatchesRebuild(d, 'after one move');
  });

  it('charges the movedAt ticket exactly once across repeated moves', function () {
    const d = new Document<ArrDoc>('test-doc');
    d.setActor(A1);
    d.update((root) => {
      root.arr = ['a', 'b', 'c'] as unknown as JSONArray<string>;
    });

    // Move 'a' to the back, then keep moving that SAME element. A re-move
    // overwrites a ticket already charged; charging it again would walk live
    // up without bound on a list the user reorders repeatedly.
    d.update((root) => root.arr.moveAfterByIndex(2, 0));
    assert.equal(d.toSortedJSON(), '{"arr":["b","c","a"]}');
    const afterFirst = structuredClone(d.getDocSize());

    d.update((root) =>
      root.arr.moveFront(root.arr.getElementByIndex(2).getID()),
    );
    d.update((root) =>
      root.arr.moveLast(root.arr.getElementByIndex(0).getID()),
    );
    assert.equal(d.toSortedJSON(), '{"arr":["b","c","a"]}');
    assert.deepEqual(
      d.getDocSize().live,
      afterFirst.live,
      'a re-move must not charge the ticket again',
    );
    assertMatchesRebuild(d, 'after three moves');
  });

  it('agrees with a rebuild on a concurrent move and remove', function () {
    // The two replicas see the pair in opposite orders. In d2's order the
    // remove lands first, so the element is already a tombstone when the move
    // stamps its ticket -- live is not holding that element at all, and the
    // charge has to go to gc instead.
    const [d1, d2] = newReplicas<ArrDoc>();

    d1.update((root) => {
      root.arr = ['a', 'b', 'c'] as unknown as JSONArray<string>;
    });
    crossSync(d1, d2);

    d1.update((root) => root.arr.moveAfterByIndex(2, 0));
    d2.update((root) => {
      root.arr.deleteByID(root.arr.getElementByIndex(0).getID());
    });
    crossSync(d1, d2);

    assert.equal(
      d1.toSortedJSON(),
      d2.toSortedJSON(),
      'replicas must converge first',
    );
    assertMatchesRebuild(d1, 'move applied before remove');
    assertMatchesRebuild(d2, 'remove applied before move');
  });

  it('agrees with a rebuild on a concurrent set and removeStyle', function () {
    // A removed attribute holds no value, so the bytes it was charging have to
    // leave whichever side held them. In one order the removeStyle sees the
    // peer's value, in the other it sees its own.
    const [d1, d2] = newReplicas<TreeDoc>();

    d1.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
          { type: 'p', children: [{ type: 'text', value: 'efgh' }] },
        ],
      });
      root.t.styleByPath([0], [1], { bold: 'true' });
    });
    crossSync(d1, d2);
    assertMatchesRebuild(d1, 'after the initial style');

    d1.update((root) => root.t.styleByPath([0], [1], { bold: 'maybe' }));
    d2.update((root) => root.t.removeStyleByPath([0], [1], ['bold']));
    crossSync(d1, d2);

    assert.equal(
      d1.toSortedJSON(),
      d2.toSortedJSON(),
      'replicas must converge first',
    );
    assertMatchesRebuild(d1, 'set applied before removeStyle');
    assertMatchesRebuild(d2, 'removeStyle applied before set');
  });

  it('agrees with a rebuild when removeStyle lands on a removed node', function () {
    // The node holding the attribute is itself a tombstone, so the container
    // never counted the attribute into live: the dropped value comes out of
    // the gc charge taken when the node was removed, not out of live.
    const [d1, d2] = newReplicas<TreeDoc>();

    d1.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
          { type: 'p', children: [{ type: 'text', value: 'efgh' }] },
        ],
      });
      root.t.styleByPath([0], [1], { bold: 'true' });
    });
    crossSync(d1, d2);

    d1.update((root) => root.t.editByPath([0], [1]));
    d2.update((root) => root.t.removeStyleByPath([0], [1], ['bold']));
    crossSync(d1, d2);

    assert.equal(
      d1.toSortedJSON(),
      d2.toSortedJSON(),
      'replicas must converge first',
    );
    assertMatchesRebuild(d1, 'edit applied before removeStyle');
    assertMatchesRebuild(d2, 'removeStyle applied before edit');
  });
});
