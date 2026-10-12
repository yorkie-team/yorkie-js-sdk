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
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import {
  PresenceChangeType,
  PresencePatchCapability,
} from '@yorkie-js/sdk/src/document/presence/change';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { PresenceChange_ChangeType as PbPresenceChangeType } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';

type TestPresence = {
  cursor?: { x: number; y: number };
  selection?: Array<string>;
  name?: string;
};

function createDoc(): Document<{ k?: string }, TestPresence> {
  return new Document<{ k?: string }, TestPresence>('presence-patch-test');
}

/**
 * `ack` hands the document a server pack that acknowledges everything pushed
 * so far, optionally advertising the given capabilities.
 */
function ack(
  doc: Document<{ k?: string }, TestPresence>,
  capabilities: Array<string>,
): void {
  const pack = doc.createChangePack();
  const changes = pack.getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  doc.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
      undefined,
      0n,
      capabilities,
    ),
  );
}

/**
 * `pendingPresenceTypes` lists the presence-change type of every change the
 * document still has to push.
 */
function pendingPresenceTypes(
  doc: Document<{ k?: string }, TestPresence>,
): Array<PresenceChangeType | undefined> {
  return doc
    .createChangePack()
    .getChanges()
    .map((change) => change.getPresenceChange()?.type);
}

