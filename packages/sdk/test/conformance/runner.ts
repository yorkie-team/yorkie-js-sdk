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

// Runner for the cross-SDK conformance script format v1. The format is
// specified in yorkie's test/conformance/README.md; the Go runner there and
// this one must produce byte-identical step lines, xml and digests for the
// same script, so every string built here follows that spec literally.

import { createHash } from 'crypto';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';

export type GenKind = 'ins' | 'split' | 'del' | 'merge' | 'style';

export type Step =
  | {
      r: number;
      op: 'edit';
      from: number;
      to: number;
      text?: string;
      split?: number;
    }
  | {
      r: number;
      op: 'style';
      from: number;
      to: number;
      attrs: Record<string, string>;
    }
  | {
      r: number;
      op: 'removeStyle';
      from: number;
      to: number;
      keys: Array<string>;
    }
  | { r: number; op: 'undo' | 'redo' | 'pull' | 'sync' | 'snapshot' }
  | {
      r: number;
      op: 'gen';
      k: GenKind;
      f: number;
      g: number;
      h: number;
      v: string;
    };

export type Status = 'pass' | 'known-diverge' | 'known-error' | 'known-fail';

export type Script = {
  v: number;
  id: string;
  issues?: Array<string>;
  status?: { go?: Status; js?: Status };
  note?: string;
  replicas: number;
  init: string;
  steps: Array<Step>;
};

export type Result = 'pass' | 'diverged' | 'error' | 'fail';

/**
 * `StatusResults` maps each ledger status to the only result it accepts.
 */
export const StatusResults: Record<Status, Result> = {
  pass: 'pass',
  'known-diverge': 'diverged',
  'known-error': 'error',
  'known-fail': 'fail',
};

const ScriptFields = new Set([
  'v',
  'id',
  'issues',
  'status',
  'note',
  'replicas',
  'init',
  'steps',
]);
const StepFields = new Set([
  'r',
  'op',
  'from',
  'to',
  'text',
  'split',
  'attrs',
  'keys',
  'k',
  'f',
  'g',
  'h',
  'v',
]);
const Ops = new Set([
  'edit',
  'style',
  'removeStyle',
  'undo',
  'redo',
  'pull',
  'sync',
  'snapshot',
  'gen',
]);
const GenKinds = new Set(['ins', 'split', 'del', 'merge', 'style']);

/**
 * `parseScript` parses and validates a script, as the Go runner's
 * LoadScript does. Unknown fields, ops, generator kinds and ledger values
 * are errors naming `name`, so a typo fails loudly instead of silently
 * replaying something else.
 */
export function parseScript(text: string, name: string): Script {
  const fail = (msg: string): never => {
    throw new Error(`${name}: ${msg}`);
  };
  const s = JSON.parse(text) as Script;
  for (const key of Object.keys(s)) {
    if (!ScriptFields.has(key)) fail(`unknown field "${key}"`);
  }
  if (s.v !== 1) fail(`unsupported version ${s.v}`);
  if (!(s.replicas >= 1)) fail('replicas must be at least 1');
  for (const [sdk, status] of Object.entries(s.status ?? {})) {
    if (!(status in StatusResults)) {
      fail(`status.${sdk}: unknown value "${status}"`);
    }
  }
  s.steps = s.steps ?? [];
  s.steps.forEach((st, i) => {
    for (const key of Object.keys(st)) {
      if (!StepFields.has(key)) fail(`step ${i}: unknown field "${key}"`);
    }
    if (!(st.r >= 0 && st.r < s.replicas)) {
      fail(`step ${i}: replica ${st.r} out of range`);
    }
    if (!Ops.has(st.op)) fail(`step ${i}: unknown op "${st.op}"`);
    if (st.op === 'gen' && !GenKinds.has(st.k)) {
      fail(`step ${i}: unknown gen kind "${st.k}"`);
    }
  });
  return s;
}

