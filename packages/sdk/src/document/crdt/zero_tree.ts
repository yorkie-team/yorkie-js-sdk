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

/**
 * PROTOTYPE — `CRDTZeroTree`, a CRDT made for the Zero editor's document
 * model.
 *
 * The document is ONE RGA (Yorkie's `RGATreeSplit`) of tokens: characters and
 * open markers (`type`, `depth`, LWW attributes). Every editor action becomes
 * an insertion or a deletion of tokens, or an attribute write on a marker:
 *
 * - typing / deleting text    → insert / delete characters
 * - Enter (a cascade of SPLIT) → insert ONE run of markers, outermost first
 * - Backspace at a block start → delete the block's marker (MERGE)
 * - formatting                 → write attributes on the inline's marker
 * - inserting / deleting nodes → insert / delete their token runs
 *
 * So the concurrent-Enter problem is reduced to concurrent insertion into an
 * RGA, which Yorkie already converges, and the editor model is a pure
 * function of the live tokens (see `zero_tree_view.ts`).
 */

import {
  InitialTimeTicket,
  MaxTimeTicket,
  TimeTicket,
  TimeTicketSize,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import {
  RGATreeSplit,
  RGATreeSplitNode,
  RGATreeSplitNodeID,
  RGATreeSplitPos,
  RGATreeSplitPosRange,
  RestoreSpan,
  ValueChange,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { GCChild, GCPair } from '@yorkie-js/sdk/src/document/crdt/gc';
import { DataSize } from '@yorkie-js/sdk/src/util/resource';
import type * as Devtools from '@yorkie-js/sdk/src/devtools/types';
import {
  CompileStats,
  DefaultZeroSchema,
  ViewEntry,
  ZNode,
  ZeroLevelKey,
  ZeroNodeJSON,
  ZeroRegionPrefix,
  ZeroSchema,
  buildView,
  cloneZeroSchema,
  dealias,
  flattenProps,
  isTextType,
  stableStringify,
  toNodeJSON,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type { ZeroAttrValue } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import {
  IndexStats,
  note,
  ZeroBlockIndex,
  ZeroChange,
  ZeroPlan,
  tokenEntry,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_index';

/**
 * `ZeroAttrEntry` is one write a register keeps (see `ZeroAttr.history`).
 * `byRange`: a range write gave it to this marker, which lay in the range,
 * rather than someone writing on the marker's node (see `dealias`).
 */
export type ZeroAttrEntry = {
  value: ZeroAttrValue;
  at: TimeTicket;
  byRange?: boolean;
};

/**
 * `ZeroAttr` is one LWW attribute register of a marker. `value` null means
 * the key was removed; the register is kept so a concurrent older write
 * cannot bring it back.
 *
 * A register a write reached keeps the newest writes (`history`, at most
 * `ZeroHistoryDepth`, newest first) so an undo can cancel one of them
 * wherever it went (see `ZeroStyleCancel`): `value` and `updatedAt` are then
 * those of the newest write no undo cancelled. Reserved keys (`zt.*`) stay
 * plain registers.
 */
export type ZeroAttr = {
  value: ZeroAttrValue;
  updatedAt: TimeTicket;
  history?: Array<ZeroAttrEntry>;
};

/**
 * `ZeroHistoryDepth` is how many writes a register keeps. An undo that
 * cancels all of them falls back to what its write's marker held before.
 */
export const ZeroHistoryDepth = 4;

/**
 * `keepsHistory` tells whether a register of `key` keeps its writes: the
 * reserved keys (`zt.*`) are bookkeeping, undone by writing them back.
 */
export function keepsHistory(key: string): boolean {
  return !key.startsWith('zt.');
}

/**
 * `ZeroMarker` is the open marker of a Zero element node.
 */
export class ZeroMarker {
  public type: string;
  public depth: number;
  public attrs: Map<string, ZeroAttr>;
  /**
   * The boundary a SPLIT made this marker at: the ids of the tokens its
   * author saw on both sides of the split point (and the cascade length).
   * Markers made by CONCURRENT splits of the same boundary get the same key,
   * and the view treats them as one split (see `dealias`).
   */
  public boundary?: string;

  constructor(
    type: string,
    depth: number,
    attrs?: Map<string, ZeroAttr>,
    boundary?: string,
  ) {
    this.type = type;
    this.depth = depth;
    this.attrs = attrs ?? new Map();
    this.boundary = boundary;
  }

  /**
   * `create` creates a marker from flat attribute writes.
   */
  public static create(
    type: string,
    depth: number,
    writes: Array<[string, ZeroAttrValue]>,
    ticket: TimeTicket,
  ): ZeroMarker {
    // a level between two depths: the next whole depth, and the level as a
    // reserved attribute (see `ZeroLevelKey`)
    if (!Number.isInteger(depth)) {
      writes = [...writes, [ZeroLevelKey, JSON.stringify(depth)]];
    }
    const marker = new ZeroMarker(type, Math.ceil(depth));
    for (const [k, v] of writes) {
      if (v !== null) {
        marker.attrs.set(k, { value: v, updatedAt: ticket });
      }
    }
    return marker;
  }

  /**
   * `set` writes one attribute with last-writer-wins. Returns the value the
   * register held before (undefined: no register) and whether it applied.
   * With `cancels` a register of a non-reserved key keeps the write in its
   * history and takes the newest write not cancelled; `byRange` marks a write
   * a range write gave it (see `ZeroAttrEntry`).
   */
  public set(
    key: string,
    value: ZeroAttrValue,
    ticket: TimeTicket,
    cancels?: ZeroStyleCancels,
    byRange?: boolean,
  ): [ZeroAttrValue | undefined, boolean] {
    const prev = this.attrs.get(key);
    if (!cancels || !keepsHistory(key)) {
      if (prev && !ticket.after(prev.updatedAt)) {
        return [prev.value, false];
      }
      this.attrs.set(key, { value, updatedAt: ticket });
      return [prev ? prev.value : undefined, true];
    }
    const history = prev
      ? (prev.history ?? [{ value: prev.value, at: prev.updatedAt }]).slice()
      : [];
    if (!history.some((e) => e.at.equals(ticket))) {
      history.push(
        byRange ? { value, at: ticket, byRange } : { value, at: ticket },
      );
      history.sort((a, b) => b.at.compare(a.at));
      history.length = Math.min(history.length, ZeroHistoryDepth);
    }
    const picked = cancels.pick(key, history);
    this.attrs.set(key, {
      value: picked.value,
      updatedAt: picked.at,
      history,
    });
    return [prev ? prev.value : undefined, picked.at.equals(ticket)];
  }

  /**
   * `holds` tells whether a register of this marker keeps the write of
   * `ticket`.
   */
  public holds(ticket: TimeTicket): boolean {
    for (const attr of this.attrs.values()) {
      if (attr.history?.some((e) => e.at.equals(ticket))) {
        return true;
      }
    }
    return false;
  }

  /**
   * `repick` makes every register with a history take its value again under
   * `cancels`.
   */
  public repick(cancels: ZeroStyleCancels): void {
    for (const [key, attr] of this.attrs) {
      if (!attr.history) {
        continue;
      }
      const picked = cancels.pick(key, attr.history);
      this.attrs.set(key, {
        value: picked.value,
        updatedAt: picked.at,
        history: attr.history,
      });
    }
  }

  /**
   * `toObject` returns the attributes that hold a value.
   */
  public toObject(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, { value }] of this.attrs) {
      if (value !== null) {
        obj[k] = value;
      }
    }
    return obj;
  }

  /**
   * `deepcopy` returns a deep copy of this element.
   */
  public deepcopy(): ZeroMarker {
    const attrs = new Map<string, ZeroAttr>();
    for (const [k, v] of this.attrs) {
      attrs.set(
        k,
        v.history
          ? { ...v, history: v.history.map((e) => ({ ...e })) }
          : { ...v },
      );
    }
    return new ZeroMarker(this.type, this.depth, attrs, this.boundary);
  }
}

/**
 * `ZeroToken` is a character or a marker.
 */
export type ZeroToken = string | ZeroMarker;

/**
 * `ZeroGhost` stands in for a character a ghost purge dropped. Characters
 * never change, so a restore refills it from its span.
 */
export const ZeroGhost = '\u0000';

/**
 * `ZeroTokens` is the value of an `RGATreeSplitNode`: a run of tokens.
 */
export class ZeroTokens {
  public tokens: Array<ZeroToken>;
  /**
   * The id of the table, row or cell marker the run was inserted in (see
   * `ZeroSchema.scoped`). The run lives only while that marker does: what
   * someone put in a row stays out of the model once the row is deleted.
   */
  public scope?: string;

  constructor(tokens: Array<ZeroToken>, scope?: string) {
    this.tokens = tokens;
    this.scope = scope;
  }

  /**
   * `length` returns the number of tokens.
   */
  public get length(): number {
    return this.tokens.length;
  }

  /**
   * `substring` returns the tokens in [indexStart, indexEnd) as new tokens.
   */
  public substring(indexStart: number, indexEnd?: number): ZeroTokens {
    return new ZeroTokens(
      this.tokens
        .slice(indexStart, indexEnd)
        .map((t) => (typeof t === 'string' ? t : t.deepcopy())),
      this.scope,
    );
  }

  /**
   * `truncate` drops the tokens from offset on.
   */
  public truncate(offset: number): void {
    this.tokens.length = Math.max(0, offset);
  }

  /**
   * `toGhost` drops the characters (GC). Markers stay: their attributes are
   * LWW registers a concurrent write may still have changed.
   */
  public toGhost(): void {
    this.tokens = this.tokens.map((t) =>
      typeof t === 'string' ? ZeroGhost : t,
    );
  }

  /**
   * `refill` puts back the characters of a ghost from a restore span value,
   * `offset` being where this run starts in it.
   */
  public refill(from: unknown, offset: number): void {
    const source = (from as ZeroTokens).tokens;
    this.tokens.forEach((t, i) => {
      const s = source[offset + i];
      if (t === ZeroGhost && typeof s === 'string' && s !== ZeroGhost) {
        this.tokens[i] = s;
      }
    });
  }

  /**
   * `getDataSize` returns the data size of this element.
   */
  public getDataSize(): DataSize {
    let data = 0;
    let meta = 0;
    for (const t of this.tokens) {
      if (typeof t === 'string') {
        data += 2;
        continue;
      }
      data += t.type.length * 2 + 4;
      for (const [k, v] of t.attrs) {
        data += (k.length + (v.value?.length ?? 0)) * 2;
        meta += TimeTicketSize;
        for (const e of v.history ?? []) {
          data += (e.value?.length ?? 0) * 2;
          meta += TimeTicketSize;
        }
      }
    }
    return { data, meta };
  }

  /**
   * `toString` returns the tokens as a string, for debugging.
   */
  public toString(): string {
    return this.tokens
      .map((t) => (typeof t === 'string' ? t : `<${t.type}:${t.depth}>`))
      .join('');
  }
}

/**
 * `toTokens` serializes Zero nodes into tokens. `depth` is the depth of the
 * nodes themselves (1 for children of `content`).
 */
/**
 * `ColumnKeys` gives cell nodes their column key before `toTokens` turns them
 * into markers (`zt.col`, see `ZeroSchema.grid`): a row added next to a row
 * takes that row's keys, the cells of one column insert share one key.
 */
export const ColumnKeys = new WeakMap<object, string>();

/**
 * `assignColumns` gives the cells of new tables and rows keys by column index
 * where none was given (`ColumnKeys`): `${base}.${index}`.
 */
function assignColumns(node: ZeroNodeJSON, base: string, schema: ZeroSchema) {
  const grid = schema.grid;
  if (!grid) {
    return;
  }
  const rows =
    node.type === grid.table
      ? (node.children ?? [])
      : node.type === grid.row
        ? [node]
        : [];
  for (const row of rows) {
    (row.children ?? []).forEach((cell, c) => {
      if (cell.type === grid.cell && !ColumnKeys.has(cell)) {
        ColumnKeys.set(cell, `${base}.${c}`);
      }
    });
  }
}

/**
 * `toTokens` flattens the given nodes into the token sequence a Zero Tree
 * stores: an open marker per element at its depth, then its characters.
 */
export function toTokens(
  nodes: Array<ZeroNodeJSON>,
  depth: number,
  ticket: TimeTicket,
  schema: ZeroSchema = DefaultZeroSchema,
): Array<ZeroToken> {
  const tokens: Array<ZeroToken> = [];
  nodes.forEach((node, i) => {
    assignColumns(node, `${ticket.toIDString()}.${depth}.${i}`, schema);
    if (node.type === schema.grid?.cell && !ColumnKeys.has(node)) {
      ColumnKeys.set(node, `${ticket.toIDString()}.${depth}.${i}`);
    }
  });
  for (const node of nodes) {
    const isText = isTextType(schema, node.type);
    const writes = flattenProps(node as Record<string, any>, isText);
    const col = ColumnKeys.get(node);
    if (col !== undefined) {
      writes.push(['zt.col', JSON.stringify(col)]);
    }
    tokens.push(ZeroMarker.create(node.type, depth, writes, ticket));
    if (isText) {
      for (const ch of String(node.data ?? '')) {
        tokens.push(ch);
      }
    } else if (node.children) {
      tokens.push(...toTokens(node.children, depth + 1, ticket, schema));
    }
  }
  return tokens;
}

/**
 * `ZeroStyleRange` makes a style write on a text node a range: up to the last
 * character of the node in its author's view, or to the end of the document
 * when `last` is absent (see `ZeroStyleRegion`).
 */
export type ZeroStyleRange = { last?: RGATreeSplitNodeID };

/**
 * `encodeNodeID` encodes a token id for a pending range write's register.
 */
export function encodeNodeID(id: RGATreeSplitNodeID): string {
  const at = id.getCreatedAt();
  return JSON.stringify([
    at.getLamport().toString(),
    at.getDelimiter(),
    at.getActorID(),
    id.getOffset(),
  ]);
}

/**
 * `decodeNodeID` decodes what `encodeNodeID` made.
 */
export function decodeNodeID(value: string): RGATreeSplitNodeID {
  const [lamport, delimiter, actor, offset] = JSON.parse(value);
  return RGATreeSplitNodeID.of(
    TimeTicket.of(BigInt(lamport), delimiter, actor),
    offset,
  );
}

/**
 * `ZeroStyleRegion` is a style write on a text node taken as a range: from
 * the node's marker to the last character of the node in its author's view
 * (`last`). Every marker of the same type between the two in the token order
 * gets the write too (LWW, at the write's ticket), so a node someone split
 * off concurrently keeps the style written on what it was split from.
 *
 * The range ends at that character, not at the token after it: a marker
 * someone put concurrently right after the node's text opens what follows
 * the range (formatting the next characters, an Enter at the node's end),
 * so it does not get the write. The token order between two tokens never
 * changes, so whether a marker falls in the range does not depend on when
 * anything arrives.
 *
 * The markers between the two when the write arrives get it then. A marker
 * that arrives later gets it if it is concurrent with the write (its change
 * does not know the write): whoever knew the write and split a node copied
 * its value, and whoever put a new node there meant it as it is. So the
 * write stays pending until every replica knows it -- it is a GC pair whose
 * removal time is its ticket -- and the marker keeps it in a register
 * (`ZeroRegionPrefix`) until then, for snapshots.
 */
export class ZeroStyleRegion implements GCChild {
  constructor(
    public readonly markerID: RGATreeSplitNodeID,
    public readonly type: string,
    public readonly last: RGATreeSplitNodeID | undefined,
    public readonly writes: Array<[string, ZeroAttrValue]>,
    public readonly ticket: TimeTicket,
  ) {}

  /**
   * `key` returns the register the start marker keeps this write in.
   */
  public get key(): string {
    return ZeroRegionPrefix + this.ticket.toIDString();
  }

  /**
   * `toIDString` returns a string that identifies this write.
   */
  public toIDString(): string {
    return `${this.markerID.toIDString()}#${this.ticket.toIDString()}`;
  }

  /**
   * `getRemovedAt` returns when this write may be dropped: once it is known
   * everywhere, no marker concurrent with it can arrive.
   */
  public getRemovedAt(): TimeTicket {
    return this.ticket;
  }

  /**
   * `getDataSize` returns nothing: the register is part of the marker.
   */
  public getDataSize(): DataSize {
    return { data: 0, meta: 0 };
  }

  /**
   * `encode` returns what the start marker keeps of this write.
   */
  public encode(): string {
    return JSON.stringify({
      l: this.last ? encodeNodeID(this.last) : '',
      w: this.writes,
    });
  }
}

/**
 * `ZeroCancelWrite` is what an undo (or redo) of a style write carries:
 * cancel (`on`) or bring back the write of `write`; `fallback` is what the
 * write's marker held before it (see `ZeroStyleCancels.pick`).
 */
export type ZeroCancelWrite = {
  write: TimeTicket;
  on: boolean;
  fallback: Array<[string, ZeroAttrValue]>;
};

/**
 * `ZeroStyleCancel` is the state of one style write's undo in a tree: set by
 * the undo or redo of `at` (last writer wins).
 *
 * It may be dropped once every replica knows it and no register keeps the
 * write (see `CRDTZeroTree.purgeBarrierAt`): a change made after knowing it
 * copies no cancelled write (see `ZeroTree.split`).
 */
export class ZeroStyleCancel implements GCChild {
  constructor(
    public readonly write: TimeTicket,
    public readonly on: boolean,
    public readonly at: TimeTicket,
    public readonly fallback: Array<[string, ZeroAttrValue]>,
  ) {}

  /**
   * `toIDString` returns a string that identifies this state.
   */
  public toIDString(): string {
    return `${this.write.toIDString()}@${this.at.toIDString()}`;
  }

  /**
   * `getRemovedAt` returns when this state may be dropped (see
   * `CRDTZeroTree.purgeBarrierAt` for the other condition).
   */
  public getRemovedAt(): TimeTicket {
    return this.at;
  }

  /**
   * `getDataSize` returns nothing: it is bookkeeping of the tree.
   */
  public getDataSize(): DataSize {
    return { data: 0, meta: 0 };
  }
}

/**
 * `ZeroStyleCancels` is a tree's table of undone style writes: an undo of a
 * write cancels it wherever registers keep it, without writing anything --
 * a register skips a cancelled write when it picks its value. So undo takes
 * back exactly that write: a value someone wrote after it, or concurrently
 * and lost to it, comes back as it is; a node made without knowing it keeps
 * its value. The registers' kept writes only grow (a top-k by ticket) and the
 * table is LWW per write, so the order changes arrive in does not matter.
 */
export class ZeroStyleCancels {
  private map = new Map<string, ZeroStyleCancel>();

  /**
   * `get` returns the state of the write of `write`.
   */
  public get(write: TimeTicket): ZeroStyleCancel | undefined {
    return this.map.get(write.toIDString());
  }

  /**
   * `set` keeps `cancel` unless a later undo or redo of its write is known.
   * Returns whether it did.
   */
  public set(cancel: ZeroStyleCancel): boolean {
    const id = cancel.write.toIDString();
    const cur = this.map.get(id);
    if (cur && !cancel.at.after(cur.at)) {
      return false;
    }
    this.map.set(id, cancel);
    return true;
  }

  /**
   * `delete` drops `cancel` if it is still the state of its write.
   */
  public delete(cancel: ZeroStyleCancel): boolean {
    const id = cancel.write.toIDString();
    if (this.map.get(id) !== cancel) {
      return false;
    }
    return this.map.delete(id);
  }

  /**
   * `isCurrent` tells whether `cancel` is the state of its write.
   */
  public isCurrent(cancel: ZeroStyleCancel): boolean {
    return this.map.get(cancel.write.toIDString()) === cancel;
  }

  /**
   * `isCancelled` tells whether an undo cancelled the write of `ticket`.
   */
  public isCancelled(ticket: TimeTicket): boolean {
    return !!this.map.get(ticket.toIDString())?.on;
  }

  /**
   * `size` returns how many writes the table holds.
   */
  public get size(): number {
    return this.map.size;
  }

  /**
   * `values` returns the states in the order of their writes' tickets.
   */
  public values(): Array<ZeroStyleCancel> {
    return [...this.map.values()].sort((a, b) => a.write.compare(b.write));
  }

  /**
   * `pick` returns the write a register keeping `history` (newest first,
   * never empty) shows: the newest one not cancelled, or, when all are, what
   * the oldest one's marker held before it. That value predates every write
   * the register keeps, so it carries the initial ticket: a value it meets in
   * a merge (`dealias`) or a copy wins over it.
   */
  public pick(key: string, history: Array<ZeroAttrEntry>): ZeroAttrEntry {
    for (const e of history) {
      if (!this.isCancelled(e.at)) {
        return e;
      }
    }
    const oldest = history[history.length - 1];
    const before = this.get(oldest.at)?.fallback.find(([k]) => k === key);
    return { value: before ? before[1] : null, at: InitialTimeTicket };
  }

  /**
   * `deepcopy` copies the table (the states are immutable).
   */
  public deepcopy(): ZeroStyleCancels {
    const clone = new ZeroStyleCancels();
    this.map.forEach((v, k) => clone.map.set(k, v));
    return clone;
  }
}

/**
 * `CRDTZeroTree` is the CRDT element.
 */
export class CRDTZeroTree extends CRDTElement {
  private rga: RGATreeSplit<ZeroTokens>;
  private schema: ZeroSchema;
  /** the model by top-level block, built on first use (see `ZeroBlockIndex`) */
  private index?: ZeroBlockIndex;
  /** what the changes since `beginChange` did to the model */
  private change?: ZeroChange;
  /** the model's entries at `beginChange`, when checking (tests) */
  private checkBefore?: Array<ViewEntry>;
  /** between `beginChange` and `takeChange` */
  private collecting = false;
  /** the range style writes still pending, by key (see `ZeroStyleRegion`) */
  private pending?: Map<string, ZeroStyleRegion>;
  /** the style writes undone or redone (see `ZeroStyleCancels`) */
  private cancels = new ZeroStyleCancels();
  /**
   * the tokens whose registers keep each write, by the write's ticket, built
   * on first use; it may name tokens that no longer keep it (see `holdersOf`)
   */
  private holders?: Map<string, Map<string, RGATreeSplitNodeID>>;

  constructor(
    rga: RGATreeSplit<ZeroTokens>,
    createdAt: TimeTicket,
    schema: ZeroSchema = DefaultZeroSchema,
  ) {
    super(createdAt);
    this.rga = rga;
    this.rga.setGhostPurge(true);
    this.schema = schema;
  }

  /**
   * `create` creates a tree holding the given content children.
   */
  public static create(
    createdAt: TimeTicket,
    children: Array<ZeroNodeJSON> = [],
    schema: ZeroSchema = cloneZeroSchema(DefaultZeroSchema),
  ): CRDTZeroTree {
    const rga = RGATreeSplit.create<ZeroTokens>();
    const tokens = toTokens(children, 1, createdAt, schema);
    if (tokens.length) {
      const head = rga.getHead();
      rga.insertAfter(
        head,
        RGATreeSplitNode.create(
          RGATreeSplitNodeID.of(createdAt, 0),
          new ZeroTokens(tokens),
        ),
      );
    }
    return new CRDTZeroTree(rga, createdAt, schema);
  }

  /**
   * `getSchema` returns the schema this tree builds its model with.
   */
  public getSchema(): ZeroSchema {
    return this.schema;
  }

  /**
   * `getRGA` returns the RGA the tokens live in.
   */
  public getRGA(): RGATreeSplit<ZeroTokens> {
    return this.rga;
  }

  private ix(): ZeroBlockIndex {
    if (!this.index) {
      this.index = new ZeroBlockIndex(this.rga, this.schema);
    }
    this.flushUndo();
    return this.index;
  }

  /**
   * `liveEntries` returns the live tokens in order, with their identities
   * (O(n): for tests and tools, not for editing).
   */
  public liveEntries(): Array<ViewEntry> {
    return this.ix().wholeEntries().raw;
  }

  /**
   * `viewEntries` returns the live tokens the model is made of: concurrent
   * splits of one boundary folded into the first (see `dealias`). Indexes of
   * the model (`ZNode.start`, `textStart`, ...) and of `indexToPos`,
   * `posToIndex` and `idAt` count these entries. O(n).
   */
  public viewEntries(): Array<ViewEntry> {
    return this.ix().wholeEntries().view;
  }

  /**
   * `liveIndexOf` maps an index of `viewEntries` to an index of `liveEntries`.
   * A position is taken right before the view token at `index` (after any
   * folded markers in front of it); with `end`, right after the view token
   * before `index` (before any folded markers behind it). So a range of view
   * tokens never takes the folded markers around it along.
   */
  private liveIndexOf(index: number, end = false): number {
    const ix = this.ix();
    const length = ix.getViewLength();
    if (end) {
      return index <= 0 ? 0 : ix.viewToRaw(Math.min(index, length) - 1) + 1;
    }
    return index < length
      ? ix.viewToRaw(Math.max(index, 0))
      : ix.getRawLength();
  }

  /**
   * `view` returns the Zero model of the current state. It is kept up to
   * date in place: read what you need before changing the tree.
   */
  public view(): ZNode {
    return this.ix().root;
  }

  /**
   * `toZeroContent` returns the Zero `content` node.
   */
  public toZeroContent(): ZeroNodeJSON {
    return toNodeJSON(this.view(), this.schema);
  }

  /**
   * `indexToPos` converts a live-token index to a position (left-preferring:
   * the position sits right after the live token before the index).
   */
  public indexToPos(index: number, end = false): RGATreeSplitPos {
    return this.rga.indexToPos(this.liveIndexOf(index, end));
  }

  /**
   * `insertPos` returns where an insertion before the view token at `index`
   * goes: before the folded split markers right in front of it (see
   * `dealias`; a marker left out for another reason stays behind it). Placed
   * after one, the insertion would read as typed into the node that split
   * opens, and could make it the one that opens the node. The position
   * travels in the operation, so the server applies it as it is.
   */
  public insertPos(index: number): RGATreeSplitPos {
    const ix = this.ix();
    let raw = this.liveIndexOf(index);
    const floor =
      index > 0 ? ix.viewToRaw(Math.min(index, ix.getViewLength()) - 1) + 1 : 0;
    while (raw > floor) {
      const abs = this.rga.indexToPos(raw).getAbsoluteID();
      const marker = this.findMarker(
        RGATreeSplitNodeID.of(abs.getCreatedAt(), abs.getOffset() - 1),
      );
      if (!marker?.boundary || !ix.isSplitAgain(marker.boundary)) {
        break;
      }
      raw--;
    }
    return this.rga.indexToPos(raw);
  }

  /**
   * `liveIndexToPos` converts an index of `liveEntries` to a position.
   */
  public liveIndexToPos(index: number): RGATreeSplitPos {
    return this.rga.indexToPos(index);
  }

  /**
   * `posToIndex` converts a position to a live-token index.
   */
  public posToIndex(pos: RGATreeSplitPos): number {
    return this.ix().rawToView(this.rga.posToIndex(pos, true));
  }

  /**
   * `liveIndexOfMarker` returns the index in `liveEntries` of the live
   * marker whose string form is `id` (a folded one included), or -1.
   */
  public liveIndexOfMarker(id: string): number {
    return this.ix().rawIndexOfMarker(id);
  }

  /**
   * `viewIDAt` returns the string form of the id of the view token at
   * `index`, or undefined past the end.
   */
  public viewIDAt(index: number): string | undefined {
    if (index < 0 || index >= this.ix().getViewLength()) {
      return;
    }
    return this.idAt(index).toIDString();
  }

  /**
   * `findMarker` returns the marker of the given absolute id, live or not.
   */
  public findMarker(id: RGATreeSplitNodeID): ZeroMarker | undefined {
    const node = this.rga.findNode(id);
    if (!node || !node.getValue()) {
      return;
    }
    const token =
      node.getValue().tokens[id.getOffset() - node.getID().getOffset()];
    return token instanceof ZeroMarker ? token : undefined;
  }

  /**
   * `markerIDOf` returns the absolute id of the live token whose string form
   * is `id` (a folded marker included), or undefined when it is not live.
   */
  public markerIDOf(id: string): RGATreeSplitNodeID | undefined {
    return this.ix().markerID(id);
  }

  /**
   * `idAt` returns the absolute id of the live token at `index`.
   */
  public idAt(index: number): RGATreeSplitNodeID {
    const ix = this.ix();
    const raw = index < ix.getViewLength() ? ix.viewToRaw(index) : index;
    const abs = this.rga.indexToPos(raw + 1).getAbsoluteID();
    return RGATreeSplitNodeID.of(abs.getCreatedAt(), abs.getOffset() - 1);
  }

  /**
   * `edit` deletes the range and inserts the tokens (if any) at its start.
   */
  public edit(
    range: RGATreeSplitPosRange,
    value: ZeroTokens | undefined,
    editedAt: TimeTicket,
    versionVector?: VersionVector,
  ): [Array<GCPair>, DataSize, Array<RestoreSpan<ZeroTokens>>] {
    this.flushUndo();
    const from = this.index ? this.rga.landingIndex(range[0], editedAt) : 0;
    const to = this.index ? this.rga.landingIndex(range[1], editedAt) : 0;
    const plan = this.index?.plan(from, Math.max(from, to), value, editedAt);
    const [, pairs, diff, changes, , removedSpans] = this.rga.edit(
      range,
      editedAt,
      value,
      versionVector,
    );
    if (value && this.pending?.size !== 0) {
      this.applyPending(value, editedAt, versionVector);
    }
    if (value?.length) {
      this.settleInserted(
        this.rga.findNode(RGATreeSplitNodeID.of(editedAt, 0)),
      );
    }
    this.record(plan, changes);
    // An undo of this edit cancels exactly this deletion (see `RestoreSpan`).
    return [
      pairs,
      diff,
      removedSpans.map((span) => ({ ...span, removedBy: editedAt })),
    ];
  }

  /**
   * `restore` revives the given spans under their original identities.
   */
  public restore(
    spans: Array<RestoreSpan<ZeroTokens>>,
    executedAt: TimeTicket,
    fallbackAnchor?: RGATreeSplitPos,
  ) {
    const result = this.rga.restore(spans, executedAt, fallbackAnchor);
    // a piece made again from its span: the span's copy of the markers
    // predates the undos since
    for (const n of result[1]) {
      this.settleInserted(n);
    }
    if (this.index) {
      const [untombstoned, recreated] = result;
      const undo = this.pendingUndo();
      for (const n of [...untombstoned, ...recreated]) {
        // removed again by this same undo first: back as it was
        if (!undo.removed.delete(n)) {
          undo.revived.add(n);
        }
      }
    }
    return result;
  }

  /**
   * `retombstone` removes the given spans again under their identities.
   */
  public retombstone(
    spans: Array<RestoreSpan<ZeroTokens>>,
    executedAt: TimeTicket,
    versionVector?: VersionVector,
  ) {
    const result = this.rga.retombstone(spans, executedAt, versionVector);
    if (this.index) {
      const undo = this.pendingUndo();
      for (const { child } of result[0]) {
        if (
          child instanceof RGATreeSplitNode &&
          child.isRemoved() &&
          child.getRemovedAt()?.equals(executedAt) &&
          !undo.revived.delete(child as RGATreeSplitNode<ZeroTokens>)
        ) {
          undo.removed.add(child as RGATreeSplitNode<ZeroTokens>);
        }
      }
    }
    return result;
  }

  /** the pieces the undo being applied revived and removed again */
  private undo?: {
    revived: Set<RGATreeSplitNode<ZeroTokens>>;
    removed: Set<RGATreeSplitNode<ZeroTokens>>;
  };

  private pendingUndo(): NonNullable<CRDTZeroTree['undo']> {
    if (!this.undo) {
      this.undo = { revived: new Set(), removed: new Set() };
    }
    return this.undo;
  }

  /**
   * `flushUndo` brings the index up to date with the undo being applied:
   * both of its halves (`retombstone`, `restore`) at once.
   */
  private flushUndo(): void {
    const undo = this.undo;
    if (!undo || !this.index) {
      return;
    }
    this.undo = undefined;
    this.keep(this.index.commitUndo([...undo.revived], [...undo.removed]));
  }

  /**
   * `setAttrs` writes attributes on the marker of the given id. Returns, for
   * the reverse operation, the previous values of the reserved keys that
   * applied (written back on undo) and the cancel of this write (or, for an
   * undo or redo, of the write it undid), and the GC pairs of a range write
   * and of a cancel. With `range` the write is a range (see
   * `ZeroStyleRegion`); `cancel` cancels or brings back an earlier write (see
   * `ZeroStyleCancels`).
   */
  public setAttrs(
    markerID: RGATreeSplitNodeID,
    writes: Array<[string, ZeroAttrValue]>,
    editedAt: TimeTicket,
    range?: ZeroStyleRange,
    cancel?: ZeroCancelWrite,
  ): [
    Array<[string, ZeroAttrValue]>,
    Array<GCPair>,
    ZeroCancelWrite | undefined,
  ] {
    this.flushUndo();
    const marker = this.findMarker(markerID);
    const prev: Array<[string, ZeroAttrValue]> = [];
    const pairs: Array<GCPair> = [];
    // the live tokens the change may touch, read before it
    let lo = Infinity;
    let hi = -Infinity;
    const touch = (from: number, to: number) => {
      lo = Math.min(lo, from);
      hi = Math.max(hi, to);
    };
    const region =
      marker && range
        ? new ZeroStyleRegion(
            markerID,
            marker.type,
            range.last,
            writes,
            editedAt,
          )
        : undefined;
    if (this.index && marker && writes.length) {
      if (region) {
        const from = this.rawPositionOf(markerID);
        const to = region.last
          ? Math.min(this.rga.length, this.rawPositionOf(region.last) + 1)
          : this.rga.length;
        if (to > from) {
          touch(from, to);
        }
      } else {
        const at = this.index.rawIndexOfMarker(markerID.toIDString());
        if (at >= 0) {
          touch(at, at + 1);
        }
      }
    }
    if (this.index && cancel) {
      for (const id of this.holdersOf(cancel.write)) {
        const at = this.rawPositionOf(id);
        touch(at, Math.min(this.rga.length, at + 1));
      }
    }
    const plan = this.index && hi > lo ? this.index.plan(lo, hi) : undefined;

    let reverse: ZeroCancelWrite | undefined;
    if (marker && writes.length) {
      const fallback: Array<[string, ZeroAttrValue]> = [];
      for (const [k, v] of writes) {
        const [old, applied] = marker.set(k, v, editedAt, this.cancels);
        if (!applied) {
          continue;
        }
        if (keepsHistory(k)) {
          fallback.push([k, old === undefined ? null : old]);
        } else {
          prev.push([k, old === undefined ? null : old]);
        }
      }
      this.track(marker, markerID);
      if (fallback.length) {
        reverse = { write: editedAt, on: true, fallback };
      }
      if (region) {
        marker.attrs.set(region.key, {
          value: region.encode(),
          updatedAt: editedAt,
        });
        this.pendingRegions().set(region.key, region);
        this.applyRegion(region);
        pairs.push({
          parent: this,
          child: region,
          gcOnlySize: region.getDataSize(),
        });
      }
    }
    if (cancel) {
      const state = new ZeroStyleCancel(
        cancel.write,
        cancel.on,
        editedAt,
        cancel.fallback,
      );
      if (this.cancels.set(state)) {
        pairs.push({
          parent: this,
          child: state,
          gcOnlySize: state.getDataSize(),
        });
        for (const id of this.holdersOf(cancel.write)) {
          this.markerAt(id)!.repick(this.cancels);
        }
      }
      reverse = { ...cancel, on: !cancel.on };
    }
    if (plan) {
      this.record(plan);
    }
    return [prev, pairs, reverse];
  }

  /**
   * `isCancelled` tells whether an undo cancelled the style write of
   * `ticket` (see `ZeroStyleCancels`).
   */
  public isCancelled(ticket: TimeTicket): boolean {
    return this.cancels.isCancelled(ticket);
  }

  /**
   * `getStyleCancels` returns the undone style writes, in the order of their
   * tickets (see `ZeroStyleCancels`).
   */
  public getStyleCancels(): Array<ZeroStyleCancel> {
    return this.cancels.values();
  }

  /**
   * `loadStyleCancel` keeps a state read from a snapshot.
   */
  public loadStyleCancel(cancel: ZeroStyleCancel): void {
    this.cancels.set(cancel);
  }

  /**
   * `markerAt` returns the marker token of `id`, live or not, or undefined
   * when no marker has that id (a purged one).
   */
  private markerAt(id: RGATreeSplitNodeID): ZeroMarker | undefined {
    const node = this.rga.findNode(id);
    if (!node || !node.getCreatedAt().equals(id.getCreatedAt())) {
      return;
    }
    const token =
      node.getValue()?.tokens[id.getOffset() - node.getID().getOffset()];
    return token instanceof ZeroMarker ? token : undefined;
  }

  /**
   * `holdersOf` returns the ids of the tokens whose registers keep the write
   * of `ticket`, live or not, dropping the ones that no longer do.
   */
  private holdersOf(ticket: TimeTicket): Array<RGATreeSplitNodeID> {
    const holders = this.holderIndex();
    const key = ticket.toIDString();
    const ids = holders.get(key);
    if (!ids) {
      return [];
    }
    const out: Array<RGATreeSplitNodeID> = [];
    for (const [k, id] of ids) {
      if (this.markerAt(id)?.holds(ticket)) {
        out.push(id);
      } else {
        ids.delete(k);
      }
    }
    if (!ids.size) {
      holders.delete(key);
    }
    return out;
  }

  private holderIndex(): Map<string, Map<string, RGATreeSplitNodeID>> {
    if (this.holders) {
      return this.holders;
    }
    this.holders = new Map();
    for (const node of this.rga) {
      node.getValue()?.tokens.forEach((t, i) => {
        if (typeof t !== 'string') {
          this.track(
            t,
            RGATreeSplitNodeID.of(
              node.getID().getCreatedAt(),
              node.getID().getOffset() + i,
            ),
          );
        }
      });
    }
    return this.holders;
  }

  /**
   * `track` notes the writes the registers of `marker` (token `id`) keep in
   * the holder index, once it is built.
   */
  private track(marker: ZeroMarker, id: RGATreeSplitNodeID): void {
    if (!this.holders) {
      return;
    }
    for (const attr of marker.attrs.values()) {
      for (const e of attr.history ?? []) {
        const key = e.at.toIDString();
        let ids = this.holders.get(key);
        if (!ids) {
          ids = new Map();
          this.holders.set(key, ids);
        }
        ids.set(id.toIDString(), id);
      }
    }
  }

  /**
   * `settleInserted` makes the markers of an inserted run take their values
   * under the cancels (a copy made without knowing an undo keeps the write it
   * cancelled) and notes them in the holder index.
   */
  private settleInserted(node: RGATreeSplitNode<ZeroTokens>): void {
    node.getValue()?.tokens.forEach((t, i) => {
      if (typeof t === 'string') {
        return;
      }
      if (this.cancels.size) {
        t.repick(this.cancels);
      }
      this.track(
        t,
        RGATreeSplitNodeID.of(
          node.getID().getCreatedAt(),
          node.getID().getOffset() + i,
        ),
      );
    });
  }

  /**
   * `rawPositionOf` returns where the token of `id` sits among the live
   * tokens: its index if it is live, the index of the live token after it
   * otherwise.
   */
  private rawPositionOf(id: RGATreeSplitNodeID): number {
    const node = this.rga.findNode(id);
    const at = this.rga.getTreeByIndex().indexOf(node);
    return node.isRemoved()
      ? at
      : at + id.getOffset() - node.getID().getOffset();
  }

  /**
   * `pendingRegions` returns the range writes still pending, read from the
   * markers that keep them the first time (a snapshot, a copy).
   */
  private pendingRegions(): Map<string, ZeroStyleRegion> {
    if (this.pending) {
      return this.pending;
    }
    this.pending = new Map();
    for (const node of this.rga) {
      const value = node.getValue();
      if (!value) {
        continue;
      }
      value.tokens.forEach((t, i) => {
        if (typeof t === 'string') {
          return;
        }
        for (const [key, reg] of t.attrs) {
          if (!key.startsWith(ZeroRegionPrefix) || reg.value === null) {
            continue;
          }
          const { l, w } = JSON.parse(reg.value);
          this.pending!.set(
            key,
            new ZeroStyleRegion(
              RGATreeSplitNodeID.of(
                node.getID().getCreatedAt(),
                node.getID().getOffset() + i,
              ),
              t.type,
              l ? decodeNodeID(l) : undefined,
              w,
              reg.updatedAt,
            ),
          );
        }
      });
    }
    return this.pending;
  }

  /**
   * `applyRegion` writes a range write on the markers of its type between
   * its marker and `last`, removed ones included (an undo may bring them
   * back), or only on `target` when it is given. Returns whether it reached
   * `target`.
   */
  private applyRegion(region: ZeroStyleRegion, target?: ZeroMarker): boolean {
    const until = region.last;
    let node: RGATreeSplitNode<ZeroTokens> | undefined = this.rga.findNode(
      region.markerID,
    );
    let i = region.markerID.getOffset() - node.getID().getOffset() + 1;
    while (node) {
      const tokens = node.getValue()?.tokens ?? [];
      const created = node.getID().getCreatedAt();
      const base = node.getID().getOffset();
      const last = until && created.equals(until.getCreatedAt());
      for (; i < tokens.length; i++) {
        if (last && base + i === until!.getOffset()) {
          return false;
        }
        const t = tokens[i];
        if (typeof t === 'string' || t.type !== region.type) {
          continue;
        }
        if (!target || t === target) {
          for (const [k, v] of region.writes) {
            t.set(k, v, region.ticket, this.cancels, true);
          }
          this.track(t, RGATreeSplitNodeID.of(created, base + i));
          if (target) {
            return true;
          }
        }
      }
      node = node.getNext();
      i = 0;
    }
    return false;
  }

  /**
   * `applyPending` gives the markers of a run inserted by a change that did
   * not know a pending range write the write, when they fall in its range.
   */
  private applyPending(
    value: ZeroTokens,
    editedAt: TimeTicket,
    versionVector?: VersionVector,
  ): void {
    if (!versionVector || !versionVector.size()) {
      return;
    }
    // in ticket order, as in Go: the writes do not depend on it (LWW), but
    // the order a marker first gets its keys in is part of its encoding
    const regions = [...this.pendingRegions().values()]
      .filter((r) => !versionVector.afterOrEqual(r.ticket))
      .sort((a, b) => a.ticket.compare(b.ticket));
    if (!regions.length) {
      return;
    }
    const node = this.rga.findNode(RGATreeSplitNodeID.of(editedAt, 0));
    for (const t of node.getValue()?.tokens ?? []) {
      if (typeof t === 'string') {
        continue;
      }
      for (const region of regions) {
        if (region.type === t.type) {
          this.applyRegion(region, t);
        }
      }
    }
  }

  /**
   * `purge` drops a range write once every replica knows it, and the state of
   * an undone write once every replica knows it and nothing keeps the write
   * (see `purgeBarrierAt`).
   */
  public purge(child: GCChild): void {
    if (child instanceof ZeroStyleCancel) {
      this.cancels.delete(child);
      return;
    }
    if (!(child instanceof ZeroStyleRegion)) {
      return;
    }
    this.pendingRegions().delete(child.key);
    this.findMarker(child.markerID)?.attrs.delete(child.key);
  }

  /**
   * `purgeBarrierAt` holds back the state of an undone write while a register
   * keeps the write or its range write is pending: either can still pick it.
   */
  public purgeBarrierAt(child: GCChild): TimeTicket | undefined {
    if (!(child instanceof ZeroStyleCancel) || !this.cancels.isCurrent(child)) {
      return;
    }
    if (
      this.pendingRegions().has(ZeroRegionPrefix + child.write.toIDString()) ||
      this.holdersOf(child.write).length
    ) {
      return MaxTimeTicket;
    }
  }

  /**
   * `record` brings the index up to date after a change of the tokens and
   * keeps what the change did for `takeChange`.
   */
  private record(
    plan: ZeroPlan | undefined,
    changes?: Array<ValueChange<ZeroTokens>>,
  ): void {
    if (!this.index || !plan) {
      return;
    }
    this.keep(this.index.commit(plan, changes));
  }

  /**
   * `keep` adds what one change did to the model to what the operation being
   * collected did so far (see `takeChange`).
   */
  private keep(change: ZeroChange): void {
    if (!this.collecting) {
      return;
    }
    if (!this.change) {
      this.change = change;
      return;
    }
    // two changes in one operation (an undo re-removing and restoring):
    // both whole, from the first one's before to the last one's after
    if (!this.change.whole || !change.whole) {
      IndexStats.escapes++;
      note('record:mixed');
    }
    this.change = {
      before: this.change.before,
      after: change.whole ? change.after : this.ix().wholeEntries().view,
      offset: 0,
      whole: true,
    };
  }

  /**
   * `beginChange` starts collecting what the following changes do to the
   * model (see `takeChange`).
   */
  public beginChange(): void {
    this.ix();
    this.change = undefined;
    this.collecting = true;
    this.checkBefore = CompileStats.verifyWindow
      ? this.ix().wholeEntries().view
      : undefined;
  }

  /**
   * `takeChange` returns what the changes since `beginChange` did to the
   * model. Checking (tests), it also compares the index with the model built
   * from scratch and gives the whole document before and after.
   */
  public takeChange():
    | (ZeroChange & {
        wholeBefore?: Array<ViewEntry>;
        wholeAfter?: Array<ViewEntry>;
      })
    | undefined {
    this.flushUndo();
    const change = this.change;
    this.change = undefined;
    this.collecting = false;
    if (!this.checkBefore) {
      return change;
    }
    const before = this.checkBefore;
    this.checkBefore = undefined;
    const after = dealias(this.rawEntriesForCheck(), this.schema).entries;
    const fresh = buildView(after, this.schema);
    const shape = (n: ZNode): unknown => ({
      type: n.type,
      depth: n.depth,
      level: n.level,
      attrs: n.attrs,
      markerID: n.markerID,
      virtual: n.virtual,
      text: n.text,
      start: n.start,
      end: n.end,
      textStart: n.textStart,
      group: n.group,
      col: n.col,
      children: n.children.map(shape),
    });
    const a = JSON.stringify(shape(this.ix().root));
    const b = JSON.stringify(shape(fresh));
    if (a !== b) {
      CompileStats.windowMismatches.push({ windowed: a, whole: b });
    }
    return change && { ...change, wholeBefore: before, wholeAfter: after };
  }

  private rawEntriesForCheck(): Array<ViewEntry> {
    // straight from the RGA, not through the index
    const entries: Array<ViewEntry> = [];
    for (const node of this.rga) {
      const value = node.getValue();
      if (node.isRemoved() || !value) {
        continue;
      }
      const key = node.getCreatedAt().toIDString();
      const base = node.getID().getOffset();
      value.tokens.forEach((t, i) =>
        entries.push(tokenEntry(t, `${key}:${base + i}`, value.scope)),
      );
    }
    return entries;
  }

  /**
   * `normalizePos` returns the given position normalized to the node chain.
   */
  public normalizePos(pos: RGATreeSplitPos): RGATreeSplitPos {
    return this.rga.normalizePos(pos);
  }

  /**
   * `refinePos` moves the given position past tombstones.
   */
  public refinePos(pos: RGATreeSplitPos): RGATreeSplitPos {
    return this.rga.refinePos(pos);
  }

  /**
   * `getDataSize` returns the data size of this element.
   */
  public getDataSize(): DataSize {
    const size = { data: 0, meta: 0 };
    for (const node of this.rga) {
      if (node.isRemoved()) {
        continue;
      }
      const s = node.getDataSize();
      size.data += s.data;
      size.meta += s.meta;
    }
    return { data: size.data, meta: size.meta + this.getMetaUsage() };
  }

  /**
   * `getGCPairs` returns the GC pairs of removed nodes and attributes.
   */
  public getGCPairs(): Array<GCPair> {
    const pairs: Array<GCPair> = [];
    for (const node of this.rga) {
      if (node.getRemovedAt()) {
        pairs.push({
          parent: this.rga,
          child: node,
          gcOnlySize: node.getDataSize(),
        });
      }
    }
    for (const region of this.pendingRegions().values()) {
      pairs.push({
        parent: this,
        child: region,
        gcOnlySize: region.getDataSize(),
      });
    }
    for (const cancel of this.cancels.values()) {
      pairs.push({
        parent: this,
        child: cancel,
        gcOnlySize: cancel.getDataSize(),
      });
    }
    return pairs;
  }

  /**
   * `toJSON` returns the JSON encoding of this tree.
   */
  public toJSON(): string {
    return stableStringify(this.toZeroContent());
  }

  /**
   * `toSortedJSON` returns the JSON encoding with sorted keys.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `toJSForTest` returns the element for Devtools.
   */
  public toJSForTest(): Devtools.JSONElement {
    // Shown by the Yorkie devtools like a Tree: elements with attributes,
    // the text of an inline-text as a text child.
    const toTreeNode = (node: ZeroNodeJSON): Record<string, unknown> => {
      const attributes: Record<string, unknown> = {};
      for (const group of ['style', 'attribute'] as const) {
        for (const [k, v] of Object.entries(node[group] ?? {})) {
          attributes[`${group}.${k}`] = v;
        }
      }
      if (!isTextType(this.schema, node.type) && node.data !== undefined) {
        attributes.data = node.data;
      }
      return {
        type: node.type,
        ...(Object.keys(attributes).length ? { attributes } : {}),
        children: isTextType(this.schema, node.type)
          ? [{ type: 'text', value: String(node.data ?? '') }]
          : (node.children ?? []).map(toTreeNode),
      };
    };
    return {
      createdAt: this.getCreatedAt().toTestString(),
      value: toTreeNode(this.toZeroContent()),
      type: 'YORKIE_TREE',
    } as unknown as Devtools.JSONElement;
  }

  /**
   * `toTestString` shows every node, tombstones included.
   */
  public toTestString(): string {
    return this.rga.toTestString();
  }

  /**
   * `deepcopy` returns a deep copy of this element.
   */
  public deepcopy(): CRDTZeroTree {
    const clone = new CRDTZeroTree(
      this.rga.deepcopy(),
      this.getCreatedAt(),
      this.schema,
    );
    clone.setRemovedAt(this.getRemovedAt());
    clone.setMovedAt(this.getMovedAt());
    clone.cancels = this.cancels.deepcopy();
    return clone;
  }
}
