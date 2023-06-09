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
  TreeNode,
  ElementNode,
} from '@yorkie-js-sdk/src/yorkie';
import { ChangePack } from '@yorkie-js-sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';
import {
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { TreeEditOpInfo } from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `listEqual` is a helper function that the given tree is equal to the
 * expected list of nodes.
 */
function listEqual(tree: Tree, expected: Array<TreeNode>) {
  const nodes: Array<TreeNode> = [];
  for (const node of tree) {
    nodes.push(node);
  }
  assert.deepEqual(nodes, expected);
}

/**
 * `createChangePack` is a helper function that creates a change pack from the
 * given document. It is used to to emulate the behavior of the server.
 */
function createChangePack(doc: Document<unknown>): ChangePack {
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
  );
  doc.applyChangePack(resPack);

  // 02. Create a pack to apply the changes to other replicas.
  return ChangePack.create(
    reqPack.getDocumentKey(),
    Checkpoint.of(reqCP.getServerSeq().add(reqPack.getChangeSize()), 0),
    false,
    reqPack.getChanges(),
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
      root.t.edit(1, 5, { type: 'text', value: 'Yorkie' });
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
      listEqual(root.t, [
        { type: 'text', value: 'ab' },
        { type: 'p', children: [] },
        { type: 'text', value: 'cd' },
        { type: 'note', children: [] },
        { type: 'text', value: 'ef' },
        { type: 'note', children: [] },
        { type: 'ng', children: [] },
        { type: 'text', value: 'gh' },
        { type: 'bp', children: [] },
        { type: 'doc', children: [] },
      ]);
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
          value: { type: 'text', value: 'X' },
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
          value: { type: 'text', value: 'X' },
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
                children: [
                  { type: 'tn', children: [{ type: 'text', value: '' }] },
                ],
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
        children: [{ type: 'tn', children: [{ type: 'text', value: '' }] }],
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
        children: [{ type: 'tn', children: [{ type: 'text', value: '' }] }],
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
        children: [{ type: 'tn', children: [{ type: 'text', value: '' }] }],
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
        children: [{ type: 'tn', children: [{ type: 'text', value: '' }] }],
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
});

describe('Tree.edit', function () {
  it.skip('Can insert text to the same position(left) concurrently', function () {
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
});
