/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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

import { assert } from 'chai';
import yorkie, {
  Document,
  Tree,
  ElementNode,
  Indexable,
} from '@yorkie-js-sdk/src/yorkie';
import { ChangePack } from '@yorkie-js-sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';
import {
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { TreeEditOpInfo } from '@yorkie-js-sdk/src/document/operation/operation';
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

/**
 * `createChangePack` is a helper function that creates a change pack from the
 * given document. It is used to to emulate the behavior of the server.
 */
function createChangePack<T>(
  doc: Document<T, Indexable>,
): ChangePack<Indexable> {
  // 01. Create a change pack from the given document and emulate the behavior
  // of PushPullChanges API.
  const reqPack = doc.createChangePack();
  const reqCP = reqPack.getCheckpoint();
  const resPack = ChangePack.create(
    reqPack.getDocumentKey(),
    Checkpoint.of(
      reqCP.getServerSeq().add(reqPack.getChangeSize()),
      reqCP.getClientSeq() + reqPack.getChangeSize(),
    ),
    false,
    [],
    undefined,
    InitialTimeTicket,
  );
  doc.applyChangePack(resPack);

  // 02. Create a pack to apply the changes to other replicas.
  return ChangePack.create(
    reqPack.getDocumentKey(),
    Checkpoint.of(reqCP.getServerSeq().add(reqPack.getChangeSize()), 0),
    false,
    reqPack.getChanges(),
    undefined,
    resPack.getMinSyncedTicket(),
  );
}

/**
 * `createTwoDocuments` is a helper function that creates two documents with
 * the given initial tree.
 */
function createTwoTreeDocs<T extends { t: Tree }>(
  key: string,
  initial: ElementNode,
): [Document<T>, Document<T>] {
  const doc1 = new yorkie.Document<T>(key);
  const doc2 = new yorkie.Document<T>(key);
  doc1.setActor('A');
  doc2.setActor('B');

  doc1.update((root) => (root.t = new Tree(initial)));
  doc2.applyChangePack(createChangePack(doc1));

  return [doc1, doc2];
}

/**
 * `syncTwoTreeDocsAndAssertEqual` is a helper function that syncs two documents
 * and asserts that the given expected tree is equal to the two documents.
 */
function syncTwoTreeDocsAndAssertEqual<T extends { t: Tree }>(
  doc1: Document<T>,
  doc2: Document<T>,
  expected: string,
) {
  doc2.applyChangePack(createChangePack(doc1));
  doc1.applyChangePack(createChangePack(doc2));

  assert.equal(doc1.getRoot().t.toXML(), doc2.getRoot().t.toXML());
  assert.equal(doc1.getRoot().t.toXML(), expected);
}
describe('Tree', () => {
  it('Can be created', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      // 01. Create a tree and insert a paragraph.
      root.t = new Tree();
      root.t.edit(0, 0, { type: 'p', children: [] });
      assert.equal(root.t.toXML(), /*html*/ `<root><p></p></root>`);
      assert.equal(
        '{"t":{"type":"root","children":[{"type":"p","children":[]}]}}',
        root.toJSON!(),
      );

      // 02. Create a text into the paragraph.
      root.t.edit(1, 1, { type: 'text', value: 'AB' });
      assert.equal(root.t.toXML(), /*html*/ `<root><p>AB</p></root>`);
      assert.equal(
        '{"t":{"type":"root","children":[{"type":"p","children":[{"type":"text","value":"AB"}]}]}}',
        root.toJSON!(),
      );

      // 03. Insert a text into the paragraph.

      root.t.edit(3, 3, { type: 'text', value: 'CD' });
      assert.equal(root.t.toXML(), /*html*/ `<root><p>ABCD</p></root>`);
      assert.equal(
        '{"t":{"type":"root","children":[{"type":"p","children":[{"type":"text","value":"AB"},{"type":"text","value":"CD"}]}]}}',
        root.toJSON!(),
      );

      // 04. Replace ABCD with Yorkie
      root.t.edit(1, 5, {
        type: 'text',
        value: 'Yorkie',
      });
      assert.equal(root.t.toXML(), /*html*/ `<root><p>Yorkie</p></root>`);
      assert.equal(
        '{"t":{"type":"root","children":[{"type":"p","children":[{"type":"text","value":"Yorkie"}]}]}}',
        root.toJSON!(),
      );
    });
  });

  it('Can be created from JSON', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
          {
            type: 'ng',
            children: [
              { type: 'note', children: [{ type: 'text', value: 'cd' }] },
              { type: 'note', children: [{ type: 'text', value: 'ef' }] },
            ],
          },
          {
            type: 'bp',
            children: [{ type: 'text', value: 'gh' }],
          },
        ],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p>ab</p><ng><note>cd</note><note>ef</note></ng><bp>gh</bp></doc>`,
      );
      assert.equal(root.t.getSize(), 18);
    });
  });

  it('Can edit its content', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      root.t.edit(1, 1, { type: 'text', value: 'X' });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>Xab</p></doc>`);

      root.t.edit(1, 2);
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      root.t.edit(2, 2, { type: 'text', value: 'X' });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>aXb</p></doc>`);

      root.t.edit(2, 3);
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      root.t.edit(2, 2, { type: 'text', value: 'X' });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>aXb</p></doc>`);

      root.t.edit(1, 4);
      assert.equal(root.t.toXML(), /*html*/ `<doc><p></p></doc>`);
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p></p></doc>`);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });

      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      root.t.edit(3, 3, { type: 'text', value: 'X' });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>abX</p></doc>`);

      root.t.edit(3, 4);
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      root.t.edit(2, 3);
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>a</p></doc>`);
    });
  });

  it('Can be subscribed by handler', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);
    });

    const actualOperations: Array<TreeEditOpInfo> = [];
    doc.subscribe('$.t', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;

        actualOperations.push(
          ...(operations.filter(
            (op) => op.type === 'tree-edit',
          ) as Array<TreeEditOpInfo>),
        );
      }
    });

    doc.update((root) => {
      root.t.edit(1, 1, { type: 'text', value: 'X' });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>Xab</p></doc>`);
    });

    assert.deepEqual(
      actualOperations.map((it) => {
        return {
          type: it.type,
          from: it.from,
          to: it.to,
          value: it.value,
        };
      }),
      [
        {
          type: 'tree-edit',
          from: 1,
          to: 1,
          value: [{ type: 'text', value: 'X' }],
        } as any,
      ],
    );
  });

  it('Can be subscribed by handler(path)', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'tc',
            children: [
              {
                type: 'p',
                children: [
                  { type: 'tn', children: [{ type: 'text', value: 'ab' }] },
                ],
              },
            ],
          },
        ],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>ab</tn></p></tc></doc>`,
      );
    });

    const actualOperations: Array<TreeEditOpInfo> = [];
    doc.subscribe('$.t', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;

        actualOperations.push(
          ...(operations.filter(
            (op) => op.type === 'tree-edit',
          ) as Array<TreeEditOpInfo>),
        );
      }
    });

    doc.update((root) => {
      root.t.editByPath([0, 0, 0, 1], [0, 0, 0, 1], {
        type: 'text',
        value: 'X',
      });

      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXb</tn></p></tc></doc>`,
      );
    });

    assert.deepEqual(
      actualOperations.map((it) => {
        return {
          type: it.type,
          fromPath: it.fromPath,
          toPath: it.toPath,
          value: it.value,
        };
      }),
      [
        {
          type: 'tree-edit',
          fromPath: [0, 0, 0, 1],
          toPath: [0, 0, 0, 1],
          value: [{ type: 'text', value: 'X' }],
        } as any,
      ],
    );
  });

  it('Can edit its content with path', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'tc',
            children: [
              {
                type: 'p',
                children: [
                  { type: 'tn', children: [{ type: 'text', value: 'ab' }] },
                ],
              },
            ],
          },
        ],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>ab</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 0, 0, 1], [0, 0, 0, 1], {
        type: 'text',
        value: 'X',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXb</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 0, 0, 3], [0, 0, 0, 3], {
        type: 'text',
        value: '!',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXb!</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 0, 1], [0, 0, 1], {
        type: 'tn',
        children: [{ type: 'text', value: 'cd' }],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXb!</tn><tn>cd</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 1], [0, 1], {
        type: 'p',
        children: [{ type: 'tn', children: [{ type: 'text', value: 'q' }] }],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXb!</tn><tn>cd</tn></p><p><tn>q</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 1, 0, 0], [0, 1, 0, 0], {
        type: 'text',
        value: 'a',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXb!</tn><tn>cd</tn></p><p><tn>aq</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 1, 0, 2], [0, 1, 0, 2], {
        type: 'text',
        value: 'B',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXb!</tn><tn>cd</tn></p><p><tn>aqB</tn></p></tc></doc>`,
      );

      assert.Throw(() => {
        doc.update((root) => {
          root.t.editByPath([0, 0, 4], [0, 0, 4], {
            type: 'tn',
            children: [],
          });
        });
      }, 'unacceptable path');
    });
  });

  it('Can edit its content with path 2', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'tc',
            children: [
              {
                type: 'p',
                children: [{ type: 'tn', children: [] }],
              },
            ],
          },
        ],
      });

      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn></tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 0, 0, 0], [0, 0, 0, 0], {
        type: 'text',
        value: 'a',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 1], [0, 1], {
        type: 'p',
        children: [{ type: 'tn', children: [] }],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p><p><tn></tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 1, 0, 0], [0, 1, 0, 0], {
        type: 'text',
        value: 'b',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p><p><tn>b</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 2], [0, 2], {
        type: 'p',
        children: [{ type: 'tn', children: [] }],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p><p><tn>b</tn></p><p><tn></tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 2, 0, 0], [0, 2, 0, 0], {
        type: 'text',
        value: 'c',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p><p><tn>b</tn></p><p><tn>c</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 3], [0, 3], {
        type: 'p',
        children: [{ type: 'tn', children: [] }],
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p><p><tn>b</tn></p><p><tn>c</tn></p><p><tn></tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 3, 0, 0], [0, 3, 0, 0], {
        type: 'text',
        value: 'd',
      });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p><p><tn>b</tn></p><p><tn>c</tn></p><p><tn>d</tn></p></tc></doc>`,
      );

      root.t.editByPath([0, 3], [0, 3], {
        type: 'p',
        children: [{ type: 'tn', children: [] }],
      });

      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>a</tn></p><p><tn>b</tn></p><p><tn>c</tn></p><p><tn></tn></p><p><tn>d</tn></p></tc></doc>`,
      );
    });
  });

  it('Can sync its content with other replicas', async function () {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'hello' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>hello</p></doc>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>hello</p></doc>`);

      d1.update((root) => {
        root.t.edit(7, 7, {
          type: 'p',
          children: [{ type: 'text', value: 'yorkie' }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p>hello</p><p>yorkie</p></doc>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<doc><p>hello</p><p>yorkie</p></doc>`,
      );
    }, this.test!.title);
  });

  it('Get correct range from index', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'root',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'b',
                children: [
                  { type: 'i', children: [{ type: 'text', value: 'ab' }] },
                ],
              },
            ],
          },
        ],
      });
    });

    const tree = doc.getRoot().t;
    //     0  1  2   3 4 5    6   7   8
    //<root><p><b><i> a b </i></b></p></root>
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );

    let range = tree.indexRangeToPosRange([0, 5]);
    assert.deepEqual(tree.posRangeToIndexRange(range), [0, 5]);

    range = tree.indexRangeToPosRange([5, 7]);
    assert.deepEqual(tree.posRangeToIndexRange(range), [5, 7]);
  });

  it('Get correct range from path', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'root',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'b',
                children: [
                  { type: 'i', children: [{ type: 'text', value: 'ab' }] },
                ],
              },
            ],
          },
        ],
      });
    });

    const tree = doc.getRoot().t;
    //     0  1  2   3 4 5    6   7   8
    //<root><p><b><i> a b </i></b></p></root>
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );

    let range = tree.pathRangeToPosRange([[0], [0, 0, 0, 2]]);
    assert.deepEqual(tree.posRangeToPathRange(range), [[0], [0, 0, 0, 2]]);

    range = tree.pathRangeToPosRange([[0], [1]]);
    assert.deepEqual(tree.posRangeToPathRange(range), [[0], [1]]);
  });
});

describe('Tree.edit', function () {
  it('Can insert multiple text nodes', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    doc.update((root) => {
      root.t.edit(
        3,
        3,
        { type: 'text', value: 'c' },
        { type: 'text', value: 'd' },
      );
    });

    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>abcd</p></doc>`);
  });

  it('Can insert multiple element nodes', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    doc.update((root) => {
      root.t.edit(
        4,
        4,
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        { type: 'i', children: [{ type: 'text', value: 'fg' }] },
      );
    });

    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p>ab</p><p>cd</p><i>fg</i></doc>`,
    );
  });

  it('Detecting error for empty text', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    assert.Throw(() => {
      doc.update((root) => {
        root.t.edit(
          3,
          3,
          { type: 'text', value: 'c' },
          { type: 'text', value: '' },
        );
      });
    }, 'text node cannot have empty value');
  });

  it('Detecting error for mixed type insertion', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    assert.Throw(() => {
      doc.update((root) => {
        root.t.edit(
          3,
          3,
          { type: 'p', children: [] },
          { type: 'text', value: 'd' },
        );
      });
    }, 'element node and text node cannot be passed together');
  });

  it('Detecting correct error order [1]', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    assert.Throw(() => {
      doc.update((root) => {
        root.t.edit(
          3,
          3,
          {
            type: 'p',
            children: [
              { type: 'text', value: 'c' },
              { type: 'text', value: '' },
            ],
          },
          { type: 'text', value: 'd' },
        );
      });
    }, 'element node and text node cannot be passed together');
  });

  it('Detecting correct error order [2]', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    assert.Throw(() => {
      doc.update((root) => {
        root.t.edit(
          3,
          3,
          { type: 'p', children: [{ type: 'text', value: 'c' }] },
          { type: 'p', children: [{ type: 'text', value: '' }] },
        );
      });
    }, 'text node cannot have empty value');
  });

  it('Detecting correct error order [3]', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ab' }],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

    assert.Throw(() => {
      doc.update((root) => {
        root.t.edit(
          3,
          3,
          { type: 'text', value: 'd' },
          { type: 'p', children: [{ type: 'text', value: 'c' }] },
        );
      });
    }, 'element node and text node cannot be passed together');
  });
});

describe('Tree.style', function () {
  it('Can be inserted with attributes', function () {
    const doc = new yorkie.Document<{ t: Tree }>(toDocKey(this.test!.title));
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'span',
                attributes: { bold: true },
                children: [{ type: 'text', value: 'hello' }],
              },
            ],
          },
        ],
      });
    });

    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p><span bold="true">hello</span></p></doc>`,
    );
  });

  it('Can be edited with index', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'tc',
            children: [
              {
                type: 'p',
                children: [{ type: 'tn', children: [] }],
                attributes: { a: 'b' },
              },
            ],
          },
        ],
      });

      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b"><tn></tn></p></tc></doc>`,
      );

      root.t.style(1, 2, { c: 'd' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b" c="d"><tn></tn></p></tc></doc>`,
      );

      root.t.style(1, 2, { c: 'q' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b" c="q"><tn></tn></p></tc></doc>`,
      );

      root.t.style(2, 3, { z: 'm' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b" c="q"><tn z="m"></tn></p></tc></doc>`,
      );
    });
  });

  it('Can be edited with path', function () {
    const key = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'tc',
            children: [
              {
                type: 'p',
                children: [{ type: 'tn', children: [] }],
                attributes: { a: 'b' },
              },
            ],
          },
        ],
      });

      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b"><tn></tn></p></tc></doc>`,
      );

      root.t.styleByPath([0, 0], { c: 'd' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b" c="d"><tn></tn></p></tc></doc>`,
      );

      root.t.styleByPath([0, 0], { c: 'q' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b" c="q"><tn></tn></p></tc></doc>`,
      );

      root.t.styleByPath([0, 0, 0], { z: 'm' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p a="b" c="q"><tn z="m"></tn></p></tc></doc>`,
      );

      assert.equal(
        root.toJSON!(),
        /*html*/ `{"t":{"type":"doc","children":[{"type":"tc","children":[{"type":"p","children":[{"type":"tn","children":[],"attributes":{"z":"m"}}],"attributes":{"a":"b","c":"q"}}]}]}}`,
      );
    });
  });

  it('Can sync its content containing attributes with other replicas', async function () {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: 'hello' }],
              attributes: { italic: 'true' },
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p italic="true">hello</p></doc>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<doc><p italic="true">hello</p></doc>`,
      );

      d1.update((root) => {
        root.t.style(0, 1, { bold: 'true' });
      });
      await c1.sync();
      await c2.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p italic="true" bold="true">hello</p></doc>`,
      );

      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<doc><p italic="true" bold="true">hello</p></doc>`,
      );
    }, this.test!.title);
  });
});

