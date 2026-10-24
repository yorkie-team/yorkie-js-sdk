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
import { DedupCounter } from '@yorkie-js/sdk/src/document/json/counter';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { PresenceChangeType } from '@yorkie-js/sdk/src/document/presence/change';
import { PresenceChange_ChangeType as PbPresenceChangeType } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

type TestDoc = { uv?: DedupCounter; k?: string };

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

  it('decodes DELETE as a clear, not as an empty presence', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((r, p) => {
      r.k = 'v';
      p.set({ name: 'a' });
    });
    const actorID = doc.getChangeID().getActorID();

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = PbPresenceChangeType.DELETE;
    pbPack.changes[0].presenceChange!.presence = undefined;

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.deepEqual(change.getPresenceChange(), {
      type: PresenceChangeType.Clear,
    });

    // The actor is dropped from the map rather than left there holding an
    // empty presence, and the operations of the change still apply.
    const presences = new Map<string, { name?: string }>([
      [actorID, { name: 'a' }],
    ]);
    const root = CRDTRoot.create();
    change.execute(root, presences, OpSource.Remote);
    assert.isFalse(presences.has(actorID));
    assert.equal(root.getObject().toJSON(), '{"k":"v"}');
  });

  it('decodes UNSPECIFIED as no presence change at all', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((r, p) => {
      r.k = 'v';
      p.set({ name: 'a' });
    });
    const actorID = doc.getChangeID().getActorID();

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = PbPresenceChangeType.UNSPECIFIED;
    pbPack.changes[0].presenceChange!.presence = undefined;

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.isFalse(change.hasPresenceChange());

    // The presence the actor already holds -- which may be this client's own,
    // on an echo of a change it pushed -- survives untouched.
    const presences = new Map<string, { name?: string }>([
      [actorID, { name: 'a' }],
    ]);
    const root = CRDTRoot.create();
    change.execute(root, presences, OpSource.Remote);
    assert.deepEqual(presences.get(actorID), { name: 'a' });
    assert.equal(root.getObject().toJSON(), '{"k":"v"}');
  });

  it('decodes a PUT that carries no presence as an empty one', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((_, p) => p.set({ name: 'a' }));

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = PbPresenceChangeType.PUT;
    pbPack.changes[0].presenceChange!.presence = undefined;

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.deepEqual(change.getPresenceChange(), {
      type: PresenceChangeType.Put,
      presence: {},
    });
  });

  it('keeps an unparsable presence value instead of failing the pack', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((_, p) => p.set({ name: 'a' }));

    const pbPack = converter.toChangePack(doc.createChangePack());
    // A peer -- another SDK, or a server API caller -- can store a presence
    // value this SDK did not JSON-encode. Letting `JSON.parse` throw would
    // fail the whole pack forever, since the checkpoint never advances past
    // a pack that fails.
    pbPack.changes[0].presenceChange!.presence!.data['name'] = 'not json{';

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.deepEqual(change.getPresenceChange(), {
      type: PresenceChangeType.Put,
      presence: { name: 'not json{' },
    });
  });

  it('decodes a PATCH that carries no presence as an empty one', function () {
    const doc = new Document<TestDoc, { name?: string }>('d');
    doc.update((_, p) => p.set({ name: 'a' }));

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = PbPresenceChangeType.PATCH;
    pbPack.changes[0].presenceChange!.presence = undefined;

    const change = converter
      .fromChangePack<{ name?: string }>(pbPack)
      .getChanges()[0];
    assert.deepEqual(change.getPresenceChange(), {
      type: PresenceChangeType.Patch,
      presence: {},
    });
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
