// Random concurrent edits on four replicas. After every operation the model
// the block index keeps must be the model built from the tokens from scratch,
// and every event compiled on a window (blocks, table rows, one text node)
// must be the event compiled on the whole document. A second batch undoes
// and redoes a lot, so undos and redos take the block path too.
import { describe, it, expect } from 'vitest';
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
import { CRDTZeroTree } from '@yorkie-js/sdk/src/document/crdt/zero_tree';
import { IndexStats } from '@yorkie-js/sdk/src/document/crdt/zero_tree_index';
import {
  CompileStats,
  ZeroNodeJSON,
  ZeroOperation,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

type Root = { zt: ZeroTree };
const capable = [RestoreRemovedByCapability];

/** a server log: replicas push their changes and pull the log in order */
class Net {
  private log: Array<{ from: number; change: unknown }> = [];
  private pushed: Array<number>;
  private cursor: Array<number>;
  constructor(private docs: Array<Document<Root>>) {
    this.pushed = docs.map(() => 0);
    this.cursor = docs.map(() => 0);
  }
  push(i: number): void {
    const changes = this.docs[i].createChangePack().getChanges();
    for (const c of changes) {
      if (c.getID().getClientSeq() > this.pushed[i]) {
        this.log.push({ from: i, change: c });
        this.pushed[i] = c.getID().getClientSeq();
      }
    }
  }
  pull(j: number): void {
    const fresh = this.log
      .slice(this.cursor[j])
      .filter((e) => e.from !== j)
      .map((e) => e.change);
    this.cursor[j] = this.log.length;
    if (!fresh.length) {
      return;
    }
    const pack = converter.fromChangePack<Indexable>(
      converter.toChangePack(
        ChangePack.create(
          this.docs[j].getKey(),
          Checkpoint.of(0n, 0),
          false,
          fresh as never,
          InitialVersionVector,
          undefined,
          0n,
          capable,
        ),
      ),
    );
    this.docs[j].applyChangePack(
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
  deliver(i: number, j: number): void {
    this.push(i);
    this.pull(j);
  }
  syncAll(): void {
    this.docs.forEach((_, i) => this.push(i));
    this.docs.forEach((_, j) => this.pull(j));
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

const para = (t: string): ZeroNodeJSON => ({
  type: 'paragraph',
  children: [{ type: 'inline-text', data: t }],
});
const cell = (t: string): ZeroNodeJSON => ({
  type: 'table-cell',
  children: [{ type: 'table-cell-body', children: [para(t)] }],
});
const row = (cols: number, t: string): ZeroNodeJSON => ({
  type: 'table-row',
  children: Array.from({ length: cols }, (_, c) => cell(`${t}${c}`)),
});

/** text holders (inline-text) with their paths */
function holders(
  node: ZeroNodeJSON,
  path: Array<number> = [],
  acc: Array<{ path: Array<number>; len: number }> = [],
): Array<{ path: Array<number>; len: number }> {
  (node.children ?? []).forEach((c, i) => {
    if (c.type === 'inline-text') {
      acc.push({ path: [...path, i], len: String(c.data ?? '').length });
    } else {
      holders(c, [...path, i], acc);
    }
  });
  return acc;
}

function randomOps(
  model: ZeroNodeJSON,
  r: () => number,
): Array<ZeroOperation> | undefined {
  const pick = <T>(xs: Array<T>): T => xs[Math.floor(r() * xs.length)];
  const hs = holders(model);
  const blocks = model.children ?? [];
  const x = r();
  if (!hs.length) {
    return [['insert', [0], [para('new')]]];
  }
  const h = pick(hs);
  const off = Math.floor(r() * (h.len + 1));
  if (x < 0.3) {
    return [['insert', [...h.path, off], pick(['a', 'bc', '가', 'xyz'])]];
  }
  if (x < 0.42 && h.len > 0) {
    const from = Math.floor(r() * h.len);
    return [['delete', [...h.path, from], 1 + Math.floor(r() * 3)]];
  }
  if (x < 0.57) {
    // Enter: split the text, then its paragraph after it
    const pp = h.path.slice(0, -1);
    const i = h.path[h.path.length - 1];
    return [
      ['split', [...h.path, off]],
      ['split', [...pp, i + 1]],
    ];
  }
  if (x < 0.69) {
    // Backspace at a paragraph start: merge it into the paragraph before
    const pp = h.path.slice(0, -1);
    const bi = pp[pp.length - 1];
    if (bi > 0) {
      const container = pp.slice(0, -1);
      let parent: ZeroNodeJSON = model;
      for (const k of container) {
        parent = parent.children![k];
      }
      const prev = parent.children![bi - 1];
      if (prev.type === 'paragraph') {
        const k = prev.children?.length ?? 0;
        const left = prev.children?.[k - 1];
        const right = parent.children![bi].children?.[0];
        const ops: Array<ZeroOperation> = [['merge', pp]];
        if (
          left?.type === 'inline-text' &&
          right?.type === 'inline-text' &&
          JSON.stringify(left.style ?? {}) === JSON.stringify(right.style ?? {})
        ) {
          ops.push(['merge', [...container, bi - 1, k]]);
        }
        return ops;
      }
    }
    return;
  }
  if (x < 0.79) {
    return [['update', h.path, { style: { bold: r() < 0.5 ? true : null } }]];
  }
  if (x < 0.85) {
    return [['insert', [Math.floor(r() * (blocks.length + 1))], [para('ins')]]];
  }
  if (x < 0.9 && blocks.length > 2) {
    return [['delete', [Math.floor(r() * blocks.length)], 1]];
  }
  // table rows
  const t = blocks.findIndex((b) => b.type === 'table');
  if (t < 0) {
    return [
      ['insert', [blocks.length], [{ type: 'table', children: [row(3, 'n')] }]],
    ];
  }
  const rows = blocks[t].children ?? [];
  if (r() < 0.6 || rows.length < 2) {
    const cols = rows[0]?.children?.length ?? 3;
    return [
      ['insert', [t, Math.floor(r() * (rows.length + 1))], [row(cols, 'r')]],
    ];
  }
  return [['delete', [t, Math.floor(r() * rows.length)], 1]];
}

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

type Intent = { path: Array<number>; label: string; virtual: boolean };

/**
 * `wrapOps` puts markers under virtual parents: it wraps a paragraph in a
 * table or lifts a table's paragraphs out (delete + insert) while others
 * insert into them, mostly at index 0. An insert of a labeled node comes
 * with where it must land.
 */
function wrapOps(
  model: ZeroNodeJSON,
  view: ZeroTreeCrdtNode,
  r: () => number,
  label: string,
): { ops: Array<ZeroOperation>; intent?: Intent } | undefined {
  const pick = <T>(xs: Array<T>): T => xs[Math.floor(r() * xs.length)];
  const tops = (model.children ?? []).map((c, i) => [i, c] as const);
  const x = r();
  if (x < 0.3) {
    const ps = tops.filter(([, c]) => c.type === 'paragraph');
    if (!ps.length) {
      return;
    }
    const [i, p] = pick(ps);
    const wrapped: ZeroNodeJSON = {
      type: 'table',
      children: [
        {
          type: 'table-row',
          children: [
            {
              type: 'table-cell',
              children: [{ type: 'table-cell-body', children: [p] }],
            },
          ],
        },
      ],
    };
    return {
      ops: [
        ['delete', [i], 1],
        ['insert', [i], [wrapped]],
      ],
    };
  }
  if (x < 0.45) {
    const ts = tops.filter(([, c]) => c.type === 'table');
    if (!ts.length) {
      return;
    }
    const [i, t] = pick(ts);
    const ps = nodes(t)
      .map(([, n]) => n)
      .filter((n) => n.type === 'paragraph');
    return {
      ops: [
        ['delete', [i], 1],
        ['insert', [i], ps.length ? ps : [para('')]],
      ],
    };
  }
  const holders: Array<[Array<number>, ZeroNodeJSON]> = [
    [[], model],
    ...nodes(model).filter(([, n]) =>
      ['paragraph', 'table-cell-body'].includes(n.type),
    ),
  ];
  const [path, parent] = pick(holders);
  const len = parent.children?.length ?? 0;
  const index = r() < 0.6 ? 0 : Math.floor(r() * (len + 1));
  if (parent.type === 'paragraph' && r() < 0.5) {
    return {
      ops: [
        [
          'insert',
          [...path, index],
          [{ type: 'inline-image', data: { src: label } }],
        ],
      ],
    };
  }
  const node: ZeroNodeJSON =
    parent.type === 'paragraph'
      ? { type: 'inline-text', data: label }
      : para(label);
  return {
    ops: [['insert', [...path, index], [node]]],
    intent: {
      path: [...path, index],
      label,
      virtual: index === 0 && !!at<ZeroTreeCrdtNode>(view, path)?.virtual,
    },
  };
}

/** how often a step undoes or redoes, and whether tombstones are collected */
type Mix = { undo: number; redo: number; gc: boolean };

/**
 * `run` plays one seed on four replicas, checking the index and the window
 * compiles after every step and convergence at the end.
 */
function run(seed: number, mix: Mix): void {
  const r = rng(seed * 7919);
  const init: ZeroNodeJSON = {
    type: 'content',
    children: [
      para('abcdef'),
      para('ghij'),
      {
        type: 'table',
        children: [row(3, 'a'), row(3, 'b'), row(3, 'c'), row(3, 'd')],
      },
      para('klmnop'),
      para('qr'),
    ],
  };
  // docs[0] only creates the tree (its undo would remove it)
  const docs = [1, 2, 3, 4].map((n) => {
    const d = new Document<Root>('zero-fuzz');
    d.setActor(`00000000000000000000000${n}`);
    return d;
  });
  docs[0].update((root) => {
    root.zt = new ZeroTree(init as never);
  });
  const net = new Net(docs);
  net.syncAll();
  CompileStats.verifyWindow = true;
  CompileStats.windowMismatches.length = 0;
  CompileStats.windows = 0;
  IndexStats.blocks = 0;
  IndexStats.rows = 0;
  IndexStats.wholes = 0;
  IndexStats.escapes = 0;
  IndexStats.reasons = {};
  CompileStats.ways = {};
  CompileStats.fallbacks = 0;
  let label = 0;
  for (let step = 0; step < 120; step++) {
    const who = 1 + Math.floor(r() * (docs.length - 1));
    const doc = docs[who];
    const u = r();
    if (u < mix.redo && doc.history.canRedo()) {
      try {
        doc.history.redo();
      } catch {
        // a redo the tree cannot place is not what this checks
      }
    } else if (u < mix.redo + mix.undo && doc.history.canUndo()) {
      try {
        doc.history.undo();
      } catch {
        // an undo the tree cannot place is not what this checks
      }
    } else {
      const model = doc.getRoot().zt.toZeroContent();
      const wrap =
        r() < 0.25
          ? wrapOps(model, doc.getRoot().zt.toCrdtView(), r, `L${++label}.`)
          : undefined;
      const ops = wrap ? wrap.ops : randomOps(model, r);
      let applied = false;
      if (ops) {
        try {
          doc.update((root) => root.zt.applyZeroOperations(ops));
          applied = true;
        } catch {
          // an operation the editor would not issue on this model
        }
      }
      const intent = wrap?.intent;
      if (applied && intent?.virtual) {
        // a node inserted at the start of a virtual parent lands there
        // (characters typed concurrently into a deleted text may follow
        // its own: compare the start)
        const got = at(doc.getRoot().zt.toZeroContent(), intent.path);
        expect(
          firstText(got).startsWith(intent.label),
          `step ${step} insert ${intent.path}`,
        ).toBe(true);
      }
    }
    // what the caches give is what a fresh copy (no caches) computes
    for (const d of docs) {
      const zt = d.getRootObject().get('zt') as unknown as CRDTZeroTree;
      const fresh = zt.deepcopy();
      expect(zt.toJSON()).toBe(fresh.toJSON());
      const plain = (e: unknown) =>
        JSON.stringify(e, (_, v) =>
          typeof v === 'bigint'
            ? v.toString()
            : v && typeof v.toIDString === 'function'
              ? v.toIDString()
              : v,
        );
      expect(zt.liveEntries().map(plain)).toEqual(
        fresh.liveEntries().map(plain),
      );
    }
    if (mix.gc && step % 40 === 39) {
      // everyone has everything: collect the tombstones
      net.syncAll();
      docs.forEach((d) => d.garbageCollect(d.getVersionVector()));
    }
    if (r() < 0.3) {
      const i = Math.floor(r() * docs.length);
      const j = (i + 1 + Math.floor(r() * (docs.length - 1))) % docs.length;
      net.deliver(i, j);
    }
  }
  net.syncAll();
  CompileStats.verifyWindow = false;
  const json = docs.map((d) => d.getRoot().zt.toJSON());
  expect(json[1]).toBe(json[0]);
  expect(json[2]).toBe(json[0]);
  expect(json[3]).toBe(json[0]);
  expect(CompileStats.windows).toBeGreaterThan(0);
  expect(CompileStats.windowMismatches).toEqual([]);
  expect(IndexStats.escapes).toBe(0);
  if (process.env.FUZZ_REASONS) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').appendFileSync(
      process.env.FUZZ_REASONS,
      JSON.stringify(IndexStats.reasons) + '\n',
    );
  }
}

const gc = process.env.FUZZ_GC !== '0';
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('ZeroTree block index', () => {
  // 116, 156, 339 and 400 once diverged: a table row rebuilt without a row
  // elsewhere that took a cell marker it removed as its scope, and a
  // narrowed window that stopped short of a deeper marker the whole
  // compile counts into a new node.
  it.each([
    ...new Set([
      ...range(Number(process.env.FUZZ_SEEDS ?? 40)),
      116,
      156,
      339,
      400,
    ]),
  ])(
    '무작위 동시 편집에서 창 컴파일이 전체 컴파일과 같아야 한다 (seed %i)',
    (seed) => run(seed, { undo: 0.08, redo: 0, gc }),
  );

  // 141, 190 and 256 once diverged: a redo removed again text another
  // client's deletion held in the redoer's view.
  it.each([
    ...new Set([
      ...range(Number(process.env.FUZZ_UNDO_SEEDS ?? 40)),
      141,
      190,
      256,
    ]),
  ])(
    '되돌리기·다시하기가 잦아도 색인 모델과 창 컴파일이 새로 지은 것과 같아야 한다 (seed %i)',
    (seed) => {
      run(seed, { undo: 0.23, redo: 0.12, gc });
      expect(IndexStats.reasons['undo:blocks'] ?? 0).toBeGreaterThan(0);
    },
  );
});