describe('Presence patch', function () {
  it('sends a full put until the server advertises the capability', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ cursor: { x: 0, y: 0 } }));
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);

    // A reply without the capability keeps it on puts.
    ack(doc, []);
    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
  });

  it('patches once the capability and a base are both there', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a', cursor: { x: 0, y: 0 } }));
    ack(doc, [PresencePatchCapability]);

    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    const change = doc.createChangePack().getChanges()[0];
    const presenceChange = change.getPresenceChange()!;
    assert.equal(presenceChange.type, PresenceChangeType.Patch);
    assert.deepEqual(
      presenceChange.type === PresenceChangeType.Patch
        ? presenceChange.presence
        : undefined,
      { cursor: { x: 1, y: 1 } },
    );

    // The patch still carries the whole presence locally, so the document the
    // change applies to is not left holding the changed key alone.
    assert.deepEqual(
      presenceChange.type === PresenceChangeType.Patch
        ? presenceChange.full
        : undefined,
      { name: 'a', cursor: { x: 1, y: 1 } },
    );
    assert.deepEqual(doc.getPresenceForTest(doc.getChangeID().getActorID()), {
      name: 'a',
      cursor: { x: 1, y: 1 },
    });

    // Only the changed key goes on the wire.
    const pbChange = converter.toChangePack(doc.createChangePack()).changes[0];
    assert.equal(pbChange.presenceChange!.type, PbPresenceChangeType.PATCH);
    assert.deepEqual(Object.keys(pbChange.presenceChange!.presence!.data), [
      'cursor',
    ]);
  });

  it('accumulates the keys of several sets in one update', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);

    doc.update((_, p) => {
      p.set({ cursor: { x: 1, y: 1 } });
      p.set({ selection: ['id-1'] });
    });

    const presenceChange = doc
      .createChangePack()
      .getChanges()[0]
      .getPresenceChange()!;
    assert.equal(presenceChange.type, PresenceChangeType.Patch);
    assert.deepEqual(
      presenceChange.type === PresenceChangeType.Patch
        ? Object.keys(presenceChange.presence).sort()
        : [],
      ['cursor', 'selection'],
    );
  });

  it('puts again after a clear, which leaves the server no base', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    assert.isTrue(doc.isPresencePatchableForTest());

    doc.update((_, p) => p.clear());
    assert.isFalse(doc.isPresencePatchableForTest());

    doc.update((_, p) => p.set({ name: 'b' }));
    assert.deepEqual(pendingPresenceTypes(doc), [
      PresenceChangeType.Clear,
      PresenceChangeType.Put,
    ]);
  });

  it('puts a presence too large for the server to cache', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);

    // 4 KiB is the server's base limit, counting 64 B per key on top of the
    // key and value bytes.
    doc.update((_, p) => p.set({ selection: [`id-${'x'.repeat(5000)}`] }));
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
  });

  it('heals with a put when a reply drops the capability', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Patch]);

    // The push landed on an old server, which stored the patch as an empty
    // presence. Its reply advertises nothing, so a full put has to follow.
    ack(doc, []);
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
    const healed = doc.createChangePack().getChanges()[0].getPresenceChange()!;
    assert.deepEqual(
      healed.type === PresenceChangeType.Put ? healed.presence : undefined,
      { name: 'a', cursor: { x: 1, y: 1 } },
    );
  });

  it('rewrites the earliest pending patch into a put on a lost base', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    doc.update((_, p) => p.set({ selection: ['id-1'] }));
    assert.deepEqual(pendingPresenceTypes(doc), [
      PresenceChangeType.Patch,
      PresenceChangeType.Patch,
    ]);

    doc.restorePresencePatches();

    // Only the first one is rewritten: the server folds the rest in order, so
    // the put in front of them is the base they need.
    assert.deepEqual(pendingPresenceTypes(doc), [
      PresenceChangeType.Put,
      PresenceChangeType.Patch,
    ]);
    const first = doc.createChangePack().getChanges()[0].getPresenceChange()!;
    assert.deepEqual(
      first.type === PresenceChangeType.Put ? first.presence : undefined,
      { name: 'a', cursor: { x: 1, y: 1 } },
    );
  });

  it('still owes a heal while later patches stay queued', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    doc.update((_, p) => p.set({ selection: ['id-1'] }));

    doc.restorePresencePatches();
    assert.deepEqual(pendingPresenceTypes(doc), [
      PresenceChangeType.Put,
      PresenceChangeType.Patch,
    ]);

    // The second patch is still on its way to a server that may not take one,
    // so a reply without the capability has to heal rather than conclude that
    // the rewrite already left a put behind.
    ack(doc, []);
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
    const healed = doc.createChangePack().getChanges()[0].getPresenceChange()!;
    assert.deepEqual(
      healed.type === PresenceChangeType.Put ? healed.presence : undefined,
      { name: 'a', cursor: { x: 1, y: 1 }, selection: ['id-1'] },
    );
  });

  it('puts when an update removes a presence key', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    assert.isTrue(doc.isPresencePatchableForTest());

    // A patch names only the keys it carries and the server folds them onto
    // the base it holds, so a key this update drops would stay standing for
    // every peer. A removal has to be a put, which says what the whole
    // presence now is.
    doc.update((_, p) => p.set({ cursor: undefined }));
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
  });

  it('puts when an undo removes the key it introduced', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);

    doc.update((_, p) =>
      p.set(
        { cursor: { x: 1, y: 1 } },
        {
          addToHistory: true,
        },
      ),
    );
    ack(doc, [PresencePatchCapability]);
    assert.isTrue(doc.isPresencePatchableForTest());

    // The reverse presence of a `set` that introduced a key carries that key
    // with no previous value, so the undo removes it.
    doc.history.undo();
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
  });

  it('owes a put again after restoring from offline persistence', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    assert.isTrue(doc.isPresencePatchableForTest());

    const restored = Document.fromBytes<{ k?: string }, TestPresence>(
      doc.getKey(),
      doc.toBytes(),
    );
    assert.isFalse(restored.isPresencePatchableForTest());

    restored.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    assert.deepEqual(pendingPresenceTypes(restored), [PresenceChangeType.Put]);
  });

  it('owes a put again after an in-place restore', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    const bytes = doc.toBytes();

    // The in-place restore copies its fields one by one, so it has to carry
    // the presence-patch state across as the static factory does.
    const target = createDoc();
    target.restoreFromBytes(bytes);
    assert.isFalse(target.isPresencePatchableForTest());

    target.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    assert.deepEqual(pendingPresenceTypes(target), [PresenceChangeType.Put]);
  });

  it('carries a pending patch through persistence and replays it', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    const actorID = doc.getChangeID().getActorID();

    // The patch is still pending, so the envelope carries it -- along with the
    // local-only `full` copy a replay needs to rebuild the presence.
    const restored = Document.fromBytes<{ k?: string }, TestPresence>(
      doc.getKey(),
      doc.toBytes(),
    );
    const pending = restored.createChangePack().getChanges()[0];
    const presenceChange = pending.getPresenceChange()!;
    assert.equal(presenceChange.type, PresenceChangeType.Patch);
    assert.deepEqual(
      presenceChange.type === PresenceChangeType.Patch
        ? presenceChange.presence
        : undefined,
      { cursor: { x: 1, y: 1 } },
    );
    assert.deepEqual(restored.getPresenceForTest(actorID), {
      name: 'a',
      cursor: { x: 1, y: 1 },
    });

    // Replaying the log onto the snapshot it was taken against rebuilds the
    // same presence rather than the changed key alone.
    const replayed = createDoc();
    replayed.restoreAppendedChanges([pending.toStruct()]);
    assert.deepEqual(replayed.getPresenceForTest(actorID), {
      name: 'a',
      cursor: { x: 1, y: 1 },
    });
  });

  it('heals a restored patch the server stored as empty', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));

    // A restore knows nothing of the capability, but the queue it brings back
    // still holds a patch that is about to be pushed as one. An old server
    // stores that as an empty presence, so its reply has to heal.
    const restored = Document.fromBytes<{ k?: string }, TestPresence>(
      doc.getKey(),
      doc.toBytes(),
    );
    assert.deepEqual(pendingPresenceTypes(restored), [
      PresenceChangeType.Patch,
    ]);

    ack(restored, []);
    assert.deepEqual(pendingPresenceTypes(restored), [PresenceChangeType.Put]);
    const healed = restored
      .createChangePack()
      .getChanges()[0]
      .getPresenceChange()!;
    assert.deepEqual(
      healed.type === PresenceChangeType.Put ? healed.presence : undefined,
      { name: 'a', cursor: { x: 1, y: 1 } },
    );
  });

  it('heals on a push ack whose remote state is dropped', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Patch]);

    // PushOnly/SyncOff take only the push ack from the reply. The capability
    // is metadata about the server that took the push, not the remote state
    // being skipped, so the heal must happen on this path too.
    const pack = doc.createChangePack();
    const changes = pack.getChanges();
    doc.acknowledgePushedChanges(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, changes[changes.length - 1].getID().getClientSeq()),
        false,
        [],
        InitialVersionVector,
        undefined,
        0n,
        [],
      ),
    );
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
  });

  it('drops the base when a reconnect may have lost it', function () {
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a' }));
    ack(doc, [PresencePatchCapability]);
    assert.isTrue(doc.isPresencePatchableForTest());

    doc.resetPresenceBase();
    assert.isFalse(doc.isPresencePatchableForTest());

    doc.update((_, p) => p.set({ cursor: { x: 1, y: 1 } }));
    assert.deepEqual(pendingPresenceTypes(doc), [PresenceChangeType.Put]);
  });

  it('folds a patch decoded off the wire onto the presence it holds', function () {
    // The server folds a patch into the base it holds before storing one, so
    // a pulled pack does not normally carry one. One that does -- an echo, a
    // peer ahead of this SDK -- must not fail the whole pack.
    const doc = createDoc();
    doc.update((_, p) => p.set({ name: 'a', cursor: { x: 0, y: 0 } }));
    const actorID = doc.getChangeID().getActorID();

    const pbPack = converter.toChangePack(doc.createChangePack());
    pbPack.changes[0].presenceChange!.type = PbPresenceChangeType.PATCH;
    pbPack.changes[0].presenceChange!.presence!.data = {
      cursor: '{"x":2,"y":2}',
    };

    const decoded = converter.fromChangePack<TestPresence>(pbPack);
    const change = decoded.getChanges()[0];
    assert.equal(change.getPresenceChange()!.type, PresenceChangeType.Patch);

    // No `full` came off the wire, so the carried keys are folded onto the
    // presence already held for that actor -- what the server would have done
    // before storing it.
    const presences = new Map([[actorID, { name: 'a' } as TestPresence]]);
    change.execute(CRDTRoot.create(), presences, OpSource.Remote);
    assert.deepEqual(presences.get(actorID), {
      name: 'a',
      cursor: { x: 2, y: 2 },
    });
  });
});
