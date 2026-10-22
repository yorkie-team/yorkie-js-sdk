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
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

const ACTOR = '000000000000000000000001';
const PEER = '000000000000000000000002';

/**
 * `crossSync` delivers each replica's pending changes to the other and
 * acknowledges them, without a server and without moving GC forward.
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();
  const pack = (
    from: ReturnType<Document<T>['createChangePack']>,
    clientSeq: number,
    changes: ReturnType<typeof from.getChanges>,
  ) =>
    ChangePack.create(
      from.getDocumentKey(),
      Checkpoint.of(0n, clientSeq),
      false,
      changes,
      InitialVersionVector,
    );
  const lastSeq = (from: ReturnType<Document<T>['createChangePack']>) => {
    const changes = from.getChanges();
    return changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
  };
  d2.applyChangePack(pack(p1, 0, p1.getChanges()));
  d1.applyChangePack(pack(p2, 0, p2.getChanges()));
  d1.applyChangePack(pack(p1, lastSeq(p1), []));
  d2.applyChangePack(pack(p2, lastSeq(p2), []));
}

/**
 * Regression for the reversed-text undo (wafflebase#629). Typing character by
 * character makes each character its own single-char insertion. Deleting a
 * contiguous run and then undoing AFTER the tombstones were GC-purged forces
 * every character down restore's recreate path. Because no character shares an
 * insertion with any other, none of the same-insertion anchor rungs fire; each
 * recreated fragment must chain after the one placed just before it, or the run
 * comes back reversed ("my name" -> "eman ym"). Un-tombstoning (no GC) already
 * preserved order, which is why this only reproduced once the run was purged.
 */
