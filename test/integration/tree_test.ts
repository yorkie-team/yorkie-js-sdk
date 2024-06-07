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

import { describe, it, assert } from 'vitest';
import yorkie, { Tree, SyncMode, converter } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { EventCollector } from '@yorkie-js-sdk/test/helper/helper';
import {
  TreeEditOpInfo,
  TreeStyleOpInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { Document, DocEventType } from '@yorkie-js-sdk/src/document/document';
import { toXML } from '@yorkie-js-sdk/src/document/crdt/tree';

describe('Tree', () => {
  it('Can be created', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Can be created from JSON', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Can be created from JSON with attrebutes', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

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
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p><span bold="true">hello</span></p></doc>`,
      );
    });
  });

  it('Can edit its content', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Can be subscribed by handler', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
        },
      ],
    );
  });

  it('Can be subscribed by handler(path)', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

    const actualOps: Array<TreeEditOpInfo> = [];
    doc.subscribe('$.t', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;

        actualOps.push(
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
      actualOps.map((it) => {
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
        },
      ],
    );
  });

  it('Can edit its content with path', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Can edit its content with path 2', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Can sync its content with other clients', async function ({ task }) {
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
    }, task.name);
  });

  it('Should return correct range from index', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Should return correct range from path', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Should return correct range from index within doc.subscribe', async function ({
    task,
  }) {
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

      d1.update((root, presence) => {
        root.t.edit(1, 1, { type: 'text', value: 'a' });
        const posSelection = root.t.indexRangeToPosRange([2, 2]);
        presence.set({ selection: posSelection });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>ahello</p></doc>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>ahello</p></doc>`);
      const { selection } = d1.getMyPresence();
      assert.deepEqual(d1.getRoot().t.posRangeToIndexRange(selection), [2, 2]);

      const eventCollector = new EventCollector<{ type: DocEventType }>();
      const unsub = d1.subscribe((event) => {
        assert.deepEqual(
          d1.getRoot().t.posRangeToIndexRange(selection),
          [2, 2],
        );
        eventCollector.add({ type: event.type });
      });
      d2.update((root) => {
        root.t.edit(2, 2, { type: 'text', value: 'b' });
      });
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p>abhello</p></doc>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<doc><p>abhello</p></doc>`,
      );

      await eventCollector.waitAndVerifyNthEvent(1, {
        type: DocEventType.RemoteChange,
      });
      unsub();
    }, task.name);
  });
});

describe('Tree.edit', function () {
  it('Can insert multiple text nodes', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
      root.t.editBulk(3, 3, [
        { type: 'text', value: 'c' },
        { type: 'text', value: 'd' },
      ]);
    });

    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>abcd</p></doc>`);
  });

  it('Can insert multiple element nodes', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
      root.t.editBulk(4, 4, [
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        { type: 'i', children: [{ type: 'text', value: 'fg' }] },
      ]);
    });

    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p>ab</p><p>cd</p><i>fg</i></doc>`,
    );
  });

  it('Can edit its content with path when multi tree nodes passed', function ({
    task,
  }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

      root.t.editBulkByPath(
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [
          {
            type: 'text',
            value: 'X',
          },
          {
            type: 'text',
            value: 'X',
          },
        ],
      );
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXXb</tn></p></tc></doc>`,
      );

      root.t.editBulkByPath(
        [0, 1],
        [0, 1],
        [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'te' },
                  { type: 'text', value: 'st' },
                ],
              },
            ],
          },
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'te' },
                  { type: 'text', value: 'xt' },
                ],
              },
            ],
          },
        ],
      );
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXXb</tn></p><p><tn>test</tn></p><p><tn>text</tn></p></tc></doc>`,
      );

      root.t.editBulkByPath(
        [0, 3],
        [0, 3],
        [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'te' },
                  { type: 'text', value: 'st' },
                ],
              },
            ],
          },
          {
            type: 'tn',
            children: [
              { type: 'text', value: 'te' },
              { type: 'text', value: 'xt' },
            ],
          },
        ],
      );
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXXb</tn></p><p><tn>test</tn></p><p><tn>text</tn></p><p><tn>test</tn></p><tn>text</tn></tc></doc>`,
      );
    });
  });

  it('Should detect error for empty text', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
        root.t.editBulk(3, 3, [
          { type: 'text', value: 'c' },
          { type: 'text', value: '' },
        ]);
      });
    }, 'text node cannot have empty value');
  });

  it('Should detect error for mixed type insertion', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
        root.t.editBulk(3, 3, [
          { type: 'p', children: [] },
          { type: 'text', value: 'd' },
        ]);
      });
    }, 'element node and text node cannot be passed together');
  });

  it('Should detect correct error order [1]', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
        root.t.editBulk(3, 3, [
          {
            type: 'p',
            children: [
              { type: 'text', value: 'c' },
              { type: 'text', value: '' },
            ],
          },
          { type: 'text', value: 'd' },
        ]);
      });
    }, 'element node and text node cannot be passed together');
  });

  it('Should detect correct error order [2]', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
        root.t.editBulk(3, 3, [
          { type: 'p', children: [{ type: 'text', value: 'c' }] },
          { type: 'p', children: [{ type: 'text', value: '' }] },
        ]);
      });
    }, 'text node cannot have empty value');
  });

  it('Should detect correct error order [3]', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
        root.t.editBulk(3, 3, [
          { type: 'text', value: 'd' },
          { type: 'p', children: [{ type: 'text', value: 'c' }] },
        ]);
      });
    }, 'element node and text node cannot be passed together');
  });

  it('Can delete nodes in a multi-level range', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              { type: 'text', value: 'ab' },
              { type: 'p', children: [{ type: 'text', value: 'x' }] },
            ],
          },
          {
            type: 'p',
            children: [
              {
                type: 'p',
                children: [{ type: 'text', value: 'cd' }],
              },
            ],
          },
          {
            type: 'p',
            children: [
              { type: 'p', children: [{ type: 'text', value: 'y' }] },
              { type: 'text', value: 'ef' },
            ],
          },
        ],
      });
    });
    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p>ab<p>x</p></p><p><p>cd</p></p><p><p>y</p>ef</p></doc>`,
    );

    doc.update((root) => root.t.edit(2, 18));
    assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>af</p></doc>`);
  });
});

