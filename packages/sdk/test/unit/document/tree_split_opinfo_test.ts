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
import type { TreeEditOpInfo } from '@yorkie-js/sdk/src/document/operation/operation';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

type TestDoc = Document<{ t: Tree }>;

type JSONNode = {
  type: string;
  value?: string;
  children?: Array<JSONNode>;
  attributes?: { [key: string]: string };
};

/**
 * `exchange` hands each replica's pending changes to the other through
 * protobuf, as on the wire, and acknowledges them.
 */
function exchange(d1: TestDoc, d2: TestDoc): void {
  const p1 = converter.fromChangePack<Indexable>(
    converter.toChangePack(d1.createChangePack()),
  );
  const p2 = converter.fromChangePack<Indexable>(
    converter.toChangePack(d2.createChangePack()),
  );
  const deliver = (to: TestDoc, p: typeof p1) =>
    to.applyChangePack(
      ChangePack.create(
        p.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        p.getChanges(),
        InitialVersionVector,
      ),
    );
  deliver(d2, p1);
  deliver(d1, p2);
  const ack = (d: TestDoc, p: typeof p1) => {
    const cs = p.getChanges();
    const lastSeq = cs.length ? cs[cs.length - 1].getID().getClientSeq() : 0;
    d.applyChangePack(
      ChangePack.create(
        p.getDocumentKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        [],
        InitialVersionVector,
      ),
    );
  };
  ack(d1, p1);
  ack(d2, p2);
}

/**
 * `replicas` returns two replicas seeded with
 * `<doc><p><t>abc</t></p></doc>`; `t` is an inline element holding text.
 */
function replicas(actorA: number, actorB: number): [TestDoc, TestDoc] {
  const a: TestDoc = new Document('tree-split-opinfo');
  const b: TestDoc = new Document('tree-split-opinfo');
  a.setActor(String(actorA).padStart(24, '0'));
  b.setActor(String(actorB).padStart(24, '0'));
  a.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: [{ type: 't', children: [{ type: 'text', value: 'abc' }] }],
        },
      ],
    });
  });
  exchange(a, b);
  return [a, b];
}

/**
 * `normalize` merges adjacent text nodes, which the index paths do not tell
 * apart, so a mirror and a tree compare by what an editor would see.
 */
function normalize(node: JSONNode): JSONNode {
  if (node.type === 'text') {
    return { type: 'text', value: node.value };
  }
  const children: Array<JSONNode> = [];
  for (const child of node.children ?? []) {
    const c = normalize(child);
    const last = children[children.length - 1];
    if (c.type === 'text' && last && last.type === 'text') {
      last.value += c.value!;
    } else if (c.type !== 'text' || c.value) {
      children.push(c);
    }
  }
  return { type: node.type, children };
}

function render(node: JSONNode): string {
  if (node.type === 'text') return node.value!;
  return `<${node.type}>${(node.children ?? []).map(render).join('')}</${
    node.type
  }>`;
}

function snapshot(doc: TestDoc): JSONNode {
  return normalize(
    JSON.parse(JSON.stringify(doc.getRoot().t.getRootTreeNode())) as JSONNode,
  );
}

function hasText(node: JSONNode): boolean {
  return (node.children ?? []).some((c) => c.type === 'text');
}

/**
 * `replay` applies tree-edit OpInfos to a JSON mirror by index path, the way
 * an editor binding that keeps its own model does. An edit with
 * `fromPath == toPath` and no value is a split. OpInfos do not carry its
 * `splitLevel` today, so the caller passes the level the sender used.
 */
function replay(
  mirror: JSONNode,
  ops: Array<TreeEditOpInfo>,
  splitLevel: number,
): JSONNode {
  const root = JSON.parse(JSON.stringify(mirror)) as JSONNode;
  const at = (path: Array<number>): [Array<JSONNode>, JSONNode] => {
    const chain: Array<JSONNode> = [root];
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
      node = node.children![path[i]];
      chain.push(node);
    }
    return [chain, node];
  };
  const same = (x: Array<number>, y: Array<number>) =>
    x.length === y.length && x.every((v, i) => v === y[i]);

  for (const op of ops) {
    const { fromPath, toPath, value } = op;
    if (!same(fromPath.slice(0, -1), toPath.slice(0, -1))) {
      throw new Error(`replay: cross-parent range ${fromPath} ${toPath}`);
    }
    const [chain, parent] = at(fromPath);
    const from = fromPath[fromPath.length - 1];
    const to = toPath[toPath.length - 1];
    if (hasText(parent)) {
      const text = parent.children![0];
      const inserted = (value ?? [])
        .map((v) => (v as JSONNode).value ?? '')
        .join('');
      text.value =
        text.value!.slice(0, from) + inserted + text.value!.slice(to);
    } else {
      parent.children!.splice(
        from,
        to - from,
        ...((value ?? []) as Array<JSONNode>).map((v) => normalize(v)),
      );
    }

    if (from === to && !value?.length) {
      // Split: `splitLevel` levels, starting with the parent of the position.
      let levels = op.splitLevel || splitLevel;
      let node = parent;
      let offset = from;
      let depth = chain.length - 1;
      while (levels-- > 0 && depth > 0) {
        let right: Array<JSONNode>;
        if (hasText(node)) {
          const text = node.children![0];
          const rest = text.value!.slice(offset);
          text.value = text.value!.slice(0, offset);
          node.children = text.value ? [text] : [];
          right = rest ? [{ type: 'text', value: rest }] : [];
        } else {
          right = node.children!.splice(offset);
        }
        const grand = chain[depth - 1];
        const index = grand.children!.indexOf(node);
        grand.children!.splice(index + 1, 0, {
          type: node.type,
          children: right,
        });
        node = grand;
        offset = index + 1;
        depth--;
      }
    }
  }
  return normalize(root);
}

