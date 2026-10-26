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
 * PROTOTYPE — `ZeroBlockIndex` keeps the model of a `CRDTZeroTree` by
 * top-level node ("block") so that an edit rebuilds only the blocks around
 * it instead of the whole document.
 *
 * The model is a pure function of the live tokens (`dealias`, `buildView`).
 * That function is local to top-level nodes: a depth-1 marker closes
 * everything open before it, in `dealias` and in `buildView` alike. So the
 * live tokens are cut into blocks at the depth-1 markers that open a
 * top-level node, and a run of whole blocks builds the same way on its own
 * as inside the document. Two things reach across blocks:
 *
 * - concurrent splits of one boundary (same `boundary`, different insertion
 *   tickets) fold into the first one, wherever it is (`dealias`);
 * - a token inserted in a table, row or cell lives only while that marker is
 *   shown (`scope`), and the marker may end up in another block.
 *
 * A block holding either is a hazard: an edit touching it, or creating one,
 * rebuilds the whole document as before. Everything else rebuilds the blocks
 * from the one before the edit to the one after it.
 *
 * Positions: a block knows where it starts among the live tokens (raw
 * index, what `RGATreeSplit` indexes in O(log n)) and among the model's
 * tokens (view index, what `ZNode.start` counts). The blocks after an edit
 * move by its length; their nodes are shifted in place (a few per paragraph,
 * not one per character).
 */