describe('Concurrent editing, overlapping range', () => {
  it('Can concurrently delete overlapping elements', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        { type: 'p', children: [] },
        { type: 'i', children: [] },
        { type: 'b', children: [] },
      ],
    });
    assert.equal(
      docA.getRoot().t.toXML(),
      /*html*/ `<r><p></p><i></i><b></b></r>`,
    );

    docA.update((r) => r.t.edit(0, 4));
    docB.update((r) => r.t.edit(2, 6));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><b></b></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r></r>`);
  });

  it('Can concurrently delete overlapping text', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>abcd</p></r>`);

    docA.update((r) => r.t.edit(1, 4));
    docB.update((r) => r.t.edit(2, 5));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>d</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p></p></r>`);
  });
});

describe('Concurrent editing, contained range', () => {
  it('Can concurrently insert and delete contained elements of the same depth', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: '1234' }] },
        { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
      ],
    });
    assert.equal(
      docA.getRoot().t.toXML(),
      /*html*/ `<r><p>1234</p><p>abcd</p></r>`,
    );

    docA.update((r) => r.t.edit(6, 6, { type: 'p', children: [] }));
    docA.update((r) => r.t.edit(8, 8, { type: 'p', children: [] }));
    docA.update((r) => r.t.edit(10, 10, { type: 'p', children: [] }));
    docA.update((r) => r.t.edit(12, 12, { type: 'p', children: [] }));
    docB.update((r) => r.t.edit(0, 12));
    assert.equal(
      docA.getRoot().t.toXML(),
      /*html*/ `<r><p>1234</p><p></p><p></p><p></p><p></p><p>abcd</p></r>`,
    );
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r></r>`);

    syncTwoTreeDocsAndAssertEqual(
      docA,
      docB,
      /*html*/ `<r><p></p><p></p><p></p><p></p></r>`,
    );
  });

  it('Detecting error when inserting and deleting contained elements at different depths', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'i', children: [] }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);

    docA.update((r) => r.t.edit(2, 2, { type: 'i', children: [] }));
    docB.update((r) => r.t.edit(1, 3));
    assert.equal(
      docA.getRoot().t.toXML(),
      /*html*/ `<r><p><i><i></i></i></p></r>`,
    );
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p></p></r>`);
  });

  it('Can concurrently delete contained elements', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [
            { type: 'i', children: [{ type: 'text', value: '1234' }] },
          ],
        },
      ],
    });
    assert.equal(
      docA.getRoot().t.toXML(),
      /*html*/ `<r><p><i>1234</i></p></r>`,
    );

    docA.update((r) => r.t.edit(0, 8));
    docB.update((r) => r.t.edit(1, 7));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r></r>`);
  });

  it('Can concurrently insert and delete contained text', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [{ type: 'text', value: '1234' }],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

    docA.update((r) => r.t.edit(1, 5));
    docB.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>a</p></r>`);
  });

  it('Can concurrently delete contained text', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [{ type: 'text', value: '1234' }],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

    docA.update((r) => r.t.edit(1, 5));
    docB.update((r) => r.t.edit(2, 4));

    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>14</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p></p></r>`);
  });

  it('Can concurrently insert and delete contained text and elements', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [{ type: 'text', value: '1234' }],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

    docA.update((r) => r.t.edit(0, 6));
    docB.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r></r>`);
  });

  it('Can concurrently delete contained text and elements', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [{ type: 'text', value: '1234' }],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

    docA.update((r) => r.t.edit(0, 6));
    docB.update((r) => r.t.edit(1, 5));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r></r>`);
  });
});

