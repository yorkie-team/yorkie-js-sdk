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

import { describe, it, assert, afterEach, vi } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Counter, Text, Tree, JSONArray } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { fromBinary } from '@bufbuild/protobuf';
import { SnapshotSchema as PbSnapshotSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  ActorID,
  InitialActorID,
} from '@yorkie-js/sdk/src/document/time/actor_id';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { SetOperation } from '@yorkie-js/sdk/src/document/operation/set_operation';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  countActors,
  maxVectorOf,
  ticketsOf,
} from '@yorkie-js/sdk/test/helper/helper';

const actorA = '000000000000000000000001';
const actorB = '000000000000000000000002';

type TestDoc = Document<any, Indexable>;

/**
 * `internals` exposes the private state under test.
 */
function internals(doc: TestDoc) {
  return doc as unknown as {
    clone?: unknown;
    root: CRDTRoot;
    localChanges: Array<Change<Indexable>>;
    presences: Map<ActorID, Indexable>;
    onlineClients: Set<ActorID>;
  };
}

/**
 * `fillEverything` edits a detached document with every kind of element, so
 * every place a ticket can hide is populated before the attach.
 */
function fillEverything(doc: TestDoc): void {
  doc.update((r, p) => {
    const text = new Text();
    r.text = text;
    r.text.edit(0, 0, 'hello');
    r.text.edit(1, 3, 'XY');
    r.text.setStyle(0, 2, { b: '1' });

    r.obj = { k: 'v', arr: [1, 2, 3] };

    r.cnt = new Counter(1);
    r.cnt.increase(2);

    r.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
    });

    r.gone = 'x';
    p.set({ cursor: '1' });
  });
  doc.update((r) => {
    r.tree.edit(2, 2, { type: 'text', value: 'c' });
    r.text.edit(0, 1, '');
    delete r.gone;
    const arr = r.obj.arr as JSONArray<number>;
    const first = arr.getElementByIndex!(0);
    const last = arr.getElementByIndex!(2);
    arr.moveBefore!(first.getID!(), last.getID!());
  });
}

/**
 * `actorsOf` counts, per actor, the non-initial tickets in the document's
 * root and in the change pack it would push.
 */
function actorsOf(doc: TestDoc): Map<string, number> {
  const snapshot = fromBinary(
    PbSnapshotSchema,
    converter.snapshotToBytes(doc.getRootObject(), new Map()),
  );
  const pack = converter.toChangePack(doc.createChangePack());

  return countActors([...ticketsOf(snapshot), ...ticketsOf(pack)]);
}

/**
 * `serverBuild` rebuilds a document from the change packs the given documents
 * would push, the way the server does.
 */
function serverBuild(...docs: Array<TestDoc>): TestDoc {
  const built: TestDoc = new Document(docs[0].getKey());
  for (const doc of docs) {
    built.applyChanges(wire(doc), OpSource.Remote);
  }
  return built;
}

/**
 * `wire` returns the local changes of the given document as they arrive on
 * another replica.
 */
function wire(doc: TestDoc): Array<Change<Indexable>> {
  const pb = converter.toChangePack(doc.createChangePack());
  return converter.fromChangePack<Indexable>(pb).getChanges();
}

/**
 * `reissue` re-issues the document's tickets as `Client.attach` does.
 */
function reissue(doc: TestDoc, actor: ActorID): void {
  doc.setActor(actor, { reissue: true });
}

/**
 * `localActorsOf` returns the actor of every local change the document would
 * push.
 */
function localActorsOf(doc: TestDoc): Array<ActorID> {
  return doc
    .createChangePack()
    .getChanges()
    .map((c) => c.getID().getActorID());
}

/**
 * `assertLocalVectors` checks that every local change the document would
 * push carries a version vector naming only the given actor, at that
 * change's own lamport. An entry left under the initial actor would make
 * every replica wait on an actor that never syncs again.
 */
function assertLocalVectors(doc: TestDoc, actor: ActorID): void {
  const changes = doc.createChangePack().getChanges();
  assert.isNotEmpty(changes);
  for (const [i, c] of changes.entries()) {
    const vector = c.getID().getVersionVector();
    for (const [id] of vector) {
      assert.equal(id, actor, `change ${i}`);
    }
    assert.equal(vector.get(actor), c.getID().getLamport(), `change ${i}`);
  }
}

/**
 * `rootBytes` encodes the root of the given document.
 */
function rootBytes(doc: TestDoc): Uint8Array {
  return converter.objectToBytes(doc.getRootObject());
}

