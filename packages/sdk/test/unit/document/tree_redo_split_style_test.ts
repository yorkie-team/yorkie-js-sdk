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
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack as PbChangePack } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

type TestDoc = Document<{ t: Tree }>;

function newActor(actor: string): TestDoc {
  const doc: TestDoc = new Document('d');
  doc.setActor(actor);
  return doc;
}

/** Takes the pending local changes through the wire form and acks them. */
function grab(doc: TestDoc): PbChangePack {
  const pack = doc.createChangePack();
  const changes = pack.getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  const pb = converter.toChangePack(pack);
  doc.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
  return pb;
}

function feed(doc: TestDoc, batch: PbChangePack): void {
  const pack = converter.fromChangePack<Indexable>(batch);
  doc.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges(),
      InitialVersionVector,
    ),
  );
}

describe('Tree redo of a split and a style in one change', () => {
  const cases: Array<{ name: string; edit: (t: Tree) => void }> = [
    {
      name: 'split in the middle, bold the right piece',
      edit: (t) => {
        t.editByPath([0, 0, 6], [0, 0, 6], undefined, 1);
        t.styleByPath([0, 1], { bold: 'true' });
      },
    },
    {
      name: 'split at the end, bold the empty piece',
      edit: (t) => {
        t.editByPath([0, 0, 11], [0, 0, 11], undefined, 1);
        t.styleByPath([0, 1], { bold: 'true' });
      },
    },
  ];

  for (const { name, edit } of cases)
    for (const collect of [false, true]) {
      it(`lets a peer apply the redo: ${name}${collect ? ', after GC' : ''}`, () => {
        const a = newActor('000000000000000000000001');
        const b = newActor('000000000000000000000002');
        a.update((r) => {
          r.t = new Tree({
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'inline',
                    children: [{ type: 'text', value: 'hello world' }],
                  },
                ],
              },
            ],
          });
        });
        a.clearHistory();
        feed(b, grab(a));

        a.update((r) => edit(r.t));
        const edited = a.getRoot().t.toXML();
        feed(b, grab(a));
        assert.equal(b.getRoot().t.toXML(), edited, 'edit');

        a.history.undo();
        feed(b, grab(a));
        assert.equal(b.getRoot().t.toXML(), a.getRoot().t.toXML(), 'undo');
        if (collect) {
          // Both have seen the undo, so its tombstones can be purged.
          const vector = maxVectorOf([
            a.getChangeID().getActorID(),
            b.getChangeID().getActorID(),
          ]);
          a.garbageCollect(vector);
          b.garbageCollect(vector);
        }

        a.history.redo();
        assert.equal(a.getRoot().t.toXML(), edited, 'redo, locally');
        feed(b, grab(a));
        assert.equal(b.getRoot().t.toXML(), edited, 'redo, on the peer');
      });
    }
});
