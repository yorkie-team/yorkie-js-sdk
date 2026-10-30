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

// A marker is written at the depth its author saw. When someone else wraps
// its container concurrently, the marker shows deeper than it was written,
// inside virtual nodes the view fills in. Edits addressed to those virtual
// nodes have to land in them.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import {
  DefaultZeroSchema,
  cloneZeroSchema,
  configureZeroSchema,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type {
  ZeroNodeJSON,
  ZeroSchema,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

type Root = { zt: ZeroTree };
const capable = [RestoreRemovedByCapability];

/**
 * `ListSchema` is ProseMirror's basic schema with lists, in Zero's shape.
 */
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
    bullet_list: 'list_item',
    list_item: 'paragraph',
  },
  allowed: {
    content: new Set(['paragraph', 'bullet_list']),
    paragraph: new Set(['inline-text', 'hard_break']),
    bullet_list: new Set(['list_item']),
    list_item: new Set(['paragraph', 'bullet_list']),
  },
};

function send(from: Document<Root>, to: Document<Root>): void {
  const pack = converter.fromChangePack<Indexable>(
    converter.toChangePack(from.createChangePack()),
  );
  to.applyChangePack(
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

function ack(doc: Document<Root>): void {
  const changes = doc.createChangePack().getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  doc.applyChangePack(
    ChangePack.create(
      doc.getKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
      undefined,
      0n,
      capable,
    ),
  );
}

function exchange(a: Document<Root>, b: Document<Root>): void {
  send(a, b);
  send(b, a);
  ack(a);
  ack(b);
}

const text = (data: string): ZeroNodeJSON => ({ type: 'inline-text', data });
const paragraph = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'paragraph',
  children,
});
const item = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'list_item',
  children,
});
const list = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'bullet_list',
  children,
});
const hardBreak: ZeroNodeJSON = { type: 'hard_break' };

function replicas(...children: Array<ZeroNodeJSON>) {
  const a = new Document<Root>('zero-tree-virtual');
  const b = new Document<Root>('zero-tree-virtual');
  a.setActor('000000000000000000000001');
  b.setActor('000000000000000000000002');
  a.update((root) => {
    root.zt = new ZeroTree({ type: 'content', children } as never);
  });
  exchange(a, b);
  return [a, b];
}

const model = (doc: Document<Root>) => doc.getRoot().zt.toZeroContent();

/**
 * `wrapped` returns two replicas after a wraps the second paragraph in a list
 * while b puts a break at its end: the break (written at depth 2) shows in a
 * virtual item and paragraph of the list.
 */
function wrapped(): [Document<Root>, Document<Root>] {
  const [a, b] = replicas(paragraph(text('ab')), paragraph(text('cd')));
  a.update((root) =>
    root.zt.applyZeroOperations([
      ['delete', [1], 1],
      ['insert', [1], [list(item(paragraph(text('cd'))))]],
    ]),
  );
  b.update((root) =>
    root.zt.applyZeroOperations([['insert', [1, 1], [hardBreak]]]),
  );
  exchange(a, b);
  return [a, b];
}

