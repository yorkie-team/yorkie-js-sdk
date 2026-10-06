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
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Text, Tree } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { reissueOperations } from '@yorkie-js/sdk/src/api/reissue';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { Operation } from '@yorkie-js/sdk/src/document/operation/operation';
import { SetOperation } from '@yorkie-js/sdk/src/document/operation/set_operation';
import { TreeStyleOperation } from '@yorkie-js/sdk/src/document/operation/tree_style_operation';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { ticketsOf } from '@yorkie-js/sdk/test/helper/helper';

const actorA = '000000000000000000000001';

type TestDoc = Document<any, Indexable>;

/**
 * `opsOf` returns the operations of every local change of the document.
 */
function opsOf(doc: TestDoc): Array<Operation> {
  const changes = (doc as unknown as { localChanges: Array<Change<Indexable>> })
    .localChanges;
  return changes.flatMap((c) => c.getOperations());
}

/**
 * `wireTickets` returns the tickets of the given operations as they travel.
 */
function wireTickets(ops: Array<Operation>): Array<[string, bigint]> {
  return ticketsOf(ops.map((op) => converter.toOperation(op)));
}

describe('reissueOperations', function () {
  it('re-issues the tickets nested in Object, Array and Tree values', function () {
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.obj = { k: 'v', arr: [1, { n: 2 }] };
      r.tree = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });
    const ops = opsOf(doc);
    const before = wireTickets(ops);
    assert.isTrue(before.some(([a, l]) => a === InitialActorID && l > 0n));

    const after = wireTickets(reissueOperations(ops, InitialActorID, actorA));
    assert.equal(after.length, before.length);
    for (const [i, [actor, lamport]] of after.entries()) {
      assert.equal(lamport, before[i][1]);
      // The lamport-0 ticket is the root's and every sentinel's identity,
      // shared by all replicas, and keeps the initial actor.
      assert.equal(actor, lamport === 0n ? InitialActorID : actorA);
    }
  });

  it('does not mutate the given operations', function () {
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.obj = { k: 'v' };
      r.t = new Text();
      r.t.edit(0, 0, 'hello');
    });
    const ops = opsOf(doc);
    const before = ops.map((op) => converter.operationToBinary(op));

    reissueOperations(ops, InitialActorID, actorA);
    assert.deepEqual(
      ops.map((op) => converter.operationToBinary(op)),
      before,
    );
  });

  it('keeps the content of a Text value', function () {
    // The wire drops a Text value's content; a Set restoring a removed Text
    // carries it in the value itself.
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'hello');
    });
    doc.update((r) => {
      delete r.t;
    });
    doc.history.undo();
    const restore = opsOf(doc).at(-1)!;
    assert.instanceOf(restore, SetOperation);
    assert.equal(
      ((restore as SetOperation).getValue() as CRDTText).toString(),
      'hello',
    );

    const [reissued] = reissueOperations([restore], InitialActorID, actorA);
    assert.instanceOf(reissued, SetOperation);
    const text = (reissued as SetOperation).getValue() as CRDTText;
    assert.equal(text.toString(), 'hello');
    assert.equal(text.getCreatedAt().getActorID(), actorA);
    assert.notInclude(text.toTestString(), InitialActorID);
  });

  it('leaves an attribute named like the actor alone', function () {
    const doc: TestDoc = new Document('d');
    doc.update((r) => {
      r.tree = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });
    doc.update((r) => {
      r.tree.style(0, 1, { [InitialActorID]: 'v' });
    });
    const style = opsOf(doc).at(-1)!;
    assert.instanceOf(style, TreeStyleOperation);

    const [reissued] = reissueOperations([style], InitialActorID, actorA);
    const attrs = (reissued as TreeStyleOperation).getAttributes();
    assert.deepEqual([...attrs.entries()], [[InitialActorID, 'v']]);
  });
});
