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

// Runner for the cross-SDK conformance script format v2. The format is
// specified in yorkie's test/conformance/README.md; the Go runner there and
// this one must produce byte-identical step lines, xml and digests for the
// same script, so every string built here follows that spec literally.

import { createHash } from 'crypto';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import {
  CRDTTree,
  CRDTTreeNode,
  ElementNode,
  TreeNode,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';

export type GenKind = 'ins' | 'split' | 'del' | 'merge' | 'style';

/**
 * `ScriptNode` is a tree node of a script: a text node or an element.
 */
export type ScriptNode =
  | { type: 'text'; value: string }
  | {
      type: string;
      children?: Array<ScriptNode>;
      attributes?: Record<string, string>;
    };

/**
 * `TreeOp` is an op on the tree, as a step (with `r`) or inside an
 * `update` (without).
 */
export type TreeOp =
  | {
      op: 'edit';
      from: number;
      to: number;
      text?: string;
      contents?: Array<ScriptNode>;
      split?: number;
    }
  | {
      op: 'style';
      from: number;
      to: number;
      attrs: Record<string, string>;
    }
  | {
      op: 'removeStyle';
      from: number;
      to: number;
      keys: Array<string>;
    };

export type Step =
  | (TreeOp & { r: number })
  | { r: number; op: 'update'; ops: Array<TreeOp> }
  | { r: number; op: 'undo' | 'redo' | 'pull' | 'sync' | 'snapshot' }
  | { op: 'exchange'; orders?: Array<Array<number>> }
  | { op: 'expect'; xml: Array<string>; label?: string }
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
  delivery?: 'log' | 'exchange';
  init: string | ScriptNode;
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
  'delivery',
  'init',
  'steps',
]);
/**
 * `OpFields` lists, for each step op, the fields a step may carry besides
 * `r` and `op`, each marked true when it is required. A field valid for
 * another op is an error, so a misplaced field fails loudly too.
 */
const OpFields: Record<string, Record<string, boolean>> = {
  edit: { from: true, to: true, text: false, contents: false, split: false },
  style: { from: true, to: true, attrs: true },
  removeStyle: { from: true, to: true, keys: true },
  update: { ops: true },
  undo: {},
  redo: {},
  pull: {},
  sync: {},
  exchange: { orders: false },
  snapshot: {},
  expect: { xml: true, label: false },
  gen: { k: true, f: true, g: true, h: true, v: true },
};
// The ops and fields format v1 does not have.
const V2Ops = new Set(['update', 'exchange', 'expect']);
const V2Fields = new Set(['contents']);
// Ops that take no `r`, and the ops an `update` may hold.
const Replicaless = new Set(['exchange', 'expect']);
const Nestable = new Set(['edit', 'style', 'removeStyle']);
// Ops valid in one delivery mode only.
const DeliveryOps: Record<string, string> = {
  pull: 'log',
  sync: 'log',
  exchange: 'exchange',
};
const GenKinds = new Set(['ins', 'split', 'del', 'merge', 'style']);
const SDKs = new Set(['go', 'js']);

/**
 * `hasOwn` tells whether `o` has its own property `k`, so inherited names
 * such as `toString` never pass for a valid key.
 */
function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/**
 * `isObject` tells whether `v` is a JSON object (not null, not an array).
 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * `checkNode` validates a script tree node and returns what is wrong with
 * it, or undefined when it is valid.
 */
function checkNode(n: unknown): string | undefined {
  if (n === null) return 'node is null';
  if (!isObject(n)) return 'node is not an object';
  for (const k of Object.keys(n)) {
    if (n[k] === null) return `field "${k}" is null`;
  }
  if (typeof n.type !== 'string' || n.type === '') {
    return 'node needs a non-empty string type';
  }
  if (n.type === 'text') {
    for (const k of Object.keys(n)) {
      if (k !== 'type' && k !== 'value') {
        return `field "${k}" is not valid for a text node`;
      }
    }
    if (typeof n.value !== 'string') return 'text node needs a string value';
    return undefined;
  }
  for (const k of Object.keys(n)) {
    if (k === 'type') continue;
    if (k === 'children') {
      if (!Array.isArray(n.children)) return 'children is not an array';
      for (let j = 0; j < n.children.length; j++) {
        const err = checkNode(n.children[j]);
        if (err) return `children[${j}]: ${err}`;
      }
    } else if (k === 'attributes') {
      const attrs = n.attributes;
      if (!isObject(attrs)) return 'attributes is not an object of strings';
      for (const [ak, av] of Object.entries(attrs)) {
        if (typeof av !== 'string') return `attributes.${ak} is not a string`;
      }
    } else {
      return `field "${k}" is not valid for an element node`;
    }
  }
  return undefined;
}