export type RunRecord = {
  id: string;
  n: number;
  result: Result;
  checks: { I1: boolean; I2: boolean; I3: boolean; I4: boolean };
  steps: Array<string>;
  xml: Array<string>;
  shapes: Array<string>;
  error?: string;
  digest: string;
  xmlDigest: string;
};

type TestDoc = Document<{ t: Tree }>;
type Mode = 'off' | 'minvv';
type Entry = { author: number; changes?: Array<Change<Indexable>> };

const DocKey = 'conformance';

/**
 * `actorOf` is replica i's actor: `i+1` as 24 zero-padded decimal digits.
 */
function actorOf(i: number): string {
  return String(i + 1).padStart(24, '0');
}

/**
 * `hop` sends a pack through the protobuf converter, as every hop between a
 * replica and the server does.
 */
function hop(pack: ChangePack<Indexable>): ChangePack<Indexable> {
  return converter.fromChangePack<Indexable>(converter.toChangePack(pack));
}

/**
 * `minVV` is the element-wise minimum over the rows; an actor missing from a
 * row counts as 0.
 */
function minVV(rows: Array<VersionVector>): VersionVector {
  const actors = new Set<string>();
  for (const row of rows) {
    for (const [actor] of row) actors.add(actor);
  }
  const out = new VersionVector(new Map());
  for (const actor of actors) {
    let min: bigint | undefined;
    for (const row of rows) {
      const l = row.get(actor) ?? 0n;
      min = min === undefined || l < min ? l : min;
    }
    out.set(actor, min!);
  }
  return out;
}

/**
 * `shapeOf` is the canonical shape of the tree, tombstones included, with
 * node ids built from their fields.
 */
export function shapeOf(doc: TestDoc): string {
  const walk = (node: CRDTTreeNode): string => {
    const createdAt = node.id.getCreatedAt();
    const id = `${createdAt.getLamport()}:${createdAt.getActorID()}:${node.id.getOffset()}`;
    const x = node.isRemoved ? 'x' : '';
    if (node.isText) return `${id}${x}"${node.value}"`;
    return `${node.type}#${id}${x}[${node.allChildren.map(walk).join(',')}]`;
  };
  return walk((doc.getRootObject().get('t') as unknown as CRDTTree).getRoot());
}

/**
 * `xmlOf` is the tree's `toXML()`.
 */
function xmlOf(doc: TestDoc): string {
  return doc.getRoot().t.toXML();
}

/**
 * `paras` lists the live paragraphs as `[base, text]`.
 */
function paras(doc: TestDoc): Array<[number, string]> {
  const json = JSON.parse(doc.getRoot().t.toJSON());
  const out: Array<[number, string]> = [];
  let base = 0;
  for (const p of json.children ?? []) {
    const text = (p.children ?? [])
      .map((c: { value?: string }) => c.value ?? '')
      .join('');
    out.push([base, text]);
    base += text.length + 2;
  }
  return out;
}

/**
 * `rebuild` builds a document of the same actor from `doc`'s snapshot
 * bytes, the way a replica is rebuilt from a server snapshot.
 */
function rebuild(doc: TestDoc, actor: string, clientSeq: number): TestDoc {
  const bytes = converter.snapshotToBytes(doc.getRootObject(), new Map());
  const d: TestDoc = new Document(DocKey);
  d.setActor(actor);
  d.applyChangePack(
    hop(
      ChangePack.create(
        DocKey,
        Checkpoint.of(0n, clientSeq),
        false,
        [],
        doc.getVersionVector().deepcopy(),
        bytes,
      ),
    ),
  );
  return d;
}

/**
 * `Replay` runs one script in one GC mode.
 */
class Replay {
  docs: Array<TestDoc> = [];
  log: Array<Entry> = [];
  cursor: Array<number>;
  rows: Array<VersionVector> = [];
  lines: Array<string> = [];
  clientSeq: Array<number>;
  i3 = true;

  constructor(
    private script: Script,
    private mode: Mode,
  ) {
    this.cursor = new Array(script.replicas).fill(0);
    this.clientSeq = new Array(script.replicas).fill(0);
  }