describe('Concurrent editing, side by side range', () => {
  it('Can concurrently insert side by side elements (left)', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    docA.update((r) => r.t.edit(0, 0, { type: 'b', children: [] }));
    docB.update((r) => r.t.edit(0, 0, { type: 'i', children: [] }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><b></b><p></p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><i></i><p></p></r>`);

    syncTwoTreeDocsAndAssertEqual(
      docA,
      docB,
      /*html*/ `<r><i></i><b></b><p></p></r>`,
    );
  });

  it('Can concurrently insert side by side elements (middle)', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    docA.update((r) => r.t.edit(1, 1, { type: 'b', children: [] }));
    docB.update((r) => r.t.edit(1, 1, { type: 'i', children: [] }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);

    syncTwoTreeDocsAndAssertEqual(
      docA,
      docB,
      /*html*/ `<r><p><i></i><b></b></p></r>`,
    );
  });

  it('Can concurrently insert side by side elements (right)', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    docA.update((r) => r.t.edit(2, 2, { type: 'b', children: [] }));
    docB.update((r) => r.t.edit(2, 2, { type: 'i', children: [] }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p><b></b></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p></p><i></i></r>`);

    syncTwoTreeDocsAndAssertEqual(
      docA,
      docB,
      /*html*/ `<r><p></p><i></i><b></b></r>`,
    );
  });

  it('Can concurrently insert and delete side by side elements', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [{ type: 'b', children: [] }],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);

    docA.update((r) => r.t.edit(1, 3));
    docB.update((r) => r.t.edit(1, 1, { type: 'i', children: [] }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    assert.equal(
      docB.getRoot().t.toXML(),
      /*html*/ `<r><p><i></i><b></b></p></r>`,
    );

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p><i></i></p></r>`);
  });

  it('Can concurrently delete and insert side by side elements', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [{ type: 'b', children: [] }],
        },
      ],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);

    docA.update((r) => r.t.edit(1, 3));
    docB.update((r) => r.t.edit(3, 3, { type: 'i', children: [] }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    assert.equal(
      docB.getRoot().t.toXML(),
      /*html*/ `<r><p><b></b><i></i></p></r>`,
    );

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p><i></i></p></r>`);
  });

  it('Can concurrently delete side by side elements', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [
            { type: 'b', children: [] },
            { type: 'i', children: [] },
          ],
        },
      ],
    });
    assert.equal(
      docA.getRoot().t.toXML(),
      /*html*/ `<r><p><b></b><i></i></p></r>`,
    );

    docA.update((r) => r.t.edit(1, 3));
    docB.update((r) => r.t.edit(3, 5));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p></p></r>`);
  });

  it('Can insert text to the same position(left) concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    docA.update((r) => r.t.edit(1, 1, { type: 'text', value: 'A' }));
    docB.update((r) => r.t.edit(1, 1, { type: 'text', value: 'B' }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>A12</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>B12</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>BA12</p></r>`);
  });

  it('Can insert text to the same position(middle) concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    docA.update((r) => r.t.edit(2, 2, { type: 'text', value: 'A' }));
    docB.update((r) => r.t.edit(2, 2, { type: 'text', value: 'B' }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1A2</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>1B2</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>1BA2</p></r>`);
  });

  it('Can insert text content to the same position(right) concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    docA.update((r) => r.t.edit(3, 3, { type: 'text', value: 'A' }));
    docB.update((r) => r.t.edit(3, 3, { type: 'text', value: 'B' }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12A</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>12B</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>12BA</p></r>`);
  });

  it('Can concurrently insert and delete side by side text', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '1234' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

    docA.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
    docB.update((r) => r.t.edit(3, 5));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>12a</p></r>`);
  });

  it('Can concurrently delete and insert side by side text', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '1234' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

    docA.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
    docB.update((r) => r.t.edit(1, 3));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>34</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>a34</p></r>`);
  });

  it('Can concurrently delete side by side text blocks', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '1234' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

    docA.update((r) => r.t.edit(3, 5));
    docB.update((r) => r.t.edit(1, 3));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>34</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p></p></r>`);
  });

  it('Can delete text content at the same position(left) concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

    docA.update((r) => r.t.edit(1, 2));
    docB.update((r) => r.t.edit(1, 2));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>23</p></r>`);
  });

  it('Can delete text content at the same position(middle) concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

    docA.update((r) => r.t.edit(2, 3));
    docB.update((r) => r.t.edit(2, 3));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>13</p></r>`);
  });

  it('Can delete text content at the same position(right) concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

    docA.update((r) => r.t.edit(3, 4));
    docB.update((r) => r.t.edit(3, 4));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>12</p></r>`);
  });
});

