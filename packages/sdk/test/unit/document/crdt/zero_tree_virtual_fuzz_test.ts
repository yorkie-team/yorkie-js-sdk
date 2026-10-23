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

// Random concurrent edits on three replicas of a list document, made to put
// markers under virtual parents often: paragraphs are wrapped in lists and
// lifted out (delete + insert, as an editor without a move does it) while
// others insert into them, mostly at index 0. The replicas must converge, and
// a node inserted at the start of a virtual parent must land there.
//
// FUZZ_SEEDS sets the number of seeds; FUZZ_LOG names a file the totals are
// appended to (inserts, misses anywhere, misses at a virtual start).
import { describe, it, expect, afterAll } from 'vitest';
import { appendFileSync } from 'fs';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import {
  ZeroTree,
  ZeroTreeCrdtNode,
} from '@yorkie-js/sdk/src/document/json/zero_tree';
import {
  DefaultZeroSchema,
  cloneZeroSchema,
  configureZeroSchema,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type {
  ZeroNodeJSON,
  ZeroOperation,
  ZeroSchema,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

type Root = { zt: ZeroTree };
const capable = [RestoreRemovedByCapability];

const blocks = ['paragraph', 'blockquote', 'bullet_list'];
const ListSchema: Partial<ZeroSchema> = {
  textType: 'inline-text',
  textTypes: new Set(['inline-text']),
  scoped: new Set(),
  single: undefined,
  grid: undefined,
  rootType: 'content',
  atomic: new Set(['hard_break']),
  defaultChild: {
    content: 'paragraph',
    paragraph: 'inline-text',
    blockquote: 'paragraph',
    bullet_list: 'list_item',
    list_item: 'paragraph',
  },
  allowed: {
    content: new Set(blocks),
    paragraph: new Set(['inline-text', 'hard_break']),
    blockquote: new Set(blocks),
    bullet_list: new Set(['list_item']),
    list_item: new Set(blocks),
  },
};

/** `deliver` sends what `from` has not sent yet to `to`. */
function deliver(from: Document<Root>, to: Array<Document<Root>>): void {
  const bytes = converter.toChangePack(from.createChangePack());
  for (const doc of to) {
    const pack = converter.fromChangePack<Indexable>(bytes);
    doc.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        pack.getChanges() as never,
        InitialVersionVector,
        undefined,
        0n,
        capable,
      ),
    );
  }
  const changes = from.createChangePack().getChanges();
  if (changes.length) {
    from.applyChangePack(
      ChangePack.create(
        from.getKey(),
        Checkpoint.of(0n, changes[changes.length - 1].getID().getClientSeq()),
        false,
        [],
        InitialVersionVector,
        undefined,
        0n,
        capable,
      ),
    );
  }
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const text = (data: string): ZeroNodeJSON => ({ type: 'inline-text', data });
const paragraph = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'paragraph',
  children,
});

/** every node with its path, depth first */
function nodes(
  node: ZeroNodeJSON,
  path: Array<number> = [],
  acc: Array<[Array<number>, ZeroNodeJSON]> = [],
): Array<[Array<number>, ZeroNodeJSON]> {
  (node.children ?? []).forEach((child, i) => {
    acc.push([[...path, i], child]);
    nodes(child, [...path, i], acc);
  });
  return acc;
}

function at<T extends { children?: Array<T> }>(
  root: T,
  path: Array<number>,
): T | undefined {
  let node: T | undefined = root;
  for (const i of path) {
    node = node?.children?.[i];
  }
  return node;
}

/** the text a node starts with: its own, or its first descendant's */
function firstText(node: ZeroNodeJSON | undefined): string {
  if (!node) {
    return '';
  }
  if (node.type === 'inline-text') {
    return String(node.data ?? '');
  }
  return firstText(node.children?.[0]);
}

const totals = { inserts: 0, misses: 0, virtualStarts: 0, virtualMisses: 0 };