/**
 * `checkOrders` checks that orders holds, for each replica, the other
 * replicas in some order, each exactly once.
 */
function checkOrders(orders: unknown, replicas: number): string | undefined {
  if (!Array.isArray(orders)) return 'orders is not an array';
  if (orders.length !== replicas) {
    return `orders has ${orders.length} entries for ${replicas} replicas`;
  }
  for (let i = 0; i < orders.length; i++) {
    const order: unknown = orders[i];
    if (!Array.isArray(order)) return `orders[${i}] is not an array`;
    const seen = new Set<number>();
    for (const j of order) {
      if (
        !Number.isInteger(j) ||
        j < 0 ||
        j >= replicas ||
        j === i ||
        seen.has(j)
      ) {
        return `orders[${i}] is not a permutation of the other replicas`;
      }
      seen.add(j);
    }
    if (seen.size !== replicas - 1) {
      return `orders[${i}] is not a permutation of the other replicas`;
    }
  }
  return undefined;
}

/**
 * `checkStep` validates one step and returns what is wrong with it, or
 * undefined when it is valid. A nested step is an op of an `update`.
 */
function checkStep(st: unknown, s: Script, nested = false): string | undefined {
  if (!isObject(st) || !hasOwn(st, 'op') || st.op === null) {
    return 'missing "op"';
  }
  const op = st.op as string;
  if (typeof op !== 'string' || !hasOwn(OpFields, op)) {
    return `unknown op "${op}"`;
  }
  if (nested && !Nestable.has(op)) {
    return `op "${op}" is not valid in an update`;
  }
  if (nested || Replicaless.has(op)) {
    if (hasOwn(st, 'r')) return `field "r" is not valid for op "${op}"`;
  } else {
    if (!hasOwn(st, 'r') || st.r === null) return 'missing "r"';
    if (!Number.isInteger(st.r)) return `replica ${st.r} is not an integer`;
    const r = st.r as number;
    if (r < 0 || r >= s.replicas) return `replica ${r} out of range`;
  }
  if (s.v === 1 && V2Ops.has(op)) return `op "${op}" needs v 2`;
  if (hasOwn(DeliveryOps, op) && DeliveryOps[op] !== s.delivery) {
    return `op "${op}" is not valid with delivery "${s.delivery}"`;
  }
  if (op === 'gen' && isObject(s.init)) {
    return `op "${op}" needs a string init`;
  }
  const allowed = OpFields[op];
  for (const k of Object.keys(st)) {
    if (k === 'r' || k === 'op') continue;
    if (!hasOwn(allowed, k)) return `field "${k}" is not valid for op "${op}"`;
    if (s.v === 1 && V2Fields.has(k)) return `field "${k}" needs v 2`;
    if (st[k] === null) return `field "${k}" is null`;
  }
  for (const [k, required] of Object.entries(allowed)) {
    if (required && !hasOwn(st, k)) return `op "${op}" needs "${k}"`;
  }

  for (const k of ['from', 'to', 'split']) {
    if (hasOwn(st, k) && !Number.isInteger(st[k])) {
      return `${k} is not an integer`;
    }
  }
  for (const k of ['text', 'v', 'label']) {
    if (hasOwn(st, k) && typeof st[k] !== 'string') {
      return `${k} is not a string`;
    }
  }
  if (hasOwn(st, 'contents')) {
    if (hasOwn(st, 'text')) return 'text and contents are exclusive';
    const contents = st.contents;
    if (!Array.isArray(contents)) return 'contents is not an array';
    if (!contents.length) return 'contents is empty';
    for (let j = 0; j < contents.length; j++) {
      const err = checkNode(contents[j]);
      if (err) return `contents[${j}]: ${err}`;
    }
  }
  if (op === 'update') {
    const ops = st.ops;
    if (!Array.isArray(ops)) return 'ops is not an array';
    if (!ops.length) return 'ops is empty';
    for (let j = 0; j < ops.length; j++) {
      if (ops[j] === null) return `ops[${j}] is null`;
      const err = checkStep(ops[j], s, true);
      if (err) return `ops[${j}]: ${err}`;
    }
  }
  if (op === 'exchange' && hasOwn(st, 'orders')) {
    const err = checkOrders(st.orders, s.replicas);
    if (err) return err;
  }
  if (op === 'expect') {
    const xml = st.xml;
    if (!Array.isArray(xml)) return 'xml is not an array';
    if (xml.length !== s.replicas) {
      return `xml has ${xml.length} entries for ${s.replicas} replicas`;
    }
    for (let j = 0; j < xml.length; j++) {
      if (typeof xml[j] !== 'string') return `xml[${j}] is not a string`;
    }
  }
  if (op === 'style') {
    const attrs = st.attrs;
    if (!isObject(attrs)) return 'attrs is not an object';
    const keys = Object.keys(attrs);
    if (!keys.length) return 'attrs is empty';
    for (const k of keys) {
      if (typeof attrs[k] !== 'string') return `attrs.${k} is not a string`;
    }
  }
  if (op === 'removeStyle') {
    const keys = st.keys;
    if (!Array.isArray(keys)) return 'keys is not an array';
    if (!keys.length) return 'keys is empty';
    for (let j = 0; j < keys.length; j++) {
      if (typeof keys[j] !== 'string') return `keys[${j}] is not a string`;
    }
  }
  if (op === 'gen') {
    if (typeof st.k !== 'string' || !GenKinds.has(st.k)) {
      return `unknown gen kind "${st.k}"`;
    }
    for (const k of ['f', 'g', 'h']) {
      const v = st[k];
      if (typeof v !== 'number' || !(v >= 0 && v < 1)) {
        return `${k} ${v} is not in [0, 1)`;
      }
    }
  }
  return undefined;
}