describe('Tree.style', function () {
  it('Can be inserted with attributes', function ({ task }) {
    const doc = new yorkie.Document<{ t: Tree }>(toDocKey(task.name));
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

  it('Can be edited removal with index', function ({ task }) {
    const doc = new yorkie.Document<{ t: Tree }>(toDocKey(task.name));
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

    doc.update((root) => {
      root.t.removeStyle(1, 8, ['bold']);
    });

    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p><span>hello</span></p></doc>`,
    );
  });

  it('Can handle removal of attributes that do not exist', function ({ task }) {
    const doc = new yorkie.Document<{ t: Tree }>(toDocKey(task.name));
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
              {
                type: 'span',
                children: [{ type: 'text', value: 'hi' }],
              },
            ],
          },
        ],
      });
    });

    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p><span bold="true">hello</span><span>hi</span></p></doc>`,
    );

    doc.update((root) => {
      root.t.removeStyle(1, 12, ['italic']);
    });

    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p><span bold="true">hello</span><span>hi</span></p></doc>`,
    );

    doc.update((root) => {
      root.t.removeStyle(1, 8, ['italic', 'bold']);
    });

    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p><span>hello</span><span>hi</span></p></doc>`,
    );
  });

  it('Can be edited with index', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Can be edited with path', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Can style nested object', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'hello' }] }],
      });
      assert.equal(root.t.toXML(), /*html*/ `<doc><p>hello</p></doc>`);
    });

    doc.update((root) =>
      root.t.style(0, 1, { img: { src: 'yorkie.png' }, rep: 'false' }),
    );
    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p img="{\\"src\\":\\"yorkie.png\\"}" rep="false">hello</p></doc>`,
    );
  });

  it('Can sync its content containing attributes with other replicas', async function ({
    task,
  }) {
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
        /*html*/ `<doc><p bold="true" italic="true">hello</p></doc>`,
      );

      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<doc><p bold="true" italic="true">hello</p></doc>`,
      );
    }, task.name);
  });

  it('Can style node with element attributes test', function ({ task }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
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
            type: 'p',
            children: [{ type: 'text', value: 'cd' }],
          },
        ],
      });

      assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p><p>cd</p></doc>`);

      // 01. style attributes to an element node.
      // style attributes with opening tag
      root.t.style(0, 1, { weight: 'bold' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p weight="bold">ab</p><p>cd</p></doc>`,
      );

      // style attributes with closing tag
      root.t.style(3, 4, { color: 'red' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p color="red" weight="bold">ab</p><p>cd</p></doc>`,
      );

      // style attributes with the whole
      root.t.style(0, 4, { size: 'small' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p color="red" size="small" weight="bold">ab</p><p>cd</p></doc>`,
      );

      // 02. style attributes to elements.
      root.t.style(0, 5, { style: 'italic' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p color="red" size="small" style="italic" weight="bold">ab</p><p style="italic">cd</p></doc>`,
      );

      // 03. Ignore styling attributes to text nodes.
      root.t.style(1, 3, { bold: 'true' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p color="red" size="small" style="italic" weight="bold">ab</p><p style="italic">cd</p></doc>`,
      );
    });
  });

  it('Can sync its content with remove style', async function ({ task }) {
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
        root.t.removeStyle(0, 1, ['italic']);
      });
      await c1.sync();
      await c2.sync();

      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>hello</p></doc>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>hello</p></doc>`);
    }, task.name);
  });

  it('Should return correct range path within doc.subscribe', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'c',
              children: [
                {
                  type: 'u',
                  children: [
                    {
                      type: 'p',
                      children: [
                        {
                          type: 'n',
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'c',
              children: [
                {
                  type: 'p',
                  children: [
                    {
                      type: 'n',
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n></n></p></c></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n></n></p></c></r>`,
      );

      d2.update((r) =>
        r.t.editByPath([1, 0, 0, 0], [1, 0, 0, 0], {
          type: 'text',
          value: '1',
        }),
      );
      d2.update((r) =>
        r.t.editByPath([1, 0, 0, 1], [1, 0, 0, 1], {
          type: 'text',
          value: '2',
        }),
      );
      d2.update((r) =>
        r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 2], {
          type: 'text',
          value: '3',
        }),
      );
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>123</n></p></c></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>123</n></p></c></r>`,
      );

      d1.update((r) =>
        r.t.editByPath([1, 0, 0, 1], [1, 0, 0, 1], {
          type: 'text',
          value: 'abcdefgh',
        }),
      );
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1abcdefgh23</n></p></c></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1abcdefgh23</n></p></c></r>`,
      );

      d2.update((r) =>
        r.t.editByPath([1, 0, 0, 5], [1, 0, 0, 5], {
          type: 'text',
          value: '4',
        }),
      );
      d2.update((r) => r.t.editByPath([1, 0, 0, 6], [1, 0, 0, 7]));
      d2.update((r) =>
        r.t.editByPath([1, 0, 0, 6], [1, 0, 0, 6], {
          type: 'text',
          value: '5',
        }),
      );
      await c2.sync();
      await c1.sync();

      const eventCollector = new EventCollector<{ type: DocEventType }>();
      const unsub = d2.subscribe((event) => {
        if (event.type === 'local-change' || event.type === 'remote-change') {
          const operation = event.value.operations[0] as TreeEditOpInfo;
          const { fromPath, toPath } = operation;
          assert.deepEqual(fromPath, [1, 0, 0, 7]);
          assert.deepEqual(toPath, [1, 0, 0, 8]);
          eventCollector.add({ type: event.type });
        }
      });

      d2.update((r) => r.t.editByPath([1, 0, 0, 7], [1, 0, 0, 8]));

      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1abcd45gh23</n></p></c></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1abcd45gh23</n></p></c></r>`,
      );

      await eventCollector.waitAndVerifyNthEvent(1, {
        type: DocEventType.LocalChange,
      });
      unsub();
    }, task.name);
  });

  it('Can handle client reload case', async function ({ task }) {
    type TestDoc = { t: Tree; num: number };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);

    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });

    // Perform a dummy update to apply changes up to the snapshot threshold.
    const snapshotThreshold = 500;
    for (let idx = 0; idx < snapshotThreshold; idx++) {
      d1.update((root) => {
        root.num = 0;
      });
    }

    // Start scenario.
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          {
            type: 'c',
            children: [
              {
                type: 'u',
                children: [
                  {
                    type: 'p',
                    children: [
                      {
                        type: 'n',
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'c',
            children: [
              {
                type: 'p',
                children: [
                  {
                    type: 'n',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      });
    });
    await c1.sync();
    await c2.sync();
    assert.equal(
      d1.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n></n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n></n></p></c></r>`,
    );

    d1.update((r) => {
      r.t.editByPath([1, 0, 0, 0], [1, 0, 0, 0], {
        type: 'text',
        value: '1',
      });
      r.t.editByPath([1, 0, 0, 1], [1, 0, 0, 1], {
        type: 'text',
        value: '2',
      });
      r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 2], {
        type: 'text',
        value: '3',
      });
      r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 2], {
        type: 'text',
        value: ' ',
      });
      r.t.editByPath([1, 0, 0, 3], [1, 0, 0, 3], {
        type: 'text',
        value: '네이버랑 ',
      });
    });
    await c1.sync();
    await c2.sync();
    assert.equal(
      d1.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>12 네이버랑 3</n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>12 네이버랑 3</n></p></c></r>`,
    );

    d2.update((r) => {
      r.t.editByPath([1, 0, 0, 1], [1, 0, 0, 8], {
        type: 'text',
        value: ' 2 네이버랑 ',
      });
      r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 2], {
        type: 'text',
        value: 'ㅋ',
      });
      r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 3], {
        type: 'text',
        value: '카',
      });
      r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 3], {
        type: 'text',
        value: '캌',
      });
      r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 3], {
        type: 'text',
        value: '카카',
      });
      r.t.editByPath([1, 0, 0, 3], [1, 0, 0, 4], {
        type: 'text',
        value: '캉',
      });
      r.t.editByPath([1, 0, 0, 3], [1, 0, 0, 4], {
        type: 'text',
        value: '카오',
      });
      r.t.editByPath([1, 0, 0, 4], [1, 0, 0, 5], {
        type: 'text',
        value: '올',
      });
      r.t.editByPath([1, 0, 0, 4], [1, 0, 0, 5], {
        type: 'text',
        value: '오라',
      });
      r.t.editByPath([1, 0, 0, 5], [1, 0, 0, 6], {
        type: 'text',
        value: '랑',
      });
      r.t.editByPath([1, 0, 0, 6], [1, 0, 0, 6], {
        type: 'text',
        value: ' ',
      });
    });
    await c2.sync();
    await c1.sync();
    assert.equal(
      d1.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오랑 2 네이버랑 3</n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오랑 2 네이버랑 3</n></p></c></r>`,
    );

    d1.update((r) => {
      r.t.editByPath([1, 0, 0, 13], [1, 0, 0, 14]);
      r.t.editByPath([1, 0, 0, 12], [1, 0, 0, 13]);
    });
    await c1.sync();
    await c2.sync();
    assert.equal(
      d1.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오랑 2 네이버3</n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오랑 2 네이버3</n></p></c></r>`,
    );

    d2.update((r) => {
      r.t.editByPath([1, 0, 0, 6], [1, 0, 0, 7]);
      r.t.editByPath([1, 0, 0, 5], [1, 0, 0, 6]);
    });
    await c2.sync();
    await c1.sync();
    assert.equal(
      d1.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오2 네이버3</n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오2 네이버3</n></p></c></r>`,
    );

    d1.update((r) => {
      r.t.editByPath([1, 0, 0, 9], [1, 0, 0, 10]);
    });
    await c1.sync();
    await c2.sync();
    assert.equal(
      d1.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오2 네이3</n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오2 네이3</n></p></c></r>`,
    );

    // A new client has been added.
    const d3 = new yorkie.Document<TestDoc>(docKey);
    const c3 = new yorkie.Client(testRPCAddr);
    await c3.activate();
    await c3.attach(d3, { syncMode: SyncMode.Manual });
    assert.equal(
      d3.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카카오2 네이3</n></p></c></r>`,
    );
    await c2.sync();

    d3.update((r) => {
      r.t.editByPath([1, 0, 0, 4], [1, 0, 0, 5]);
      r.t.editByPath([1, 0, 0, 3], [1, 0, 0, 4]);
    });
    await c3.sync();
    await c2.sync();
    assert.equal(
      d3.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카2 네이3</n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 카2 네이3</n></p></c></r>`,
    );

    d3.update((r) => {
      r.t.editByPath([1, 0, 0, 2], [1, 0, 0, 3]);
    });

    await c3.sync();
    await c2.sync();
    assert.equal(
      d3.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 2 네이3</n></p></c></r>`,
    );
    assert.equal(
      d2.getRoot().t.toXML(),
      /*html*/ `<r><c><u><p><n></n></p></u></c><c><p><n>1 2 네이3</n></p></c></r>`,
    );

    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });
});

