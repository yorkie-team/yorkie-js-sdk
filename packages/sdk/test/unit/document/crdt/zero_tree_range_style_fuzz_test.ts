// Random concurrent range formatting on four replicas: overlapping formats,
// typing, Enter and deletions. Every format sets its own key, so a character
// a format covered in its author's view must end up with that key while it
// lives (no format lost), whatever was split or typed concurrently.
import { describe, it, expect } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import { CRDTZeroTree } from '@yorkie-js/sdk/src/document/crdt/zero_tree';
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

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const crdtOf = (d: Document<Root>) =>
  d.getRootObject().get('zt') as unknown as CRDTZeroTree;

/** the ids of the characters of each text node of each paragraph */
function charIDs(d: Document<Root>): Array<Array<Array<string>>> {
  const tree = crdtOf(d);
  const entries = tree.viewEntries();
  return tree
    .view()
    .children.map((p: ZNode) =>
      p.children.map((n) =>
        entries
          .slice(n.textStart, n.textStart + n.text.length)
          .map((e) => e.id),
      ),
    );
}

/** the style keys of the text node each live character is in */
function stylesByChar(d: Document<Root>): Map<string, Set<string>> {
  const tree = crdtOf(d);
  const out = new Map<string, Set<string>>();
  const ids = charIDs(d);
  tree.view().children.forEach((p: ZNode, pi: number) =>
    p.children.forEach((n, ni) => {
      const keys = new Set(
        Object.keys(n.attrs)
          .filter((k) => k.startsWith('style.'))
          .map((k) => k.slice(6)),
      );
      ids[pi][ni].forEach((id) => out.set(id, keys));
    }),
  );
  return out;
}

/** where paragraph offset `off` falls: [child, offset in it] */
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

/**
 * `formatOps` returns what Zero issues to format [from, to) of paragraph
 * `p`: split at both ends (inside a text node), then update every text node
 * in between.
 */
function formatOps(
  p: number,
  lens: Array<number>,
  from: number,
  to: number,
  key: string,
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
      ops.push(['update', [p, i], { style: { [key]: true } }]);
    }
    start += lens[i];
  }
  return ops;
}

/**
 * `noteInterleaved` adds the characters around a folded text marker that has
 * something between it and the split it was folded into (a character typed
 * there, another split): the ones between the two, which get the folded
 * marker's registers, and the ones right after it, which join whatever node
 * is open there -- a structure of `dealias`.
 */
function noteInterleaved(d: Document<Root>, out: Set<string>): void {
  const tree = crdtOf(d);
  const repOf = new Map<string, string>();
  for (const e of tree.viewEntries()) {
    e.aliases?.forEach((id) => repOf.set(id, e.id));
  }
  if (!repOf.size) {
    return;
  }
  const raw = tree.liveEntries();
  const at = new Map(raw.map((e, i) => [e.id, i]));
  let after = false;
  raw.forEach((e, i) => {
    if (e.marker?.type === 'inline-text') {
      const rep = repOf.get(e.id);
      const between =
        rep === undefined ? [] : raw.slice((at.get(rep) ?? i) + 1, i);
      after = between.some((x) => x.char !== undefined || !repOf.has(x.id));
      if (after) {
        between.forEach((x) => x.char !== undefined && out.add(x.id));
      }
    } else if (e.char !== undefined && after) {
      out.add(e.id);
    }
  });
}

const seeds = Array.from(
  { length: Number(process.env.STYLE_SEEDS ?? 40) },
  (_, i) => i + 1,
);
const gc = process.env.STYLE_GC !== '0';

