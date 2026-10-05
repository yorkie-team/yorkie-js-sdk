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
import yorkie, { SyncMode, Text } from '@yorkie-js/sdk/src/yorkie';
import { Client } from '@yorkie-js/sdk/src/client/client';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';

type TextDoc = Document<Record<string, Text | { by: string }>>;

/**
 * `activeClients` activates `n` clients.
 */
async function activeClients(
  n: number,
  opts: { key?: string } = {},
): Promise<Array<Client>> {
  const clients: Array<Client> = [];
  for (let i = 0; i < n; i++) {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr, ...opts });
    await client.activate();
    clients.push(client);
  }
  return clients;
}

/**
 * `fill` sets a new Text under the given key of a detached document.
 */
function fill(doc: TextDoc, key: string, content: string): void {
  doc.update((r) => {
    r[key] = new Text();
    (r[key] as Text).edit(0, 0, content);
  });
}

/**
 * `creatorOf` returns the actor of the element under the given key.
 */
function creatorOf(doc: TextDoc, key: string): string {
  return doc.getRootObject().get(key)!.getCreatedAt().getActorID();
}

describe('Pre-attach edits', function () {
  it('converges two clients that filled the same key before attach', async function ({
    task,
  }) {
    // Their elements are created under the initial actor, so two clients
    // that fill the same key used to push values with the same createdAt.
    const docKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    let last = '';
    let lastText = '';
    for (let round = 0; round < 3; round++) {
      const clients = await activeClients(2);
      const docs: Array<TextDoc> = [
        new yorkie.Document(docKey),
        new yorkie.Document(docKey),
      ];
      const contents = [`round${round}-c1`, `round${round}-c2`];
      for (const [i, doc] of docs.entries()) {
        doc.update((r) => {
          r.k1 = new Text();
          (r.k1 as Text).edit(0, 0, contents[i]);
          r.o = { by: contents[i] };
        });
      }

      await Promise.all(
        docs.map((doc, i) =>
          clients[i].attach(doc, { syncMode: SyncMode.Manual }),
        ),
      );
      for (const client of [...clients, clients[0]]) {
        await client.sync();
      }
      assert.equal(docs[0].toSortedJSON(), docs[1].toSortedJSON());

      // One whole client's write wins every key, never a mix or nothing.
      // Every pre-attach write has lamport 1, so the previous round's
      // winner may still win by the actor tie-break -- but nothing older.
      const text = (docs[0].getRoot().k1 as Text).toString();
      const candidates = lastText ? [...contents, lastText] : contents;
      assert.include(candidates, text, docs[0].toSortedJSON());
      lastText = text;
      assert.equal((docs[0].getRoot().o as { by: string }).by, text);
      last = docs[0].toSortedJSON();

      for (const client of clients) {
        await client.deactivate();
      }
    }

    const [observer] = await activeClients(1);
    const observed: TextDoc = new yorkie.Document(docKey);
    await observer.attach(observed, { syncMode: SyncMode.Manual });
    assert.equal(observed.toSortedJSON(), last);
    await observer.deactivate();
  });

  it('re-issues pre-attach tickets to the client actor', async function ({
    task,
  }) {
    const [c1, c2] = await activeClients(2);
    const doc: TextDoc = new yorkie.Document(
      `${toDocKey(task.name)}-${new Date().getTime()}`,
    );
    fill(doc, 'k1', 'abc');
    assert.equal(creatorOf(doc, 'k1'), InitialActorID);

    await c1.attach(doc, { syncMode: SyncMode.Manual });
    assert.equal(creatorOf(doc, 'k1'), c1.getActorID());
    assert.equal(doc.toSortedJSON(), '{"k1":[{"val":"abc"}]}');

    const observed: TextDoc = new yorkie.Document(doc.getKey());
    await c2.attach(observed, { syncMode: SyncMode.Manual });
    assert.equal(observed.toSortedJSON(), doc.toSortedJSON());
    assert.equal(creatorOf(observed, 'k1'), c1.getActorID());

    await c1.deactivate();
    await c2.deactivate();
  });

  it('does not re-issue a second pre-attach document of a key', async function ({
    task,
  }) {
    // A re-issue keeps the lamports, and a fresh document starts them at 1,
    // so re-issuing this one to the same actor would mint the createdAt the
    // first attach already pushed. The tickets keep the initial actor.
    //
    // Two Clients of one client key share the stable actor, which is the
    // usual way a JS app meets this: a new Client after a sign-out, say.
    const docKey = `${toDocKey(task.name)}-${new Date().getTime()}`;
    const clientKey = `${docKey}-client`;

    const [first] = await activeClients(1, { key: clientKey });
    const doc1: TextDoc = new yorkie.Document(docKey);
    fill(doc1, 'first', 'a');
    await first.attach(doc1, { syncMode: SyncMode.Manual });
    assert.equal(creatorOf(doc1, 'first'), first.getActorID());
    await first.deactivate();

    const [second] = await activeClients(1, { key: clientKey });
    assert.equal(second.getActorID(), first.getActorID());
    const doc2: TextDoc = new yorkie.Document(docKey);
    fill(doc2, 'second', 'b');
    await second.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(creatorOf(doc2, 'second'), InitialActorID);

    // Both elements survive. Read them through another client: a pull drops
    // the changes the pulling actor itself pushed up to its checkpoint's
    // clientSeq, and doc2 repeated the clientSeq doc1 pushed under, so its
    // own pull filters doc1's change out (yorkie#2123).
    const [observer] = await activeClients(1);
    const observed: TextDoc = new yorkie.Document(docKey);
    await observer.attach(observed, { syncMode: SyncMode.Manual });
    assert.equal(
      observed.toSortedJSON(),
      '{"first":[{"val":"a"}],"second":[{"val":"b"}]}',
    );

    await second.deactivate();
    await observer.deactivate();
  });
});