describe('Tree.edit(concurrent overlapping range)', () => {
  it('Can concurrently delete overlapping elements', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [] },
            { type: 'i', children: [] },
            { type: 'b', children: [] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p></p><i></i><b></b></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p></p><i></i><b></b></r>`,
      );

      d1.update((r) => r.t.edit(0, 4));
      d2.update((r) => r.t.edit(2, 6));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><b></b></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);
    }, task.name);
  });

  it('Can concurrently delete overlapping text', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>abcd</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>abcd</p></r>`);

      d1.update((r) => r.t.edit(1, 4));
      d2.update((r) => r.t.edit(2, 5));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>d</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    }, task.name);
  });

  it('overlapping-merge-and-merge', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
            { type: 'p', children: [{ type: 'text', value: 'c' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(5, 7));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>abc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>abc</p></r>`);
    }, task.name);
  });

  it.skip('overlapping-merge-and-delete-element-node', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(3, 6));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);
    }, task.name);
  });

  it.skip('overlapping-merge-and-delete-text-nodes', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'bcde' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>bcde</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>bcde</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(4, 6));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>abcde</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>de</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ade</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ade</p></r>`);
    }, task.name);
  });
});

describe('Tree.edit(concurrent, contained range)', () => {
  it('Can concurrently insert and delete contained elements of the same depth', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '1234' }] },
            { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p>abcd</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p>abcd</p></r>`,
      );

      d1.update((r) => r.t.edit(6, 6, { type: 'p', children: [] }));
      d2.update((r) => r.t.edit(0, 12));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p></p><p>abcd</p></r>`,
      );
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    }, task.name);
  });

  it('Can concurrently multiple insert and delete contained elements of the same depth', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '1234' }] },
            { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p>abcd</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p>abcd</p></r>`,
      );

      d1.update((r) => r.t.edit(6, 6, { type: 'p', children: [] }));
      d1.update((r) => r.t.edit(8, 8, { type: 'p', children: [] }));
      d1.update((r) => r.t.edit(10, 10, { type: 'p', children: [] }));
      d1.update((r) => r.t.edit(12, 12, { type: 'p', children: [] }));
      d2.update((r) => r.t.edit(0, 12));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p></p><p></p><p></p><p></p><p>abcd</p></r>`,
      );
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p></p><p></p><p></p><p></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p></p><p></p><p></p><p></p></r>`,
      );
    }, task.name);
  });

  it('Detecting error when inserting and deleting contained elements at different depths', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'i', children: [] }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);

      d1.update((r) => r.t.edit(2, 2, { type: 'i', children: [] }));
      d2.update((r) => r.t.edit(1, 3));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><i><i></i></i></p></r>`,
      );
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    }, task.name);
  });

  it('Can concurrently delete contained elements', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
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
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><i>1234</i></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><i>1234</i></p></r>`,
      );

      d1.update((r) => r.t.edit(0, 8));
      d2.update((r) => r.t.edit(1, 7));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);
    }, task.name);
  });

  it('Can concurrently insert and delete contained text', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '1234' }],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

      d1.update((r) => r.t.edit(1, 5));
      d2.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);
    }, task.name);
  });

  it('Can concurrently delete contained text', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '1234' }],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

      d1.update((r) => r.t.edit(1, 5));
      d2.update((r) => r.t.edit(2, 4));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>14</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    }, task.name);
  });

  it('Can concurrently insert and delete contained text and elements', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '1234' }],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

      d1.update((r) => r.t.edit(0, 6));
      d2.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);
    }, task.name);
  });

  it('Can concurrently delete contained text and elements', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '1234' }],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

      d1.update((r) => r.t.edit(0, 6));
      d2.update((r) => r.t.edit(1, 5));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);
    }, task.name);
  });

  it('contained-split-and-split-at-the-same-position', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(2, 2, undefined, 1));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p></p><p>b</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p></p><p>b</p></r>`,
      );
    }, task.name);
  });

  it('contained-split-and-split-at-diffrent-positions-on-the-same-node', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'abc' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>abc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>abc</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(3, 3, undefined, 1));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
    }, task.name);
  });

  it.skip('contained-split-and-split-at-different-levels', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [
                { type: 'p', children: [{ type: 'text', value: 'ab' }] },
                { type: 'p', children: [{ type: 'text', value: 'c' }] },
              ],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><p>ab</p><p>c</p></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>ab</p><p>c</p></p></r>`,
      );

      d1.update((r) => r.t.edit(3, 3, undefined, 1));
      d2.update((r) => r.t.edit(5, 5, undefined, 1));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p><p>c</p></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>ab</p></p><p><p>c</p></p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p></p><p><p>c</p></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p></p><p><p>c</p></p></r>`,
      );
    }, task.name);
  });

  it('contained-split-and-insert-into-the-split-position', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(2, 2, { type: 'text', value: 'c' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>acb</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ac</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ac</p><p>b</p></r>`);
    }, task.name);
  });

  it('contained-split-and-insert-into-original-node', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(1, 1, { type: 'text', value: 'c' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>cab</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ca</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ca</p><p>b</p></r>`);
    }, task.name);
  });

  it('contained-split-and-insert-into-split-node', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(3, 3, { type: 'text', value: 'c' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>abc</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);
    }, task.name);
  });

  it('contained-split-and-delete-contents-in-split-node', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(2, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p></p></r>`);
    }, task.name);
  });

  it.skip('contained-split-and-delete-the-whole-original-and-split-nodes', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(0, 4));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);
    }, task.name);
  });

  it('contained-merge-and-merge-at-different-levels', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [
                { type: 'p', children: [{ type: 'text', value: 'a' }] },
                { type: 'p', children: [{ type: 'text', value: 'b' }] },
              ],
            },
            { type: 'p', children: [{ type: 'text', value: 'c' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p></p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p></p><p>c</p></r>`,
      );

      d1.update((r) => r.t.edit(3, 5));
      d2.update((r) => r.t.edit(7, 9));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><p>ab</p></p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p>c</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><p>ab</p>c</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><p>ab</p>c</p></r>`);
    }, task.name);
  });

  it.skip('contained-merge-and-merge-at-the-same-level', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
            { type: 'p', children: [{ type: 'text', value: 'c' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 7));
      d2.update((r) => r.t.edit(5, 7));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
    }, task.name);
  });

  it.skip('contained-merge-and-insert', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(4, 4, { type: 'text', value: 'c' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>cb</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>acb</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>acb</p></r>`);
    }, task.name);
  });

  it('contained-merge-and-delete-the-whole', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(0, 6));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);
    }, task.name);
  });

  it.skip('contained-merge-and-delete-contents-in-merged-node', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'bc' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(4, 5));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>abc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>c</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
    }, task.name);
  });

  it('contained-merge-and-delete-sub-range-in-merged-range', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
            { type: 'p', children: [{ type: 'text', value: 'c' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 7));
      d2.update((r) => r.t.edit(3, 6));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>c</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ac</p></r>`);
    }, task.name);
  });

  it('contained-merge-and-split-merged-node', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'bc' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>bc</p></r>`);

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(5, 5, undefined, 1));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>abc</p></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);
    }, task.name);
  });

  it('contained-merge-and-split-at-multi-levels', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [
                { type: 'p', children: [{ type: 'text', value: 'a' }] },
                { type: 'p', children: [{ type: 'text', value: 'b' }] },
              ],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p><p>b</p></p></r>`,
      );

      d1.update((r) => r.t.edit(3, 5));
      d2.update((r) => r.t.edit(4, 4, undefined, 1));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><p>ab</p></p></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>a</p></p><p><p>b</p></p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><p>ab</p></p><p></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><p>ab</p></p><p></p></r>`,
      );
    }, task.name);
  });
});