describe('ZeroTree virtual parents (random)', () => {
  const saved = cloneZeroSchema(DefaultZeroSchema);
  afterAll(() => {
    configureZeroSchema(saved);
    if (process.env.FUZZ_LOG) {
      appendFileSync(process.env.FUZZ_LOG, `${JSON.stringify(totals)}\n`);
    }
  });

  it.each(
    Array.from(
      { length: Number(process.env.FUZZ_SEEDS ?? 100) },
      (_, i) => i + 1,
    ),
  )(
    'converges and puts inserts at the start of virtual parents (seed %i)',
    (seed) => {
      configureZeroSchema(ListSchema);
      const r = rng(seed * 7919);
      const pick = <T>(xs: Array<T>): T => xs[Math.floor(r() * xs.length)];
      const docs = [1, 2, 3].map((n) => {
        const doc = new Document<Root>('zero-virtual-fuzz');
        doc.setActor(`00000000000000000000000${n}`);
        return doc;
      });
      docs[0].update((root) => {
        root.zt = new ZeroTree({
          type: 'content',
          children: [
            paragraph(text('ab')),
            paragraph(text('cd')),
            paragraph(text('ef')),
          ],
        } as never);
      });
      deliver(docs[0], [docs[1], docs[2]]);
      let label = 0;
      for (let step = 0; step < 40; step++) {
        const doc = pick(docs);
        const model = doc.getRoot().zt.toZeroContent();
        const tops = (model.children ?? []).map((c, i) => [i, c] as const);
        const x = r();
        let ops: Array<ZeroOperation> | undefined;
        let intent:
          | { path: Array<number>; label: string; virtual: boolean }
          | undefined;
        if (x < 0.2) {
          // wrap a top-level paragraph in a list
          const ps = tops.filter(([, c]) => c.type === 'paragraph');
          if (ps.length) {
            const [i, p] = pick(ps);
            ops = [
              ['delete', [i], 1],
              [
                'insert',
                [i],
                [
                  {
                    type: 'bullet_list',
                    children: [{ type: 'list_item', children: [p] }],
                  },
                ],
              ],
            ];
          }
        } else if (x < 0.3) {
          // lift a top-level list's items out as paragraphs
          const ls = tops.filter(([, c]) => c.type === 'bullet_list');
          if (ls.length) {
            const [i, l] = pick(ls);
            const ps = (l.children ?? []).flatMap((li) => li.children ?? []);
            ops = [
              ['delete', [i], 1],
              ['insert', [i], ps.length ? ps : [paragraph()]],
            ];
          }
        } else if (x < 0.8) {
          // insert a node, mostly at index 0
          const holders: Array<[Array<number>, ZeroNodeJSON]> = [
            [[], model],
            ...nodes(model).filter(([, n]) =>
              ['paragraph', 'list_item'].includes(n.type),
            ),
          ];
          const [path, parent] = pick(holders);
          const len = parent.children?.length ?? 0;
          const index = r() < 0.6 ? 0 : Math.floor(r() * (len + 1));
          label++;
          let node: ZeroNodeJSON;
          if (parent.type === 'paragraph') {
            node = r() < 0.5 ? { type: 'hard_break' } : text(`N${label}.`);
          } else {
            node = paragraph(text(`P${label}.`));
          }
          ops = [['insert', [...path, index], [node]]];
          if (node.type !== 'hard_break') {
            const view = doc.getRoot().zt.toCrdtView();
            intent = {
              path: [...path, index],
              label: firstText(node),
              virtual:
                index === 0 && !!at<ZeroTreeCrdtNode>(view, path)?.virtual,
            };
          }
        } else if (x < 0.9) {
          // type a character
          const texts = nodes(model).filter(
            ([, n]) => n.type === 'inline-text',
          );
          if (texts.length) {
            const [path, n] = pick(texts);
            const offset = Math.floor(r() * (String(n.data ?? '').length + 1));
            ops = [['insert', [...path, offset], 'x']];
          }
        } else {
          const from = pick(docs);
          deliver(
            from,
            docs.filter((d) => d !== from),
          );
        }
        if (!ops) {
          continue;
        }
        doc.update((root) => root.zt.applyZeroOperations(ops!));
        if (intent) {
          // the inserted node is at its path (characters typed concurrently
          // into a deleted text may follow its own: compare the start)
          const got = at(doc.getRoot().zt.toZeroContent(), intent.path);
          const landed = firstText(got).startsWith(intent.label);
          totals.inserts++;
          totals.misses += landed ? 0 : 1;
          if (intent.virtual) {
            totals.virtualStarts++;
            totals.virtualMisses += landed ? 0 : 1;
            expect(landed, `step ${step} insert ${intent.path}`).toBe(true);
          }
        }
      }
      for (let round = 0; round < 2; round++) {
        for (const d of docs) {
          deliver(
            d,
            docs.filter((o) => o !== d),
          );
        }
      }
      const xml = docs.map((d) => d.getRoot().zt.toXML());
      expect(xml[1]).toBe(xml[0]);
      expect(xml[2]).toBe(xml[0]);
    },
  );
});