import type { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import {
  RGATreeSplit,
  RGATreeSplitNode,
  RGATreeSplitNodeID,
  ValueChange,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import type { ZeroAttrValue } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import {
  ViewEntry,
  ZNode,
  ZeroRegionPrefix,
  ZeroSchema,
  buildView,
  dealias,
  padded,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type {
  ZeroToken,
  ZeroTokens,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree';

/**
 * `ZeroBlock` is one top-level region of the live tokens.
 */
type ZeroBlock = {
  rawStart: number;
  rawLength: number;
  viewStart: number;
  viewLength: number;
  /** view-local index → raw-local index, when tokens are left out */
  live?: Array<number>;
  /** the top-level nodes the block builds (usually one) */
  nodes: Array<ZNode>;
  /** the live markers in the block: id string and id */
  markers: Array<[string, RGATreeSplitNodeID]>;
  /** [boundary key, insertion ticket, marker id] of its split markers */
  keys: Array<[string, string, string]>;
  /** scope markers its tokens name that are not in it */
  scopes: Array<string>;
  /** how many of its tokens name each scope marker (see `planRows`) */
  scopeRefs: Map<string, number>;
  /** a live scope crosses its edge (see the file comment) */
  crossing: boolean;
};

/**
 * `ZeroChange` is what one change did to the model: the view entries of a
 * run of whole top-level nodes before and after it, `offset` top-level nodes
 * in front of them (0 and the whole document when it was rebuilt).
 */
export type ZeroChange = {
  before: Array<ViewEntry>;
  after: Array<ViewEntry>;
  offset: number;
  /** the whole document was rebuilt */
  whole: boolean;
  /**
   * set when the change is some rows of the table at `offset`: `before` and
   * `after` are the table's marker and those rows, the first being row
   * `rows`; `widen` gives the whole table instead
   */
  rows?: number;
  widen?: () => { before: Array<ViewEntry>; after: Array<ViewEntry> };
};

/**
 * `ZeroPlan` is a change being made: what the index knew before it.
 */
export type ZeroPlan =
  | {
      kind: 'blocks';
      first: number;
      last: number;
      rawStart: number;
      rawEnd: number;
      raw: Array<ViewEntry>;
      before: Array<ViewEntry>;
    }
  | { kind: 'whole'; raw: Array<ViewEntry>; before: Array<ViewEntry> }
  | {
      kind: 'rows';
      first: number;
      table: ZNode;
      r0: number;
      r1: number;
      rowStart: number;
      rowEnd: number;
      head: ViewEntry;
      raw: Array<ViewEntry>;
      before: Array<ViewEntry>;
    };

/**
 * `IndexStats` counts how changes were applied (tests read it).
 */
export const IndexStats = {
  blocks: 0,
  rows: 0,
  wholes: 0,
  /** a change reached outside its blocks (never expected) */
  escapes: 0,
  /** why changes were rebuilt whole or escaped */
  reasons: {} as Record<string, number>,
};

/**
 * `note` counts a reason (tests read `IndexStats.reasons`).
 */
export function note(reason: string): void {
  IndexStats.reasons[reason] = (IndexStats.reasons[reason] ?? 0) + 1;
}

/**
 * `tokenEntry` makes the view entry of one token. Attributes are copied.
 */
export function tokenEntry(
  t: ZeroToken,
  id: string,
  scope: string | undefined,
): ViewEntry {
  if (typeof t === 'string') {
    return { id, char: t, scope };
  }
  const registers: Record<string, { value: ZeroAttrValue; at: TimeTicket }> =
    {};
  const attrs: Record<string, string> = {};
  t.attrs.forEach((attr, key) => {
    // a pending range write is bookkeeping, not part of the node
    if (key.startsWith(ZeroRegionPrefix)) {
      return;
    }
    registers[key] = { value: attr.value, at: attr.updatedAt };
    if (attr.value !== null) {
      attrs[key] = attr.value;
    }
  });
  return {
    id,
    marker: {
      type: t.type,
      depth: t.depth,
      attrs,
      boundary: t.boundary,
      registers,
    },
    scope,
  };
}

/**
 * `opensBlock` tells whether the raw entry at `i` opens a block: a depth-1
 * marker that does not merge into the marker before it (see `buildView`).
 */
function opensBlock(raw: Array<ViewEntry>, i: number): boolean {
  const m = raw[i]?.marker;
  if (!m || m.depth !== 1) {
    return false;
  }
  const prev = raw[i - 1]?.marker;
  return !(m.boundary && prev && prev.boundary === m.boundary);
}

/**
 * `ticketOf` returns the insertion ticket part of a token id.
 */
function ticketOf(id: string): string {
  return id.slice(0, id.lastIndexOf(':'));
}

/**
 * `markerIDs` remembers the id of each marker entry `rawEntries` made.
 */
const markerNodeIDs = new WeakMap<ViewEntry, RGATreeSplitNodeID>();

/**
 * `shiftNode` moves a node and its descendants by `delta` view tokens.
 */
function shiftNode(node: ZNode, delta: number): void {
  node.start += delta;
  node.end += delta;
  node.textStart += delta;
  for (const child of node.children) {
    shiftNode(child, delta);
  }
}

/**
 * `ZeroBlockIndex` is the block-structured model of a `CRDTZeroTree`.
 */
export class ZeroBlockIndex {
  private rga: RGATreeSplit<ZeroTokens>;
  private schema: ZeroSchema;
  private blocks: Array<ZeroBlock> = [];
  private rawLength = 0;
  private viewLength = 0;
  private markerIDs = new Map<string, RGATreeSplitNodeID>();
  private markerBlock = new Map<string, ZeroBlock>();
  private keyTickets = new Map<string, Map<string, number>>();
  public root: ZNode;

  constructor(rga: RGATreeSplit<ZeroTokens>, schema: ZeroSchema) {
    this.rga = rga;
    this.schema = schema;
    this.root = buildView([], schema);
    this.rebuildWhole();
  }

  // --- reading the tokens --------------------------------------------------

  /**
   * `rawEntries` returns the live tokens in [from, to) as view entries.
   */
  public rawEntries(from: number, to: number): Array<ViewEntry> {
    const out: Array<ViewEntry> = [];
    if (to <= from) {
      return out;
    }
    const [found, offset] = this.rga.getTreeByIndex().findForText(from);
    let node = found as RGATreeSplitNode<ZeroTokens> | undefined;
    let i = offset;
    let need = to - from;
    while (node && need > 0) {
      const value = node.getValue();
      if (!node.isRemoved() && value) {
        const key = node.getCreatedAt().toIDString();
        const base = node.getID().getOffset();
        const tokens = value.tokens;
        for (; i < tokens.length && need > 0; i++, need--) {
          const entry = tokenEntry(
            tokens[i],
            `${key}:${base + i}`,
            value.scope,
          );
          if (entry.marker) {
            markerNodeIDs.set(
              entry,
              RGATreeSplitNodeID.of(node.getCreatedAt(), base + i),
            );
          }
          out.push(entry);
        }
      }
      node = node.getNext();
      i = 0;
    }
    return out;
  }

  /**
   * `wholeEntries` returns every live token and the model's entries.
   */
  public wholeEntries(): {
    raw: Array<ViewEntry>;
    view: Array<ViewEntry>;
    live: Array<number>;
  } {
    const raw = this.rawEntries(0, this.rga.length);
    const { entries, live } = dealias(raw, this.schema);
    return { raw, view: entries, live };
  }

  // --- positions -----------------------------------------------------------

  /**
   * `getViewLength` returns the number of view entries.
   */
  public getViewLength(): number {
    return this.viewLength;
  }

  /**
   * `getRawLength` returns the number of live tokens.
   */
  public getRawLength(): number {
    return this.rawLength;
  }

  private blockAt(index: number, key: 'rawStart' | 'viewStart'): number {
    let lo = 0;
    let hi = this.blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.blocks[mid][key] <= index) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /**
   * `viewToRaw` returns the live index of the view entry at `index`.
   */
  public viewToRaw(index: number): number {
    const block = this.blocks[this.blockAt(index, 'viewStart')];
    const local = index - block.viewStart;
    return block.rawStart + (block.live ? block.live[local] : local);
  }

  /**
   * `rawToView` returns the first view index whose live index is not
   * before `raw`.
   */
  public rawToView(raw: number): number {
    if (raw >= this.rawLength) {
      return this.viewLength;
    }
    const block = this.blocks[this.blockAt(raw, 'rawStart')];
    const local = raw - block.rawStart;
    if (!block.live) {
      return block.viewStart + Math.min(local, block.viewLength);
    }
    let lo = 0;
    let hi = block.live.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (block.live[mid] < local) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return block.viewStart + lo;
  }

  /**
   * `rawIndexOfMarker` returns the live index of the marker of the given id,
   * or -1 when it is not live.
   */
  public rawIndexOfMarker(id: string): number {
    const nodeID = this.markerIDs.get(id);
    if (!nodeID) {
      return -1;
    }
    const node = this.rga.findNode(nodeID);
    if (!node || node.isRemoved()) {
      return -1;
    }
    return (
      this.rga.getTreeByIndex().indexOf(node) +
      nodeID.getOffset() -
      node.getID().getOffset()
    );
  }

  /**
   * `markerID` returns the id of a live marker.
   */
  public markerID(id: string): RGATreeSplitNodeID | undefined {
    return this.markerIDs.get(id);
  }

  // --- changes -------------------------------------------------------------

  /**
   * `plan` prepares a change of the live tokens in [from, to) (raw, as
   * `landingIndex` finds them) that inserts `value`, if any.
   */
  public plan(
    from: number,
    to: number,
    value?: ZeroTokens,
    ticket?: TimeTicket,
  ): ZeroPlan {
    const whole = () => this.planWhole();
    if (
      this.schema.single?.[this.schema.rootType] ||
      !this.rawLength ||
      !this.blocks.length
    ) {
      note('plan:empty');
      return whole();
    }
    const first = from > 0 ? this.blockAt(from - 1, 'rawStart') : 0;
    const last = this.blockAt(Math.min(to, this.rawLength - 1), 'rawStart');
    for (let b = first; b <= last; b++) {
      if (this.isHazard(this.blocks[b])) {
        note(this.blocks[b].crossing ? 'plan:crossing' : 'plan:key');
        return whole();
      }
    }
    if (value) {
      const id = ticket?.toIDString() ?? '';
      for (const t of value.tokens) {
        if (typeof t !== 'string' && t.boundary) {
          const tickets = this.keyTickets.get(t.boundary);
          if (tickets && (tickets.size > 1 || !tickets.has(id))) {
            note('plan:new-key');
            return whole();
          }
        }
      }
      if (value.scope) {
        const provider = this.markerBlock.get(value.scope);
        if (provider) {
          const at = this.blockAt(provider.rawStart, 'rawStart');
          if (at < first || at > last) {
            note('plan:scope');
            return whole();
          }
        }
      }
    }
    const rows = first === last && this.planRows(first, from, to);
    if (rows) {
      return rows;
    }
    const rawStart = this.blocks[first].rawStart;
    const end = this.blocks[last];
    const rawEnd = end.rawStart + end.rawLength;
    const raw = this.rawEntries(rawStart, rawEnd);
    return {
      kind: 'blocks',
      first,
      last,
      rawStart,
      rawEnd,
      raw,
      before: dealias(raw, this.schema).entries,
    };
  }

  /**
   * `planWhole` prepares a change rebuilt over the whole document.
   */
  public planWhole(): ZeroPlan {
    const { raw, view } = this.wholeEntries();
    return { kind: 'whole', raw, before: view };
  }

  /**
   * `planRows` prepares a change inside the rows of a table block: from the
   * row holding the token before it to the row holding the token after it.
   */
  private planRows(
    first: number,
    from: number,
    to: number,
  ): ZeroPlan | undefined {
    const block = this.blocks[first];
    const table = block.nodes[0];
    const grid = this.schema.grid;
    if (
      !grid ||
      block.live ||
      block.nodes.length !== 1 ||
      table.type !== grid.table ||
      table.virtual ||
      !table.markerID ||
      table.start !== block.viewStart ||
      !table.children.length ||
      padded(table, this.schema)
    ) {
      return;
    }
    // no token is left out of the block: raw and view count alike
    const raw = (view: number) => block.rawStart + view - block.viewStart;
    const rows = table.children;
    if (from - 1 < raw(rows[0].start)) {
      return;
    }
    const rowAt = (r: number) => {
      let k = 0;
      while (k + 1 < rows.length && raw(rows[k + 1].start) <= r) {
        k++;
      }
      return k;
    };
    const blockEnd = block.rawStart + block.rawLength;
    const r0 = rowAt(from - 1);
    const r1 = rowAt(Math.min(to, blockEnd - 1));
    const rowStart = raw(rows[r0].start);
    const rowEnd = r1 + 1 < rows.length ? raw(rows[r1 + 1].start) : blockEnd;
    const head = this.rawEntries(block.rawStart, block.rawStart + 1)[0];
    const entries = this.rawEntries(rowStart, rowEnd);
    // a marker of these rows another row's tokens hang on (a run typed into
    // a cell and moved with a re-inserted paragraph): the other row changes
    // with it, so the whole table is rebuilt
    const inWindow = new Map<string, number>();
    for (const e of entries) {
      if (e.scope) {
        inWindow.set(e.scope, (inWindow.get(e.scope) ?? 0) + 1);
      }
    }
    for (const e of entries) {
      if (
        e.marker &&
        (block.scopeRefs.get(e.id) ?? 0) > (inWindow.get(e.id) ?? 0)
      ) {
        note('rows:provider');
        return;
      }
    }
    const before = dealias([head, ...entries], this.schema);
    // the rows must build behind the table marker alone: nothing they hold
    // hangs on a marker of the other rows
    if (before.live.length !== entries.length + 1) {
      note('rows:plan-hidden');
      return;
    }
    return {
      kind: 'rows',
      first,
      table,
      r0,
      r1,
      rowStart,
      rowEnd,
      head,
      raw: entries,
      before: before.entries,
    };
  }

  /**
   * `commitRows` brings the rows of a table block up to date, or the whole
   * block when the change went beyond them.
   */
  private commitRows(
    plan: Extract<ZeroPlan, { kind: 'rows' }>,
    changes?: Array<ValueChange<ZeroTokens>>,
  ): ZeroChange {
    const total = this.rga.length;
    const delta = total - this.rawLength;
    const block = this.blocks[plan.first];
    const table = plan.table;
    const { rowStart, rowEnd } = plan;
    const blockEnd = block.rawStart + block.rawLength;
    // the whole block, as `commit` takes it
    const asBlock = (): ZeroPlan => {
      const raw = [
        ...this.rawEntries(block.rawStart, rowStart),
        ...plan.raw,
        ...this.rawEntries(rowEnd + delta, blockEnd + delta),
      ];
      return {
        kind: 'blocks',
        first: plan.first,
        last: plan.first,
        rawStart: block.rawStart,
        rawEnd: blockEnd,
        raw,
        before: dealias(raw, this.schema).entries,
      };
    };
    const inside = (x: number) => x > rowStart && x <= rowEnd;
    if (
      changes?.some((c) => !c.value && (!inside(c.from) || !inside(c.to))) ||
      rowEnd + delta <= rowStart
    ) {
      note('rows:outside');
      return this.commit(asBlock(), changes);
    }
    const raw = this.rawEntries(rowStart, rowEnd + delta);
    const { entries, live } = dealias([plan.head, ...raw], this.schema);
    const fake = buildView(entries, this.schema);
    const built = fake.children[0];
    const grid = this.schema.grid!;
    const fail = (why: string) => {
      note(`rows:${why}`);
      return this.commit(asBlock(), changes);
    };
    if (
      raw.some((e) => e.marker && e.marker.depth <= 1) ||
      live.length !== raw.length + 1 ||
      live.some((x, i) => x !== i)
    ) {
      return fail('shape');
    }
    if (
      fake.children.length !== 1 ||
      built.markerID !== table.markerID ||
      built.children.some((r) => r.virtual || r.type !== grid.row) ||
      padded(built, this.schema)
    ) {
      return fail('rows');
    }
    // the rows left alone fix the columns: the new ones must have them all
    const cols = (row: ZNode) =>
      row.children
        .map((c) => c.col ?? '')
        .sort()
        .join('|');
    const others = table.children.filter((_, k) => k < plan.r0 || k > plan.r1);
    if (
      others.length &&
      built.children.some((r) => cols(r) !== cols(others[0]))
    ) {
      return fail('columns');
    }
    // markers: the window's old ones out, its new ones in
    const oldIDs = new Set(plan.raw.filter((e) => e.marker).map((e) => e.id));
    const newMarkers: Array<[string, RGATreeSplitNodeID]> = [];
    const newKeys: Array<[string, string, string]> = [];
    for (const e of raw) {
      if (e.marker) {
        newMarkers.push([e.id, markerNodeIDs.get(e)!]);
        if (e.marker.boundary) {
          newKeys.push([e.marker.boundary, ticketOf(e.id), e.id]);
        }
      }
    }
    const kept = block.markers.filter(([id]) => !oldIDs.has(id));
    const own = new Set([...kept, ...newMarkers].map(([id]) => id));
    if (raw.some((e) => e.scope && !own.has(e.scope))) {
      return fail('scope');
    }
    const keptKeys = block.keys.filter(([, , id]) => !oldIDs.has(id));
    this.unregister(block);
    block.markers = [...kept, ...newMarkers];
    block.keys = [...keptKeys, ...newKeys];
    for (const [list, sign] of [
      [plan.raw, -1],
      [raw, 1],
    ] as const) {
      for (const e of list) {
        if (e.scope) {
          const n = (block.scopeRefs.get(e.scope) ?? 0) + sign;
          if (n > 0) {
            block.scopeRefs.set(e.scope, n);
          } else {
            block.scopeRefs.delete(e.scope);
          }
        }
      }
    }
    this.register(block);
    if (this.isHazard(block)) {
      note('rows:hazard');
      return this.commitWhole(
        this.reconstructBefore(asBlock() as never, delta),
      );
    }
    // the rows: built behind the table marker, moved to where they are
    const viewDelta = entries.length - plan.before.length;
    const at = table.start + (rowStart - block.rawStart) - 1;
    for (const row of built.children) {
      shiftNode(row, at);
      row.parent = table;
    }
    for (const row of table.children.slice(plan.r1 + 1)) {
      shiftNode(row, viewDelta);
    }
    table.children = [
      ...table.children.slice(0, plan.r0),
      ...built.children,
      ...table.children.slice(plan.r1 + 1),
    ];
    table.end += viewDelta;
    block.rawLength += delta;
    block.viewLength += viewDelta;
    for (let b = plan.first + 1; b < this.blocks.length; b++) {
      const later = this.blocks[b];
      later.rawStart += delta;
      later.viewStart += viewDelta;
      if (viewDelta) {
        later.nodes.forEach((n) => shiftNode(n, viewDelta));
      }
    }
    this.rawLength = total;
    this.viewLength += viewDelta;
    const children = this.root.children;
    this.root.end = Math.max(
      this.viewLength,
      children.length ? children[children.length - 1].end : 0,
    );
    let offset = 0;
    for (let b = 0; b < plan.first; b++) {
      offset += this.blocks[b].nodes.length;
    }
    IndexStats.rows++;
    const first = plan.first;
    return {
      before: plan.before,
      after: entries,
      offset,
      whole: false,
      rows: plan.r0,
      widen: () => {
        const now = this.blocks[first];
        const after = this.rawEntries(
          now.rawStart,
          now.rawStart + now.rawLength,
        );
        const before = [
          ...after.slice(0, rowStart - now.rawStart),
          ...plan.raw,
          ...after.slice(rowEnd + delta - now.rawStart),
        ];
        return {
          before: dealias(before, this.schema).entries,
          after: dealias(after, this.schema).entries,
        };
      },
    };
  }

  /**
   * `commit` brings the index to the current tokens after the planned
   * change, whose value changes (`RGATreeSplit.edit`) are given when known.
   */
  public commit(
    plan: ZeroPlan,
    changes?: Array<ValueChange<ZeroTokens>>,
  ): ZeroChange {
    const total = this.rga.length;
    if (plan.kind === 'whole') {
      return this.commitWhole(plan.before);
    }
    if (plan.kind === 'rows') {
      return this.commitRows(plan, changes);
    }
    const delta = total - this.rawLength;
    const { first, last, rawStart, rawEnd } = plan;
    const inside = (x: number) =>
      (x > rawStart || rawStart === 0) && x <= rawEnd;
    // only the deletions: an insertion after a tombstone is reported from the
    // end of the tombstone's insPrev, which may sit before where it landed
    if (
      changes?.some((c) => !c.value && (!inside(c.from) || !inside(c.to))) ||
      rawEnd + delta < rawStart
    ) {
      IndexStats.escapes++;
      note(
        `escape:${JSON.stringify({ rawStart, rawEnd, delta, changes: changes?.map((c) => [c.from, c.to, c.value?.length ?? 0]) })}`,
      );
      return this.commitWhole(this.reconstructBefore(plan, delta));
    }
    const raw = this.rawEntries(rawStart, rawEnd + delta);
    const viewStart = this.blocks[first].viewStart;
    const isWhole = rawStart === 0 && rawEnd + delta === total;
    const built = this.build(raw, rawStart, viewStart, isWhole);
    const old = this.blocks.slice(first, last + 1);
    if (!built) {
      note('commit:empty');
      return this.commitWhole(this.reconstructBefore(plan, delta));
    }
    old.forEach((b) => this.unregister(b));
    built.blocks.forEach((b) => this.register(b));
    built.blocks.forEach((b) => this.resolveScopes(b));
    if (built.blocks.some((b) => this.isHazard(b))) {
      // a hazard the plan could not see: what was built may not hold
      note('commit:hazard');
      return this.commitWhole(this.reconstructBefore(plan, delta));
    }
    const viewDelta =
      built.view.length - old.reduce((n, b) => n + b.viewLength, 0);
    for (let b = last + 1; b < this.blocks.length; b++) {
      const block = this.blocks[b];
      block.rawStart += delta;
      block.viewStart += viewDelta;
      if (viewDelta) {
        block.nodes.forEach((n) => shiftNode(n, viewDelta));
      }
    }
    this.blocks.splice(first, last - first + 1, ...built.blocks);
    this.rawLength = total;
    this.viewLength += viewDelta;
    let offset = 0;
    for (let b = 0; b < first; b++) {
      offset += this.blocks[b].nodes.length;
    }
    // the root holds the blocks' nodes in order: replace the old ones
    const nodes: Array<ZNode> = [];
    for (const block of built.blocks) {
      for (const node of block.nodes) {
        node.parent = this.root;
        nodes.push(node);
      }
    }
    const children = this.root.children.slice();
    children.splice(
      offset,
      old.reduce((n, b) => n + b.nodes.length, 0),
      ...nodes,
    );
    this.root.children = children;
    this.root.end = Math.max(
      this.viewLength,
      children.length ? children[children.length - 1].end : 0,
    );
    IndexStats.blocks++;
    return { before: plan.before, after: built.view, offset, whole: false };
  }

  /**
   * `commitUndo` brings the index up to date after an undo or redo
   * (`restore`, `retombstone`) that revived `revived` and removed `removed`
   * again. The pieces are found where they are now: the tokens around them
   * did not change, so the blocks from the one before the first piece to the
   * one after the last are rebuilt, the state before read back from the
   * pieces (a removed piece keeps its tokens until GC).
   */
  public commitUndo(
    revived: Array<RGATreeSplitNode<ZeroTokens>>,
    removed: Array<RGATreeSplitNode<ZeroTokens>>,
  ): ZeroChange {
    const total = this.rga.length;
    const delta = total - this.rawLength;
    const back = new Set(revived);
    const gone = new Set(removed);
    const wasLive = (n: RGATreeSplitNode<ZeroTokens>) =>
      gone.has(n) || (!n.isRemoved() && !back.has(n));
    if (!back.size && !gone.size) {
      return { before: [], after: [], offset: 0, whole: false };
    }
    if (
      this.schema.single?.[this.schema.rootType] ||
      !this.rawLength ||
      !this.blocks.length
    ) {
      note('undo:empty');
      return this.commitWhole(this.undoBeforeWhole(wasLive));
    }
    // the first and the last piece, by where they are now
    const tree = this.rga.getTreeByIndex();
    let first: RGATreeSplitNode<ZeroTokens> | undefined;
    let last: RGATreeSplitNode<ZeroTokens> | undefined;
    let firstAt = Infinity;
    let lastEnd = -1;
    for (const n of [...back, ...gone]) {
      const at = tree.indexOf(n);
      const end = at + n.getLength();
      if (at < firstAt) {
        [first, firstAt] = [n, at];
      }
      if (end > lastEnd) {
        [last, lastEnd] = [n, end];
      }
    }
    // the live token before the first piece and after the last one: both
    // unchanged, so before the change they sit at `from - 1` and `to`
    let left = first!.getPrev();
    while (left && (back.has(left) || gone.has(left) || !left.getLength())) {
      left = left.getPrev();
    }
    let right = last!.getNext();
    while (
      right &&
      (back.has(right) || gone.has(right) || !right.getLength())
    ) {
      right = right.getNext();
    }
    const from = left ? tree.indexOf(left) + left.getLength() : 0;
    const to = (right ? tree.indexOf(right) : total) - delta;
    const firstBlock = from > 0 ? this.blockAt(from - 1, 'rawStart') : 0;
    const lastBlock = this.blockAt(
      Math.min(Math.max(to, from), this.rawLength - 1),
      'rawStart',
    );
    for (let b = firstBlock; b <= lastBlock; b++) {
      if (this.isHazard(this.blocks[b])) {
        note('undo:hazard');
        return this.commitWhole(this.undoBeforeWhole(wasLive));
      }
    }
    const revivedMarkers = new Set<string>();
    for (const n of back) {
      const key = n.getCreatedAt().toIDString();
      const base = n.getID().getOffset();
      const tokens = n.getValue()?.tokens ?? [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (typeof t === 'string') {
          continue;
        }
        revivedMarkers.add(`${key}:${base + i}`);
        if (t.boundary) {
          const tickets = this.keyTickets.get(t.boundary);
          if (tickets && (tickets.size > 1 || !tickets.has(key))) {
            note('undo:key');
            return this.commitWhole(this.undoBeforeWhole(wasLive));
          }
        }
      }
    }
    // a revived marker shows again the tokens that name it as their scope:
    // those of another block change with it
    if (revivedMarkers.size) {
      for (let b = 0; b < this.blocks.length; b++) {
        if (
          (b < firstBlock || b > lastBlock) &&
          this.blocks[b].scopes.some((x) => revivedMarkers.has(x))
        ) {
          note('undo:scope');
          return this.commitWhole(this.undoBeforeWhole(wasLive));
        }
      }
    }
    const rawStart = this.blocks[firstBlock].rawStart;
    const end = this.blocks[lastBlock];
    const rawEnd = end.rawStart + end.rawLength;
    const raw = this.liveBefore(rawStart, rawEnd - rawStart, wasLive);
    note('undo:blocks');
    return this.commit({
      kind: 'blocks',
      first: firstBlock,
      last: lastBlock,
      rawStart,
      rawEnd,
      raw,
      before: dealias(raw, this.schema).entries,
    });
  }

  /**
   * `liveBefore` reads `count` tokens that were live before an undo, from
   * the one at `rawStart` (unchanged, so where it was).
   */
  private liveBefore(
    rawStart: number,
    count: number,
    wasLive: (n: RGATreeSplitNode<ZeroTokens>) => boolean,
  ): Array<ViewEntry> {
    const out: Array<ViewEntry> = [];
    let node: RGATreeSplitNode<ZeroTokens> | undefined;
    let i = 0;
    if (rawStart > 0) {
      const [found, offset] = this.rga.getTreeByIndex().findForText(rawStart);
      node = found as RGATreeSplitNode<ZeroTokens>;
      i = offset;
      if (i >= node.getLength()) {
        node = node.getNext();
        i = 0;
      }
    } else {
      node = this.rga.getHead().getNext();
    }
    while (node && out.length < count) {
      const value = node.getValue();
      if (value && wasLive(node)) {
        const key = node.getCreatedAt().toIDString();
        const base = node.getID().getOffset();
        for (; i < value.tokens.length && out.length < count; i++) {
          const entry = tokenEntry(
            value.tokens[i],
            `${key}:${base + i}`,
            value.scope,
          );
          if (entry.marker) {
            markerNodeIDs.set(
              entry,
              RGATreeSplitNodeID.of(node.getCreatedAt(), base + i),
            );
          }
          out.push(entry);
        }
      }
      node = node.getNext();
      i = 0;
    }
    return out;
  }

  /**
   * `undoBeforeWhole` returns the model's entries before an undo.
   */
  private undoBeforeWhole(
    wasLive: (n: RGATreeSplitNode<ZeroTokens>) => boolean,
  ): Array<ViewEntry> {
    return dealias(this.liveBefore(0, Infinity, wasLive), this.schema).entries;
  }

  /**
   * `reconstructBefore` returns the model's entries before a planned change:
   * the tokens outside its blocks did not change.
   */
  private reconstructBefore(
    plan: Extract<ZeroPlan, { kind: 'blocks' }>,
    delta: number,
  ): Array<ViewEntry> {
    const total = this.rga.length;
    const raw = [
      ...this.rawEntries(0, plan.rawStart),
      ...plan.raw,
      ...this.rawEntries(plan.rawEnd + delta, total),
    ];
    return dealias(raw, this.schema).entries;
  }

  private commitWhole(before: Array<ViewEntry>): ZeroChange {
    const after = this.rebuildWhole();
    IndexStats.wholes++;
    return { before, after, offset: 0, whole: true };
  }

  /**
   * `rebuildWhole` rebuilds every block. Returns the model's entries.
   */
  public rebuildWhole(): Array<ViewEntry> {
    this.blocks.forEach((b) => this.unregister(b));
    this.markerIDs.clear();
    this.markerBlock.clear();
    this.keyTickets.clear();
    const total = this.rga.length;
    const raw = this.rawEntries(0, total);
    const built = this.build(raw, 0, 0, true)!;
    this.blocks = built.blocks;
    this.blocks.forEach((b) => this.register(b));
    this.blocks.forEach((b) => this.resolveScopes(b));
    this.rawLength = total;
    this.viewLength = built.view.length;
    this.assemble();
    return built.view;
  }

  /**
   * `build` builds the blocks of the raw entries of a run of whole blocks
   * that starts at `rawStart` and `viewStart`. Undefined when the run does
   * not build on its own (it left every token out).
   */
  private build(
    raw: Array<ViewEntry>,
    rawStart: number,
    viewStart: number,
    isWhole: boolean,
  ): { blocks: Array<ZeroBlock>; view: Array<ViewEntry> } | undefined {
    const { entries, live } = dealias(raw, this.schema);
    if (!entries.length && !isWhole) {
      return;
    }
    const root = buildView(entries, this.schema);
    // cut where a top-level node opens with a depth-1 marker of its own
    const cuts: Array<{ raw: number; view: number }> = [{ raw: 0, view: 0 }];
    for (const child of root.children) {
      if (child.virtual || !child.markerID || child.start === 0) {
        continue;
      }
      const at = live[child.start];
      if (raw[at]?.id === child.markerID && opensBlock(raw, at)) {
        cuts.push({ raw: at, view: child.start });
      }
    }
    const blocks: Array<ZeroBlock> = [];
    let c = 0;
    for (let k = 0; k < cuts.length; k++) {
      const rawFrom = cuts[k].raw;
      const rawTo = k + 1 < cuts.length ? cuts[k + 1].raw : raw.length;
      const viewFrom = cuts[k].view;
      const viewTo = k + 1 < cuts.length ? cuts[k + 1].view : entries.length;
      const nodes: Array<ZNode> = [];
      while (
        c < root.children.length &&
        (k + 1 === cuts.length || root.children[c].start < viewTo)
      ) {
        nodes.push(root.children[c++]);
      }
      let localLive: Array<number> | undefined;
      if (viewTo - viewFrom !== rawTo - rawFrom) {
        localLive = live.slice(viewFrom, viewTo).map((x) => x - rawFrom);
      } else {
        for (let v = viewFrom; v < viewTo; v++) {
          if (live[v] - rawFrom !== v - viewFrom) {
            localLive = live.slice(viewFrom, viewTo).map((x) => x - rawFrom);
            break;
          }
        }
      }
      const markers: Array<[string, RGATreeSplitNodeID]> = [];
      const keys: Array<[string, string, string]> = [];
      for (let i = rawFrom; i < rawTo; i++) {
        const m = raw[i].marker;
        if (m) {
          markers.push([raw[i].id, markerNodeIDs.get(raw[i])!]);
          if (m.boundary) {
            keys.push([m.boundary, ticketOf(raw[i].id), raw[i].id]);
          }
        }
      }
      const own = new Set(markers.map(([id]) => id));
      const scopes = new Set<string>();
      const scopeRefs = new Map<string, number>();
      for (let i = rawFrom; i < rawTo; i++) {
        const scope = raw[i].scope;
        if (scope && !own.has(scope)) {
          scopes.add(scope);
        }
        if (scope) {
          scopeRefs.set(scope, (scopeRefs.get(scope) ?? 0) + 1);
        }
      }
      blocks.push({
        rawStart: rawStart + rawFrom,
        rawLength: rawTo - rawFrom,
        viewStart: viewStart + viewFrom,
        viewLength: viewTo - viewFrom,
        live: localLive,
        nodes,
        markers,
        keys,
        scopes: [...scopes],
        scopeRefs,
        crossing: false,
      });
    }
    if (viewStart) {
      root.children.forEach((n) => shiftNode(n, viewStart));
    }
    return { blocks, view: entries };
  }

  /**
   * `resolveScopes` marks a block whose tokens name a live scope marker of
   * another block, and that block: deleting the marker hides them. A scope
   * marker that is not live hides them wherever they are.
   */
  private resolveScopes(block: ZeroBlock): void {
    for (const scope of block.scopes) {
      const provider = this.markerBlock.get(scope);
      if (provider && provider !== block) {
        block.crossing = true;
        provider.crossing = true;
      }
    }
  }

  private isHazard(block: ZeroBlock): boolean {
    return (
      block.crossing ||
      block.keys.some(([key]) => (this.keyTickets.get(key)?.size ?? 0) > 1)
    );
  }

  private register(block: ZeroBlock): void {
    for (const [id, nodeID] of block.markers) {
      this.markerBlock.set(id, block);
      this.markerIDs.set(id, nodeID);
    }
    for (const [key, ticket] of block.keys) {
      let tickets = this.keyTickets.get(key);
      if (!tickets) {
        tickets = new Map();
        this.keyTickets.set(key, tickets);
      }
      tickets.set(ticket, (tickets.get(ticket) ?? 0) + 1);
    }
  }

  private unregister(block: ZeroBlock): void {
    for (const [id] of block.markers) {
      if (this.markerBlock.get(id) === block) {
        this.markerBlock.delete(id);
        this.markerIDs.delete(id);
      }
    }
    for (const [key, ticket] of block.keys) {
      const tickets = this.keyTickets.get(key);
      const n = (tickets?.get(ticket) ?? 0) - 1;
      if (n > 0) {
        tickets!.set(ticket, n);
      } else {
        tickets?.delete(ticket);
        if (tickets && !tickets.size) {
          this.keyTickets.delete(key);
        }
      }
    }
  }

  /**
   * `assemble` makes the root hold the nodes of every block.
   */
  private assemble(): void {
    const children: Array<ZNode> = [];
    for (const block of this.blocks) {
      for (const node of block.nodes) {
        node.parent = this.root;
        children.push(node);
      }
    }
    this.root.children = children;
    this.root.end = Math.max(
      this.viewLength,
      children.length ? children[children.length - 1].end : 0,
    );
  }

  /**
   * `debugBlocks` returns the block layout (tests).
   */
  public debugBlocks(): Array<[number, number, number, number, number]> {
    return this.blocks.map((b) => [
      b.rawStart,
      b.rawLength,
      b.viewStart,
      b.viewLength,
      b.nodes.length,
    ]);
  }
}
