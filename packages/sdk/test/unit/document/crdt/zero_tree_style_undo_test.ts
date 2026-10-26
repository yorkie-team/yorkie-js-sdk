// Undo and redo of formats with others writing the same keys: an undo takes
// back exactly its own write (see `ZeroStyleCancels`), on every node the
// write reached, and leaves alone what someone wrote after it, concurrently
// with it, or on a node made without knowing it.
import { describe, it, expect } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import {
  CRDTZeroTree,
  ZeroStyleCancel,
  ZeroStyleCancels,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import {
  decodeChange,
  encodeChange,
} from '@yorkie-js/sdk/src/api/zero_tree_codec';
import type { Change } from '@yorkie-js/sdk/src/document/change/change';
import type {
  ZNode,
  ZeroNodeJSON,
  ZeroOperation,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

type Root = { zt: ZeroTree };
const capable = [RestoreRemovedByCapability];

/** a server log: replicas push their changes and pull the log in order */
class Net {
  public log: Array<{ from: number; change: unknown }> = [];
  private pushed: Array<number>;
  private cursor: Array<number>;
  constructor(private docs: Array<Document<Root>>) {
    this.pushed = docs.map(() => 0);
    this.cursor = docs.map(() => 0);
  }
  push(i: number): void {
    for (const c of this.docs[i].createChangePack().getChanges()) {
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
  syncAll(): void {
    this.docs.forEach((_, i) => this.push(i));
    this.docs.forEach((_, j) => this.pull(j));
  }
}

const crdtOf = (d: Document<Root>) =>
  d.getRootObject().get('zt') as unknown as CRDTZeroTree;

const Colors: Record<string, string> = {
  red: 'R',
  blue: 'B',
  green: 'G',
  yellow: 'Y',
};

/** one letter per character of the first paragraph: its color ('.' none) */
function line(d: Document<Root>): string {
  let out = '';
  for (const n of d.getRoot().zt.toZeroContent().children?.[0].children ?? []) {
    const style = (n.style ?? {}) as Record<string, unknown>;
    out += (style.color ? Colors[String(style.color)] : '.').repeat(
      String(n.data ?? '').length,
    );
  }
  return out;
}

/** what Zero issues to format [from, to) of paragraph `p` */
function formatOps(
  p: number,
  lens: Array<number>,
  from: number,
  to: number,
  style: Record<string, unknown>,
): Array<ZeroOperation> {
  const ops: Array<ZeroOperation> = [];
  lens = [...lens];
  const splitAt = (off: number) => {
    let start = 0;
    for (let i = 0; i < lens.length; i++) {
      if (off > start && off < start + lens[i]) {
        ops.push(['split', [p, i, off - start]]);
        lens.splice(i, 1, off - start, start + lens[i] - off);
        return;
      }
      start += lens[i];
    }
  };
  splitAt(to);
  splitAt(from);
  let start = 0;
  for (let i = 0; i < lens.length; i++) {
    if (lens[i] && start >= from && start + lens[i] <= to) {
      ops.push(['update', [p, i], { style }]);
    }
    start += lens[i];
  }
  return ops;
}

function lensOf(d: Document<Root>, p: number): Array<number> {
  return (d.getRoot().zt.toZeroContent().children?.[p].children ?? []).map(
    (c) => String(c.data ?? '').length,
  );
}

function color(d: Document<Root>, from: number, to: number, c: string): void {
  const ops = formatOps(0, lensOf(d, 0), from, to, { color: c });
  d.update((root) => root.zt.applyZeroOperations(ops));
}

/** raises the lamport clock of `d` by `k` changes */
function bump(d: Document<Root>, k: number): void {
  for (let j = 0; j < k; j++) {
    d.update((root) => {
      (root as Record<string, unknown>).n = j;
    });
  }
}

function setup(actors?: Array<string>) {
  const docs = [0, 1, 2].map((i) => {
    const d = new Document<Root>('style-undo');
    d.setActor(actors?.[i] ?? `00000000000000000000000${i + 1}`);
    return d;
  });
  docs[0].update((root) => {
    root.zt = new ZeroTree({
      type: 'content',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'inline-text', data: 'abcdefghij' }],
        },
      ],
    } as never);
  });
  const net = new Net(docs);
  net.syncAll();
  return { docs, net };
}

