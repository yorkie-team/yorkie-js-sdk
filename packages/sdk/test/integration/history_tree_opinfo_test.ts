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
import { Document, Tree } from '@yorkie-js/sdk/src/yorkie';
import type { ElementNode, TreeNode } from '@yorkie-js/sdk/src/yorkie';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';

type TestDoc = { t: Tree };

type TreeEditInfo = {
  type: string;
  fromPath: Array<number>;
  toPath: Array<number>;
  value?: Array<TreeNode>;
};

/**
 * `follow` mirrors `doc` into a detached document by applying only the
 * tree-edit OpInfos `doc` publishes, the way an editor binding would. If the
 * OpInfos describe the change, the mirror stays equal to `doc`.
 */
function follow(doc: Document<TestDoc>): {
  xml: () => string;
  undoRedoInfos: () => Array<TreeEditInfo>;
} {
  const mirror = new Document<TestDoc>('mirror');
  mirror.update((root) => {
    root.t = new Tree(doc.getRoot().t.getRootTreeNode() as ElementNode);
  });
  const undoRedoInfos: Array<TreeEditInfo> = [];

  doc.subscribe((event) => {
    if (event.type !== 'local-change' && event.type !== 'remote-change') {
      return;
    }
    for (const op of event.value.operations) {
      if (op.type !== 'tree-edit') {
        continue;
      }
      const info = op as unknown as TreeEditInfo;
      if (event.source === 'undoredo') {
        undoRedoInfos.push(info);
      }
      mirror.update((root) => {
        if (info.value?.length) {
          root.t.editBulkByPath(info.fromPath, info.toPath, info.value);
        } else {
          root.t.editByPath(info.fromPath, info.toPath);
        }
      });
    }
  });

  return {
    xml: () => mirror.getRoot().t.toXML(),
    undoRedoInfos: () => undoRedoInfos,
  };
}

describe('Tree History - undo/redo OpInfo positions', () => {
  const para = (value: string): ElementNode => ({
    type: 'p',
    children: [{ type: 'text', value }],
  });

  const cases: Array<{
    name: string;
    initial: Array<ElementNode>;
    edit: (t: Tree) => void;
  }> = [
    {
      name: 'insert text',
      initial: [para('abcd')],
      edit: (t) => t.editByPath([0, 2], [0, 2], { type: 'text', value: 'X' }),
    },
    {
      name: 'delete text',
      initial: [para('abcd')],
      edit: (t) => t.editByPath([0, 1], [0, 3]),
    },
    {
      name: 'insert element',
      initial: [para('ab')],
      edit: (t) => t.editByPath([1], [1], para('cd')),
    },
    {
      name: 'delete element',
      initial: [para('ab'), para('cd')],
      edit: (t) => t.editByPath([0], [1]),
    },
    {
      name: 'delete two elements',
      initial: [para('ab'), para('cd'), para('ef')],
      edit: (t) => t.editByPath([0], [2]),
    },
  ];

  for (const { name, initial, edit } of cases) {
    it(`reports where undo and redo of "${name}" landed`, async ({ task }) => {
      await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
        d1.update((root) => {
          root.t = new Tree({ type: 'doc', children: initial });
        });
        await c1.sync();
        await c2.sync();
        const sync = async () => {
          await c1.sync();
          await c2.sync();
          await c1.sync();
        };
        const m1 = follow(d1);
        const m2 = follow(d2);
        const check = (label: string) => {
          assert.equal(m1.xml(), d1.getRoot().t.toXML(), `d1 ${label}`);
          assert.equal(m2.xml(), d2.getRoot().t.toXML(), `d2 ${label}`);
        };

        d1.update((root) => edit(root.t));
        await sync();
        check('after edit');

        d1.history.undo();
        await sync();
        check('after undo');

        d1.history.redo();
        await sync();
        check('after redo');

        for (const info of m1.undoRedoInfos()) {
          assert.isAbove(info.fromPath.length, 0, 'undo/redo reports a path');
        }
      }, task.name);
    });
  }

  it('reports shifted positions when a peer edited before the undone text', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({ type: 'doc', children: [para('ab')] });
      });
      await c1.sync();
      await c2.sync();
      const sync = async () => {
        await c1.sync();
        await c2.sync();
        await c1.sync();
      };
      const m1 = follow(d1);
      const m2 = follow(d2);

      d1.update((root) =>
        root.t.editByPath([0, 2], [0, 2], { type: 'text', value: 'cd' }),
      );
      await sync();
      d2.update((root) =>
        root.t.editByPath([0, 0], [0, 0], { type: 'text', value: 'XYZ' }),
      );
      await sync();

      d1.history.undo();
      await sync();
      assert.equal(d1.getRoot().t.toXML(), '<doc><p>XYZab</p></doc>');
      assert.equal(m1.xml(), d1.getRoot().t.toXML(), 'd1 after undo');
      assert.equal(m2.xml(), d2.getRoot().t.toXML(), 'd2 after undo');
      assert.deepEqual(
        m1.undoRedoInfos().map(({ fromPath, toPath }) => [fromPath, toPath]),
        [
          [
            [0, 5],
            [0, 7],
          ],
        ],
      );
    }, task.name);
  });

  it('reports a restored subtree parent first, then its children', async ({
    task,
  }) => {
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({ type: 'doc', children: [para('ab'), para('cd')] });
      });
      await c1.sync();
      await c2.sync();
      const m1 = follow(d1);
      const m2 = follow(d2);

      d1.update((root) => root.t.editByPath([1], [2]));
      await c1.sync();
      await c2.sync();
      d1.history.undo();
      await c1.sync();
      await c2.sync();

      assert.equal(d2.getRoot().t.toXML(), '<doc><p>ab</p><p>cd</p></doc>');
      assert.equal(m1.xml(), d1.getRoot().t.toXML());
      assert.equal(m2.xml(), d2.getRoot().t.toXML());
      assert.deepEqual(
        m1.undoRedoInfos().map(({ fromPath, value }) => [fromPath, value]),
        [
          [[1], [{ type: 'p', children: [] }]],
          [[1, 0], [{ type: 'text', value: 'cd' }]],
        ],
      );
    }, task.name);
  });
});