describe('Concurrent editing, complex cases', () => {
  it('Can delete text content anchored to another concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

    docA.update((r) => r.t.edit(1, 2));
    docB.update((r) => r.t.edit(2, 3));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>3</p></r>`);
  });

  it('Can produce complete deletion concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

    docA.update((r) => r.t.edit(1, 2));
    docB.update((r) => r.t.edit(2, 4));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>1</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p></p></r>`);
  });

  it('Can handle block delete concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12345' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

    docA.update((r) => r.t.edit(1, 3));
    docB.update((r) => r.t.edit(4, 6));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>345</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>3</p></r>`);
  });

  it('Can handle insert within block delete concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12345' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

    docA.update((r) => r.t.edit(2, 5));
    docB.update((r) => r.t.edit(3, 3, { type: 'text', value: 'B' }));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>15</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>12B345</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>1B5</p></r>`);
  });

  it('Can handle insert within block delete concurrently [2]', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12345' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

    docA.update((r) => r.t.edit(2, 6));
    docB.update((r) =>
      r.t.edit(
        3,
        3,
        { type: 'text', value: 'a' },
        { type: 'text', value: 'bc' },
      ),
    );
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>12abc345</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>1abc</p></r>`);
  });

  it('Can handle block element insertion within delete [2]', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: '1234' }] },
        { type: 'p', children: [{ type: 'text', value: '5678' }] },
      ],
    });
    assert.equal(
      docA.getRoot().t.toXML(),
      /*html*/ `<r><p>1234</p><p>5678</p></r>`,
    );

    docA.update((r) => r.t.edit(0, 12));
    docB.update((r) =>
      r.t.edit(
        6,
        6,
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        { type: 'i', children: [{ type: 'text', value: 'fg' }] },
      ),
    );
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r></r>`);
    assert.equal(
      docB.getRoot().t.toXML(),
      /*html*/ `<r><p>1234</p><p>cd</p><i>fg</i><p>5678</p></r>`,
    );

    syncTwoTreeDocsAndAssertEqual(
      docA,
      docB,
      /*html*/ `<r><p>cd</p><i>fg</i></r>`,
    );
  });

  it('Can handle concurrent element insert/ deletion (left)', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12345' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

    docA.update((r) => r.t.edit(0, 7));
    docB.update((r) =>
      r.t.edit(
        0,
        0,
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        { type: 'i', children: [{ type: 'text', value: 'fg' }] },
      ),
    );
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r></r>`);
    assert.equal(
      docB.getRoot().t.toXML(),
      /*html*/ `<r><p>cd</p><i>fg</i><p>12345</p></r>`,
    );

    syncTwoTreeDocsAndAssertEqual(
      docA,
      docB,
      /*html*/ `<r><p>cd</p><i>fg</i></r>`,
    );
  });

  it('Can handle concurrent element insert/ deletion (right)', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12345' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

    docA.update((r) => r.t.edit(0, 7));
    docB.update((r) =>
      r.t.edit(
        7,
        7,
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        { type: 'i', children: [{ type: 'text', value: 'fg' }] },
      ),
    );

    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r></r>`);
    assert.equal(
      docB.getRoot().t.toXML(),
      /*html*/ `<r><p>12345</p><p>cd</p><i>fg</i></r>`,
    );

    syncTwoTreeDocsAndAssertEqual(
      docA,
      docB,
      /*html*/ `<r><p>cd</p><i>fg</i></r>`,
    );
  });

  it('Can handle deletion of insertion anchor concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    docA.update((r) => r.t.edit(2, 2, { type: 'text', value: 'A' }));
    docB.update((r) => r.t.edit(1, 2));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>1A2</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p>2</p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>A2</p></r>`);
  });

  it('Can handle deletion after insertion concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    docA.update((r) => r.t.edit(1, 1, { type: 'text', value: 'A' }));
    docB.update((r) => r.t.edit(1, 3));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>A12</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>A</p></r>`);
  });

  it('Can handle deletion before insertion concurrently', function () {
    const [docA, docB] = createTwoTreeDocs(toDocKey(this.test!.title), {
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
    });
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

    docA.update((r) => r.t.edit(3, 3, { type: 'text', value: 'A' }));
    docB.update((r) => r.t.edit(1, 3));
    assert.equal(docA.getRoot().t.toXML(), /*html*/ `<r><p>12A</p></r>`);
    assert.equal(docB.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

    syncTwoTreeDocsAndAssertEqual(docA, docB, /*html*/ `<r><p>A</p></r>`);
  });
});