/** syncs all and checks the replicas show the same line */
function settle(docs: Array<Document<Root>>, net: Net): string {
  net.syncAll();
  const lines = docs.map(line);
  expect(lines[1]).toBe(lines[0]);
  expect(lines[2]).toBe(lines[0]);
  return lines[0];
}

describe('ZeroTree format undo', () => {
  it('P0 혼자 겹친 서식 두 번을 되돌리면 차례로 원래 색으로 돌아와야 한다', () => {
    const { docs, net } = setup();
    const [a] = docs;
    color(a, 0, 10, 'red');
    settle(docs, net);
    color(a, 1, 8, 'blue');
    color(a, 3, 5, 'green');
    expect(settle(docs, net)).toBe('RBBGGBBBRR');
    a.history.undo();
    expect(settle(docs, net)).toBe('RBBBBBBBRR');
    a.history.undo();
    expect(settle(docs, net)).toBe('RRRRRRRRRR');
  });

  it('P1 남이 나중에 덮은 글자는 내 서식 되돌리기 뒤에도 그 값이어야 한다', () => {
    const { docs, net } = setup();
    const [a, b] = docs;
    color(a, 0, 10, 'red');
    settle(docs, net);
    color(a, 1, 8, 'blue');
    settle(docs, net);
    color(b, 3, 5, 'green');
    expect(settle(docs, net)).toBe('RBBGGBBBRR');
    a.history.undo();
    expect(settle(docs, net)).toBe('RRRGGRRRRR');
    // redo brings the write back only where it is still the newest
    a.history.redo();
    expect(settle(docs, net)).toBe('RBBGGBBBRR');
  });

  it.each([
    ['B 가 LWW 로 이긴 경우', undefined, 'RBBGGBBBRR'],
    [
      'A 가 LWW 로 이긴 경우',
      [
        '000000000000000000000009',
        '000000000000000000000001',
        '000000000000000000000002',
      ],
      'RBBBBBBBRR',
    ],
  ])(
    'P2 동시 같은 키 (%s): 되돌리면 남의 값이 남아야 한다',
    (_, actors, both) => {
      const { docs, net } = setup(actors);
      const [a, b] = docs;
      color(a, 0, 10, 'red');
      settle(docs, net);
      bump(actors ? a : b, 3);
      color(a, 1, 8, 'blue');
      color(b, 3, 5, 'green');
      expect(settle(docs, net)).toBe(both);
      a.history.undo();
      expect(settle(docs, net)).toBe('RRRGGRRRRR');
      a.history.redo();
      expect(settle(docs, net)).toBe(both);
    },
  );

  it('P3 동시 다른 키: 굵게를 되돌려도 남의 색은 그대로여야 한다', () => {
    const { docs, net } = setup();
    const [a, b] = docs;
    color(a, 0, 10, 'red');
    settle(docs, net);
    const ops = formatOps(0, lensOf(a, 0), 1, 8, { bold: true });
    a.update((root) => root.zt.applyZeroOperations(ops));
    color(b, 3, 5, 'green');
    settle(docs, net);
    a.history.undo();
    expect(settle(docs, net)).toBe('RRRGGRRRRR');
    const bold = a
      .getRoot()
      .zt.toZeroContent()
      .children![0].children!.some((n) => (n.style ?? {}).bold);
    expect(bold).toBe(false);
  });

  it('P4 서식과 그 되돌리기를 모르는 동시 서식은 그대로 남아야 한다', () => {
    const { docs, net } = setup();
    const [a, b] = docs;
    color(a, 0, 10, 'red');
    settle(docs, net);
    color(a, 1, 8, 'blue');
    a.history.undo();
    color(b, 3, 5, 'green');
    expect(settle(docs, net)).toBe('RRRGGRRRRR');
  });

  it('P5 남이 같은 노드에 다시 쓴 서식은 내 되돌리기 뒤에도 남아야 한다', () => {
    const { docs, net } = setup();
    const [a, b] = docs;
    color(a, 0, 10, 'red');
    settle(docs, net);
    color(a, 1, 8, 'blue');
    settle(docs, net);
    color(b, 1, 8, 'green');
    expect(settle(docs, net)).toBe('RGGGGGGGRR');
    a.history.undo();
    expect(settle(docs, net)).toBe('RGGGGGGGRR');
  });

  it('P6 서식을 안 뒤 넣은 서식 없는 노드는 되돌리기 뒤에도 서식이 없어야 한다', () => {
    const { docs, net } = setup();
    const [a, , c] = docs;
    color(a, 0, 10, 'red');
    settle(docs, net);
    color(a, 1, 8, 'blue');
    settle(docs, net);
    c.update((root) =>
      root.zt.applyZeroOperations([
        ['split', [0, 1, 3]],
        ['insert', [0, 2], [{ type: 'inline-text', data: 'XY' }]],
      ]),
    );
    expect(settle(docs, net)).toBe('RBBB..BBBBRR');
    a.history.undo();
    expect(settle(docs, net)).toBe('RRRR..RRRRRR');
  });

  it('P7 혼자 같은 노드에 두 번 쓴 서식을 되돌리고 다시하면 차례로 돌아와야 한다', () => {
    const { docs, net } = setup();
    const [a] = docs;
    color(a, 0, 10, 'red');
    color(a, 1, 8, 'yellow');
    settle(docs, net);

    (a as any).internalHistory.clearUndo();
    color(a, 1, 8, 'blue');
    color(a, 1, 8, 'green');
    a.history.undo();
    expect(line(a)).toBe('RBBBBBBBRR');
    a.history.undo();
    expect(line(a)).toBe('RYYYYYYYRR');
    a.history.redo();
    expect(line(a)).toBe('RBBBBBBBRR');
    a.history.redo();
    expect(line(a)).toBe('RGGGGGGGRR');
    expect(settle(docs, net)).toBe('RGGGGGGGRR');
  });

  it('P8 혼자 섞인 값 위의 서식을 되돌리면 글자마다 원래 값이어야 한다', () => {
    const { docs, net } = setup();
    const [a] = docs;
    color(a, 0, 5, 'red');
    color(a, 5, 10, 'green');
    settle(docs, net);
    color(a, 0, 10, 'blue');
    expect(settle(docs, net)).toBe('BBBBBBBBBB');
    a.history.undo();
    expect(settle(docs, net)).toBe('RRRRRGGGGG');
  });

  it('모든 쓰기가 취소된 레지스터의 값은 어떤 실제 쓰기에도 져야 한다', () => {
    // the value before the cancelled writes predates all of them: a merge
    // with a folded marker's register, or a copy, must not lose to it
    const cancels = new ZeroStyleCancels();
    const a1 = TimeTicket.of(5n, 1, '000000000000000000000007');
    cancels.set(
      new ZeroStyleCancel(
        a1,
        true,
        TimeTicket.of(6n, 1, '000000000000000000000007'),
        [],
      ),
    );
    const picked = cancels.pick('style.bold', [{ value: 'false', at: a1 }]);
    expect(picked.value).toBe(null);
    expect(picked.at.equals(InitialTimeTicket)).toBe(true);
    expect(
      TimeTicket.of(4n, 1, '000000000000000000000005').after(picked.at),
    ).toBe(true);
  });

  it('되돌린 서식을 모두 알고 아무 레지스터도 쓰지 않을 때만 취소 기록을 지워야 한다', () => {
    const { docs, net } = setup();
    const [a, b] = docs;
    color(a, 0, 10, 'red');
    settle(docs, net);
    color(a, 1, 8, 'blue');
    a.history.undo();
    settle(docs, net);
    const tree = crdtOf(a);
    expect(tree.getStyleCancels().length).toBe(1);
    // the registers still keep the write: the state stays
    docs.forEach((d) => d.garbageCollect(d.getVersionVector()));
    expect(tree.getStyleCancels().length).toBe(1);
    // five writes later the registers keep it no more
    for (const c of ['green', 'yellow', 'green', 'yellow', 'green']) {
      color(b, 0, 10, c);
    }
    settle(docs, net);
    docs.forEach((d) => d.garbageCollect(d.getVersionVector()));
    expect(docs.map((d) => crdtOf(d).getStyleCancels().length)).toEqual([
      0, 0, 0,
    ]);
    expect(settle(docs, net)).toBe('GGGGGGGGGG');
  });
});

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function locate(lens: Array<number>, off: number): [number, number] {
  let start = 0;
  for (let i = 0; i < lens.length; i++) {
    if (off <= start + lens[i]) {
      return [i, off - start];
    }
    start += lens[i];
  }
  return [lens.length - 1, lens[lens.length - 1]];
}

