/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { converter, Document, Tree, TreeNode } from '@yorkie-js/sdk/src/yorkie';
import { describe, bench, assert } from 'vitest';
import { maxVectorOf } from '../helper/helper';

const benchmarkTreeEdit = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [] }],
    });

    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i, { type: 'text', value: 'a' });
    }
  });
};

const benchmarkTreeDeleteAll = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [] }],
    });

    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i, { type: 'text', value: 'a' });
    }
  });

  doc.update((root) => {
    root.tree.edit(1, size + 1);
  }, 'delete them');
  assert.equal(doc.getRoot().tree.toXML(), `<doc><p></p></doc>`);
};

const benchmarkTreeSplitGC = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'a'.repeat(size) }] },
      ],
    });
  });

  doc.update((root) => {
    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i + 1, { type: 'text', value: 'b' });
    }
  }, `modify ${size} nodes`);
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(
    size,
    doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()])),
  );
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};

const benchmarkTreeEditGC = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [] }],
    });
  });
  doc.update((root) => {
    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i, { type: 'text', value: 'a' });
    }
  });

  doc.update((root) => {
    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i + 1, { type: 'text', value: 'b' });
    }
  }, `modify ${size} nodes`);
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(
    size,
    doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()])),
  );
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};

const benchmarkTreeConvert = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');
  doc.update((root) => {
    const children: Array<TreeNode> = [];
    for (let i = 1; i <= size; i++) {
      children.push({ type: 'text', value: 'a' });
    }

    root.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children }],
    });
  });

  const root = doc.getRoot().tree.getIndexTree().getRoot();
  const pbTreeNodes = converter.toTreeNodes(root);
  converter.fromTreeNodes(pbTreeNodes);
};

describe('tree.edit', () => {
  bench('tree.edit 100', () => {
    benchmarkTreeEdit(100);
  });

  bench('tree.edit 1000', () => {
    benchmarkTreeEdit(1000);
  });

  bench('tree.edit 100', () => {
    benchmarkTreeEdit(100);
  });

  bench('tree.edit 1000', () => {
    benchmarkTreeEdit(1000);
  });

  bench('tree delete all 1000', () => {
    benchmarkTreeDeleteAll(1000);
  });
});

describe('tree GC', () => {
  bench('tree split GC 100', () => {
    benchmarkTreeSplitGC(100);
  });

  bench('tree split GC 1000', () => {
    benchmarkTreeSplitGC(1000);
  });

  bench('tree edit GC 100', () => {
    benchmarkTreeEditGC(100);
  });

  bench('tree edit GC 1000', () => {
    benchmarkTreeEditGC(1000);
  });
});

describe('tree convert', () => {
  bench('tree convert from/to Protobuf 10000', () => {
    benchmarkTreeConvert(10000);
  });

  bench('tree convert from/to Protobuf 20000', () => {
    benchmarkTreeConvert(20000);
  });

  bench('tree convert from/to Protobuf 30000', () => {
    benchmarkTreeConvert(30000);
  });
});