describe('Tree.edit(concurrent, side by side range)', () => {
  it('Can concurrently insert side by side elements (left)', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      d1.update((r) => r.t.edit(0, 0, { type: 'b', children: [] }));
      d2.update((r) => r.t.edit(0, 0, { type: 'i', children: [] }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><b></b><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><i></i><p></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><i></i><b></b><p></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><i></i><b></b><p></p></r>`,
      );
    }, task.name);
  });

  it('Can concurrently insert side by side elements (middle)', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      d1.update((r) => r.t.edit(1, 1, { type: 'b', children: [] }));
      d2.update((r) => r.t.edit(1, 1, { type: 'i', children: [] }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><i></i><b></b></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><i></i><b></b></p></r>`,
      );
    }, task.name);
  });

  it('Can concurrently insert side by side elements (right)', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      d1.update((r) => r.t.edit(2, 2, { type: 'b', children: [] }));
      d2.update((r) => r.t.edit(2, 2, { type: 'i', children: [] }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p><b></b></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p><i></i></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p></p><i></i><b></b></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p></p><i></i><b></b></r>`,
      );
    }, task.name);
  });

  it('Can concurrently insert and delete side by side elements', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [{ type: 'b', children: [] }],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);

      d1.update((r) => r.t.edit(1, 3));
      d2.update((r) => r.t.edit(1, 1, { type: 'i', children: [] }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><i></i><b></b></p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);
    }, task.name);
  });

  it('Can concurrently delete and insert side by side elements', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            {
              type: 'p',
              children: [{ type: 'b', children: [] }],
            },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);

      d1.update((r) => r.t.edit(1, 3));
      d2.update((r) => r.t.edit(3, 3, { type: 'i', children: [] }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><b></b><i></i></p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);
    }, task.name);
  });

  it('Can concurrently delete side by side elements', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
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
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p><b></b><i></i></p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p><b></b><i></i></p></r>`,
      );

      d1.update((r) => r.t.edit(1, 3));
      d2.update((r) => r.t.edit(3, 5));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p><i></i></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><b></b></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    }, task.name);
  });

  it('Can insert text to the same position(left) concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      d1.update((r) => r.t.edit(1, 1, { type: 'text', value: 'A' }));
      d2.update((r) => r.t.edit(1, 1, { type: 'text', value: 'B' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>A12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>B12</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>BA12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>BA12</p></r>`);
    }, task.name);
  });

  it('Can insert text to the same position(middle) concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      d1.update((r) => r.t.edit(2, 2, { type: 'text', value: 'A' }));
      d2.update((r) => r.t.edit(2, 2, { type: 'text', value: 'B' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1A2</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1B2</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1BA2</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1BA2</p></r>`);
    }, task.name);
  });

  it('Can insert text content to the same position(right) concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      d1.update((r) => r.t.edit(3, 3, { type: 'text', value: 'A' }));
      d2.update((r) => r.t.edit(3, 3, { type: 'text', value: 'B' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12A</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12B</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12BA</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12BA</p></r>`);
    }, task.name);
  });

  it('Can concurrently insert and delete side by side text', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '1234' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

      d1.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
      d2.update((r) => r.t.edit(3, 5));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12a</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12a</p></r>`);
    }, task.name);
  });

  it('Can concurrently delete and insert side by side text', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '1234' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

      d1.update((r) => r.t.edit(3, 3, { type: 'text', value: 'a' }));
      d2.update((r) => r.t.edit(1, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12a34</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>34</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a34</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a34</p></r>`);
    }, task.name);
  });

  it('Can concurrently delete side by side text blocks', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '1234' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1234</p></r>`);

      d1.update((r) => r.t.edit(3, 5));
      d2.update((r) => r.t.edit(1, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>34</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    }, task.name);
  });

  it('Can delete text content at the same position(left) concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

      d1.update((r) => r.t.edit(1, 2));
      d2.update((r) => r.t.edit(1, 2));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
    }, task.name);
  });

  it('Can delete text content at the same position(middle) concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

      d1.update((r) => r.t.edit(2, 3));
      d2.update((r) => r.t.edit(2, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);
    }, task.name);
  });

  it('Can delete text content at the same position(right) concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

      d1.update((r) => r.t.edit(3, 4));
      d2.update((r) => r.t.edit(3, 4));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
    }, task.name);
  });

  it('side-by-side-split-and-split', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'ab' }] },
            { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>cd</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>cd</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(6, 6, undefined, 1));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>cd</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>c</p><p>d</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p><p>d</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p><p>d</p></r>`,
      );
    }, task.name);
  });

  it.skip('side-by-side-split-and-insert', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) =>
        r.t.edit(4, 4, { type: 'p', children: [{ type: 'text', value: 'c' }] }),
      );
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
    }, task.name);
  });

  it.skip('side-by-side-split-and-delete', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'ab' }] },
            { type: 'p', children: [{ type: 'text', value: 'c' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);

      d1.update((r) => r.t.edit(2, 2, undefined, 1));
      d2.update((r) => r.t.edit(4, 7));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
    }, task.name);
  });

  it('side-by-side-merge-and-merge', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
            { type: 'p', children: [{ type: 'text', value: 'c' }] },
            { type: 'p', children: [{ type: 'text', value: 'd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p><p>d</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p><p>d</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(8, 10));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>c</p><p>d</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>cd</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>cd</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>cd</p></r>`,
      );
    }, task.name);
  });

  it('side-by-side-merge-and-insert', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) =>
        r.t.edit(6, 6, { type: 'p', children: [{ type: 'text', value: 'c' }] }),
      );
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);
    }, task.name);
  });

  it('side-by-side-merge-and-delete', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
            { type: 'p', children: [{ type: 'text', value: 'c' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(6, 9));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p><p>c</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>a</p><p>b</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>ab</p></r>`);
    }, task.name);
  });

  it('side-by-side-merge-and-split', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: 'a' }] },
            { type: 'p', children: [{ type: 'text', value: 'b' }] },
            { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>cd</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>cd</p></r>`,
      );

      d1.update((r) => r.t.edit(2, 4));
      d2.update((r) => r.t.edit(8, 8, undefined, 1));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>cd</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>a</p><p>b</p><p>c</p><p>d</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>c</p><p>d</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>ab</p><p>c</p><p>d</p></r>`,
      );
    }, task.name);
  });
});

describe('Tree.edit(concurrent, complex cases)', () => {
  it('Can delete text content anchored to another concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

      d1.update((r) => r.t.edit(1, 2));
      d2.update((r) => r.t.edit(2, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>13</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>3</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>3</p></r>`);
    }, task.name);
  });

  it('Can produce complete deletion concurrently', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '123' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

      d1.update((r) => r.t.edit(1, 2));
      d2.update((r) => r.t.edit(2, 4));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>23</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
    }, task.name);
  });

  it('Can handle block delete concurrently', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '12345' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

      d1.update((r) => r.t.edit(1, 3));
      d2.update((r) => r.t.edit(4, 6));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>345</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>123</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>3</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>3</p></r>`);
    }, task.name);
  });

  it('Can handle insert within block delete concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '12345' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

      d1.update((r) => r.t.edit(2, 5));
      d2.update((r) => r.t.edit(3, 3, { type: 'text', value: 'B' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>15</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12B345</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1B5</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1B5</p></r>`);
    }, task.name);
  });

  it('Can handle insert within block delete concurrently [2]', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '12345' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

      d1.update((r) => r.t.edit(2, 6));
      d2.update((r) =>
        r.t.editBulk(3, 3, [
          { type: 'text', value: 'a' },
          { type: 'text', value: 'bc' },
        ]),
      );
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12abc345</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1abc</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>1abc</p></r>`);
    }, task.name);
  });

  it('Can handle block element insertion within delete [2]', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '1234' }] },
            { type: 'p', children: [{ type: 'text', value: '5678' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p>5678</p></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p>5678</p></r>`,
      );

      d1.update((r) => r.t.edit(0, 12));
      d2.update((r) =>
        r.t.editBulk(6, 6, [
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          { type: 'i', children: [{ type: 'text', value: 'fg' }] },
        ]),
      );
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>1234</p><p>cd</p><i>fg</i><p>5678</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>cd</p><i>fg</i></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>cd</p><i>fg</i></r>`,
      );
    }, task.name);
  });

  it('Can handle concurrent element insert/ deletion (left)', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '12345' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

      d1.update((r) => r.t.edit(0, 7));
      d2.update((r) =>
        r.t.editBulk(0, 0, [
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          { type: 'i', children: [{ type: 'text', value: 'fg' }] },
        ]),
      );
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>cd</p><i>fg</i><p>12345</p></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>cd</p><i>fg</i></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>cd</p><i>fg</i></r>`,
      );
    }, task.name);
  });

  it('Can handle concurrent element insert/ deletion (right)', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: '12345' }] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12345</p></r>`);

      d1.update((r) => r.t.edit(0, 7));
      d2.update((r) =>
        r.t.editBulk(7, 7, [
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          { type: 'i', children: [{ type: 'text', value: 'fg' }] },
        ]),
      );

      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>12345</p><p>cd</p><i>fg</i></r>`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<r><p>cd</p><i>fg</i></r>`,
      );
      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<r><p>cd</p><i>fg</i></r>`,
      );
    }, task.name);
  });

  it('Can handle deletion of insertion anchor concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
        });
      });

      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      d1.update((r) => r.t.edit(2, 2, { type: 'text', value: 'A' }));
      d2.update((r) => r.t.edit(1, 2));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>1A2</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>2</p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>A2</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>A2</p></r>`);
    }, task.name);
  });

  it('Can handle deletion after insertion concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      d1.update((r) => r.t.edit(1, 1, { type: 'text', value: 'A' }));
      d2.update((r) => r.t.edit(1, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>A12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>A</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>A</p></r>`);
    }, task.name);
  });

  it('Can handle deletion before insertion concurrently', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [{ type: 'text', value: '12' }] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>12</p></r>`);

      d1.update((r) => r.t.edit(3, 3, { type: 'text', value: 'A' }));
      d2.update((r) => r.t.edit(1, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>12A</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p>A</p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p>A</p></r>`);
    }, task.name);
  });
});