/**
 * `parseScript` parses and validates a script, as the Go runner's
 * LoadScript does. Unknown fields, ops, generator kinds and ledger values
 * are errors naming `name`, and so are steps missing a field their op needs
 * or carrying one it does not take, so a typo fails loudly instead of
 * silently replaying something else. `JSON.parse` rejects anything but
 * whitespace after the script.
 */
export function parseScript(text: string, name: string): Script {
  const fail = (msg: string): never => {
    throw new Error(`${name}: ${msg}`);
  };
  let s: Script;
  try {
    s = JSON.parse(text) as Script;
  } catch (e) {
    return fail(`parse: ${(e as Error).message}`);
  }
  if (!isObject(s)) fail('not a script object');
  for (const key of Object.keys(s)) {
    if (!ScriptFields.has(key)) fail(`unknown field "${key}"`);
  }
  if (s.v !== 1 && s.v !== 2) fail(`unsupported version ${s.v}`);
  if (!Number.isInteger(s.replicas) || !(s.replicas >= 1)) {
    fail('replicas must be at least 1');
  }
  const status: unknown = s.status ?? {};
  if (!isObject(status)) fail('status is not an object');
  for (const [sdk, value] of Object.entries(status as object)) {
    if (!SDKs.has(sdk)) fail(`status: unknown sdk "${sdk}"`);
    if (typeof value !== 'string' || !hasOwn(StatusResults, value)) {
      fail(`status.${sdk}: unknown value "${value}"`);
    }
  }
  if (hasOwn(s, 'init') && typeof s.init !== 'string') {
    if (!isObject(s.init)) fail('init must be a string or a tree node');
    if (s.v === 1) fail('init: a tree node needs v 2');
    const err = checkNode(s.init);
    if (err) fail(`init: ${err}`);
    if (s.init.type === 'text') fail('init: the root must be an element');
  }
  if (hasOwn(s, 'delivery')) {
    if (s.v === 1) fail('delivery needs v 2');
    if (s.delivery === null) fail('field "delivery" is null');
    if (s.delivery !== 'log' && s.delivery !== 'exchange') {
      fail(`unknown delivery "${s.delivery}"`);
    }
  }
  s.delivery = s.delivery ?? 'log';
  s.steps = s.steps ?? [];
  if (!Array.isArray(s.steps)) fail('steps is not an array');
  s.steps.forEach((st, i) => {
    const err = checkStep(st, s);
    if (err) fail(`step ${i}: ${err}`);
  });
  return s;
}