describe('ZeroTree range formatting', () => {
  it.each([
    ['A 의 시각이 앞설 때', 0],
    ['B 의 시각이 앞설 때', 3],
  ])(
    '맞닿은 구간의 동시 서식은 서로의 구간으로 번지지 않아야 한다 (%s)',
    (_, bump) => {
      // A bolds [0,1) and B underlines [1,3) at once: both split at 1, and
      // B's split marker sits right after A's range in the token order
      const [a, b] = [1, 2].map((n) => {
        const d = new Document<Root>('style-abut');
        d.setActor(`00000000000000000000000${n}`);
        return d;
      });
      a.update((root) => {
        root.zt = new ZeroTree({
          type: 'content',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'inline-text', data: 'abc' }],
            },
          ],
        } as never);
      });
      const net = new Net([a, b]);
      net.syncAll();
      for (let i = 0; i < bump; i++) {
        b.update((root) => {
          (root as Record<string, unknown>).n = i;
        });
      }
      a.update((root) =>
        root.zt.applyZeroOperations(formatOps(0, [3], 0, 1, 'bold')),
      );
      b.update((root) =>
        root.zt.applyZeroOperations(formatOps(0, [3], 1, 3, 'underline')),
      );
      net.syncAll();
      const show = (d: Document<Root>) =>
        (d.getRoot().zt.toZeroContent().children![0].children ?? [])
          .filter((n) => n.data)
          .map(
            (n) =>
              `${n.data}:${Object.keys(n.style ?? {})
                .sort()
                .join('+')}`,
          )
          .join(' | ');
      expect(show(a)).toBe('a:bold | bc:underline');
      expect(b.getRoot().zt.toJSON()).toBe(a.getRoot().zt.toJSON());
    },
  );

  it.each(seeds)(
    '겹치는 동시 서식이 수렴하고 서식을 잃지 않아야 한다 (seed %i)',
    (seed) => {
      const r = rng(seed * 7919);
      const init: ZeroNodeJSON = {
        type: 'content',
        children: ['abcdefghij', 'klmnopqrst', 'uvwxyz0123'].map((t) => ({
          type: 'paragraph',
          children: [{ type: 'inline-text', data: t }],
        })),
      };
      const docs = [1, 2, 3, 4].map((n) => {
        const d = new Document<Root>('style-fuzz');
        d.setActor(`00000000000000000000000${n}`);
        return d;
      });
      docs[0].update((root) => {
        root.zt = new ZeroTree(init as never);
      });
      // the reserved `zt.*` keys never reach the editor: not in an event
      const leaks: Array<string> = [];
      docs.forEach((d) =>
        d.subscribe((event) => {
          if (event.type !== 'local-change' && event.type !== 'remote-change') {
            return;
          }
          const ops = JSON.stringify(event.value.operations);
          if (ops.includes('zt.')) {
            leaks.push(ops);
          }
        }),
      );
      const net = new Net(docs);
      net.syncAll();
      // per format: the characters it covered and the ones of its paragraph
      // it did not, in its author's view
      const formats: Array<{
        key: string;
        ids: Array<string>;
        outside: Array<string>;
      }> = [];
      const format = (
        doc: Document<Root>,
        p: number,
        lens: Array<number>,
        from: number,
        to: number,
      ): void => {
        const key = `k${formats.length}`;
        const all = charIDs(doc)[p].flat();
        formats.push({
          key,
          ids: all.slice(from, to),
          outside: [...all.slice(0, from), ...all.slice(to)],
        });
        const ops = formatOps(p, lens, from, to, key);
        doc.update((root) => root.zt.applyZeroOperations(ops));
      };
      const interleaved = new Set<string>();
      for (let step = 0; step < 80; step++) {
        if (r() < 0.15) {
          // two replicas that know the same, formatting abutting ranges at
          // once: neither format may spread into the other's range
          const i = 1 + Math.floor(r() * 3);
          const j = 1 + ((i + Math.floor(r() * 2)) % 3);
          net.push(i);
          net.push(j);
          net.pull(i);
          net.pull(j);
          const paras = docs[i].getRoot().zt.toZeroContent().children ?? [];
          const p = Math.floor(r() * paras.length);
          const lens = (paras[p].children ?? []).map(
            (c) => String(c.data ?? '').length,
          );
          const total = lens.reduce((a, b) => a + b, 0);
          if (total >= 2) {
            const mid = 1 + Math.floor(r() * (total - 1));
            const from = Math.floor(r() * mid);
            const to = mid + 1 + Math.floor(r() * (total - mid));
            format(docs[i], p, lens, from, mid);
            format(docs[j], p, lens, mid, to);
          }
          docs.forEach((d) => noteInterleaved(d, interleaved));
          continue;
        }
        const doc = docs[1 + Math.floor(r() * 3)];
        const model = doc.getRoot().zt.toZeroContent();
        const paras = model.children ?? [];
        const p = Math.floor(r() * paras.length);
        const lens = (paras[p].children ?? []).map(
          (c) => String(c.data ?? '').length,
        );
        const total = lens.reduce((a, b) => a + b, 0);
        const u = r();
        let ops: Array<ZeroOperation> | undefined;
        if (u < 0.45 && total >= 2) {
          const from = Math.floor(r() * (total - 1));
          const to = from + 1 + Math.floor(r() * (total - from));
          format(doc, p, lens, from, to);
        } else if (u < 0.7) {
          const [i, l] = locate(lens, Math.floor(r() * (total + 1)));
          ops = [['insert', [p, i, l], 'x']];
        } else if (u < 0.85) {
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
        }
        docs.forEach((d) => noteInterleaved(d, interleaved));
        if (gc && step % 40 === 39) {
          net.syncAll();
          docs.forEach((d) => d.garbageCollect(d.getVersionVector()));
        }
        if (r() < 0.35) {
          const i = Math.floor(r() * docs.length);
          const j = (i + 1 + Math.floor(r() * (docs.length - 1))) % docs.length;
          net.push(i);
          net.pull(j);
        }
      }
      net.syncAll();
      docs.forEach((d) => noteInterleaved(d, interleaved));
      const json = docs.map((d) => d.getRoot().zt.toJSON());
      expect(json[1]).toBe(json[0]);
      expect(json[2]).toBe(json[0]);
      expect(json[3]).toBe(json[0]);
      // ... nor the model
      expect(json[0].includes('zt.')).toBe(false);
      expect(leaks).toEqual([]);

      if (process.env.STYLE_CASES_OUT) {
        // the server's log replayed on a fresh replica, for the Go
        // cross-SDK test (zero_tree_cross_test.go)
        const changes = net.log.map((e) =>
          encodeChange(e.change as Change<never>),
        );
        const replay = new Document<Root>('style-fuzz');
        replay.setActor('0000000000000000000000ff');
        for (const h of changes) {
          replay.applyChangePack(
            ChangePack.create(
              replay.getKey(),
              Checkpoint.of(0n, 0),
              false,
              [decodeChange(h)] as never,
              InitialVersionVector,
              undefined,
              0n,
              capable,
            ),
          );
        }
        const snapshot = converter.bytesToHex(
          converter.snapshotToBytes(replay.getRootObject(), new Map()),
        );
        const model = replay.getRoot().zt.toJSON();
        expect(model).toBe(json[0]);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').appendFileSync(
          process.env.STYLE_CASES_OUT,
          JSON.stringify({
            seed,
            changes,
            gcEvery: 0,
            snapshot,
            snapshotGC: snapshot,
            gcMarks: [],
            snapshotMarks: snapshot,
            json: model,
            jsonGC: model,
            jsonMarks: model,
          }) + '\n',
        );
      }
      // every character a format covered keeps its key, also where the
      // format was written on a marker folded into a concurrent Enter at the
      // same place (`dealias`); no character of its paragraph it did not
      // cover gets it. A character next to a folded marker with something
      // between it and the split it was folded into is counted apart (see
      // `noteInterleaved`): a structure of `dealias` that range writes do not
      // change.
      const styles = stylesByChar(docs[0]);
      let lost = 0;
      let covered = 0;
      let spread = 0;
      let spreadFolded = 0;
      for (const { key, ids, outside } of formats) {
        for (const id of ids) {
          const keys = styles.get(id);
          if (!keys) {
            continue;
          }
          covered++;
          if (!keys.has(key)) {
            lost++;
          }
        }
        for (const id of outside) {
          if (styles.get(id)?.has(key)) {
            if (interleaved.has(id)) {
              spreadFolded++;
            } else {
              spread++;
            }
          }
        }
      }
      if (process.env.STYLE_OUT) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').appendFileSync(
          process.env.STYLE_OUT,
          JSON.stringify({
            seed,
            formats: formats.length,
            covered,
            lost,
            spread,
            spreadFolded,
          }) + '\n',
        );
      }
      expect(lost).toBe(0);
      expect(spread).toBe(0);
    },
  );
});
