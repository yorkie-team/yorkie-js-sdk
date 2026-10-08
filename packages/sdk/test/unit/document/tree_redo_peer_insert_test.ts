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

import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { converter } from '@yorkie-js/sdk/src/api/converter';

const A1 = '000000000000000000000001';
const A2 = '000000000000000000000002';

type Doc = Document<{ t: Tree }>;

/**
 * `roundTrip` encodes a change pack to protobuf and back, so the exchange
 * below carries exactly what a real sync carries — restore spans included,
 * and nothing that only survives because both replicas share a heap.
 */
function roundTrip(pack: ChangePack<Indexable>): ChangePack<Indexable> {
  return converter.fromChangePack(converter.toChangePack(pack));
}

/**
 * `crossSync` exchanges pending local changes between two in-process
 * documents, mimicking a server round-trip. Mirrors the helper in
 * text_restore_convergence_test.ts, with the protobuf round-trip added.
 */
function crossSync(d1: Doc, d2: Doc): void {
  const p1 = roundTrip(d1.createChangePack());
  const p2 = roundTrip(d2.createChangePack());

  // Neutral checkpoint (clientSeq 0) so the receiver's own pending local
  // changes are not dropped; empty version vector keeps GC out of the swap.
  const deliver = (to: Doc, pack: ChangePack<Indexable>) =>
    to.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        pack.getChanges(),
        InitialVersionVector,
      ),
    );
  deliver(d2, p1);
  deliver(d1, p2);

  // Self-ack: drop exactly the delivered changes from each sender's local
  // queue so the next crossSync doesn't re-send them.
  const ack = (pack: ChangePack<Indexable>) => {
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
 * `collect` purges every tombstone both replicas have seen, so a later
 * restore has to recreate the node from its span instead of reviving it.
 */
function collect(d1: Doc, d2: Doc): void {
  d1.garbageCollect(maxVectorOf([A1, A2]));
  d2.garbageCollect(maxVectorOf([A1, A2]));
}

/**
 * `buildPeerInsertBefore` has d1 type `a`, `b`, `c` as three separate
 * changes, then d2 insert `XYZ` in front of them, syncing throughout. Each
 * of d1's three inserts is left on its undo stack.
 */
function buildPeerInsertBefore(): [Doc, Doc] {
  const d1: Doc = new Document<{ t: Tree }>('test-doc');
  const d2: Doc = new Document<{ t: Tree }>('test-doc');
  d1.setActor(A1);
  d2.setActor(A2);

  d1.update((root) => {
    root.t = new Tree({ type: 'doc', children: [{ type: 'p', children: [] }] });
  });
  crossSync(d1, d2);

  for (const [i, ch] of [...'abc'].entries()) {
    d1.update((root) =>
      root.t.editByPath([0, i], [0, i], { type: 'text', value: ch }),
    );
    crossSync(d1, d2);
  }

  d2.update((root) =>
    root.t.editByPath([0, 0], [0, 0], { type: 'text', value: 'XYZ' }),
  );
  crossSync(d1, d2);

  assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZabc</p></doc>');
  assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
  return [d1, d2];
}

/**
 * `buildSplitTextWithPeerInsert` has d1 type `abc` as ONE insert, then d2
 * split that text node in two by inserting `Q` inside it and insert `XYZ` in
 * front of it. d1's single insert is left on its undo stack, and its span now
 * covers TWO live pieces (`ab` at offset 0 and `c` at offset 2) — the
 * multi-piece `first !== last` path through `spanAnchors`.
 */
function buildSplitTextWithPeerInsert(): [Doc, Doc] {
  const d1: Doc = new Document<{ t: Tree }>('test-doc');
  const d2: Doc = new Document<{ t: Tree }>('test-doc');
  d1.setActor(A1);
  d2.setActor(A2);

  d1.update((root) => {
    root.t = new Tree({ type: 'doc', children: [{ type: 'p', children: [] }] });
  });
  crossSync(d1, d2);

  d1.update((root) =>
    root.t.editByPath([0, 0], [0, 0], { type: 'text', value: 'abc' }),
  );
  crossSync(d1, d2);

  // Splits d1's text node at offset 2, so one insertion now owns two pieces.
  d2.update((root) =>
    root.t.editByPath([0, 2], [0, 2], { type: 'text', value: 'Q' }),
  );
  d2.update((root) =>
    root.t.editByPath([0, 0], [0, 0], { type: 'text', value: 'XYZ' }),
  );
  crossSync(d1, d2);

  assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZabQc</p></doc>');
  assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
  return [d1, d2];
}

describe('tree redo across a peer insert (#1418)', () => {
  it('restores a garbage-collected node after the peer text, not before it', () => {
    const [d1, d2] = buildPeerInsertBefore();

    // Sync and collect between the undos, so every undone node is purged by
    // the time the redo has to bring one back.
    for (let i = 0; i < 3; i++) {
      d1.history.undo();
      crossSync(d1, d2);
      collect(d1, d2);
    }
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZ</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), '<doc><p>XYZ</p></doc>');

    d1.history.redo();
    crossSync(d1, d2);

    // `a` carries an EARLIER ticket than `XYZ` yet belongs to its right, so a
    // recreate that falls back to id order puts it first.
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZa</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
  });

  it('replays all three redos in order after a collect', () => {
    const [d1, d2] = buildPeerInsertBefore();

    for (let i = 0; i < 3; i++) {
      d1.history.undo();
      crossSync(d1, d2);
      collect(d1, d2);
    }
    for (let i = 0; i < 3; i++) {
      d1.history.redo();
      crossSync(d1, d2);
      collect(d1, d2);
    }

    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZabc</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
  });

  it('converges when the undone nodes are still tombstones', () => {
    const [d1, d2] = buildPeerInsertBefore();

    d1.history.undo();
    d1.history.undo();
    d1.history.undo();
    crossSync(d1, d2);
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZ</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), '<doc><p>XYZ</p></doc>');

    d1.history.redo();
    crossSync(d1, d2);

    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZa</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
  });

  it('re-anchors a span that tombstoned several text pieces', () => {
    const [d1, d2] = buildSplitTextWithPeerInsert();

    // The undo re-removes both pieces of the one insertion, so the span's
    // anchors come from the leftmost (`ab`) and the rightmost (`c`) piece.
    d1.history.undo();
    crossSync(d1, d2);
    collect(d1, d2);
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZQ</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());

    d1.history.redo();
    crossSync(d1, d2);

    // Both pieces were purged, so the redo recreates the span as one node and
    // places it by its anchors: after `XYZ`, which is what the left anchor
    // (re-read at the undo) says. Falling back to id order would put `abc`
    // first, since it carries an earlier ticket than `XYZ`.
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZabcQ</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
  });

  it('re-anchors a span whose pieces no longer share a parent', () => {
    const [d1, d2] = buildSplitTextWithPeerInsert();

    // Splitting the paragraph inside d1's text moves the `c` piece out from
    // under the `ab` piece's parent, so the span's two pieces end up in
    // different elements. A span records ONE parent, so the right anchor has
    // to come from a piece that still sits under it.
    d2.update((root) => root.t.editByPath([0, 5], [0, 5], undefined, 1));
    crossSync(d1, d2);
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZab</p><p>Qc</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());

    d1.history.undo();
    crossSync(d1, d2);
    collect(d1, d2);
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZ</p><p>Q</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());

    d1.history.redo();
    crossSync(d1, d2);

    // The recreated node lands under the first paragraph, after `XYZ`: the
    // parent and the left anchor both come from the `ab` piece, the only one
    // still there to read them from.
    assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZabc</p><p>Q</p></doc>');
    assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
  });

  it('survives an undo/redo cycle repeated after collection', () => {
    const [d1, d2] = buildPeerInsertBefore();

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 3; i++) {
        d1.history.undo();
        crossSync(d1, d2);
        collect(d1, d2);
      }
      assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZ</p></doc>');
      for (let i = 0; i < 3; i++) {
        d1.history.redo();
        crossSync(d1, d2);
        collect(d1, d2);
      }
      assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZabc</p></doc>');
      assert.equal(d2.getRoot().t.toXML(), d1.getRoot().t.toXML());
    }
  });
});