/** `listen` records the tree-edit OpInfos of the remote changes on `doc`. */
function listen(doc: TestDoc): Array<TreeEditOpInfo> {
  const ops: Array<TreeEditOpInfo> = [];
  doc.subscribe((event) => {
    if (event.type !== 'remote-change') return;
    for (const op of event.value.operations) {
      if (op.type === 'tree-edit') ops.push(op as TreeEditOpInfo);
    }
  });
  return ops;
}

/**
 * A remote split reports where it split, in the receiver's coordinates. When
 * the receiver concurrently inserted at the split boundary, the split keeps
 * that insert on its left (§7.3 Boundary Insert Migration), so the boundary
 * the receiver sees is after the insert. The OpInfo has to say so: an editor
 * replaying it by index otherwise moves the insert to the new node and its
 * model no longer matches the tree.
 */
describe('Tree split OpInfo with a concurrent insert at the split boundary', () => {
  type Case = {
    name: string;
    insert: (t: Tree) => void;
    split: (t: Tree) => void;
    splitLevel?: number;
  };
  const insertXY = (t: Tree) =>
    t.editByPath([0, 0, 3], [0, 0, 3], { type: 'text', value: 'XY' });
  const cases: Array<Case> = [
    {
      name: 'text split of the inline element',
      insert: insertXY,
      split: (t) => t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1),
    },
    {
      name: 'Enter: text split, then paragraph split',
      insert: insertXY,
      split: (t) => {
        t.editByPath([0, 0, 3], [0, 0, 3], undefined, 1);
        t.splitByPath([0, 1]);
      },
    },
    {
      name: 'paragraph split with a concurrent element insert at the boundary',
      insert: (t) =>
        t.editByPath([0, 1], [0, 1], {
          type: 't',
          children: [{ type: 'text', value: 'XY' }],
        }),
      split: (t) => t.splitByPath([0, 1]),
    },
    {
      name: 'text and paragraph split in one edit',
      insert: insertXY,
      split: (t) => t.editByPath([0, 0, 3], [0, 0, 3], undefined, 2),
      splitLevel: 2,
    },
    {
      name: 'split away from the insert (control)',
      insert: insertXY,
      split: (t) => t.editByPath([0, 0, 2], [0, 0, 2], undefined, 1),
    },
  ];
  // [name, A's actor, B's actor, local changes A makes first]. B syncs its
  // clock to A's on the seed exchange, so without a head start B's split
  // carries the newer ticket whatever the actor order; the head start gives
  // A's insert the newer ticket instead.
  const orders: Array<[string, number, number, number]> = [
    ['split ticket newer, inserter actor lower', 1, 2, 0],
    ['split ticket newer, inserter actor higher', 2, 1, 0],
    ['insert ticket newer', 1, 2, 2],
  ];

  for (const c of cases) {
    for (const [order, actorA, actorB, headStart] of orders) {
      it(`${c.name} (${order}): replaying the OpInfos matches the tree`, () => {
        // Given: A inserts at the boundary while B splits there.
        const [a, b] = replicas(actorA, actorB);
        for (let i = 0; i < headStart; i++) {
          a.update((root) => {
            (root as unknown as { n: number }).n = i;
          });
        }
        a.update((root) => c.insert(root.t));
        b.update((root) => c.split(root.t));
        const mirrorA = snapshot(a);
        const mirrorB = snapshot(b);
        const opsA = listen(a);
        const opsB = listen(b);

        // When: they exchange.
        exchange(a, b);

        // Then: both converge, and replaying each side's remote OpInfos on
        // that side's own model reproduces its tree.
        const xmlA = a.getRoot().t.toXML();
        const xmlB = b.getRoot().t.toXML();
        assert.equal(xmlA, xmlB, 'replicas diverged');
        assert.equal(
          render(replay(mirrorB, opsB, c.splitLevel ?? 1)),
          render(snapshot(b)),
          `B replay of ${JSON.stringify(opsB)}`,
        );
        assert.equal(
          render(replay(mirrorA, opsA, c.splitLevel ?? 1)),
          render(snapshot(a)),
          `A replay of ${JSON.stringify(
            opsA.map(({ fromPath, toPath, from, to, value, splitLevel }) => ({
              fromPath,
              toPath,
              from,
              to,
              value,
              splitLevel,
            })),
          )}; A tree ${xmlA}`,
        );
      });
    }
  }
});
