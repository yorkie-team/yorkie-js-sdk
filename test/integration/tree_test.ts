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
import yorkie, { Tree } from '@yorkie-js-sdk/src/yorkie';
import {
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { TreeEditOpInfo } from '@yorkie-js-sdk/src/document/operation/operation';

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
        } as any,
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

  it('Get correct range from index', function ({ task }) {
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

  it('Get correct range from path', function ({ task }) {
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
      root.t.edit(
        3,
        3,
        { type: 'text', value: 'c' },
        { type: 'text', value: 'd' },
      );
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

      root.t.editByPath(
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        {
          type: 'text',
          value: 'X',
        },
        {
          type: 'text',
          value: 'X',
        },
      );
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXXb</tn></p></tc></doc>`,
      );

      root.t.editByPath(
        [0, 1],
        [0, 1],
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
      );
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXXb</tn></p><p><tn>test</tn></p><p><tn>text</tn></p></tc></doc>`,
      );

      root.t.editByPath(
        [0, 3],
        [0, 3],
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
      );
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><tc><p><tn>aXXb</tn></p><p><tn>test</tn></p><p><tn>text</tn></p><p><tn>test</tn></p><tn>text</tn></tc></doc>`,
      );
    });
  });

  it('Detecting error for empty text', function ({ task }) {
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
        root.t.edit(
          3,
          3,
          { type: 'text', value: 'c' },
          { type: 'text', value: '' },
        );
      });
    }, 'text node cannot have empty value');
  });

  it('Detecting error for mixed type insertion', function ({ task }) {
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
        root.t.edit(
          3,
          3,
          { type: 'p', children: [] },
          { type: 'text', value: 'd' },
        );
      });
    }, 'element node and text node cannot be passed together');
  });

  it('Detecting correct error order [1]', function ({ task }) {
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

  it('Detecting correct error order [2]', function ({ task }) {
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
        root.t.edit(
          3,
          3,
          { type: 'p', children: [{ type: 'text', value: 'c' }] },
          { type: 'p', children: [{ type: 'text', value: '' }] },
        );
      });
    }, 'text node cannot have empty value');
  });

  it('Detecting correct error order [3]', function ({ task }) {
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
        root.t.edit(
          3,
          3,
          { type: 'text', value: 'd' },
          { type: 'p', children: [{ type: 'text', value: 'c' }] },
        );
      });
    }, 'element node and text node cannot be passed together');
  });

  it('delete nodes in a multi-level range test', function ({ task }) {
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
    assert.equal(
      doc.getRoot().t.toXML(),
      /*html*/ `<doc><p>a</p><p>f</p></doc>`,
    );

    // TODO(sejongk): Use the below assertion after implementing Tree.Move.
    // assert.equal(doc.getRoot().t.toXML(), /*html*/ `<doc><p>af</p></doc>`);
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
        /*html*/ `<doc><p italic="true" bold="true">hello</p></doc>`,
      );

      assert.equal(
        d2.getRoot().t.toXML(),
        /*html*/ `<doc><p italic="true" bold="true">hello</p></doc>`,
      );
    }, task.name);
  });

  it('style node with element attributes test', function ({ task }) {
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
        /*html*/ `<doc><p weight="bold" color="red">ab</p><p>cd</p></doc>`,
      );

      // style attributes with the whole
      root.t.style(0, 4, { size: 'small' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p weight="bold" color="red" size="small">ab</p><p>cd</p></doc>`,
      );

      // 02. style attributes to elements.
      root.t.style(0, 5, { style: 'italic' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p weight="bold" color="red" size="small" style="italic">ab</p><p style="italic">cd</p></doc>`,
      );

      // 03. Ignore styling attributes to text nodes.
      root.t.style(1, 3, { bold: 'true' });
      assert.equal(
        root.t.toXML(),
        /*html*/ `<doc><p weight="bold" color="red" size="small" style="italic">ab</p><p style="italic">cd</p></doc>`,
      );
    });
  });
});

describe('Concurrent editing, overlapping range', () => {
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
});

describe('Concurrent editing, contained range', () => {
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
});

describe('Concurrent editing, side by side range', () => {
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
});

describe('Concurrent editing, complex cases', () => {
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
        r.t.edit(
          3,
          3,
          { type: 'text', value: 'a' },
          { type: 'text', value: 'bc' },
        ),
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
        r.t.edit(
          6,
          6,
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          { type: 'i', children: [{ type: 'text', value: 'fg' }] },
        ),
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
        r.t.edit(
          0,
          0,
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          { type: 'i', children: [{ type: 'text', value: 'fg' }] },
        ),
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
        r.t.edit(
          7,
          7,
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
          { type: 'i', children: [{ type: 'text', value: 'fg' }] },
        ),
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

describe('testing edge cases', () => {
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

  it('split link can transmitted through rpc', async function ({ task }) {
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

  it('can calculate size of index tree correctly', async function ({ task }) {
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
});