  /**
   * `pending` tells whether the log holds an entry replica r has not seen
   * and did not author.
   */
  pending(r: number): boolean {
    for (let i = this.cursor[r]; i < this.log.length; i++) {
      if (this.log[i].author !== r) return true;
    }
    return false;
  }

  /**
   * `vv` is the version vector of a pack the server sends to replica r: in
   * `minvv` mode, minVV once r is caught up, as the real server delivers
   * every pending change before the client collects.
   */
  vv(r: number): VersionVector {
    if (this.mode === 'off' || this.pending(r)) return InitialVersionVector;
    return minVV(this.rows);
  }

  /**
   * `storeRow` records replica r's version vector on the fake server.
   */
  storeRow(r: number) {
    if (this.mode === 'minvv') {
      this.rows[r] = this.docs[r].getVersionVector().deepcopy();
    }
  }

  /**
   * `push` sends replica r's local change and applies the server's ack.
   */
  push(r: number): Array<Change<Indexable>> {
    const doc = this.docs[r];
    const pack = hop(doc.createChangePack());
    const changes = pack.getChanges();
    const lastSeq = changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
    this.clientSeq[r] = lastSeq;
    this.storeRow(r);
    doc.applyChangePack(
      hop(
        ChangePack.create(
          DocKey,
          Checkpoint.of(0n, lastSeq),
          false,
          [],
          this.vv(r),
        ),
      ),
    );
    return changes;
  }

  /**
   * `pull` delivers the next log entry replica r has not seen and returns
   * its index, or -1 when none is left.
   */
  pull(r: number): number {
    while (
      this.cursor[r] < this.log.length &&
      this.log[this.cursor[r]].author === r
    ) {
      this.cursor[r]++;
    }
    if (this.cursor[r] >= this.log.length) return -1;
    const idx = this.cursor[r]++;
    const e = this.log[idx];
    if (e.changes) {
      this.docs[r].applyChangePack(
        hop(
          ChangePack.create(
            DocKey,
            Checkpoint.of(0n, 0),
            false,
            e.changes,
            this.vv(r),
          ),
        ),
      );
      this.storeRow(r);
    }
    return idx;
  }

  /**
   * `local` runs a local op on replica r and appends its log entry. `run`
   * returns the description, or '' when the op has nothing to act on.
   */
  local(r: number, run: (d: TestDoc) => string) {
    const doc = this.docs[r];
    const desc = run(doc);
    const d = `d${r + 1}`;
    if (desc === '' || !doc.hasLocalChanges()) {
      this.log.push({ author: r });
      this.lines.push(`${d}.noop`);
      return;
    }
    this.log.push({ author: r, changes: this.push(r) });
    this.lines.push(`${d}.${desc}`);
  }

  /**
   * `checkRebuild` compares a replica with its rebuild from snapshot bytes
   * and returns the rebuild.
   */
  checkRebuild(r: number): TestDoc | undefined {
    try {
      const d = rebuild(this.docs[r], actorOf(r), this.clientSeq[r]);
      if (
        xmlOf(d) !== xmlOf(this.docs[r]) ||
        shapeOf(d) !== shapeOf(this.docs[r])
      ) {
        this.i3 = false;
      }
      return d;
    } catch {
      this.i3 = false;
      return undefined;
    }
  }