describe('Tree(edge cases)', () => {
  it('Can delete very first text when there is tombstone in front of target text', function ({
    task,
  }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      // 01. Create a tree and insert a paragraph.
      root.t = new Tree();
      root.t.edit(0, 0, {
        type: 'p',
        children: [{ type: 'text', value: 'abcdefghi' }],
      });
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abcdefghi</p></root>`);

      root.t.edit(1, 1, { type: 'text', value: '12345' });
      assert.equal(root.t.toXML(), `<root><p>12345abcdefghi</p></root>`);

      root.t.edit(2, 5);
      assert.equal(root.t.toXML(), `<root><p>15abcdefghi</p></root>`);

      root.t.edit(3, 5);
      assert.equal(root.t.toXML(), `<root><p>15cdefghi</p></root>`);

      root.t.edit(2, 4);
      assert.equal(root.t.toXML(), `<root><p>1defghi</p></root>`);

      root.t.edit(1, 3);
      assert.equal(root.t.toXML(), `<root><p>efghi</p></root>`);

      root.t.edit(1, 2);
      assert.equal(root.t.toXML(), `<root><p>fghi</p></root>`);

      root.t.edit(2, 5);
      assert.equal(root.t.toXML(), `<root><p>f</p></root>`);

      root.t.edit(1, 2);
      assert.equal(root.t.toXML(), `<root><p></p></root>`);
    });
  });

  it('Can delete node when there is more than one text node in front which has size bigger than 1', function ({
    task,
  }) {
    const key = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ t: Tree }>(key);

    doc.update((root) => {
      // 01. Create a tree and insert a paragraph.
      root.t = new Tree();
      root.t.edit(0, 0, {
        type: 'p',
        children: [{ type: 'text', value: 'abcde' }],
      });
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abcde</p></root>`);

      root.t.edit(6, 6, {
        type: 'text',
        value: 'f',
      });
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abcdef</p></root>`);

      root.t.edit(7, 7, {
        type: 'text',
        value: 'g',
      });
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abcdefg</p></root>`);

      root.t.edit(7, 8);
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abcdef</p></root>`);
      root.t.edit(6, 7);
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abcde</p></root>`);
      root.t.edit(5, 6);
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abcd</p></root>`);
      root.t.edit(4, 5);
      assert.equal(root.t.toXML(), /*html*/ `<root><p>abc</p></root>`);
      root.t.edit(3, 4);
      assert.equal(root.t.toXML(), /*html*/ `<root><p>ab</p></root>`);
      root.t.edit(2, 3);
      assert.equal(root.t.toXML(), /*html*/ `<root><p>a</p></root>`);
      root.t.edit(1, 2);
      assert.equal(root.t.toXML(), /*html*/ `<root><p></p></root>`);
    });
  });

  it('Can split link can transmitted through rpc', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });

      d1.update((root) => {
        root.t.edit(2, 2, { type: 'text', value: '1' });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>a1b</p></doc>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>a1b</p></doc>`);

      d2.update((root) => {
        root.t.edit(3, 3, { type: 'text', value: '1' });
      });

      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>a11b</p></doc>`);

      d2.update((root) => {
        root.t.edit(2, 3, { type: 'text', value: '12' });
      });

      d2.update((root) => {
        root.t.edit(4, 5, { type: 'text', value: '21' });
      });

      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>a1221b</p></doc>`);

      // if split link is not transmitted, then left sibling in from index below, is "b" not "a"
      d2.update((root) => {
        root.t.edit(2, 4, { type: 'text', value: '123' });
      });

      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<doc><p>a12321b</p></doc>`,
      );
    }, task.name);
  });

  it('Can calculate size of index tree correctly', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
      });

      d1.update((root) => {
        root.t.edit(2, 2, { type: 'text', value: '123' });
      });
      d1.update((root) => {
        root.t.edit(2, 2, { type: 'text', value: '456' });
      });
      d1.update((root) => {
        root.t.edit(2, 2, { type: 'text', value: '789' });
      });
      d1.update((root) => {
        root.t.edit(2, 2, { type: 'text', value: '0123' });
      });

      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p>a0123789456123b</p></doc>`,
      );
      await c1.sync();
      await c2.sync();

      const size = d1.getRoot().t.getIndexTree().getRoot().size;

      assert.equal(d2.getRoot().t.getIndexTree().getRoot().size, size);
    }, task.name);
  });

  it('Can calculate size of index tree correctly during concurrent editing', async function ({
    task,
  }) {
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

      d1.update((root) => root.t.edit(0, 7));
      d2.update((root) => root.t.edit(1, 2, { type: 'text', value: 'p' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc></doc>`);
      assert.equal(0, d1.getRoot().t.getSize());
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>pello</p></doc>`);
      assert.equal(7, d2.getRoot().t.getSize());
      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc></doc>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc></doc>`);
      assert.equal(d2.getRoot().t.getSize(), d1.getRoot().t.getSize());
    }, task.name);
  });

  it('Can keep index tree consistent from snapshot', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'r',
          children: [{ type: 'p', children: [] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p></p></r>`);

      d1.update((root) => root.t.edit(0, 2));
      d2.update((root) => {
        root.t.edit(1, 1, {
          type: 'i',
          children: [{ type: 'text', value: 'a' }],
        });
        root.t.edit(2, 3, { type: 'text', value: 'b' });
      });
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d1.getRoot().t.getSize(), 0);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r><p><i>b</i></p></r>`);
      assert.equal(5, d2.getRoot().t.getSize());
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<r></r>`);
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<r></r>`);

      const d1Nodes: Array<[string, number, boolean]> = [];
      const d2Nodes: Array<[string, number, boolean]> = [];
      const sNodes: Array<[string, number, boolean]> = [];
      d1.getRoot()
        .t.getIndexTree()
        .traverseAll((node) => {
          d1Nodes.push([toXML(node), node.size, node.isRemoved]);
        });
      d2.getRoot()
        .t.getIndexTree()
        .traverseAll((node) => {
          d2Nodes.push([toXML(node), node.size, node.isRemoved]);
        });
      const sRoot = converter.bytesToObject(
        converter.objectToBytes(d1.getRootObject()),
      );
      (sRoot.get('t') as unknown as Tree).getIndexTree().traverseAll((node) => {
        sNodes.push([toXML(node), node.size, node.isRemoved]);
      });
      assert.deepEqual(d1Nodes, d2Nodes);
      assert.deepEqual(d1Nodes, sNodes);
    }, task.name);
  });

  it('Can split and merge with empty paragraph: left', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [
                { type: 'text', value: 'a' },
                { type: 'text', value: 'b' },
              ],
            },
          ],
        });
      });
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      d1.update((root) => root.t.edit(1, 1, undefined, 1));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p></p><p>ab</p></doc>`,
      );
      d1.update((root) => root.t.edit(1, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    }, task.name);
  });

  it('Can split and merge with empty paragraph: right', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [
                { type: 'text', value: 'a' },
                { type: 'text', value: 'b' },
              ],
            },
          ],
        });
      });
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      d1.update((root) => root.t.edit(3, 3, undefined, 1));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p>ab</p><p></p></doc>`,
      );
      d1.update((root) => root.t.edit(3, 5));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    }, task.name);
  });

  it('Can split and merge with empty paragraph and multiple split level: left', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [
                {
                  type: 'p',
                  children: [
                    { type: 'text', value: 'a' },
                    { type: 'text', value: 'b' },
                  ],
                },
              ],
            },
          ],
        });
      });
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p><p>ab</p></p></doc>`,
      );

      d1.update((root) => root.t.edit(2, 2, undefined, 2));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p><p></p></p><p><p>ab</p></p></doc>`,
      );
      d1.update((root) => root.t.edit(2, 6));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p><p>ab</p></p></doc>`,
      );

      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    }, task.name);
  });

  it('Can split at the same offset multiple times', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [
                { type: 'text', value: 'a' },
                { type: 'text', value: 'b' },
              ],
            },
          ],
        });
      });
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      d1.update((root) => root.t.edit(2, 2, undefined, 1));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p>a</p><p>b</p></doc>`,
      );

      d1.update((root) => root.t.edit(2, 2, { type: 'text', value: 'c' }));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p>ac</p><p>b</p></doc>`,
      );

      d1.update((root) => root.t.edit(2, 2, undefined, 1));
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p>a</p><p>c</p><p>b</p></doc>`,
      );

      d1.update((root) => root.t.edit(2, 7, undefined));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);

      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    }, task.name);
  });
});

describe('TreeChange', () => {
  it('Concurrent delete and delete', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
        assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);
      });
      await c1.sync();
      await c2.sync();

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((root) => root.t.edit(0, 4));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc></doc>`);

      d2.update((root) => root.t.edit(1, 2));
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>b</p></doc>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());

      assert.deepEqual(
        ops1.map((it) => {
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
            from: 0,
            to: 4,
            value: undefined,
          },
        ],
      );

      assert.deepEqual(
        ops2.map((it) => {
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
            to: 2,
            value: undefined,
          },
          {
            type: 'tree-edit',
            from: 0,
            to: 3,
            value: undefined,
          },
        ],
      );
    }, task.name);
  });

  it('Concurrent delete and insert', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
        assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);
      });
      await c1.sync();
      await c2.sync();

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((root) => root.t.edit(1, 3));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p></p></doc>`);

      d2.update((root) => root.t.edit(2, 2, { type: 'text', value: 'c' }));
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>acb</p></doc>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());

      assert.deepEqual(
        ops1.map((it) => {
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
            to: 3,
            value: undefined,
          },
          {
            type: 'tree-edit',
            from: 1,
            to: 1,
            value: [{ type: 'text', value: 'c' }],
          },
        ],
      );

      assert.deepEqual(
        ops2.map((it) => {
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
            from: 2,
            to: 2,
            value: [{ type: 'text', value: 'c' }],
          },
          {
            type: 'tree-edit',
            from: 3,
            to: 4,
            value: undefined,
          },
          {
            type: 'tree-edit',
            from: 1,
            to: 2,
            value: undefined,
          },
        ],
      );
    }, task.name);
  });

  it('Concurrent delete and insert when parent removed', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
        });
        assert.equal(root.t.toXML(), /*html*/ `<doc><p>ab</p></doc>`);
      });
      await c1.sync();
      await c2.sync();

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((root) => root.t.edit(0, 4));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc></doc>`);

      d2.update((root) => root.t.edit(2, 2, { type: 'text', value: 'c' }));
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>acb</p></doc>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());

      assert.deepEqual(
        ops1.map((it) => {
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
            from: 0,
            to: 4,
            value: undefined,
          },
        ],
      );

      assert.deepEqual(
        ops2.map((it) => {
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
            from: 2,
            to: 2,
            value: [{ type: 'text', value: 'c' }],
          },
          {
            type: 'tree-edit',
            from: 0,
            to: 5,
            value: undefined,
          },
        ],
      );
    }, task.name);
  });

  it('Concurrent delete with contents and insert', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [{ type: 'text', value: 'a' }] }],
        });
        assert.equal(root.t.toXML(), /*html*/ `<doc><p>a</p></doc>`);
      });
      await c1.sync();
      await c2.sync();

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((root) => root.t.edit(1, 2, { type: 'text', value: 'b' }));
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>b</p></doc>`);

      d2.update((root) => root.t.edit(2, 2, { type: 'text', value: 'c' }));
      assert.equal(d2.getRoot().t.toXML(), /*html*/ `<doc><p>ac</p></doc>`);

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());

      assert.deepEqual(
        ops1.map((it) => {
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
            to: 2,
            value: [{ type: 'text', value: 'b' }],
          },
          {
            type: 'tree-edit',
            from: 2,
            to: 2,
            value: [{ type: 'text', value: 'c' }],
          },
        ],
      );

      assert.deepEqual(
        ops2.map((it) => {
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
            from: 2,
            to: 2,
            value: [{ type: 'text', value: 'c' }],
          },
          {
            type: 'tree-edit',
            from: 1,
            to: 2,
            value: [{ type: 'text', value: 'b' }],
          },
        ],
      );
    }, task.name);
  });

  it('Concurrent insert and style', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p></p></doc>`);

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((root) => root.t.style(0, 1, { key: 'a' }));
      d1.update((root) => root.t.style(0, 1, { key: 'a' }));
      d2.update((root) => root.t.edit(0, 0, { type: 'p', children: [] }));
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p></p><p key="a"></p></doc>`,
      );

      const editChange: TreeEditOpInfo = {
        type: 'tree-edit',
        path: '$.t',
        from: 0,
        to: 0,
        fromPath: [0],
        toPath: [0],
        value: [{ children: [], type: 'p' }],
        splitLevel: undefined,
      };
      const styleChange: TreeStyleOpInfo = {
        type: 'tree-style',
        path: '$.t',
        from: 0,
        to: 1,
        fromPath: [0],
        toPath: [0, 0],
        value: { attributes: { key: 'a' } },
      };
      const styleChange2: TreeStyleOpInfo = {
        ...styleChange,
        from: 2,
        to: 3,
        fromPath: [1],
        toPath: [1, 0],
      };

      assert.deepEqual(ops1, [styleChange, styleChange, editChange]);
      assert.deepEqual(ops2, [editChange, styleChange2, styleChange2]);
    }, task.name);
  });

  it('Concurrent insert and removeStyle', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', attributes: { key: 'a' }, children: [] }],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p key="a"></p></doc>`,
      );

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((root) => root.t.removeStyle(0, 1, ['key']));
      d1.update((root) => root.t.removeStyle(0, 1, ['key']));
      d2.update((root) => root.t.edit(0, 0, { type: 'p', children: [] }));
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p></p><p></p></doc>`,
      );

      const editChange: TreeEditOpInfo = {
        type: 'tree-edit',
        path: '$.t',
        from: 0,
        to: 0,
        fromPath: [0],
        toPath: [0],
        value: [{ children: [], type: 'p' }],
        splitLevel: undefined,
      };
      const styleChange: TreeStyleOpInfo = {
        type: 'tree-style',
        path: '$.t',
        from: 0,
        to: 1,
        fromPath: [0],
        toPath: [0, 0],
        value: {
          attributesToRemove: ['key'],
        },
      };
      const styleChange2: TreeStyleOpInfo = {
        ...styleChange,
        from: 2,
        to: 3,
        fromPath: [1],
        toPath: [1, 0],
      };

      assert.deepEqual(ops1, [styleChange, styleChange, editChange]);
      assert.deepEqual(ops2, [editChange, styleChange2, styleChange2]);
    }, task.name);
  });

  it('Concurrent delete and style', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'root',
          children: [
            { type: 't', attributes: { id: '1', value: 'init' }, children: [] },
            { type: 't', attributes: { id: '2', value: 'init' }, children: [] },
          ],
        });
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<root><t id="1" value="init"></t><t id="2" value="init"></t></root>`,
      );

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((root) => root.t.styleByPath([0], { value: 'changed' }));
      d2.update((root) => root.t.editByPath([0], [1]));
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<root><t id="2" value="init"></t></root>`,
      );

      assert.deepEqual(
        ops1.map((it) => {
          return { type: it.type, from: it.from, to: it.to, value: it.value };
        }),
        [
          {
            type: 'tree-style',
            from: 0,
            to: 1,
            value: { attributes: { value: 'changed' } },
          },
          {
            type: 'tree-edit',
            from: 0,
            to: 2,
            value: undefined,
          },
        ],
      );

      assert.deepEqual(
        ops2.map((it) => {
          return { type: it.type, from: it.from, to: it.to, value: it.value };
        }),
        [
          {
            type: 'tree-edit',
            from: 0,
            to: 2,
            value: undefined,
          },
        ],
      );
    }, task.name);
  });

  it('Concurrent style and style', async function ({ task }) {
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
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(d1.getRoot().t.toXML(), /*html*/ `<doc><p>hello</p></doc>`);

      const [ops1, ops2] = subscribeDocs(d1, d2);

      d1.update((r) => r.t.style(0, 1, { bold: 'true' }));
      d2.update((r) => r.t.style(0, 1, { bold: 'false' }));
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
      assert.equal(
        d1.getRoot().t.toXML(),
        /*html*/ `<doc><p bold="false">hello</p></doc>`,
      );

      assert.deepEqual(
        ops1.map((it) => {
          return { type: it.type, from: it.from, to: it.to, value: it.value };
        }),
        [
          {
            type: 'tree-style',
            from: 0,
            to: 1,
            value: { attributes: { bold: 'true' } },
          },
          {
            type: 'tree-style',
            from: 0,
            to: 1,
            value: { attributes: { bold: 'false' } },
          },
        ],
      );

      assert.deepEqual(
        ops2.map((it) => {
          return { type: it.type, from: it.from, to: it.to, value: it.value };
        }),
        [
          {
            type: 'tree-style',
            from: 0,
            to: 1,
            value: { attributes: { bold: 'false' } },
          },
        ],
      );
    }, task.name);
  });
});

function subscribeDocs(
  d1: Document<{ t: Tree }>,
  d2: Document<{ t: Tree }>,
): [
  Array<TreeEditOpInfo | TreeStyleOpInfo>,
  Array<TreeEditOpInfo | TreeStyleOpInfo>,
] {
  const ops1: Array<TreeEditOpInfo | TreeStyleOpInfo> = [];
  const ops2: Array<TreeEditOpInfo | TreeStyleOpInfo> = [];

  d1.subscribe('$.t', (event) => {
    ops1.push(...event.value.operations);
  });

  d2.subscribe('$.t', (event) => {
    ops2.push(...event.value.operations);
  });

  return [ops1, ops2];
}