export type RunRecord = {
  id: string;
  n: number;
  result: Result;
  checks: { I1: boolean; I2: boolean; I3: boolean; I4: boolean; E: boolean };
  steps: Array<string>;
  xml: Array<string>;
  shapes: Array<string>;
  error?: string;
  // expects describes each expect step that did not hold.
  expects: Array<string>;
  digest: string;
  xmlDigest: string;
};

/**
 * `checksString` is the checks as five `1`/`0` characters for I1..I4 and
 * E, e.g. "01101", as parity rows record them.
 */
export function checksString(c: RunRecord['checks']): string {
  return [c.I1, c.I2, c.I3, c.I4, c.E].map((ok) => (ok ? '1' : '0')).join('');
}

/**
 * `nodeXML` is the canonical XML of a script node, as step lines show it:
 * `<type k="v" …>children</type>` with attributes sorted by key, and a text
 * node as its value, nothing escaped.
 */
export function nodeXML(n: ScriptNode): string {
  if (n.type === 'text') return (n as { value: string }).value;
  const el = n as Exclude<ScriptNode, { type: 'text'; value: string }>;
  const attrs = el.attributes ?? {};
  const kv = Object.keys(attrs)
    .sort()
    .map((k) => ` ${k}="${attrs[k]}"`)
    .join('');
  const children = (el.children ?? []).map(nodeXML).join('');
  return `<${el.type}${kv}>${children}</${el.type}>`;
}

/**
 * `toTreeNode` copies a script node into a fresh SDK tree node, so a replay
 * never shares one with the SDK.
 */
function toTreeNode(n: ScriptNode): TreeNode {
  return JSON.parse(JSON.stringify(n)) as TreeNode;
}

/**
 * `treeOp` runs one edit, style or removeStyle op on the tree.
 */
function treeOp(t: Tree, op: TreeOp) {
  if (op.op === 'edit') {
    if (op.contents) {
      t.editBulk(op.from, op.to, op.contents.map(toTreeNode), op.split ?? 0);
    } else {
      t.edit(
        op.from,
        op.to,
        op.text ? { type: 'text', value: op.text } : undefined,
        op.split ?? 0,
      );
    }
  } else if (op.op === 'style') {
    t.style(op.from, op.to, op.attrs);
  } else {
    t.removeStyle(op.from, op.to, op.keys);
  }
}

/**
 * `describeOp` is the step-line form of an edit, style or removeStyle op.
 */
function describeOp(op: TreeOp): string {
  if (op.op === 'style') {
    const kv = Object.keys(op.attrs)
      .sort()
      .map((k) => `${k}=${op.attrs[k]}`);
    return `style(${op.from},${op.to},${kv.join(',')})`;
  }
  if (op.op === 'removeStyle') {
    return `removeStyle(${op.from},${op.to},${op.keys.join(',')})`;
  }
  return describeEdit(op.from, op.to, op.text, op.split, op.contents);
}

/**
 * `describeEdit` is the step-line form of an edit.
 */
function describeEdit(
  from: number,
  to: number,
  text?: string,
  split?: number,
  contents?: Array<ScriptNode>,
): string {
  if (contents) return `edit(${from},${to},${contents.map(nodeXML).join(',')})`;
  if (text) return `edit(${from},${to},'${text}')`;
  if (split === 1 && from === to) return `split(${from})`;
  if (split && split > 1 && from === to) return `split(${from},${split})`;
  return `edit(${from},${to})`;
}

