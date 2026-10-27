/**
 * General-purpose checks: ZeroTree used with a ProseMirror basic + list
 * shaped schema instead of the Zero one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import {
  applyZeroOperation,
  configureZeroSchema,
  DefaultZeroSchema,
  cloneZeroSchema,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type {
  ZeroNodeJSON,
  ZeroSchema,
  ZeroOperation,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type { CRDTZeroTree } from '@yorkie-js/sdk/src/document/crdt/zero_tree';

import { appendFileSync } from 'fs';
const note = (...args: Array<unknown>) =>
  appendFileSync(
    process.env.ZT_LOG ?? '/dev/null',
    args.map(String).join(' ') + '\n',
  );
type Root = { zt: ZeroTree };
const capable = [RestoreRemovedByCapability];

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

// ProseMirror basic + list expressed as a ZeroSchema.
// - A PM text node (with its marks) is the text type `text`; marks are style.*
// - PM attrs = attribute.*
const PM: ZeroSchema = {
  textType: 'text',
  textTypes: new Set(['text']),
  scoped: new Set(),
  single: undefined,
  grid: undefined,
  rootType: 'doc',
  atomic: new Set(['image', 'hard_break', 'horizontal_rule']),
  defaultChild: {
    // A PM paragraph is inline*, so it has no required child: an empty
    // paragraph has no children.
    blockquote: 'paragraph',
    bullet_list: 'list_item',
    ordered_list: 'list_item',
    list_item: 'paragraph',
  },
  allowed: {
    doc: new Set([
      'paragraph',
      'heading',
      'blockquote',
      'bullet_list',
      'ordered_list',
      'code_block',
      'horizontal_rule',
    ]),
    paragraph: new Set(['text', 'image', 'hard_break']),
    heading: new Set(['text', 'image', 'hard_break']),
    code_block: new Set(['text']),
    blockquote: new Set([
      'paragraph',
      'heading',
      'blockquote',
      'bullet_list',
      'ordered_list',
      'code_block',
      'horizontal_rule',
    ]),
    bullet_list: new Set(['list_item']),
    ordered_list: new Set(['list_item']),
    list_item: new Set([
      'paragraph',
      'heading',
      'blockquote',
      'bullet_list',
      'ordered_list',
      'code_block',
    ]),
  },
};

const t = (text: string, style?: Record<string, unknown>): ZeroNodeJSON =>
  style ? { type: 'text', data: text, style } : { type: 'text', data: text };
const p = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'paragraph',
  children,
});
const li = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'list_item',
  children,
});
const ul = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'bullet_list',
  children,
});
const doc = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'doc',
  children,
});

let seq = 0;
function replicas(init: ZeroNodeJSON): [Document<Root>, Document<Root>] {
  seq++;
  const a = new Document<Root>(`g-${seq}`);
  const b = new Document<Root>(`g-${seq}`);
  a.setActor('000000000000000000000001');
  b.setActor('000000000000000000000002');
  a.update((root) => {
    root.zt = new ZeroTree(init as never);
  });
  exchange(a, b);
  return [a, b];
}
const model = (d: Document<Root>) => d.getRoot().zt.toZeroContent();
const xml = (d: Document<Root>) => d.getRoot().zt.toXML();
const ops = (d: Document<Root>, list: Array<ZeroOperation>) =>
  d.update((root) => root.zt.applyZeroOperations(list));
const crdtOf = (d: Document<Root>) =>
  (d.getRootObject() as CRDTObject).get('zt') as unknown as CRDTZeroTree;

/** `recordRemote` collects the operations of remote zero-tree events. */
function recordRemote(d: Document<Root>): Array<ZeroOperation> {
  const got: Array<ZeroOperation> = [];
  d.subscribe((event) => {
    if (event.type !== 'remote-change') return;
    for (const info of event.value.operations) {
      if ((info as any).type === 'zero-tree') {
        got.push(...(info as any).operations);
      }
    }
  });
  return got;
}

const saved = cloneZeroSchema(DefaultZeroSchema);

