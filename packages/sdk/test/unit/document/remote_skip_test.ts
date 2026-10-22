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
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { IncreaseOperation } from '@yorkie-js/sdk/src/document/operation/increase_operation';
import {
  Counter,
  DedupCounter,
} from '@yorkie-js/sdk/src/document/json/counter';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  PresenceChange,
  PresenceChangeType,
} from '@yorkie-js/sdk/src/document/presence/change';
import { PresenceChange_ChangeType as PbPresenceChangeType } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

type TestDoc = { uv?: DedupCounter; c?: Counter; k?: string };

/**
 * `localChangesOf` returns the changes the given document has minted.
 */
function localChangesOf<T>(doc: Document<T>): Array<Change<never>> {
  return (doc as unknown as { localChanges: Array<Change<never>> })
    .localChanges;
}

/**
 * `sourceWithCounter` returns a document holding a dedup counter and the
 * ticket the counter was created at.
 */
function sourceWithCounter(): {
  doc: Document<TestDoc>;
  counterCreatedAt: TimeTicket;
} {
  const doc = new Document<TestDoc>('d');
  let counterCreatedAt!: TimeTicket;
  doc.update((r) => {
    r.uv = new DedupCounter();
    counterCreatedAt = (r.uv as DedupCounter).getID();
  });
  return { doc, counterCreatedAt };
}

/**
 * `remoteIncrease` rebuilds the given document's last change with a single
 * increase operation on the counter -- the shape a non-SDK writer can push and
 * the server stores.
 */
function remoteIncrease(
  doc: Document<TestDoc>,
  counterCreatedAt: TimeTicket,
  value: number,
  actor?: string,
): Change<never> {
  const changes = localChangesOf(doc);
  const id = changes[changes.length - 1].getID();
  return Change.create<never>({
    id,
    operations: [
      IncreaseOperation.create(
        counterCreatedAt,
        Primitive.of(value, id.createTimeTicket(1)),
        id.createTimeTicket(2),
        actor,
      ),
    ],
  });
}

/**
 * `presenceOf` returns the presence a decoded change carries, if any.
 */
function presenceOf(
  change?: PresenceChange<{ name?: string }>,
): Partial<{ name?: string }> | undefined {
  return (change as { presence?: Partial<{ name?: string }> } | undefined)
    ?.presence;
}

