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
});
