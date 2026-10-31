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

// A port of Go's pkg/document/text_undo_removal_ledger_test.go
// (yorkie-team/yorkie#2310). The subtest names and scenarios are Go's, so a
// failure on either side points at the same rule.

import { describe, it, expect } from 'vitest';
import { fromBinary, toBinary } from '@bufbuild/protobuf';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { SnapshotSchema as PbSnapshotSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';
import { minVersionVector } from '@yorkie-js/sdk/test/helper/adv_sync';

type Root = { t: Text };

const actors = [
  '',
  '000000000000000000000001',
  '000000000000000000000002',
  '000000000000000000000003',
];

/**
 * `send` delivers the pending changes of `from` to each of `to` through
 * protobuf, so what the wire carries is part of what is tested.
 */
function send(from: Document<Root>, ...to: Array<Document<Root>>): void {
  const pack = converter.fromChangePack<Indexable>(
    converter.toChangePack(from.createChangePack()),
  );
  for (const doc of to) {
    doc.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        pack.getChanges() as never,
        InitialVersionVector,
      ),
    );
  }
}

/**
 * `ack` drops the changes `doc` has already sent from its local queue.
 */
function ack(doc: Document<Root>): void {
  const changes = doc.createChangePack().getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  doc.applyChangePack(
    ChangePack.create(
      doc.getKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
}

function exchange(a: Document<Root>, b: Document<Root>): void {
  send(a, b);
  send(b, a);
  ack(a);
  ack(b);
}

/**
 * `replicas` returns two replicas holding `content` in the Text under `t`.
 */
function replicas(content: string): [Document<Root>, Document<Root>] {
  const a = new Document<Root>('ledger');
  const b = new Document<Root>('ledger');
  a.setActor(actors[1]);
  b.setActor(actors[2]);
  a.update((root) => {
    root.t = new Text();
    root.t.edit(0, 0, content);
  });
  exchange(a, b);
  return [a, b];
}

/**
 * `fromSnapshot` returns a third replica loaded from the snapshot of `src`,
 * as a client that attached late would be.
 */
function fromSnapshot(src: Document<Root>): Document<Root> {
  const bytes = converter.snapshotToBytes(src.getRootObject(), new Map());
  const doc = new Document<Root>('ledger');
  doc.setActor(actors[3]);
  doc.applyChangePack(
    ChangePack.create(
      'ledger',
      Checkpoint.of(1n, 0),
      false,
      [],
      src.getVersionVector(),
      bytes,
    ),
  );
  return doc;
}

function edit(doc: Document<Root>, from: number, to: number, content = '') {
  doc.update((root) => root.t.edit(from, to, content));
}

const text = (doc: Document<Root>) => doc.getRoot().t.toString();

const textOf = (doc: Document<Root>) =>
  doc.getRootObject().get('t') as unknown as CRDTText;

const nodes = (doc: Document<Root>) => [...textOf(doc).getRGATreeSplit()];

/**
 * `churn` deletes the character at 1 and undoes it `n` times on `doc` alone,
 * so no peer sees the pairs and GC can prune none of them. It returns the
 * most removal events any node of the Text then carries.
 */
function churn(doc: Document<Root>, n: number): number {
  for (let i = 0; i < n; i++) {
    edit(doc, 1, 2);
    doc.history.undo();
  }
  return Math.max(...nodes(doc).map((n) => n.getRemovalEvents().length));
}

/**
 * `tombstones` counts the removed nodes still in the Text.
 */
const tombstones = (doc: Document<Root>) =>
  nodes(doc).filter((n) => n.isRemoved()).length;

const events = (doc: Document<Root>) =>
  nodes(doc).reduce((sum, n) => sum + n.getRemovalEvents().length, 0);

const minVV = (...docs: Array<Document<Root>>): VersionVector =>
  minVersionVector(docs.map((d) => d.getVersionVector()));

describe('Text undo with a removal ledger', () => {
  it.each(['undoer first', 'deleter first'])(
    'keeps a concurrent deletion the undo never saw (%s)',
    (order) => {
      const [a, b] = replicas('abcdefgh');
      // b deletes `d` and undoes it; a concurrently deletes `defgh`.
      edit(b, 3, 4);
      b.history.undo();
      edit(a, 3, 8);

      if (order === 'undoer first') {
        send(b, a);
        send(a, b);
      } else {
        send(a, b);
        send(b, a);
      }

      // `d` was removed by a's deletion too: b's undo cancels only its own.
      expect(text(a)).toBe('abc');
      expect(text(b)).toBe('abc');
    },
  );

  it('does not remove text a concurrent undo revives (yorkie#2237)', () => {
    const [d1, d2] = replicas('efgh');
    edit(d2, 1, 2);
    exchange(d1, d2);
    expect(text(d1)).toBe('egh');

    // d1 deletes `g` while d2 undoes its deletion of `f`.
    edit(d1, 1, 2);
    d2.history.undo();
    exchange(d1, d2);

    // d1 saw `f` removed, so its deletion leaves the revived `f` alone.
    expect(text(d1)).toBe('efh');
    expect(text(d2)).toBe('efh');
  });

  it('cancels the redo, not the original deletion, on the next undo', () => {
    const [a, b] = replicas('abcdefgh');
    // b: delete `d`, undo, redo, undo. Each undo has to cancel the removal
    // just before it: the second one cancels the redo.
    edit(b, 3, 4);
    b.history.undo();
    b.history.redo();
    b.history.undo();
    expect(text(b)).toBe('abcdefgh');
    // a concurrently removes `defgh`, which keeps `d` removed everywhere.
    edit(a, 3, 8);
    exchange(a, b);

    expect(text(a)).toBe('abc');
    expect(text(b)).toBe('abc');
  });

  it('leaves alone a removed piece the deleter saw removed', () => {
    const [a, b] = replicas('abcdefgh');
    edit(b, 3, 4);
    exchange(a, b);
    // a removes `cef` around the removed `d`; b concurrently undoes.
    edit(a, 2, 5);
    b.history.undo();
    exchange(a, b);

    expect(text(a)).toBe('abdgh');
    expect(text(b)).toBe('abdgh');
  });

  it('keeps the ledger through a snapshot', () => {
    const [a, b] = replicas('abcdefgh');
    edit(b, 3, 4);
    edit(a, 3, 8);
    send(a, b);

    // c loads b's snapshot, where `d` is removed by both deletions; it must
    // not forget a's part when b's undo arrives.
    const c = fromSnapshot(b);
    b.history.undo();
    send(b, a, c);

    expect(text(a)).toBe('abc');
    expect(text(b)).toBe('abc');
    expect(text(c)).toBe('abc');
  });

  it('keeps a piece another deletion still holds out of GC', () => {
    const [a, b] = replicas('abcdefgh');
    edit(b, 3, 4);
    edit(a, 3, 8);
    exchange(a, b);

    // Both deletions are known everywhere. b collects `efgh` but keeps `d`:
    // an undo of either deletion must find it held by the other.
    expect(b.garbageCollect(b.getVersionVector())).toBeGreaterThan(0);
    expect(tombstones(b)).toBe(1);

    b.history.undo();
    exchange(a, b);
    expect(text(a)).toBe('abc');
    expect(text(b)).toBe('abc');

    // Only a's deletion is left on `d`, so it can be collected now.
    expect(b.garbageCollect(b.getVersionVector())).toBeGreaterThan(0);
    expect(tombstones(b)).toBe(0);
  });

  it('does not recreate a purged piece a redo never removed', () => {
    const [a, b] = replicas('abcdefgh');
    // b deletes `d` and undoes it while a deletes `d` too.
    edit(b, 3, 4);
    b.history.undo();
    edit(a, 3, 4);
    exchange(a, b);
    expect(text(b)).toBe('abcefgh');

    // b's redo finds `d` already removed by a, so it records nothing there,
    // and the undo of the redo must not name `d` either: a has collected `d`
    // and would recreate it.
    b.history.redo();
    exchange(a, b);
    expect(a.garbageCollect(a.getVersionVector())).toBeGreaterThan(0);
    b.history.undo();
    exchange(a, b);

    expect(text(a)).toBe('abcefgh');
    expect(text(b)).toBe('abcefgh');
  });

  it('revives a deletion nobody else made, also after a snapshot', () => {
    const [a, b] = replicas('abcdefgh');
    edit(b, 3, 4);
    exchange(a, b);
    const c = fromSnapshot(a);
    b.history.undo();
    send(b, a, c);

    expect(text(a)).toBe('abcdefgh');
    expect(text(b)).toBe('abcdefgh');
    expect(text(c)).toBe('abcdefgh');
  });

  it('redoes only what the redoer saw live', () => {
    const [a, b] = replicas('abcdef');
    // a and b delete `cd` concurrently; a learns of b's deletion.
    edit(a, 2, 4);
    edit(b, 2, 4);
    send(b, a);
    ack(b);
    // a undoes and redoes: `cd` stays removed by b's deletion all along, so
    // a's redo removes nothing. b then undoes its deletion.
    a.history.undo();
    a.history.redo();
    b.history.undo();
    exchange(a, b);

    // b revived `cd` before a's redo arrived; the redo, which saw `cd`
    // removed, leaves it alone there as it did on a.
    expect(text(a)).toBe('abcdef');
    expect(text(b)).toBe('abcdef');
  });

  it('propagates an undo that leaves the text as it was', () => {
    const [a, b] = replicas('abcdefgh');
    // Both delete `a` concurrently; b learns of a's deletion first.
    edit(a, 0, 1);
    edit(b, 0, 1);
    send(a, b);
    ack(a);

    // b's undo cancels its own deletion while a's still holds `a`, so b's
    // text does not change. Its change has to reach a all the same.
    a.history.undo();
    b.history.undo();
    expect(text(b)).toBe('bcdefgh');
    send(b, a);
    send(a, b);

    expect(text(a)).toBe('abcdefgh');
    expect(text(b)).toBe('abcdefgh');
  });

  it('redo leaves alone a piece removed in its view', () => {
    const [a, b] = replicas('abcdefgh');
    edit(a, 0, 1);
    edit(b, 0, 3);
    send(b, a);
    ack(b);
    // b undoes before a hears of it, so in a's view `a` stays removed by b's
    // deletion: a's undo and redo leave it removed, and the redo must not
    // remove it on b, where b's undo already revived it.
    b.history.undo();
    a.history.undo();
    a.history.redo();
    send(a, b);
    send(b, a);

    expect(text(a)).toBe(text(b));
    expect(text(a)).toBe('abcdefgh');
  });

  it('recreates a purged piece before the piece that follows it', () => {
    const [a, b] = replicas('abcdefghij');
    edit(a, 1, 3);
    edit(a, 0, 1);
    // b splits `defghij` by removing `e`, so two pieces of the insertion
    // survive after the gap a's undo will recreate.
    edit(b, 4, 5);
    send(a, b);
    ack(a);
    expect(b.garbageCollect(b.getVersionVector())).toBeGreaterThan(0);

    // a revives `a` and removes `d`. On b, `a` must come back before `d`:
    // placed after a later piece, a's removal would run from `a` to the end
    // of the text.
    a.history.undo();
    edit(a, 1, 2);
    exchange(a, b);

    expect(text(a)).toBe('afghij');
    expect(text(b)).toBe('afghij');
  });

  it('keeps a piece until its cancelled removals are known everywhere', () => {
    const [a, b] = replicas('abc');
    const c = fromSnapshot(a);
    // a and b remove `b` concurrently; c hears only of a's removal and
    // removes the text around it.
    edit(a, 1, 2);
    edit(b, 1, 2);
    send(a, c);
    edit(c, 0, 2);

    // a undoes its removal. b learns all of it, so only b's own removal
    // holds `b` there; c still knows nothing of a's undo.
    send(a, b);
    ack(a);
    a.history.undo();
    send(a, b);
    send(b, a, c);
    ack(b);
    b.garbageCollect(minVV(a, b, c));

    // b's undo revives `b`; c's removal, which saw `b` removed by a, must
    // leave it alone on b as on a, whether or not b purged it.
    b.history.undo();
    send(b, a, c);
    send(c, a, b);
    send(a, c);

    expect(text(a)).toBe('b');
    expect(text(b)).toBe('b');
    expect(text(c)).toBe('b');
  });

  it('links a recreated piece to the nearest surviving neighbours', () => {
    const [a, b] = replicas('abcdefghij');
    // a removes `g`, then `h`; b collects both.
    edit(a, 6, 7);
    edit(a, 6, 7);
    send(a, b);
    ack(a);
    expect(b.garbageCollect(b.getVersionVector())).toBeGreaterThan(0);

    // b removes `f`, the piece before the gap, and a learns of it.
    edit(b, 5, 6);
    send(b, a);
    ack(b);

    // a's undo recreates `h` on b, which then collects `f` too: `f` still
    // pointed past the recreated `h`, so purging it must not hand `ij` an
    // insertion predecessor that skips `h`.
    a.history.undo();
    send(a, b);
    ack(a);
    expect(b.garbageCollect(minVV(a, b))).toBeGreaterThan(0);

    // An edit ending right after `h` resolves through `ij`'s predecessor.
    edit(a, 5, 6);
    send(a, b);

    expect(text(a)).toBe('abcdeij');
    expect(text(b)).toBe('abcdeij');
  });

  it('keeps a recreated piece out of a deletion that saw it removed', () => {
    const [a, b] = replicas('abc');
    const c = fromSnapshot(a);
    edit(b, 1, 2);
    send(b, a, c);
    ack(b);
    expect(a.garbageCollect(minVV(a, b, c))).toBeGreaterThan(0);

    // b undoes; c, which saw `b` removed but not the undo, removes the text
    // around it. a recreates `b` from the undo, so the recreated node has to
    // answer c's view as b's own ledger does.
    b.history.undo();
    edit(c, 0, 2);
    send(b, a, c);
    send(c, a, b);

    expect(text(a)).toBe('b');
    expect(text(b)).toBe('b');
    expect(text(c)).toBe('b');
  });

  it('loads a snapshot whose removal events break the rules', () => {
    const [a] = replicas('abc');
    edit(a, 1, 2);
    const bytes = converter.snapshotToBytes(a.getRootObject(), new Map());

    // Repeat removed_at as an event: no undo can produce that.
    const pbSnapshot = fromBinary(PbSnapshotSchema, bytes);
    const root = pbSnapshot.root!.body;
    if (root.case !== 'jsonObject') {
      throw new Error('expected an object root');
    }
    const textBody = root.value.nodes[0].element!.body;
    if (textBody.case !== 'text') {
      throw new Error('expected a text');
    }
    let removed = 0;
    for (const node of textBody.value.nodes) {
      if (node.removedAt) {
        node.removalEvents = [node.removedAt];
        removed++;
      }
    }
    expect(removed).toBeGreaterThan(0);

    // The bytes are refused rather than read as removed_at alone: a replica
    // that kept only removed_at would answer a later concurrent deletion, or
    // an undo, differently from every replica holding the full ledger, and
    // diverge from then on without a word.
    expect(() =>
      converter.bytesToSnapshot(toBinary(PbSnapshotSchema, pbSnapshot)),
    ).toThrow(/removal_events/);
  });

  it('reads back a snapshot whose ledger it grew itself', () => {
    const [a] = replicas('abc');

    // A server holding this document writes the ledger into every snapshot
    // it builds, and a client has to be able to load that snapshot again.
    // Go churns past the 4096-event bound it puts on pushed payloads; the JS
    // SDK has no such bound, so a few hundred pairs exercise the same path.
    expect(churn(a, 300)).toBeGreaterThan(512);
    const b = fromSnapshot(a);
    expect(text(b)).toBe('abc');
  });

  it('drops cancelled removals every replica knows', () => {
    const [a, b] = replicas('abcdefgh');
    for (let i = 0; i < 5; i++) {
      edit(a, 0, 8);
      a.history.undo();
      exchange(a, b);
    }
    // Every removal is cancelled, but only a vector both replicas have seen
    // lets the pairs go; until then they decide later deletions.
    expect(events(a)).toBeGreaterThan(0);
    a.garbageCollect(minVV(a, b));
    expect(events(a)).toBe(0);
    expect(text(a)).toBe('abcdefgh');
  });

  it('carries a cancelled removal through a snapshot', () => {
    const [a, b] = replicas('abcdefgh');
    // a deletes `d` and undoes it; the pair stays in the ledger while b has
    // not seen the cancel, so the snapshot has to carry both halves.
    edit(a, 3, 4);
    a.history.undo();
    expect(events(a)).toBeGreaterThan(0);

    const c = fromSnapshot(a);
    expect(events(c)).toBeGreaterThan(0);
    expect(text(c)).toBe('abcdefgh');

    // The replica loaded from that snapshot answers a later concurrent
    // deletion as the one that wrote it does: b never saw the undo, so its
    // deletion of `d` holds the piece removed on both.
    edit(b, 3, 4);
    send(a, b);
    send(b, a, c);
    expect(text(a)).toBe('abcefgh');
    expect(text(c)).toBe(text(a));
  });

  it('reverses an undo that found nothing left to undo', () => {
    const [a, b] = replicas('ab');
    // b inserts `X`, then deletes `a` and undoes that deletion, leaving one
    // entry on each stack.
    edit(b, 2, 2, 'X');
    edit(b, 0, 1);
    b.history.undo();
    exchange(a, b);
    expect(text(b)).toBe('abX');

    // a removes `X`; b's undo of its own insertion then finds nothing live to
    // re-remove, so its reverse names no span.
    edit(a, 2, 3);
    exchange(a, b);
    b.history.undo();
    exchange(a, b);
    expect(text(b)).toBe('ab');

    // That reverse still has to be pushed: dropping it would leave the redo
    // stack one entry short, and this redo would re-run the deletion of `a`
    // instead of doing nothing.
    b.history.redo();
    exchange(a, b);
    expect(text(b)).toBe('ab');
    expect(text(a)).toBe('ab');
  });
});