/**
 * `mulberry32` is a small seeded PRNG, so a seed replays the same history.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `fillRandomly` edits a detached document with a seeded mix of text, tree,
 * array and object edits, removals and undo/redo. An edit the current state
 * cannot take is skipped.
 */
function fillRandomly(doc: TestDoc, seed: number): void {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);

  doc.update((r) => {
    r.t = new Text();
    r.t.edit(0, 0, 'abcdef');
    r.o = { k: 'v', t: new Text() };
    r.o.t.edit(0, 0, 'ghij');
    r.a = [1, new Text()];
    r.a[1].edit(0, 0, 'klmn');
    r.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
    });
  });

  const texts = [(r: any) => r.t, (r: any) => r.o.t, (r: any) => r.a[1]];
  for (let step = 0; step < 16; step++) {
    try {
      switch (pick(8)) {
        case 0:
        case 1:
          doc.update((r) => {
            const text = texts[pick(texts.length)](r);
            const from = pick(text.length + 1);
            const to = from + pick(text.length - from + 1);
            text.edit(from, to, pick(2) ? 'x' : '');
          });
          break;
        case 2:
          doc.update((r) => {
            const text = texts[pick(texts.length)](r);
            const from = pick(text.length + 1);
            text.setStyle(from, from + pick(text.length - from + 1), {
              b: `${pick(3)}`,
            });
          });
          break;
        case 3:
          doc.update((r) => {
            const size = r.tree.getSize();
            const at = 1 + pick(size - 1);
            if (pick(2)) {
              r.tree.edit(at, at, { type: 'text', value: 'q' });
            } else {
              r.tree.edit(at, at, undefined, 1);
            }
          });
          break;
        case 4:
          doc.update((r) => {
            if (pick(2)) {
              r.a.push(pick(10));
            } else {
              r.o.k = `${pick(10)}`;
            }
          });
          break;
        case 5:
          doc.update((r) => {
            const which = pick(3);
            if (which === 0) delete r.t;
            if (which === 1) delete r.o;
            if (which === 2) r.a.delete(1);
          });
          break;
        case 6:
          if (doc.history.canUndo()) doc.history.undo();
          break;
        case 7:
          if (doc.history.canRedo()) doc.history.redo();
          break;
      }
    } catch {
      // The picked target is gone or the range does not fit; skip it.
    }
  }
}

/**
 * `fuzzTimeout` is the budget the seeded sweep gets. CI caps `testTimeout` at
 * 5s, and 300 seeded histories replayed through a re-issue run past that once
 * coverage instrumentation is in the way. The sweep is synchronous, so the cap
 * cannot interrupt it: it only turns a sweep that already finished, and
 * passed, into a failure. Locally the config sets no limit and this keeps it
 * that way.
 */
const fuzzTimeout = process.env.CI === 'true' ? 180_000 : Infinity;