describe('Text restore after GC', () => {
  it('recreates a purged multi-insertion run in document order on undo', () => {
    const doc = new Document<{ t: Text }>('text-restore-after-gc');
    doc.setActor(ACTOR);
    doc.update((r) => {
      r.t = new Text();
    });

    const s = 'hello my name is';
    for (let i = 0; i < s.length; i++) {
      doc.update((r) => r.t.edit(i, i, s[i]));
    }
    assert.equal(doc.getRoot().t.toString(), s);

    doc.update((r) => r.t.edit(6, 13, '')); // delete "my name"
    assert.equal(doc.getRoot().t.toString(), 'hello  is');

    // Purge the tombstones (as happens once the delete is synced/acked), so
    // undo cannot un-tombstone in place and must recreate from the spans.
    const purged = doc.garbageCollect(maxVectorOf([ACTOR]));
    assert.isAbove(purged, 0, 'the deleted run should be purged');

    doc.history.undo();
    assert.equal(
      doc.getRoot().t.toString(),
      s,
      'a purged run must be recreated in document order, not reversed',
    );
  });

  it('single-insertion run is unaffected (one recreate)', () => {
    const doc = new Document<{ t: Text }>('text-restore-after-gc-single');
    doc.setActor(ACTOR);
    doc.update((r) => {
      r.t = new Text();
    });
    doc.update((r) => r.t.edit(0, 0, 'hello my name is'));
    doc.update((r) => r.t.edit(6, 13, ''));
    doc.garbageCollect(maxVectorOf([ACTOR]));
    doc.history.undo();
    assert.equal(doc.getRoot().t.toString(), 'hello my name is');
  });

  // Which pieces survive is per-replica GC state, so where a restore anchors
  // must not depend on it. Here only the undoing replica has purged, so it
  // rebuilds the run through the anchor ladder, while the peer still holds the
  // tombstones and revives them in place. In the second case the text left of
  // the run is purged as well, so no piece of any neighbour survives on the
  // undoing replica and the first fragment falls back to the operation's own
  // position.
  for (const [name, purgeLeft] of [
    ['its neighbours survive', false],
    ['its left neighbour is purged too', true],
  ] as const) {
    it(`converges when only the undoing replica purged the run (${name})`, () => {
      const d1 = new Document<{ t: Text }>('text-restore-after-gc-peer');
      const d2 = new Document<{ t: Text }>('text-restore-after-gc-peer');
      d1.setActor(ACTOR);
      d2.setActor(PEER);
      d1.update((r) => {
        r.t = new Text();
      });
      const s = 'hello my name is';
      for (let i = 0; i < s.length; i++) {
        d1.update((r) => r.t.edit(i, i, s[i]));
      }
      crossSync(d1, d2);
      d1.clearHistory();

      if (purgeLeft) {
        d2.update((r) => r.t.edit(0, 6, '')); // the peer deletes "hello "
        crossSync(d1, d2);
      }
      const from = purgeLeft ? 0 : 6;
      d1.update((r) => r.t.edit(from, from + 7, '')); // delete "my name"
      crossSync(d1, d2);

      assert.isAbove(d1.garbageCollect(maxVectorOf([ACTOR, PEER])), 0);
      d1.history.undo();
      crossSync(d1, d2);

      const want = purgeLeft ? 'my name is' : s;
      assert.equal(d1.getRoot().t.toString(), want);
      assert.equal(d2.getRoot().t.toString(), want);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    });
  }

  // The reverse of an insertion records the inserted run as a span. The undo
  // only re-tombstones it, so the span's value is never read; the redo flips
  // the direction and the same span becomes the content to restore. A replica
  // that purged the node rebuilds it from that value alone, so the span has to
  // carry the attributes the edit applied or the two replicas diverge
  // (yorkie-team/yorkie-js-sdk#1497).
  it('keeps the attributes of a re-inserted run when redoing after GC', () => {
    const d1 = new Document<{ t: Text }>('text-redo-attrs-after-gc');
    const d2 = new Document<{ t: Text }>('text-redo-attrs-after-gc');
    d1.setActor(ACTOR);
    d2.setActor(PEER);
    d1.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'ab');
    });
    crossSync(d1, d2);
    d1.clearHistory();

    d1.update((r) => r.t.edit(1, 1, 'X', { b: '1' }));
    d1.history.undo();
    crossSync(d1, d2);

    // Only d1 purges the undone run, so its redo must recreate the node from
    // the span while d2 revives the tombstone it still holds.
    assert.isAbove(d1.garbageCollect(maxVectorOf([ACTOR, PEER])), 0);
    d1.history.redo();
    crossSync(d1, d2);

    assert.equal(d1.getRoot().t.toString(), 'aXb');
    assert.deepEqual(d1.getRoot().t.values()[1].attributes, { b: '1' });
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
  });

  // The span is captured when the reversed edit runs, so an attribute applied
  // to the inserted run AFTERWARDS is not in it. The undo re-snapshots the
  // span against the live content before removing it, so the redo's restore
  // payload carries the style the peer added; otherwise a replica that purged
  // the run recreates it unstyled while a replica that un-tombstones keeps the
  // style (yorkie-team/yorkie-js-sdk#1497).
  it('keeps a style applied after the insert when redoing after GC', () => {
    const d1 = new Document<{ t: Text }>('text-redo-late-attrs-after-gc');
    const d2 = new Document<{ t: Text }>('text-redo-late-attrs-after-gc');
    d1.setActor(ACTOR);
    d2.setActor(PEER);
    d1.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'ab');
    });
    crossSync(d1, d2);
    d1.clearHistory();

    d1.update((r) => r.t.edit(1, 1, 'X'));
    crossSync(d1, d2);

    // The peer styles the inserted run after the fact, so the span recorded at
    // insert time knows nothing about it.
    d2.update((r) => r.t.setStyle(1, 2, { b: '1' }));
    crossSync(d1, d2);
    assert.deepEqual(d1.getRoot().t.values()[1].attributes, { b: '1' });

    d1.history.undo();
    crossSync(d1, d2);

    assert.isAbove(d1.garbageCollect(maxVectorOf([ACTOR, PEER])), 0);
    d1.history.redo();
    crossSync(d1, d2);

    assert.equal(d1.getRoot().t.toString(), 'aXb');
    assert.deepEqual(d1.getRoot().t.values()[1].attributes, { b: '1' });
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
  });

  // Mirrors the chained case of yorkie's text_redo_attrs_test: every round
  // purges the run again, so each redo recreates it from the span.
  it('keeps the attributes across chained undo/redo with GC', () => {
    const doc = new Document<{ t: Text }>('text-redo-attrs-chained');
    doc.setActor(ACTOR);
    doc.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'ab');
    });
    doc.clearHistory();
    doc.update((r) => r.t.edit(1, 1, 'X', { b: '1', i: '1' }));

    for (let i = 0; i < 3; i++) {
      doc.history.undo();
      doc.garbageCollect(maxVectorOf([ACTOR]));
      doc.history.redo();

      assert.equal(doc.getRoot().t.toString(), 'aXb');
      assert.deepEqual(doc.getRoot().t.values()[1].attributes, {
        b: '1',
        i: '1',
      });
    }
  });

  // The style covers one character of the run, so the undo has to report the
  // pieces separately for the redo to recreate each with its own attributes.
  it('keeps a style covering part of the insert when redoing after GC', () => {
    const d1 = new Document<{ t: Text }>('text-redo-partial-attrs-after-gc');
    const d2 = new Document<{ t: Text }>('text-redo-partial-attrs-after-gc');
    d1.setActor(ACTOR);
    d2.setActor(PEER);
    d1.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'ab');
    });
    crossSync(d1, d2);
    d1.clearHistory();

    d1.update((r) => r.t.edit(1, 1, 'XYZ'));
    crossSync(d1, d2);
    d2.update((r) => r.t.setStyle(2, 3, { b: '1' }));
    crossSync(d1, d2);

    d1.history.undo();
    crossSync(d1, d2);
    d1.garbageCollect(maxVectorOf([ACTOR, PEER]));
    d1.history.redo();
    crossSync(d1, d2);

    assert.equal(d1.getRoot().t.toString(), 'aXYZb');
    const values = d1.getRoot().t.values();
    assert.deepEqual(
      values.map((v) => [v.content, v.attributes ?? {}]),
      [
        ['a', {}],
        ['X', {}],
        ['Y', { b: '1' }],
        ['Z', {}],
        ['b', {}],
      ],
    );
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
  });

  // An edit that carried no attributes must not gain any from the span.
  it('keeps a plain re-inserted run unstyled when redoing after GC', () => {
    const doc = new Document<{ t: Text }>('text-redo-plain-after-gc');
    doc.setActor(ACTOR);
    doc.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'ab');
    });
    doc.clearHistory();
    doc.update((r) => r.t.edit(1, 1, 'X'));

    doc.history.undo();
    doc.garbageCollect(maxVectorOf([ACTOR]));
    doc.history.redo();

    assert.equal(doc.getRoot().t.toString(), 'aXb');
    assert.isEmpty(doc.getRoot().t.values()[1].attributes ?? {});
  });
});