describe('ZeroTree with a ProseMirror basic+list schema', () => {
  beforeAll(() => {
    configureZeroSchema(PM);
  });

  it('keeps the PM schema in the document state of a tree created after configureZeroSchema', () => {
    const [a, b] = replicas(doc(p(t('hello'))));
    expect(model(a)).toEqual(doc(p(t('hello'))));
    expect(crdtOf(b).getSchema().rootType).toBe('doc');
    // Empty paragraph: no defaultChild, so no children (same as PM)
    ops(a, [['delete', [0, 0], 1]]);
    exchange(a, b);
    expect(model(b)).toEqual(doc(p()));
    // Typing into the empty paragraph creates a new text node
    ops(b, [['insert', [0, 0], 'x']]);
    exchange(a, b);
    expect(model(a)).toEqual(doc(p(t('x'))));
  });

  it('merges a partial schema in configureZeroSchema and keeps the earlier keys', () => {
    const before = cloneZeroSchema(DefaultZeroSchema);
    configureZeroSchema({ rootType: 'root2' });
    // allowed, defaultChild and the rest stay PM; only rootType changes
    expect(DefaultZeroSchema.allowed.doc).toBeDefined();
    expect(DefaultZeroSchema.rootType).toBe('root2');
    // Switching from the Zero default to PM without grid/scoped keeps the
    // Zero table rules
    configureZeroSchema(saved);
    configureZeroSchema({ ...PM, grid: undefined } as any);
    expect(DefaultZeroSchema.grid).toBeUndefined();
    configureZeroSchema(saved);
    const partial: Partial<ZeroSchema> = { ...PM };
    delete partial.grid;
    delete partial.scoped;
    configureZeroSchema(partial);
    expect(DefaultZeroSchema.grid?.table).toBe('table');
    expect([...DefaultZeroSchema.scoped]).toContain('table');
    configureZeroSchema(before);
  });

  it('keeps the schema of an existing tree when the process switches schemas', () => {
    const [a] = replicas(doc(p(t('x'))));
    configureZeroSchema(saved); // back to the Zero schema
    const z = new Document<Root>('zero-doc');
    z.update((root) => {
      root.zt = new ZeroTree({
        type: 'content',
        children: [
          { type: 'paragraph', children: [{ type: 'inline-text', data: 'z' }] },
        ],
      } as never);
    });
    expect(crdtOf(z).getSchema().rootType).toBe('content');
    expect(crdtOf(a).getSchema().rootType).toBe('doc');
    ops(a, [['insert', [0, 0, 1], 'y']]);
    expect(model(a)).toEqual(doc(p(t('xy'))));
    configureZeroSchema(PM);
  });

  it('drops node JSON keys outside style/attribute/data, such as PM attrs and marks', () => {
    const [a] = replicas(doc(p(t('x'))));
    ops(a, [
      [
        'insert',
        [1],
        [
          {
            type: 'heading',
            attrs: { level: 2 },
            children: [
              { type: 'text', data: 'H', marks: [{ type: 'strong' }] },
            ],
          } as any,
        ],
      ],
    ]);
    expect(model(a).children![1]).toEqual({
      type: 'heading',
      children: [{ type: 'text', data: 'H' }],
    });
    // Moved to attribute.*, they are kept
    ops(a, [
      [
        'insert',
        [2],
        [{ type: 'heading', attribute: { level: 2 }, children: [t('H2')] }],
      ],
    ]);
    expect(model(a).children![2].attribute).toEqual({ level: 2 });
  });

  it('merges concurrent Enters at the same place into one line', () => {
    const [a, b] = replicas(doc(p(t('abcd'))));
    const enter: Array<ZeroOperation> = [
      ['split', [0, 0, 2]],
      ['split', [0, 1]],
    ];
    ops(a, enter);
    ops(b, enter);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    // A plain text CRDT (two '\n') would give three paragraphs; this gives two
    expect(model(a).children!.length).toBe(2);
  });

  it('converges an Enter inside a list item (three-level split) with a concurrent one', () => {
    const [a, b] = replicas(doc(ul(li(p(t('abcd'))))));
    // PM splitListItem: text → paragraph → list_item
    ops(a, [
      ['split', [0, 0, 0, 0, 2]],
      ['split', [0, 0, 0, 1]],
      ['split', [0, 0, 1]],
    ]);
    ops(b, [
      ['split', [0, 0, 0, 0, 3]],
      ['split', [0, 0, 0, 1]],
      ['split', [0, 0, 1]],
    ]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(xml(a)).toBe(
      '<doc><bullet_list><list_item><paragraph><text>ab</text></paragraph></list_item>' +
        '<list_item><paragraph><text>c</text></paragraph></list_item>' +
        '<list_item><paragraph><text>d</text></paragraph></list_item></bullet_list></doc>',
    );
  });

  it('applies overlapping concurrent range formats to the pieces the other side split', () => {
    const [a, b] = replicas(doc(p(t('abcdef'))));
    // A: [1,4) bold - two boundary splits and an update in between
    ops(a, [
      ['split', [0, 0, 4]],
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    // B: [2,5) italic
    ops(b, [
      ['split', [0, 0, 5]],
      ['split', [0, 0, 2]],
      ['update', [0, 1], { style: { italic: true } }],
    ]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    const runs = (model(a).children![0].children ?? []).map(
      (c) =>
        `${c.data}:${Object.keys(c.style ?? {})
          .sort()
          .join('+')}`,
    );
    // Intended: a, b(bold), cd(bold+italic), e(italic), f
    // (before range formats, cd was italic only and e had no format)
    expect(runs).toEqual(['a:', 'b:bold', 'cd:bold+italic', 'e:italic', 'f:']);
  });

  it('formats text typed concurrently inside a range format', () => {
    const [a, b] = replicas(doc(p(t('abcdef'))));
    ops(a, [
      ['split', [0, 0, 4]],
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    ops(b, [['insert', [0, 0, 3], 'X']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(model(a).children![0].children).toEqual([
      t('a'),
      t('bcXd', { bold: true }),
      t('ef'),
    ]);
  });

  it('keeps neighboring texts with the same format, so paths differ from the normalized PM model', () => {
    const [a] = replicas(doc(p(t('abcd'))));
    ops(a, [
      ['split', [0, 0, 2]],
      ['update', [0, 1], { style: { bold: true } }],
      ['update', [0, 1], { style: { bold: null } }],
    ]);
    // PM would have one text "abcd". ZeroTree has two.
    expect(model(a).children![0].children).toEqual([t('ab'), t('cd')]);
    // Sending the PM position (offset 3 in the paragraph) as the PM path
    // [0,0,3] clamps to the end of the first text node (2): 'abXcd', not 'abcXd'
    ops(a, [['insert', [0, 0, 3], 'X']]);
    expect(model(a).children![0].children).toEqual([t('abX'), t('cd')]);
  });

  it('inserts at the intended place through the normalized rich view and its paths', () => {
    const [a] = replicas(doc(p(t('abcd'))));
    ops(a, [
      ['split', [0, 0, 2]],
      ['update', [0, 1], { style: { bold: true } }],
      ['update', [0, 1], { style: { bold: null } }],
      ['split', [0, 1, 2]],
    ]);
    // The Zero model keeps the boundary and an empty text; the rich view has one text
    expect(model(a).children![0].children).toEqual([t('ab'), t('cd'), t('')]);
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('abcd'),
    ]);
    a.update((root) =>
      root.zt.applyRichOperations([['insert', [0, 0, 3], 'X']]),
    );
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('abcXd'),
    ]);
    // A delete across two Zero nodes
    a.update((root) => root.zt.applyRichOperations([['delete', [0, 0, 1], 2]]));
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('aXd'),
    ]);
  });

  it('keeps both overlapping concurrent rich formats', () => {
    const [a, b] = replicas(doc(p(t('abcdef'))));
    a.update((root) =>
      root.zt.applyRichOperations([
        ['format', [0], { from: 1, to: 4, style: { bold: true } }],
      ]),
    );
    b.update((root) =>
      root.zt.applyRichOperations([
        ['format', [0], { from: 2, to: 5, style: { italic: true } }],
      ]),
    );
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('a'),
      t('b', { bold: true }),
      t('cd', { bold: true, italic: true }),
      t('e', { italic: true }),
      t('f'),
    ]);
  });

  it('converges a block type change (paragraph to heading) with typing in that paragraph', () => {
    const [a, b] = replicas(doc(p(t('abcd')), p(t('next'))));
    const remoteA = recordRemote(a);
    // type is not an LWW attribute, so it is only a delete and an insert
    ops(a, [
      ['delete', [0], 1],
      [
        'insert',
        [0],
        [{ type: 'heading', attribute: { level: 1 }, children: [t('abcd')] }],
      ],
    ]);
    ops(b, [['insert', [0, 0, 4], 'XY']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    // B's 'XY' survives, but not necessarily in the heading
    const text = xml(a);
    expect(text).toContain('XY');
    // Text typed at the end lands at the end of the new heading, because the
    // copy is inserted before the tombstone
    expect(text).toContain('<heading attribute.level="1"><text>abcdXY</text>');
    // Record the result and the remote operations A received
    note('G10', text, JSON.stringify(remoteA));
  });

  it('converges sinking a list item into the previous one with typing in that item', () => {
    const [a, b] = replicas(doc(ul(li(p(t('one'))), li(p(t('two'))))));
    // sinkListItem changes the depth, so it is a delete and an insert
    ops(a, [
      ['delete', [0, 1], 1],
      ['insert', [0, 0, 1], [ul(li(p(t('two'))))]],
    ]);
    ops(b, [['insert', [0, 1, 0, 0, 3], '!']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    const text = xml(a);
    note('G11', text);
    // Text typed at the end lands at the end of the copy
    expect(text).toContain('<text>two!</text>');
  });

  it.each([
    ['typing in the middle', [['insert', [0, 0, 2], 'XY']], 'abXYcd'],
    ['deleting a character', [['delete', [0, 0, 1], 1]], 'acd'],
    [
      'formatting',
      [
        ['split', [0, 0, 2]],
        ['update', [0, 1], { style: { bold: true } }],
      ],
      'ab|cd(bold)',
    ],
  ])('converges a block type change with %s', (_, bOps, intended) => {
    const [a, b] = replicas(doc(p(t('zz')), p(t('abcd'))));
    ops(a, [
      ['delete', [1], 1],
      [
        'insert',
        [1],
        [{ type: 'heading', attribute: { level: 1 }, children: [t('abcd')] }],
      ],
    ]);
    ops(
      b,
      (bOps as Array<ZeroOperation>).map(
        ([k, path, d]) => [k, [1, ...path.slice(1)], d] as ZeroOperation,
      ),
    );
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    note('G10b', _, 'intended:', intended, 'actual:', xml(a));
  });

  it('converges sinking a list item with typing or deleting in the middle', () => {
    for (const [name, bOps] of [
      ['typing', [['insert', [0, 1, 0, 0, 1], '!']]],
      ['deleting', [['delete', [0, 1, 0, 0, 0], 1]]],
    ] as Array<[string, Array<ZeroOperation>]>) {
      const [a, b] = replicas(doc(ul(li(p(t('one'))), li(p(t('two'))))));
      ops(a, [
        ['delete', [0, 1], 1],
        ['insert', [0, 0, 1], [ul(li(p(t('two'))))]],
      ]);
      ops(b, bOps);
      exchange(a, b);
      expect(model(a)).toEqual(model(b));
      note('G11b', name, xml(a));
    }
  });

  it('converges moving a block (drag) with typing in the moved block', () => {
    const [a, b] = replicas(doc(p(t('one')), p(t('two')), p(t('three'))));
    // Moving a block is also a delete and an insert
    ops(a, [
      ['delete', [2], 1],
      ['insert', [0], [p(t('three'))]],
    ]);
    ops(b, [['insert', [2, 0, 2], '#']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    note('G16', xml(a));
  });

  it('merges blocks of different types (Backspace at a paragraph after a heading)', () => {
    const [a, b] = replicas(
      doc(
        { type: 'heading', attribute: { level: 1 }, children: [t('H')] },
        p(t('body')),
      ),
    );
    const remoteB = recordRemote(b);
    ops(a, [['merge', [1]]]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(xml(a)).toBe(
      '<doc><heading attribute.level="1"><text>H</text><text>body</text></heading></doc>',
    );
    // The receiver's event is not a merge, because the Zero applier rejects a
    // merge of different types
    note('G12', JSON.stringify(remoteB));
    expect(remoteB.some((o) => o[0] === 'merge')).toBe(false);
  });

  it('converges an undo of a list item delete with typing in another item', () => {
    const [a, b] = replicas(doc(ul(li(p(t('one'))), li(p(t('two'))))));
    ops(a, [['delete', [0, 1], 1]]);
    exchange(a, b);
    ops(b, [['insert', [0, 0, 0, 0, 3], '1']]);
    a.history.undo();
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(model(a)).toEqual(doc(ul(li(p(t('one1'))), li(p(t('two'))))));
  });

  it('emits remote events that take the receiver model from before to after', () => {
    const [a, b] = replicas(doc(p(t('abcdef')), ul(li(p(t('x'))))));
    const got = recordRemote(b);
    const before = JSON.parse(JSON.stringify(model(b)));
    ops(a, [
      ['split', [0, 0, 3]],
      ['split', [0, 1]],
      ['insert', [1, 0, 0], 'Q'],
      ['update', [1, 0], { style: { bold: true } }],
      ['merge', [1]],
      ['insert', [1, 1], [li(p(t('y')))]],
    ]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    // Applying got to before with Zero semantics gives the model of b
    const replay = JSON.parse(JSON.stringify(before));
    for (const o of got) applyZeroOperation(replay, o, crdtOf(b).getSchema());
    expect(replay).toEqual(model(b));
    expect(got.length).toBeGreaterThan(0);
    note('G14', JSON.stringify(before), JSON.stringify(got));
  });

  it('measures inserting one character into a large document (local and remote)', () => {
    const N = Number(process.env.ZT_N ?? 500);
    const paras = Array.from({ length: N }, (_, i) =>
      p(t(`paragraph ${i} `.padEnd(60, 'x'))),
    );
    const [a, b] = replicas(doc(...paras));
    const at = Math.floor(N / 2);
    const t0 = performance.now();
    const K = 20;
    for (let k = 0; k < K; k++) {
      ops(a, [['insert', [at, 0, 5], 'Z']]);
    }
    const local = (performance.now() - t0) / K;
    const t1 = performance.now();
    send(a, b);
    const remote = (performance.now() - t1) / K;
    ack(a);
    expect(model(a)).toEqual(model(b));
    note(
      `G15 N=${N} paragraphs (~${N * 61} tokens): local ${local.toFixed(1)}ms/char, remote ${remote.toFixed(1)}ms/char`,
    );
  });
});