describe('Document.setActor with reissue', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves no ticket under the initial actor', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    const before = doc.toSortedJSON();
    assert.isAbove(actorsOf(doc).get(InitialActorID) ?? 0, 0);

    reissue(doc, actorA);

    const actors = actorsOf(doc);
    assert.isUndefined(actors.get(InitialActorID), `${[...actors]}`);
    assert.isAbove(actors.get(actorA) ?? 0, 0);
    assert.equal(doc.toSortedJSON(), before);

    const vector = doc.getVersionVector();
    assert.isFalse(vector.has(InitialActorID));
    assert.equal(vector.get(actorA), doc.getChangeID().getLamport());
    assert.equal(doc.getChangeID().getActorID(), actorA);

    assertLocalVectors(doc, actorA);

    const presences = internals(doc).presences;
    assert.isTrue(presences.has(actorA));
    assert.isFalse(presences.has(InitialActorID));
  });

  it('builds the same root the server builds', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    reissue(doc, actorA);

    const built = serverBuild(doc);
    assert.equal(doc.toSortedJSON(), built.toSortedJSON());
    assert.deepEqual(rootBytes(doc), rootBytes(built));
  });

  it('continues edits under the new actor', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    reissue(doc, actorA);

    doc.update((r) => {
      r.text.edit(0, 0, 'Z');
      r.tree.edit(1, 1, { type: 'text', value: 'Q' });
      r.obj.k = 'w';
    });
    assert.isUndefined(actorsOf(doc).get(InitialActorID));
    assert.isAbove(actorsOf(doc).get(actorA) ?? 0, 0);
    assertLocalVectors(doc, actorA);

    assert.equal(doc.toSortedJSON(), serverBuild(doc).toSortedJSON());
  });

  it('re-issues a retried attach to the next actor', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    reissue(doc, actorA);
    reissue(doc, actorB);

    const actors = actorsOf(doc);
    assert.isUndefined(actors.get(InitialActorID));
    assert.isUndefined(actors.get(actorA));
    assert.isAbove(actors.get(actorB) ?? 0, 0);
    assertLocalVectors(doc, actorB);
  });

  it('clears the undo history it invalidates', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    assert.isTrue(doc.history.canUndo());

    reissue(doc, actorA);
    assert.isFalse(doc.history.canUndo());
    assert.isUndefined(internals(doc).clone);
  });

  it('replays an undone change under the source it ran with', function () {
    // `SetOperation`/`RemoveOperation` skip an operation whose target sits
    // under a removed parent, and `OpSource.UndoRedo` is the only source they
    // look at. A change an undo produced must therefore be replayed as
    // `UndoRedo`, or the rebuilt root can differ from the live one.
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.obj = { k: 'v' };
    });
    doc.update((r) => {
      r.obj.k = 'w';
    });
    doc.history.undo();
    const before = doc.toSortedJSON();

    const sources: Array<OpSource> = [];
    const execute = Change.prototype.execute;
    vi.spyOn(Change.prototype, 'execute').mockImplementation(function (
      this: Change<Indexable>,
      root: CRDTRoot,
      presences: Map<ActorID, Indexable>,
      source: OpSource,
    ) {
      sources.push(source);
      return execute.call(this, root, presences, source);
    } as typeof Change.prototype.execute);

    reissue(doc, actorA);
    vi.restoreAllMocks();

    assert.equal(sources.length, internals(doc).localChanges.length);
    assert.deepEqual(sources, [
      OpSource.Local,
      OpSource.Local,
      OpSource.UndoRedo,
    ]);
    assert.equal(doc.toSortedJSON(), before);
    assert.isUndefined(actorsOf(doc).get(InitialActorID));
  });

  it('replays an undone change under its own source after a snapshot', function () {
    // `applySnapshot` re-applies the queued local changes on top of the
    // snapshot root, and `reissueActor` is not the only replay that has to
    // honour the source each change ran under: a change an undo produced is
    // replayed as `UndoRedo` here too. See `replaySourceOf`.
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.obj = { k: 'v' };
    });
    doc.update((r) => {
      r.obj.k = 'w';
    });
    doc.history.undo();
    const undoSeq = internals(doc).localChanges[2].getID().getClientSeq();

    const replayed: Array<[number, OpSource]> = [];
    const execute = Change.prototype.execute;
    vi.spyOn(Change.prototype, 'execute').mockImplementation(function (
      this: Change<Indexable>,
      root: CRDTRoot,
      presences: Map<ActorID, Indexable>,
      source: OpSource,
    ) {
      replayed.push([this.getID().getClientSeq(), source]);
      return execute.call(this, root, presences, source);
    } as typeof Change.prototype.execute);

    doc.applySnapshot(1n, maxVectorOf([]), undefined);
    vi.restoreAllMocks();

    const sources = replayed
      .filter(([clientSeq]) => clientSeq === undoSeq)
      .map(([, source]) => source);
    assert.isNotEmpty(sources);
    assert.deepEqual([...new Set(sources)], [OpSource.UndoRedo]);
  });

  it('carries the undo mark through the persisted change log', function () {
    // The offline-persistence layer writes the queued changes as structs and
    // replays them after a reload (`restoreAppendedChanges`). The mark that
    // says a change ran as `UndoRedo` has to survive that round trip, or the
    // replay runs an operation the undo had skipped.
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.obj = { k: 'v' };
    });
    doc.update((r) => {
      r.obj.k = 'w';
    });
    doc.history.undo();

    const changes = internals(doc).localChanges;
    assert.deepEqual(
      changes.map((change) => change.isUndoRedo()),
      [false, false, true],
    );
    const restored = changes.map((change) =>
      Change.fromStruct<Indexable>(change.toStruct()),
    );
    assert.deepEqual(
      restored.map((change) => change.isUndoRedo()),
      [false, false, true],
    );
  });

  it('does not re-issue a document that has synced', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    const pack = doc.createChangePack();
    doc.applyChangePack(
      ChangePack.create(
        doc.getKey(),
        pack.getCheckpoint().increaseClientSeq(0).forward(Checkpoint.of(1n, 0)),
        false,
        [],
        doc.getVersionVector(),
      ),
    );
    doc.update((r) => {
      r.late = 'v';
    });

    reissue(doc, actorA);
    assert.isAbove(actorsOf(doc).get(InitialActorID) ?? 0, 0);

    // The fallback is what sets the actor on a document that has synced, so
    // it has to reach the change ID and every buffered local change.
    assert.equal(doc.getChangeID().getActorID(), actorA);
    const local = localActorsOf(doc);
    assert.isNotEmpty(local);
    for (const actor of local) {
      assert.equal(actor, actorA);
    }
  });

  it('does not re-issue a document that absorbed a snapshot', function () {
    // The checkpoint, the status and the version vector all still look
    // untouched after a snapshot pack carrying the initial checkpoint, so
    // only the absorbed guard keeps the rebuild -- which can reproduce the
    // local changes and nothing else -- away from the root.
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    const snapshot = converter.snapshotToBytes(doc.getRootObject(), new Map());
    doc.applyChangePack(
      ChangePack.create(
        doc.getKey(),
        Checkpoint.of(0n, 0),
        false,
        [],
        doc.getVersionVector(),
        snapshot,
      ),
    );
    assert.isTrue(doc.hasLocalChanges());
    const before = doc.toSortedJSON();

    reissue(doc, actorA);

    assert.equal(doc.toSortedJSON(), before);
    assert.isAbove(actorsOf(doc).get(InitialActorID) ?? 0, 0);
  });

  it('does not re-issue a document restored from bytes', function () {
    const source: TestDoc = new Document('d');
    fillEverything(source);
    const doc = Document.fromBytes<Indexable, Indexable>(
      'd',
      source.toBytes(),
    ) as TestDoc;
    assert.isTrue(doc.hasLocalChanges());

    reissue(doc, actorA);
    assert.isAbove(actorsOf(doc).get(InitialActorID) ?? 0, 0);
  });

  it('is plain setActor without the option', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    const before = doc.toSortedJSON();
    const initial = actorsOf(doc).get(InitialActorID) ?? 0;
    assert.isTrue(doc.history.canUndo());

    doc.setActor(actorA);

    assert.equal(doc.getChangeID().getActorID(), actorA);
    assert.equal(doc.toSortedJSON(), before);
    assert.isTrue(doc.history.canUndo());
    for (const actor of localActorsOf(doc)) {
      assert.equal(actor, actorA);
    }
    // The tickets inside the operations and the root keep the initial actor.
    const left = actorsOf(doc).get(InitialActorID) ?? 0;
    assert.isAbove(left, 0);
    assert.isBelow(left, initial);
  });

  it('only sets the actor of an empty document', function () {
    const doc: TestDoc = new Document('d');
    reissue(doc, actorA);
    assert.equal(doc.getChangeID().getActorID(), actorA);
    assert.equal(doc.toSortedJSON(), '{}');
  });

  for (const editAfterUndo of [false, true]) {
    it(`keeps the content of a Text restored by undo (edit after: ${editAfterUndo})`, function () {
      // The wire carries a Text value without its content, so a re-issue
      // that round-trips a restoring Set would empty the Text locally, and
      // the replay of a later Edit on its nodes would fail.
      const doc: TestDoc = new Document('d');
      doc.update((r) => {
        r.t = new Text();
        r.t.edit(0, 0, 'hello');
        r.a = [new Text()];
        r.a[0].edit(0, 0, 'world');
      });
      doc.update((r) => {
        delete r.t;
        r.a.delete(0);
      });
      doc.history.undo();
      if (editAfterUndo) {
        doc.update((r) => {
          r.t.edit(2, 4, 'ZZ');
          r.a[0].edit(0, 1, 'W');
        });
      }
      const before = doc.toSortedJSON();

      reissue(doc, actorA);
      assert.equal(doc.toSortedJSON(), before);
      assert.isUndefined(actorsOf(doc).get(InitialActorID));
      assert.isAbove(actorsOf(doc).get(actorA) ?? 0, 0);
    });
  }

  for (const wrap of ['none', 'object', 'array'] as const) {
    it(`keeps the split links of a Text restored by undo (wrap: ${wrap})`, function () {
      // An Edit after the undo resolves its position through the restored
      // Text's insertion links. The value goes through its element encoding,
      // which has to carry them, or the replay puts the Edit elsewhere.
      const doc: TestDoc = new Document('d');
      const text = (r: any) =>
        wrap === 'none' ? r.t : wrap === 'object' ? r.o.t : r.a[0];
      doc.update((r) => {
        if (wrap === 'none') r.t = new Text();
        if (wrap === 'object') r.o = { t: new Text() };
        if (wrap === 'array') r.a = [new Text()];
        text(r).edit(0, 0, 'abcdef');
      });
      doc.update((r) => text(r).edit(2, 4, 'x'));
      doc.update((r) => {
        if (wrap === 'none') delete r.t;
        if (wrap === 'object') delete r.o;
        if (wrap === 'array') r.a.delete(0);
      });
      doc.history.undo();
      doc.update((r) => text(r).edit(0, 2, 'x'));
      const before = doc.toSortedJSON();

      reissue(doc, actorA);
      assert.equal(doc.toSortedJSON(), before);
      assert.isUndefined(actorsOf(doc).get(InitialActorID));
      if (wrap === 'object') {
        // A nested Text travels with its content, so the server builds it.
        assert.equal(serverBuild(doc).toSortedJSON(), before);
      }
    });
  }

  it('keeps tree splits, undo/redo, tree style and array set', function () {
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.tree = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
      });
    });
    doc.update((r) => {
      r.tree.edit(3, 3, undefined, 1);
    });
    doc.history.undo();
    doc.history.redo();
    doc.update((r) => {
      r.tree.style(0, 1, { a: 'b' });
      r.arr = [1, 2];
      r.arr.setValue!(0, 9);
      r.c = new Counter(1);
      r.c.increase(3);
    });
    const before = doc.toSortedJSON();
    const size = doc.getDocSize();
    const garbage = doc.getGarbageLen();

    reissue(doc, actorA);
    assert.equal(doc.toSortedJSON(), before);
    assert.deepEqual(doc.getDocSize(), size);
    assert.equal(doc.getGarbageLen(), garbage);
    assert.isUndefined(actorsOf(doc).get(InitialActorID));
    assert.isAbove(actorsOf(doc).get(actorA) ?? 0, 0);
    assert.equal(doc.toSortedJSON(), serverBuild(doc).toSortedJSON());
  });

  it('converges two documents that filled the same key', function () {
    const doc1: TestDoc = new Document('d');
    const doc2: TestDoc = new Document('d');
    for (const [doc, content] of [
      [doc1, 'one'],
      [doc2, 'two'],
    ] as const) {
      doc.update((r) => {
        r.k1 = new Text();
        r.k1.edit(0, 0, content);
      });
    }
    reissue(doc1, actorA);
    reissue(doc2, actorB);

    // The values no longer share a createdAt.
    const created1 = doc1.getRootObject().get('k1')!.getCreatedAt();
    const created2 = doc2.getRootObject().get('k1')!.getCreatedAt();
    assert.notEqual(created1.toIDString(), created2.toIDString());

    // doc1 reaches the server first; doc2's later Set wins by LWW on the
    // actor tie-break (same lamport, larger actor).
    const built = serverBuild(doc1, doc2);
    assert.equal(built.toSortedJSON(), '{"k1":[{"val":"two"}]}');

    const from1 = wire(doc1);
    const from2 = wire(doc2);
    doc1.applyChanges(from2, OpSource.Remote);
    doc2.applyChanges(from1, OpSource.Remote);
    assert.equal(doc1.toSortedJSON(), built.toSortedJSON());
    assert.equal(doc2.toSortedJSON(), built.toSortedJSON());
  });

  it('renames an online client entry to the re-issued actor', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    doc.addOnlineClient(InitialActorID);

    reissue(doc, actorA);

    const online = internals(doc).onlineClients;
    assert.isTrue(online.has(actorA));
    assert.isFalse(online.has(InitialActorID));
  });

  it('leaves the document untouched when the replay fails', function () {
    const doc: TestDoc = new Document('d');
    fillEverything(doc);
    const before = doc.toSortedJSON();
    const changes = internals(doc).localChanges;
    const root = internals(doc).root;

    vi.spyOn(SetOperation.prototype, 'execute').mockImplementation(() => {
      throw new Error('boom');
    });
    assert.throws(() => reissue(doc, actorA), 'boom');
    vi.restoreAllMocks();

    assert.strictEqual(internals(doc).localChanges, changes);
    assert.strictEqual(internals(doc).root, root);
    assert.equal(doc.toSortedJSON(), before);
    assert.equal(doc.getChangeID().getActorID(), InitialActorID);
    assert.isTrue(doc.history.canUndo());
  });

  it(
    'keeps the content of random pre-attach histories',
    function () {
      // Anything the wire drops from a value that a later edit relies on shows
      // up here as content that changes at attach.
      for (let seed = 1; seed <= 300; seed++) {
        const doc: TestDoc = new Document('d');
        fillRandomly(doc, seed);
        const before = doc.toSortedJSON();

        reissue(doc, actorA);
        assert.equal(doc.toSortedJSON(), before, `seed ${seed}`);
        assert.isUndefined(actorsOf(doc).get(InitialActorID), `seed ${seed}`);
      }
    },
    fuzzTimeout,
  );
});