  step(s: Step) {
    const d = `d${s.r + 1}`;
    switch (s.op) {
      case 'edit':
        return this.local(s.r, (doc) => {
          doc.update((root) =>
            root.t.edit(
              s.from,
              s.to,
              s.text ? { type: 'text', value: s.text } : undefined,
              s.split ?? 0,
            ),
          );
          if (s.text) return `edit(${s.from},${s.to},'${s.text}')`;
          if (s.split && s.from === s.to) return `split(${s.from})`;
          return `edit(${s.from},${s.to})`;
        });
      case 'style':
        return this.local(s.r, (doc) => {
          doc.update((root) => root.t.style(s.from, s.to, s.attrs));
          const kv = Object.keys(s.attrs)
            .sort()
            .map((k) => `${k}=${s.attrs[k]}`);
          return `style(${s.from},${s.to},${kv.join(',')})`;
        });
      case 'removeStyle':
        return this.local(s.r, (doc) => {
          doc.update((root) => root.t.removeStyle(s.from, s.to, s.keys));
          return `removeStyle(${s.from},${s.to},${s.keys.join(',')})`;
        });
      case 'undo':
        return this.local(s.r, (doc) => {
          doc.history.undo();
          return 'undo';
        });
      case 'redo':
        return this.local(s.r, (doc) => {
          doc.history.redo();
          return 'redo';
        });
      case 'gen':
        return this.local(s.r, (doc) => resolveGen(doc, s));
      case 'pull': {
        const idx = this.pull(s.r);
        this.lines.push(idx < 0 ? `pull ${d} -` : `pull ${d} <- #${idx}`);
        return;
      }
      case 'sync':
        for (let idx = this.pull(s.r); idx >= 0; idx = this.pull(s.r)) {
          this.lines.push(`pull ${d} <- #${idx}`);
        }
        return;
      case 'snapshot': {
        let rebuilt: TestDoc | undefined;
        if (this.mode === 'off') {
          rebuilt = this.checkRebuild(s.r);
        }
        this.docs[s.r] =
          rebuilt ?? rebuild(this.docs[s.r], actorOf(s.r), this.clientSeq[s.r]);
        this.lines.push(`${d}.snapshot`);
        return;
      }
      default:
        throw new Error(`unknown op: ${JSON.stringify(s)}`);
    }
  }

  /**
   * `run` replays the script and the end-of-run sync. It throws whatever a
   * step throws.
   */
  run() {
    const n = this.script.replicas;
    for (let i = 0; i < n; i++) {
      const d: TestDoc = new Document(DocKey);
      d.setActor(actorOf(i));
      this.docs.push(d);
    }

    // The init change is not in the server log.
    this.docs[0].update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: this.script.init }] },
        ],
      });
    });
    const init = hop(this.docs[0].createChangePack()).getChanges();
    const ack = (seq: number, changes: Array<Change<Indexable>>) =>
      hop(
        ChangePack.create(
          DocKey,
          Checkpoint.of(0n, seq),
          false,
          changes,
          InitialVersionVector,
        ),
      );
    this.clientSeq[0] = init[init.length - 1].getID().getClientSeq();
    this.docs[0].applyChangePack(ack(this.clientSeq[0], []));
    for (let i = 1; i < n; i++) this.docs[i].applyChangePack(ack(0, init));
    for (let i = 0; i < n; i++) {
      this.rows.push(this.docs[i].getVersionVector().deepcopy());
    }

    for (const s of this.script.steps) this.step(s);

    for (let r = 0; r < n; r++) while (this.pull(r) >= 0);
    if (this.mode === 'minvv') {
      const vv = minVV(this.rows);
      for (const doc of this.docs) {
        doc.applyChangePack(
          hop(ChangePack.create(DocKey, Checkpoint.of(0n, 0), false, [], vv)),
        );
      }
    }
  }
}

/**
 * `resolveGen` resolves a generator event on `doc` exactly as fuzz2 does and
 * returns its description, or '' when there is no candidate.
 */
