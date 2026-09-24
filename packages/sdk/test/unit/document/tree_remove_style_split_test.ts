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
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

type TestDoc = Document<{ t: Tree }>;

function exchange(docs: Array<TestDoc>, orders: Array<Array<number>>): void {
  const packs = docs.map((doc) =>
    converter.fromChangePack<Indexable>(
      converter.toChangePack(doc.createChangePack()),
    ),
  );
  docs.forEach((doc, i) => {
    for (const j of orders[i]) {
      if (j === i) continue;
      doc.applyChangePack(
        ChangePack.create(
          packs[j].getDocumentKey(),
          Checkpoint.of(0n, 0),
          false,
          packs[j].getChanges(),
          InitialVersionVector,
        ),
      );
    }
  });
  docs.forEach((doc, i) => {
    const changes = packs[i].getChanges();
    const lastSeq = changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
    doc.applyChangePack(
      ChangePack.create(
        packs[i].getDocumentKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        [],
        InitialVersionVector,
      ),
    );
  });
}

function replicas(n: number): Array<TestDoc> {
  const docs: Array<TestDoc> = [];
  for (let i = 0; i < n; i++) {
    const doc: TestDoc = new Document('test-doc');
    doc.setActor(String(i + 1).padStart(24, '0'));
    docs.push(doc);
  }
  docs[0].update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: [
            {
              type: 'span',
              attributes: { bold: 'true' },
              children: [{ type: 'text', value: 'abcde' }],
            },
          ],
        },
      ],
    });
  });
  exchange(
    docs,
    docs.map((_, i) => (i === 0 ? [] : [0])),
  );
  return docs;
}

describe('removeStyle over a concurrently split boundary', function () {
  it('converges whichever side arrives first', function () {
    const docs = replicas(2);
    docs[0].update((root) =>
      root.t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1),
    );
    docs[1].update((root) =>
      root.t.removeStyleByPath([0, 0], [0, 1], ['bold']),
    );
    exchange(docs, [[1], [0]]);

    assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
  });

  it('converges when both replicas split and one removes the style', function () {
    const docs = replicas(2);
    docs[0].update((root) => {
      root.t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1);
      root.t.removeStyleByPath([0, 0], [0, 1], ['bold']);
    });
    docs[1].update((root) =>
      root.t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1),
    );
    exchange(docs, [[1], [0]]);

    assert.equal(docs[1].getRoot().t.toXML(), docs[0].getRoot().t.toXML());
  });
});