type TestDoc = Document<{ t: Tree }>;
export type Mode = 'off' | 'minvv';
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
 * `localChanges` counts the changes of `doc` not yet sent.
 */
function localChanges(doc: TestDoc): number {
  return doc.createChangePack().getChanges().length;
}

/**
 * `xmlOf` is the tree's `toXML()`.
 */
function xmlOf(doc: TestDoc): string {
  return doc.getRoot().t.toXML();
}

/**
 * `paras` lists the live paragraphs as `[base, text]`. Lengths are string
 * lengths, i.e. UTF-16 code units, the unit of Tree indexes.
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
export class Replay {
  docs: Array<TestDoc> = [];
  log: Array<Entry> = [];
  cursor: Array<number>;
  rows: Array<VersionVector> = [];
  lines: Array<string> = [];
  clientSeq: Array<number>;
  i3 = true;
  // arrivals holds one entry per exchange, the packs it delivered as
  // `d{to}<-d{from}` in the order they were applied, and senders the
  // replicas that had a pack to hand over in it. Nothing in a record
  // depends on them, and they live in the runner because only the delivery
  // loop sees the order packs arrive in: a correct CRDT converges whatever
  // that order, so no record can show whether `orders` reached the
  // documents, and a test has to read it here.
  arrivals: Array<Array<string>> = [];
  senders: Array<Array<number>> = [];
  // expects counts the expect steps run; expectFails describes those that
  // did not hold. Both stay empty in minvv mode.
  expects = 0;
  expectFails: Array<string> = [];

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
    const d = `d${r + 1}`;
    if (this.script.delivery === 'exchange') {
      const before = localChanges(doc);
      const desc = run(doc);
      const changed = desc !== '' && localChanges(doc) !== before;
      this.lines.push(`${d}.${changed ? desc : 'noop'}`);
      return;
    }
    const desc = run(doc);
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

  /**
   * `exchange` hands every replica's local changes to the others, as one
   * pack per author, in the given orders (default: each replica receives
   * the others in ascending index), then acks every author. In minvv mode
   * every replica has then seen everything, so all rows are set and one
   * empty pack carrying minVV goes to every replica. It returns the step
   * line.
   */
  exchange(orders?: Array<Array<number>>): string {
    const n = this.docs.length;
    const resolved =
      orders ??
      this.docs.map((_, i) =>
        this.docs.map((__, j) => j).filter((j) => j !== i),
      );

    const packs = this.docs.map((doc) => {
      const changes = hop(doc.createChangePack()).getChanges();
      return changes.length ? changes : undefined;
    });
    this.senders.push(packs.flatMap((changes, i) => (changes ? [i] : [])));
    const delivered: Array<string> = [];
    resolved.forEach((order, i) => {
      for (const j of order) {
        const changes = packs[j];
        if (!changes) continue;
        this.docs[i].applyChangePack(
          hop(
            ChangePack.create(
              DocKey,
              Checkpoint.of(0n, 0),
              false,
              changes,
              InitialVersionVector,
            ),
          ),
        );
        delivered.push(`d${i + 1}<-d${j + 1}`);
      }
    });
    this.arrivals.push(delivered);
    packs.forEach((changes, i) => {
      if (!changes) return;
      this.clientSeq[i] = changes[changes.length - 1].getID().getClientSeq();
      this.docs[i].applyChangePack(
        hop(
          ChangePack.create(
            DocKey,
            Checkpoint.of(0n, this.clientSeq[i]),
            false,
            [],
            InitialVersionVector,
          ),
        ),
      );
    });
    if (this.mode === 'minvv') {
      for (let i = 0; i < n; i++) this.storeRow(i);
      const vv = minVV(this.rows);
      for (const doc of this.docs) {
        doc.applyChangePack(
          hop(ChangePack.create(DocKey, Checkpoint.of(0n, 0), false, [], vv)),
        );
      }
    }

    const parts = resolved.map(
      (order, i) => `d${i + 1}<-[${order.map((j) => `d${j + 1}`).join(',')}]`,
    );
    return `exchange ${parts.join(' ')}`;
  }

  /**
   * `expect` compares each replica's XML with the expected one, in off
   * mode.
   */
  expect(s: Extract<Step, { op: 'expect' }>) {
    if (this.mode === 'minvv') return;
    this.expects++;
    this.docs.forEach((doc, r) => {
      const got = xmlOf(doc);
      if (got !== s.xml[r]) {
        this.expectFails.push(
          `expect "${s.label ?? ''}" (step line ${this.lines.length}): ` +
            `d${r + 1} is ${got}, want ${s.xml[r]}`,
        );
      }
    });
  }

  step(s: Step) {
    if (s.op === 'exchange') {
      this.lines.push(this.exchange(s.orders));
      return;
    }
    if (s.op === 'expect') {
      this.expect(s);
      this.lines.push('expect');
      return;
    }
    const d = `d${s.r + 1}`;
    switch (s.op) {
      case 'edit':
      case 'style':
      case 'removeStyle':
        return this.local(s.r, (doc) => {
          doc.update((root) => treeOp(root.t, s));
          return describeOp(s);
        });
      case 'update':
        return this.local(s.r, (doc) => {
          doc.update((root) => {
            for (const op of s.ops) treeOp(root.t, op);
          });
          return `update[${s.ops.map(describeOp).join(';')}]`;
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
        // The rebuild would drop changes not yet exchanged.
        if (this.docs[s.r].hasLocalChanges()) {
          throw new Error(`snapshot of ${d} with changes not yet exchanged`);
        }
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
    const init = this.script.init;
    const node: ScriptNode =
      typeof init === 'object'
        ? init
        : {
            type: 'doc',
            children: [
              { type: 'p', children: [{ type: 'text', value: init }] },
            ],
          };
    // An element without `children` has none, but Tree needs the root's.
    const rootNode = toTreeNode(node) as ElementNode;
    rootNode.children = rootNode.children ?? [];
    this.docs[0].update((root) => {
      root.t = new Tree(rootNode);
    });
    const initChanges = hop(this.docs[0].createChangePack()).getChanges();
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
    this.clientSeq[0] = initChanges[initChanges.length - 1]
      .getID()
      .getClientSeq();
    this.docs[0].applyChangePack(ack(this.clientSeq[0], []));
    for (let i = 1; i < n; i++) {
      this.docs[i].applyChangePack(ack(0, initChanges));
    }
    // The init change is not an edit of the script: an undo must not reach
    // it, or it would remove the tree.
    for (const doc of this.docs) doc.clearHistory();
    for (let i = 0; i < n; i++) {
      this.rows.push(this.docs[i].getVersionVector().deepcopy());
    }

    for (const s of this.script.steps) this.step(s);

    if (this.script.delivery === 'exchange') {
      this.exchange();
      return;
    }

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
 * `replay` runs the script in one GC mode and returns the replay with the
 * message of the error it threw, if any. A replay that threw keeps what the
 * steps before the error did.
 */
export function replay(
  script: Script,
  mode: Mode,
): [Replay, string | undefined] {
  const rn = new Replay(script, mode);
  try {
    rn.run();
  } catch (e) {
    return [rn, String((e as Error)?.message ?? e)];
  }
  return [rn, undefined];
}

/**
 * `runScript` replays the script in `off` and `minvv` modes, checks I1-I4
 * and E, and returns the record.
 */
export function runScript(script: Script): RunRecord {
  const [off, offErr] = replay(script, 'off');

  // If `off` mode throws, `minvv` mode is not run.
  const [on, onErr] = offErr
    ? [new Replay(script, 'minvv'), undefined]
    : replay(script, 'minvv');

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

  const expects = script.steps.filter((s) => s.op === 'expect').length;
  const E = off.expects === expects && off.expectFails.length === 0;

  let result: Result = 'pass';
  if (!I2) result = 'error';
  else if (!I1) result = 'diverged';
  else if (!I3 || !I4 || !E) result = 'fail';

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
    checks: { I1, I2, I3, I4, E },
    steps,
    xml: result === 'error' ? [] : xml,
    shapes: result === 'error' ? [] : shapes,
    error: offErr ? `off: ${offErr}` : onErr && `minvv: ${onErr}`,
    expects: off.expectFails,
    digest,
    xmlDigest,
  };
}