type Reg = { value: string | null; at: { getLamport(): bigint } } | undefined;

/** per live character: the registers of the text node it is in */
function registersByChar(
  d: Document<Root>,
): Map<string, { node?: string; regs: Record<string, Reg> }> {
  const tree = crdtOf(d);
  const entries = tree.viewEntries();
  const out = new Map<string, { node?: string; regs: Record<string, Reg> }>();
  const walk = (n: ZNode) => {
    if (!n.children.length && n.text) {
      for (const e of entries.slice(n.textStart, n.textStart + n.text.length)) {
        out.set(e.id, {
          node: n.markerID,
          regs: (n.registers ?? {}) as unknown as Record<string, Reg>,
        });
      }
    }
    n.children.forEach(walk);
  };
  walk(tree.view());
  return out;
}

const GCEvery = 7;

/**
 * `replayLog` applies the server's log on a fresh replica, with a GC after
 * every `gcEvery` changes (0: none) once every author has a change in: by the
 * element-wise minimum of the authors' last version vectors.
 */
function replayLog(
  changes: Array<string>,
  gcEvery: number,
): { snapshot: string; json: string } {
  const replay = new Document<Root>('undo-fuzz');
  replay.setActor('0000000000000000000000ff');
  const decoded = changes.map((h) => decodeChange(h));
  const authors = new Set(decoded.map((c) => c.getID().getActorID()));
  const latest = new Map<string, VersionVector>();
  decoded.forEach((c, i) => {
    replay.applyChangePack(
      ChangePack.create(
        replay.getKey(),
        Checkpoint.of(0n, 0),
        false,
        [c] as never,
        InitialVersionVector,
        undefined,
        0n,
        capable,
      ),
    );
    latest.set(c.getID().getActorID(), c.getID().getVersionVector());
    if (gcEvery && (i + 1) % gcEvery === 0 && latest.size === authors.size) {
      const min = new Map<string, bigint>();
      const keys = new Set<string>();
      latest.forEach((v) => {
        for (const [k] of v) {
          keys.add(k);
        }
      });
      for (const k of keys) {
        let m: bigint | undefined;
        latest.forEach((v) => {
          const x = v.get(k) ?? 0n;
          m = m === undefined || x < m ? x : m;
        });
        if (m) {
          min.set(k, m);
        }
      }
      if (min.size) {
        replay.garbageCollect(new VersionVector(min));
      }
    }
  });
  return {
    snapshot: converter.bytesToHex(
      converter.snapshotToBytes(replay.getRootObject(), new Map()),
    ),
    json: replay.getRoot().zt.toJSON(),
  };
}