describe('ZeroTree virtual parents', () => {
  const saved = cloneZeroSchema(DefaultZeroSchema);
  beforeAll(() => configureZeroSchema(ListSchema));
  afterAll(() => configureZeroSchema(saved));

  it('shows a concurrently wrapped marker in virtual parents', () => {
    const [a, b] = wrapped();
    expect(model(a)).toEqual(model(b));
    expect(model(a).children![1]).toEqual(
      list(item(paragraph(text('cd'))), item(paragraph(hardBreak))),
    );
  });

  it('puts a node inserted at the start of a virtual parent inside it', () => {
    const [a, b] = wrapped();
    a.update((root) =>
      root.zt.applyZeroOperations([['insert', [1, 1, 0, 0], [text('Z')]]]),
    );
    // in it, before the break -- not at the end of the item before
    expect(model(a).children![1]).toEqual(
      list(item(paragraph(text('cd'))), item(paragraph(text('Z'), hardBreak))),
    );
    exchange(a, b);
    expect(model(b)).toEqual(model(a));
  });

  it('puts a block inserted at the start of a virtual item inside it', () => {
    const [a, b] = wrapped();
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['insert', [1, 1, 0], [paragraph(text('P'))]],
      ]),
    );
    expect(model(a).children![1]).toEqual(
      list(
        item(paragraph(text('cd'))),
        item(paragraph(text('P')), paragraph(hardBreak)),
      ),
    );
    exchange(a, b);
    expect(model(b)).toEqual(model(a));
  });

  // The paragraph sits between the list (depth 1) and the break (depth 2):
  // its marker carries that level (`zt.level`), which the model never shows.
  it('gives an attribute to a virtual parent without moving it', () => {
    const [a, b] = wrapped();
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['update', [1, 1, 0], { attribute: { align: 'center' } }],
      ]),
    );
    expect(model(a).children![1].children![1]).toEqual(
      item({
        type: 'paragraph',
        attribute: { align: 'center' },
        children: [hardBreak],
      }),
    );
    exchange(a, b);
    expect(model(b)).toEqual(model(a));
  });

  it('gives an attribute to a virtual item without moving it', () => {
    const [a, b] = wrapped();
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['update', [1, 1], { attribute: { checked: true } }],
      ]),
    );
    expect(model(a).children![1].children![1]).toEqual({
      type: 'list_item',
      attribute: { checked: true },
      children: [paragraph(hardBreak)],
    });
    exchange(a, b);
    expect(model(b)).toEqual(model(a));
  });

  it('splits a virtual item where Enter is pressed in it', () => {
    // b types at the end of the paragraph a wraps: the text shows in a
    // virtual item; Enter in it splits the text, the paragraph and the item
    const [a, b] = replicas(paragraph(text('ab')), paragraph(text('cd')));
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['delete', [1], 1],
        ['insert', [1], [list(item(paragraph(text('cd'))))]],
      ]),
    );
    b.update((root) =>
      root.zt.applyZeroOperations([['insert', [1, 1], [text('xy')]]]),
    );
    exchange(a, b);
    expect(model(a).children![1]).toEqual(
      list(item(paragraph(text('cd'))), item(paragraph(text('xy')))),
    );
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['split', [1, 1, 0, 0, 1]],
        ['split', [1, 1, 0, 1]],
        ['split', [1, 1, 1]],
      ]),
    );
    expect(model(a).children![1]).toEqual(
      list(
        item(paragraph(text('cd'))),
        item(paragraph(text('x'))),
        item(paragraph(text('y'))),
      ),
    );
    exchange(a, b);
    expect(model(b)).toEqual(model(a));
  });

  it.each([
    ['after', 1, [paragraph(text('')), paragraph(text('P'))]],
    ['before', 0, [paragraph(text('P')), paragraph(text(''))]],
  ])(
    'inserts a block %s the default child an empty item shows',
    (_, index, children) => {
      const [a, b] = replicas(list(item(paragraph(text('a')))));
      // the item's only paragraph goes: the item shows an empty default one,
      // as the editor holds it
      a.update((root) =>
        root.zt.applyZeroOperations([['delete', [0, 0, 0], 1]]),
      );
      expect(model(a).children![0]).toEqual(list(item(paragraph(text('')))));
      a.update((root) =>
        root.zt.applyZeroOperations([
          ['insert', [0, 0, index as number], [paragraph(text('P'))]],
        ]),
      );
      expect(model(a).children![0]).toEqual(
        list(item(...(children as Array<ZeroNodeJSON>))),
      );
      exchange(a, b);
      expect(model(b)).toEqual(model(a));
    },
  );

  it('keeps the next item of the list out of the virtual parents', () => {
    // a moves the first paragraph into the list (a new list before it, the
    // old list's marker merged away); b puts a break at the paragraph's end.
    const [a, b] = replicas(
      paragraph(text('ab')),
      list(item(paragraph(text('cd')))),
    );
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['insert', [0], [list(item(paragraph(text('ab'))))]],
        ['delete', [1], 1],
        ['merge', [1]],
      ]),
    );
    b.update((root) =>
      root.zt.applyZeroOperations([['insert', [0, 1], [hardBreak]]]),
    );
    exchange(a, b);
    // the item `cd` (written at the break's depth) is the list's next item,
    // not a child of the break's virtual item
    expect(model(a)).toEqual({
      type: 'content',
      children: [
        list(
          item(paragraph(text('ab'))),
          item(paragraph(hardBreak)),
          item(paragraph(text('cd'))),
        ),
      ],
    });
    expect(model(b)).toEqual(model(a));
  });
});
