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
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

/*
 * A Set/Add/SetByIndex payload carries a whole element, and the wire format
 * carries insPrevID/insNextID on every tree node it holds. `converter`
 * strips them on the way in, because such a payload is client-supplied and
 * its nodes can never be split products.
 *
 * A reverse operation reaches the document without passing the converter:
 * undo executes the copy it captured directly. Unless the copy is stripped
 * too, the replica that ran the undo keeps links every other replica -- and
 * the server -- decoded away, and the two disagree from there on.
 */

type TestDoc = Document<{ t: Tree; u?: Tree }>;

/**
 * `splitLinks` lists every split-sibling link the tree under `key` carries,
 * one line per node that has one. Empty when the tree carries none.
 */
function splitLinks(doc: TestDoc, key = 't'): Array<string> {
  const lines: Array<string> = [];
  const walk = (node: CRDTTreeNode) => {
    const prev = node.insPrevID?.toIDString();
    const next = node.insNextID?.toIDString();
    if (prev || next) {
      lines.push(`${node.id.toIDString()} prev=${prev} next=${next}`);
    }
    node.allChildren.forEach(walk);
  };
  walk(
    (
      doc.getRootObject().get(key) as unknown as CRDTTree
    ).getRoot() as CRDTTreeNode,
  );
  return lines;
}

/**
 * `replicate` hands every change `from` has produced to a fresh replica,
 * through protobuf as on the wire.
 */
function replicate(from: TestDoc): TestDoc {
  const pack = converter.fromChangePack<Indexable>(
    converter.toChangePack(from.createChangePack()),
  );
  const to: TestDoc = new Document('test-doc');
  to.setActor('000000000000000000000002');
  to.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges(),
      InitialVersionVector,
    ),
  );
  return to;
}

/**
 * `withSplitTree` returns a document holding a tree whose span and paragraph
 * have both been split, so its nodes carry split-sibling links.
 */
function withSplitTree(): TestDoc {
  const doc: TestDoc = new Document('test-doc');
  doc.setActor('000000000000000000000001');
  doc.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: [
            { type: 'span', children: [{ type: 'text', value: 'abcde' }] },
          ],
        },
      ],
    });
  });
  doc.update((root) => root.t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1));
  return doc;
}

describe('Split links in a reverse operation payload', function () {
  it('the tree a split leaves behind does carry them', function () {
    assert.isNotEmpty(splitLinks(withSplitTree()));
  });

  it('an undone Set restores the same links here and on a replica', function () {
    const doc = withSplitTree();
    const restored = doc.getRoot().t.toXML();
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [] }],
      });
    });
    doc.history.undo();

    const replica = replicate(doc);
    assert.equal(doc.getRoot().t.toXML(), restored);
    assert.equal(replica.getRoot().t.toXML(), restored);
    assert.deepEqual(splitLinks(doc), splitLinks(replica));
  });

  it('an undone Remove restores the same links here and on a replica', function () {
    const doc = withSplitTree();
    const restored = doc.getRoot().t.toXML();
    doc.update((root) => {
      delete (root as unknown as Record<string, unknown>).t;
    });
    doc.history.undo();

    const replica = replicate(doc);
    assert.equal(doc.getRoot().t.toXML(), restored);
    assert.equal(replica.getRoot().t.toXML(), restored);
    assert.deepEqual(splitLinks(doc), splitLinks(replica));
  });
});