const seeds = Array.from(
  { length: Number(process.env.UNDO_SEEDS ?? 40) },
  (_, i) => i + 1,
);
const solo = !!process.env.UNDO_SOLO;

describe('ZeroTree format undo fuzz', () => {
  it.each(seeds)(
    '되돌리기 섞인 동시 서식이 수렴하고 남의 값을 덮지 않아야 한다 (seed %i)',
    (seed) => {
      const r = rng(seed * 104729);
      const docs = [1, 2, 3].map((n) => {
        const d = new Document<Root>('undo-fuzz');
        d.setActor(`00000000000000000000000${n}`);
        return d;
      });
      docs[0].update((root) => {
        root.zt = new ZeroTree({
          type: 'content',
          children: ['abcdefghij', 'klmnopqrst'].map((t) => ({
            type: 'paragraph',
            children: [
              { type: 'inline-text', data: t, style: { color: 'red' } },
            ],
          })),
        } as never);
      });

      (docs[0] as any).internalHistory.clearUndo();
      const net = new Net(docs);
      net.syncAll();
      // the write of each format's undo entry (its first update's ticket)
      const formatOf = new WeakMap<
        object,
        { lamport: bigint; actor: string }
      >();
      const colors = ['blue', 'green', 'yellow', 'red'];
      let clobbered = 0;
      let clobberedMoved = 0;
      let measured = 0;
      for (let step = 0; step < 60; step++) {
        const doc = docs[solo ? 0 : Math.floor(r() * 3)];

        const history = (doc as any).internalHistory;
        const u = r();
        if (u < 0.14) {
          const stack = history.getUndoStackForTest();
          const entry = stack[stack.length - 1];
          if (!entry) {
            continue;
          }
          const format = formatOf.get(entry);
          const keys = new Set<string>();
          for (const op of entry) {
            for (const [k] of op?.getWrites?.() ?? []) {
              if (!k.startsWith('zt.')) {
                keys.add(k);
              }
            }
            for (const [k] of op?.getCancel?.()?.fallback ?? []) {
              keys.add(k);
            }
          }
          const before = format ? registersByChar(doc) : undefined;
          doc.history.undo();
          if (format && before) {
            measured++;
            const after = registersByChar(doc);
            for (const [id, b] of before) {
              const a = after.get(id);
              if (!a) {
                continue;
              }
              for (const k of keys) {
                const reg = b.regs[k];
                const mine =
                  reg &&
                  (reg.at as any).getLamport() === format.lamport &&
                  (reg.at as any).getActorID() === format.actor;
                if (
                  reg &&
                  !mine &&
                  (a.regs[k]?.value ?? null) !== (reg.value ?? null)
                ) {
                  if (a.node === b.node) {
                    clobbered++;
                  } else {
                    clobberedMoved++;
                  }
                }
              }
            }
          }
          continue;
        }
        if (u < 0.22) {
          if (doc.history.canRedo()) {
            doc.history.redo();
          }
          continue;
        }
        const paras = doc.getRoot().zt.toZeroContent().children ?? [];
        const p = Math.floor(r() * paras.length);
        const lens = lensOf(doc, p);
        const total = lens.reduce((x, y) => x + y, 0);
        const v = r();
        let ops: Array<ZeroOperation> | undefined;
        let style: Record<string, unknown> | undefined;
        if (v < 0.55 && total >= 2) {
          const from = Math.floor(r() * (total - 1));
          const to = from + 1 + Math.floor(r() * (total - from));
          style =
            r() < 0.8
              ? { color: colors[Math.floor(r() * colors.length)] }
              : { bold: r() < 0.7 ? true : null };
          ops = formatOps(p, lens, from, to, style);
        } else if (v < 0.75) {
          const [i, l] = locate(lens, Math.floor(r() * (total + 1)));
          ops = [['insert', [p, i, l], 'x']];
        } else if (v < 0.87) {
          const [i, l] = locate(lens, Math.floor(r() * (total + 1)));
          ops = [
            ['split', [p, i, l]],
            ['split', [p, i + 1]],
          ];
        } else if (total) {
          const [i, l] = locate(lens, Math.floor(r() * total));
          if (l < lens[i]) {
            ops = [['delete', [p, i, l], 1]];
          }
        }
        if (ops) {
          doc.update((root) => root.zt.applyZeroOperations(ops!));
          const update = ops.find(([kind]) => kind === 'update');
          if (update && style) {
            const node = crdtOf(doc).view().children[p].children[update[1][1]];
            const reg = node?.registers?.[`style.${Object.keys(style)[0]}`];
            const stack = history.getUndoStackForTest();
            if (reg && stack.length) {
              formatOf.set(stack[stack.length - 1], {
                lamport: (reg.at as any).getLamport(),

                actor: (reg.at as any).getActorID(),
              });
            }
          }
        }
        if (step % 30 === 29) {
          net.syncAll();
          docs.forEach((d) => d.garbageCollect(d.getVersionVector()));
        } else if (r() < 0.4) {
          const i = Math.floor(r() * 3);
          const j = (i + 1 + Math.floor(r() * 2)) % 3;
          net.push(i);
          net.pull(j);
        }
      }
      net.syncAll();
      const json = docs.map((d) => d.getRoot().zt.toJSON());
      expect(json[1]).toBe(json[0]);
      expect(json[2]).toBe(json[0]);
      expect(json[0].includes('zt.')).toBe(false);
      if (process.env.UNDO_OUT) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').appendFileSync(
          process.env.UNDO_OUT,
          JSON.stringify({
            seed,
            measured,
            clobbered,
            clobberedMoved,
            model: solo ? json[0] : undefined,
          }) + '\n',
        );
      }
      if (process.env.UNDO_CASES_OUT) {
        // the server's log replayed on a fresh replica, for the Go
        // cross-SDK test (zero_tree_cross_test.go): as it is, and with a GC
        // every `GCEvery` changes (as the Go test does)
        const changes = net.log.map((e) =>
          encodeChange(e.change as Change<never>),
        );
        const plain = replayLog(changes, 0);
        const gc = replayLog(changes, GCEvery);
        expect(plain.json).toBe(json[0]);
        expect(gc.json).toBe(json[0]);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').appendFileSync(
          process.env.UNDO_CASES_OUT,
          JSON.stringify({
            seed,
            changes,
            gcEvery: GCEvery,
            snapshot: plain.snapshot,
            snapshotGC: gc.snapshot,
            gcMarks: [],
            snapshotMarks: plain.snapshot,
            json: plain.json,
            jsonGC: gc.json,
            jsonMarks: plain.json,
          }) + '\n',
        );
      }
      // an undo takes back only its own write on a node that stayed
      expect(clobbered).toBe(0);
    },
  );
});

