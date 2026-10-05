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
import { create } from '@bufbuild/protobuf';
import yorkie, { Text } from '@yorkie-js/sdk/src/yorkie';
import { SyncMode } from '@yorkie-js/sdk/src/client/client';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import {
  ChangePack as PbChangePack,
  ChangePackSchema,
  CheckpointSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { AttachDocumentResponseSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { countActors, ticketsOf } from '@yorkie-js/sdk/test/helper/helper';

const actorA = '0000000000000000000000a1';
const actorB = '0000000000000000000000b1';

/**
 * `attachResponse` builds a minimal AttachDocumentResponse that acknowledges
 * the pushed changes and carries nothing back.
 */
function attachResponse(docKey: string, pushed: PbChangePack) {
  return create(AttachDocumentResponseSchema, {
    documentId: `${docKey}-id`,
    changePack: create(ChangePackSchema, {
      documentKey: docKey,
      checkpoint: create(CheckpointSchema, {
        serverSeq: BigInt(pushed.changes.length),
        clientSeq: pushed.checkpoint!.clientSeq,
      }),
    }),
    disablePresence: false,
    schemaRules: [],
  });
}

/**
 * `fakeClient` returns a real Client forced into the active state under the
 * given actor, with a fake `rpcClient` that records every pushed pack and
 * answers with `respond`.
 */
function fakeClient(
  actor: string,
  pushed: Array<PbChangePack>,
  respond: (docKey: string, pack: PbChangePack) => Promise<unknown> = (
    docKey,
    pack,
  ) => Promise.resolve(attachResponse(docKey, pack)),
) {
  const client = new yorkie.Client({ rpcAddr: 'http://localhost' });
  (client as any).status = 'activated';
  (client as any).id = actor;
  (client as any).actorID = actor;
  (client as any).rpcClient = {
    attachDocument: (req: {
      documentKey: string;
      changePack: PbChangePack;
    }) => {
      pushed.push(req.changePack);
      return respond(req.documentKey, req.changePack);
    },
  };
  return client;
}

/**
 * `filled` returns a detached document of the given key edited before any
 * attach, so every ticket it holds names the initial actor.
 */
function filled(docKey: string, content: string) {
  const doc = new Document<{ t: Text }, Indexable>(docKey);
  doc.update((r) => {
    r.t = new Text();
    r.t.edit(0, 0, content);
  });
  return doc;
}

describe('Client.attach re-issues pre-attach tickets', function () {
  it('pushes the pre-attach changes under the client actor', async function () {
    const pushed: Array<PbChangePack> = [];
    const client = fakeClient(actorA, pushed);
    const doc = filled('reissue-claim-push', 'hello');

    await client.attach(doc, { syncMode: SyncMode.Manual });

    const actors = countActors(ticketsOf(pushed[0]));
    assert.isUndefined(actors.get(InitialActorID), `${[...actors]}`);
    assert.isAbove(actors.get(actorA) ?? 0, 0);
    assert.equal(doc.getRoot().t.toString(), 'hello');
  });

  it('keeps the re-issued state when the attach fails', async function () {
    const pushed: Array<PbChangePack> = [];
    const failing = fakeClient(actorA, pushed, () =>
      Promise.reject(new Error('lost')),
    );
    const doc = filled('reissue-claim-fail', 'hello');

    try {
      await failing.attach(doc, { syncMode: SyncMode.Manual });
      assert.fail('attach should fail');
    } catch (err) {
      assert.equal((err as Error).message, 'lost');
    }
    assert.equal(doc.getChangeID().getActorID(), actorA);
    assert.isUndefined(countActors(ticketsOf(pushed[0])).get(InitialActorID));

    // A retry under another client re-issues from the first actor to its
    // own; rolling back could not be made safe when a response was lost.
    const retried: Array<PbChangePack> = [];
    const other = fakeClient(actorB, retried);
    await other.attach(doc, { syncMode: SyncMode.Manual });

    const actors = countActors(ticketsOf(retried[0]));
    assert.isUndefined(actors.get(InitialActorID));
    assert.isUndefined(actors.get(actorA));
    assert.isAbove(actors.get(actorB) ?? 0, 0);
  });

  it('does not re-issue when the attach options are rejected', async function () {
    const pushed: Array<PbChangePack> = [];
    const client = fakeClient(actorA, pushed);
    const doc = filled('reissue-claim-invalid', 'hello');

    let rejected: unknown;
    try {
      await client.attach(doc, { documentPollInterval: 0 });
    } catch (err) {
      rejected = err;
    }
    assert.include((rejected as Error).message, 'documentPollInterval');
    assert.equal(doc.getChangeID().getActorID(), InitialActorID);
    assert.isTrue(doc.history.canUndo());

    // The claim was not taken either, so the valid retry still re-issues.
    await client.attach(doc, { syncMode: SyncMode.Manual });
    assert.isUndefined(countActors(ticketsOf(pushed[0])).get(InitialActorID));
  });

  it('declines a second never-synced document of a key under one actor', async function () {
    // The re-issue keeps each lamport, so the second document re-issued to
    // the same actor would mint the tickets the first one already pushed.
    const docKey = 'reissue-claim-second';
    const pushed: Array<PbChangePack> = [];
    const client = fakeClient(actorA, pushed);

    const first = filled(docKey, 'one');
    await client.attach(first, { syncMode: SyncMode.Manual });

    // The claim is per actor rather than per Client: every Client of a client
    // key shares its stable actor, so another Client of it declines too.
    const second = filled(docKey, 'two');
    const sibling = fakeClient(actorA, pushed);
    await sibling.attach(second, { syncMode: SyncMode.Manual });

    assert.isUndefined(countActors(ticketsOf(pushed[0])).get(InitialActorID));
    // Declined, the plain setActor rewrites only the change IDs and each
    // operation's executedAt; the minted tickets keep the initial actor.
    assert.isAbove(
      countActors(ticketsOf(pushed.at(-1))).get(InitialActorID) ?? 0,
      0,
    );
    assert.equal(second.getChangeID().getActorID(), actorA);
  });
});
