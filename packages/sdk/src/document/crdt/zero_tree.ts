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
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { GCPair } from '@yorkie-js/sdk/src/document/crdt/gc';
import { DataSize } from '@yorkie-js/sdk/src/util/resource';
import type * as Devtools from '@yorkie-js/sdk/src/devtools/types';
import {
  DefaultZeroSchema,
  ViewEntry,
  ZNode,
  ZeroNodeJSON,
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

/**
 * `ZeroAttr` is one LWW attribute register of a marker. `value` null means
 * the key was removed; the register is kept so a concurrent older write
 * cannot bring it back.
 */
export type ZeroAttr = { value: ZeroAttrValue; updatedAt: TimeTicket };

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
    const marker = new ZeroMarker(type, depth);
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
   */
  public set(
    key: string,
    value: ZeroAttrValue,
    ticket: TimeTicket,
  ): [ZeroAttrValue | undefined, boolean] {
    const prev = this.attrs.get(key);
    if (prev && !ticket.after(prev.updatedAt)) {
      return [prev.value, false];
    }
    this.attrs.set(key, { value, updatedAt: ticket });
    return [prev ? prev.value : undefined, true];
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
      attrs.set(k, { ...v });
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
 * `CRDTZeroTree` is the CRDT element.
 */
export class CRDTZeroTree extends CRDTElement {
  private rga: RGATreeSplit<ZeroTokens>;
  private schema: ZeroSchema;

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
  ): CRDTZeroTree {
    const rga = RGATreeSplit.create<ZeroTokens>();
    const tokens = toTokens(children, 1, createdAt);
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
    return new CRDTZeroTree(rga, createdAt, cloneZeroSchema(DefaultZeroSchema));
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

  /**
   * `liveEntries` returns the live tokens in order, with their identities.
   * Attributes are copied: the entries are a snapshot.
   */
  public liveEntries(): Array<ViewEntry> {
    const entries: Array<ViewEntry> = [];
    for (const node of this.rga) {
      if (node.isRemoved()) {
        continue;
      }
      const value = node.getValue();
      if (!value) {
        continue;
      }
      const createdAt = node.getCreatedAt();
      const base = node.getID().getOffset();
      value.tokens.forEach((t, i) => {
        const id = RGATreeSplitNodeID.of(createdAt, base + i).toIDString();
        if (typeof t === 'string') {
          entries.push({ id, char: t, scope: value.scope });
        } else {
          const registers: Record<
            string,
            { value: ZeroAttrValue; at: TimeTicket }
          > = {};
          t.attrs.forEach((attr, key) => {
            registers[key] = { value: attr.value, at: attr.updatedAt };
          });
          entries.push({
            id,
            marker: {
              type: t.type,
              depth: t.depth,
              attrs: t.toObject(),
              boundary: t.boundary,
              registers,
            },
            scope: value.scope,
          });
        }
      });
    }
    return entries;
  }

  /**
   * `viewEntries` returns the live tokens the model is made of: concurrent
   * splits of one boundary folded into the first (see `dealias`). Indexes of
   * the model (`ZNode.start`, `textStart`, ...) and of `indexToPos`,
   * `posToIndex` and `idAt` count these entries.
   */
  public viewEntries(): Array<ViewEntry> {
    return dealias(this.liveEntries(), this.schema).entries;
  }

  /**
   * `liveIndexOf` maps an index of `viewEntries` to an index of `liveEntries`.
   * A position is taken right before the view token at `index` (after any
   * folded markers in front of it); with `end`, right after the view token
   * before `index` (before any folded markers behind it). So a range of view
   * tokens never takes the folded markers around it along.
   */
  private liveIndexOf(index: number, end = false): number {
    const { live } = dealias(this.liveEntries(), this.schema);
    if (end) {
      return index <= 0 ? 0 : live[Math.min(index, live.length) - 1] + 1;
    }
    return index < live.length
      ? live[Math.max(index, 0)]
      : this.liveEntries().length;
  }

  /**
   * `view` builds the Zero model of the current state.
   */
  public view(): ZNode {
    return buildView(this.viewEntries(), this.schema);
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
   * `liveIndexToPos` converts an index of `liveEntries` to a position.
   */
  public liveIndexToPos(index: number): RGATreeSplitPos {
    return this.rga.indexToPos(index);
  }

  /**
   * `posToIndex` converts a position to a live-token index.
   */
  public posToIndex(pos: RGATreeSplitPos): number {
    const raw = this.rga.posToIndex(pos, true);
    const { live } = dealias(this.liveEntries(), this.schema);
    let index = 0;
    while (index < live.length && live[index] < raw) {
      index++;
    }
    return index;
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
    const raw = this.liveEntries().findIndex((e) => e.id === id);
    if (raw < 0) {
      return;
    }
    const abs = this.rga.indexToPos(raw + 1).getAbsoluteID();
    return RGATreeSplitNodeID.of(abs.getCreatedAt(), abs.getOffset() - 1);
  }

  /**
   * `idAt` returns the absolute id of the live token at `index`.
   */
  public idAt(index: number): RGATreeSplitNodeID {
    const { live } = dealias(this.liveEntries(), this.schema);
    const raw = live[index] ?? index;
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
    const [, pairs, diff, , , removedSpans] = this.rga.edit(
      range,
      editedAt,
      value,
      versionVector,
    );
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
    return this.rga.restore(spans, executedAt, fallbackAnchor);
  }

  /**
   * `retombstone` removes the given spans again under their identities.
   */
  public retombstone(
    spans: Array<RestoreSpan<ZeroTokens>>,
    executedAt: TimeTicket,
    versionVector?: VersionVector,
  ) {
    return this.rga.retombstone(spans, executedAt, versionVector);
  }

  /**
   * `setAttrs` writes attributes on the marker of the given id. Returns the
   * previous values of the keys that applied, for the reverse operation.
   */
  public setAttrs(
    markerID: RGATreeSplitNodeID,
    writes: Array<[string, ZeroAttrValue]>,
    editedAt: TimeTicket,
  ): Array<[string, ZeroAttrValue]> {
    const marker = this.findMarker(markerID);
    const prev: Array<[string, ZeroAttrValue]> = [];
    if (!marker) {
      return prev;
    }
    for (const [k, v] of writes) {
      const [old, applied] = marker.set(k, v, editedAt);
      if (applied) {
        prev.push([k, old === undefined ? null : old]);
      }
    }
    return prev;
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
    return clone;
  }
}