describe('ZeroTree format undo bench', () => {
  it.runIf(!!process.env.BENCH)('10만 자 서식 되돌리기 시간', () => {
    const paras = Number(process.env.BENCH_PARAS ?? 100);
    const init: ZeroNodeJSON = {
      type: 'content',
      children: Array.from({ length: paras }, (_, i) => ({
        type: 'paragraph',
        children: [
          {
            type: 'inline-text',
            data: String.fromCharCode(97 + (i % 26)).repeat(1000),
            style: { color: 'red' },
          },
        ],
      })),
    } as never;
    const d = new Document<Root>('bench');
    d.setActor('000000000000000000000001');
    d.update((root) => {
      root.zt = new ZeroTree(init as never);
    });

    (d as any).internalHistory.clearUndo();
    d.getRoot().zt.toZeroContent();
    const format: Array<number> = [];
    const undo: Array<number> = [];
    const redo: Array<number> = [];
    for (let i = 0; i < 30; i++) {
      const p = (i * 7) % paras;
      const ops: Array<ZeroOperation> = [
        ['split', [p, 0, 600]],
        ['split', [p, 0, 400]],
        ['update', [p, 1], { style: { color: i % 2 ? 'blue' : 'green' } }],
      ];
      let t = performance.now();
      d.update((root) => root.zt.applyZeroOperations(ops));
      format.push(performance.now() - t);
      t = performance.now();
      d.history.undo();
      undo.push(performance.now() - t);
      t = performance.now();
      d.history.redo();
      redo.push(performance.now() - t);
      d.history.undo();
    }
    const q = (a: Array<number>, x: number) =>
      [...a].sort((m, n) => m - n)[Math.floor(a.length * x)].toFixed(2);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').appendFileSync(
      process.env.BENCH,
      `${paras * 1000} chars: format p50 ${q(format, 0.5)} p95 ${q(format, 0.95)}, undo p50 ${q(undo, 0.5)} p95 ${q(undo, 0.95)}, redo p50 ${q(redo, 0.5)} p95 ${q(redo, 0.95)}\n`,
    );
  });
});