function resolveGen(doc: TestDoc, s: Extract<Step, { op: 'gen' }>): string {
  const ps = paras(doc);
  if (s.k === 'ins' || s.k === 'split') {
    const slots: Array<number> = [];
    for (const [base, text] of ps) {
      for (let k = 0; k <= text.length; k++) slots.push(base + 1 + k);
    }
    if (!slots.length) return '';
    const idx = slots[Math.floor(s.f * slots.length)];
    if (s.k === 'ins') {
      doc.update((r) => r.t.edit(idx, idx, { type: 'text', value: s.v }));
      return `edit(${idx},${idx},'${s.v}')`;
    }
    doc.update((r) => r.t.edit(idx, idx, undefined, 1));
    return `split(${idx})`;
  }
  if (s.k === 'del') {
    const c: Array<{ idx: number; room: number }> = [];
    for (const [base, text] of ps) {
      for (let k = 0; k < text.length; k++) {
        c.push({ idx: base + 1 + k, room: Math.min(3, text.length - k) });
      }
    }
    if (!c.length) return '';
    const p = c[Math.floor(s.f * c.length)];
    const len = 1 + Math.floor(s.g * p.room);
    doc.update((r) => r.t.edit(p.idx, p.idx + len));
    return `edit(${p.idx},${p.idx + len})`;
  }
  if (s.k === 'merge') {
    if (ps.length < 2) return '';
    const i = Math.floor(s.f * (ps.length - 1));
    const [base, text] = ps[i];
    const next = ps[i + 1][1];
    const a = Math.floor(s.g * (Math.min(2, text.length) + 1));
    const b = Math.floor(s.h * (Math.min(2, next.length) + 1));
    const from = base + 1 + text.length - a;
    const to = base + text.length + 3 + b;
    doc.update((r) => r.t.edit(from, to));
    return `edit(${from},${to})`;
  }
  if (s.k === 'style') {
    if (!ps.length) return '';
    const [base, text] = ps[Math.floor(s.f * ps.length)];
    const key = s.g < 0.5 ? 'b' : 'i';
    const to = base + text.length + 2;
    doc.update((r) => r.t.style(base, to, { [key]: s.v }));
    return `style(${base},${to},${key}=${s.v})`;
  }
  throw new Error(`unknown gen kind: ${s.k}`);
}

/**
 * `digest16` is the first 16 hex digits of the sha256 of `s`.
 */
function digest16(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/**
 * `runScript` replays the script in `off` and `minvv` modes, checks I1-I4
 * and returns the record.
 */
export function runScript(script: Script): RunRecord {
  const off = new Replay(script, 'off');
  let offErr: string | undefined;
  try {
    off.run();
  } catch (e) {
    offErr = String((e as Error)?.message ?? e);
  }

  // If `off` mode throws, `minvv` mode is not run.
  const on = new Replay(script, 'minvv');
  let onErr: string | undefined;
  if (!offErr) {
    try {
      on.run();
    } catch (e) {
      onErr = String((e as Error)?.message ?? e);
    }
  }

  const I2 = !offErr && !onErr;
  let I1 = false;
  let I3 = false;
  let I4 = false;
  let xml: Array<string> = [];
  let shapes: Array<string> = [];
  if (!offErr) {
    xml = off.docs.map(xmlOf);
    shapes = off.docs.map(shapeOf);
    I1 = xml.every((x) => x === xml[0]) && shapes.every((s) => s === shapes[0]);
    for (let r = 0; r < off.docs.length; r++) off.checkRebuild(r);
    I3 = off.i3;
    if (!onErr) {
      const onXML = on.docs.map(xmlOf);
      I4 = onXML[0] === xml[0] && onXML.every((x) => x === onXML[0]);
    }
  }

  let result: Result = 'pass';
  if (!I2) result = 'error';
  else if (!I1) result = 'diverged';
  else if (!I3 || !I4) result = 'fail';

  const steps = off.lines;
  const head = steps.join('\n') + '\n';
  const digest =
    result === 'error'
      ? digest16(head + 'ERROR')
      : digest16(head + xml.join('\n') + '\n' + shapes.join('\n'));
  const xmlDigest =
    result === 'error'
      ? digest16(head + 'ERROR')
      : digest16(head + xml.join('\n'));

  return {
    id: script.id,
    n: script.replicas,
    result,
    checks: { I1, I2, I3, I4 },
    steps,
    xml: result === 'error' ? [] : xml,
    shapes: result === 'error' ? [] : shapes,
    error: offErr ? `off: ${offErr}` : onErr && `minvv: ${onErr}`,
    digest,
    xmlDigest,
  };
}