describe('a remote change this SDK cannot apply', function () {
  it('applies a dedup increase that carries an actor and a unit delta', function () {
    const { doc, counterCreatedAt } = sourceWithCounter();
    const target = new Document<TestDoc>('d');
    target.applyChange(localChangesOf(doc)[0] as never, OpSource.Remote);

    // Skipping must not swallow the applicable shape: one actor, delta 1.
    target.applyChange(
      remoteIncrease(doc, counterCreatedAt, 1, 'actor-a'),
      OpSource.Remote,
    );
    assert.equal(target.getRoot().uv!.getValue(), 1);

    // The same actor again is deduplicated, a second actor counts.
    target.applyChange(
      remoteIncrease(doc, counterCreatedAt, 1, 'actor-a'),
      OpSource.Remote,
    );
    assert.equal(target.getRoot().uv!.getValue(), 1);
    target.applyChange(
      remoteIncrease(doc, counterCreatedAt, 1, 'actor-b'),
      OpSource.Remote,
    );
    assert.equal(target.getRoot().uv!.getValue(), 2);
  });

  it('skips a remote increase whose target is missing or not a counter', function () {
    const { doc, counterCreatedAt } = sourceWithCounter();
    const target = new Document<TestDoc>('d');
    target.applyChange(localChangesOf(doc)[0] as never, OpSource.Remote);
    const root = (target as unknown as { root: CRDTRoot }).root;

    // A target this document never saw, and a target that is not a counter:
    // both are stored changes that can never be applied here.
    doc.update((r) => {
      r.k = 'v';
    });
    target.applyChange(localChangesOf(doc)[1] as never, OpSource.Remote);
    const stringCreatedAt = localChangesOf(doc)[1]
      .getOperations()[0]
      .getEffectedCreatedAt();
    const missing = remoteIncrease(
      doc,
      counterCreatedAt.setActor('ffffffffffffffffffffffff'),
      1,
      'actor-a',
    ).getOperations()[0];
    const notACounter = remoteIncrease(
      doc,
      stringCreatedAt,
      1,
      'actor-a',
    ).getOperations()[0];

    for (const op of [missing, notACounter]) {
      assert.isUndefined(op.execute(root, OpSource.Remote));
      assert.throws(() => op.execute(root, OpSource.Local), YorkieError);
    }
    assert.equal(target.getRoot().uv!.getValue(), 0);
  });

  it('skips a dedup increase that carries no actor', function () {
    const { doc, counterCreatedAt } = sourceWithCounter();
    const target = new Document<TestDoc>('d');
    target.applyChange(localChangesOf(doc)[0] as never, OpSource.Remote);

    // A later change in the same pack must still land: the point of skipping
    // is that one unapplicable change does not wedge the document.
    doc.update((r) => {
      r.k = 'v';
    });
    const bad = remoteIncrease(doc, counterCreatedAt, 1);
    const good = localChangesOf(doc)[1];
    const pack = new ChangePack<never>(
      'd',
      Checkpoint.of(2n, 0),
      false,
      [bad, good as never],
      InitialVersionVector,
    );

    target.applyChangePack(pack);

    assert.equal(target.getRoot().uv!.getValue(), 0);
    assert.equal(target.getRoot().k, 'v');
    assert.equal(target.getCheckpoint().getServerSeq(), 2n);
  });

  it('skips a dedup increase whose delta the counter refuses', function () {
    const { doc, counterCreatedAt } = sourceWithCounter();
    const target = new Document<TestDoc>('d');
    target.applyChange(localChangesOf(doc)[0] as never, OpSource.Remote);

    const bad = remoteIncrease(doc, counterCreatedAt, 2, 'actor-a');
    assert.doesNotThrow(() => target.applyChange(bad, OpSource.Remote));
    assert.equal(target.getRoot().uv!.getValue(), 0);
  });

  it('still reports a local dedup increase that cannot be applied', function () {
    const { doc, counterCreatedAt } = sourceWithCounter();
    const target = new Document<TestDoc>('d');
    target.applyChange(localChangesOf(doc)[0] as never, OpSource.Remote);
    const root = (target as unknown as { root: CRDTRoot }).root;

    // The caller of `update`/undo/redo asked for the mutation and matches on
    // the code the operation threw, so only the pull path skips.
    for (const source of [OpSource.Local, OpSource.UndoRedo]) {
      const noActor = remoteIncrease(
        doc,
        counterCreatedAt,
        1,
      ).getOperations()[0];
      assert.throws(
        () => noActor.execute(root, source),
        YorkieError,
        'dedup counter requires actor',
      );

      const badDelta = remoteIncrease(
        doc,
        counterCreatedAt,
        2,
        'actor-a',
      ).getOperations()[0];
      assert.throws(
        () => badDelta.execute(root, source),
        YorkieError,
        'dedup counter only supports increment by 1',
      );
    }
  });

  it('skips a queued increase the snapshot made unapplicable', function () {
    // A peer removed the counter while this replica was offline, so the
    // increase queued in `localChanges` has no target on the snapshot root.
    // The replay `applySnapshot` performs runs under `Local`, not `Remote`,
    // and a throw there leaves the checkpoint behind the snapshot -- the
    // server then redelivers it forever, which is the very wedge the skip
    // exists to prevent.
    const seed = new Document<TestDoc>('d');
    seed.update((r) => {
      r.c = new Counter(0);
    });
    const target = new Document<TestDoc>('d');
    target.applyChange(localChangesOf(seed)[0] as never, OpSource.Remote);
    target.update((r) => r.c!.increase(1));
    assert.lengthOf(localChangesOf(target), 1);

    const peer = new Document<TestDoc>('d');
    peer.update((r) => {
      r.k = 'v';
    });
    const bytes = converter.snapshotToBytes(peer.getRootObject(), new Map());

    assert.doesNotThrow(() =>
      target.applySnapshot(2n, peer.getVersionVector(), bytes),
    );
    assert.equal(target.getRoot().k, 'v');
    assert.isUndefined(target.getRoot().c);
  });

  it('decodes a DELETE presence change as a clear', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((_, p) => p.set({ name: 'a' }));
    const actorID = doc.getChangeID().getActorID();

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = PbPresenceChangeType.DELETE;
    pbPack.changes[0].presenceChange!.presence = undefined;

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.equal(change.getPresenceChange()!.type, PresenceChangeType.Clear);

    // DELETE and CLEAR both drop the actor's presence.
    const presences = new Map([[actorID, { name: 'a' }]]);
    change.execute(CRDTRoot.create(), presences, OpSource.Remote);
    assert.isFalse(presences.has(actorID));
  });

  it('decodes an UNSPECIFIED presence change as no presence change', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((r, p) => {
      r.k = 'v';
      p.set({ name: 'a' });
    });
    const actorID = doc.getChangeID().getActorID();

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = PbPresenceChangeType.UNSPECIFIED;

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.equal(change.getPresenceChange(), undefined);

    // The operations of the change still apply; only the presence it names
    // nothing about is dropped.
    const presences = new Map<string, { name?: string }>();
    const root = CRDTRoot.create();
    change.execute(root, presences, OpSource.Remote);
    assert.isFalse(presences.has(actorID));
    assert.equal(root.getObject().toJSON(), '{"k":"v"}');
  });

  it('decodes a PUT or PATCH that carries no presence as an empty one', function () {
    for (const type of [PbPresenceChangeType.PUT, PbPresenceChangeType.PATCH]) {
      const doc = new Document<TestDoc, { name?: string }>('d');
      doc.update((_, p) => p.set({ name: 'a' }));

      // `presence` is an optional message on the wire, so a non-SDK writer can
      // store a PUT without one. Decoding must not throw a raw TypeError.
      const pbPack = converter.toChangePack(doc.createChangePack());
      pbPack.changes[0].presenceChange!.type = type;
      pbPack.changes[0].presenceChange!.presence = undefined;

      const change = converter
        .fromChangePack<{ name?: string }>(pbPack)
        .getChanges()[0];
      assert.deepEqual(presenceOf(change.getPresenceChange()), {});
    }
  });

  it('decodes a presence value that is not JSON as the raw string', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((_, p) => p.set({ name: 'a' }));

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.presence!.data = { name: 'raw' };

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.deepEqual(presenceOf(change.getPresenceChange()), { name: 'raw' });
  });

  it('rejects a presence change outside the enum', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((_, p) => p.set({ name: 'a' }));

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = 42 as PbPresenceChangeType;

    assert.throws(
      () => converter.fromChangePack<{ name?: string }>(pbPack),
      YorkieError,
    );
    assert.equal(
      (() => {
        try {
          converter.fromChangePack<{ name?: string }>(pbPack);
        } catch (e) {
          return (e as YorkieError).code;
        }
      })(),
      Code.ErrInvalidType,
    );
  });
});
