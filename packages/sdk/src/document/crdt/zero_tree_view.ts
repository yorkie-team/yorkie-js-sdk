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
 * PROTOTYPE — Zero Tree view.
 *
 * Everything in this file is a pure function of the LIVE token sequence of a
 * `CRDTZeroTree`: tombstones are never read. That is the property the design
 * rests on: the live sequence converges because it is an RGA, so the editor
 * model built from it converges too, and garbage collection (which only ever
 * removes tombstones) cannot change it.
 *
 * Token sequence: every Zero element node is an OPEN marker carrying its
 * type, its depth (path length from `content`) and its attributes; the text of
 * an `inline-text` is the characters that follow its marker. There are no
 * close tokens -- a marker at depth d closes every open node at depth >= d.
 */

/**
 * `ZeroAttrValue` is the value of one attribute write. `null` means the key
 * was removed: the register is kept so a concurrent older write cannot bring
 * it back, and it has to stay apart from `undefined` (never written).
 */
// eslint-disable-next-line @typescript-eslint/no-restricted-types
export type ZeroAttrValue = string | null;

/**
 * `ZeroOperation` is a Zero editor operation: `[operator, path, data?]`.
 */
export type ZeroOperation = [string, Array<number>, unknown?];

/**
 * `ZeroNodeJSON` is the JSON form of a Zero node (`INodeJson`).
 */
export type ZeroNodeJSON = {
  type: string;
  children?: Array<ZeroNodeJSON>;
  data?: unknown;
  style?: Record<string, unknown>;
  attribute?: Record<string, unknown>;
};

/**
 * `ZeroSchema` is the part of the Zero schema the view needs: which type holds
 * text, which types are atomic leaves, the default child of each container
 * and which children a container accepts.
 */
export type ZeroSchema = {
  textType: string;
  /**
   * every type whose `data` is text (`text-data`): `inline-text` and the
   * ones plugins define (`caption-inline-text`, `inline-code-text`, ...).
   * Their characters are tokens, merged one by one. `textType` is the default.
   */
  textTypes: Set<string>;
  /**
   * container types whose insides die with them: a token run inserted in a
   * table, row, cell, caption, image component ... is left out of the model
   * once that node's marker is gone (a cell someone added to a row being
   * deleted, a line typed into a deleted cell or caption). Paragraphs and
   * links are not scoped (they merge): text in them survives into the
   * container before.
   */
  scoped: Set<string>;
  /**
   * child types a container holds at most one of (`max: 1`: the image and the
   * caption of an image component, the body of a cell). Two made at once
   * (two people add a caption) are one: the first in document order stays,
   * the other is left out of the model with what is in it.
   */
  single?: Record<string, Set<string>>;
  /**
   * the table types. A cell marker carries its column's key (`zt.col`), and a
   * deleted column is a flag on the table marker (`zt.del.<key>`): cells of a
   * deleted column stay out of the model (a row someone added meanwhile), and
   * a row missing a live column gets an empty virtual cell there (a row added
   * while someone added a column). Zero itself never sees these keys.
   */
  grid?: { table: string; row: string; cell: string };
  rootType: string;
  atomic: Set<string>;
  defaultChild: Record<string, string>;
  allowed: Record<string, Set<string>>;
};

export const DefaultZeroSchema: ZeroSchema = {
  textType: 'inline-text',
  textTypes: new Set(['inline-text']),
  scoped: new Set(['table', 'table-row', 'table-cell', 'table-cell-body']),
  grid: { table: 'table', row: 'table-row', cell: 'table-cell' },
  rootType: 'content',
  atomic: new Set(['inline-image']),
  defaultChild: {
    content: 'paragraph',
    paragraph: 'inline-text',
    'inline-hyperlink': 'inline-text',
    table: 'table-row',
    'table-row': 'table-cell',
    'table-cell': 'table-cell-body',
    'table-cell-body': 'paragraph',
  },
  allowed: {
    content: new Set(['paragraph', 'table']),
    paragraph: new Set(['inline-text', 'inline-image', 'inline-hyperlink']),
    'inline-hyperlink': new Set(['inline-text', 'inline-image']),
    table: new Set(['table-row']),
    'table-row': new Set(['table-cell']),
    'table-cell': new Set(['table-cell-body']),
    'table-cell-body': new Set(['paragraph', 'table']),
  },
};

/**
 * `cloneZeroSchema` copies a schema (sets and maps included, order kept).
 * A tree takes a copy of the configured schema when it is created and keeps
 * it as document state (it travels in snapshots), so a server or a later
 * configuration builds the same model.
 */
export function cloneZeroSchema(schema: ZeroSchema): ZeroSchema {
  const sets = (m: Record<string, Set<string>>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, new Set(v)]));
  return {
    textType: schema.textType,
    textTypes: new Set(schema.textTypes),
    scoped: new Set(schema.scoped),
    single: schema.single ? sets(schema.single) : undefined,
    grid: schema.grid ? { ...schema.grid } : undefined,
    rootType: schema.rootType,
    atomic: new Set(schema.atomic),
    defaultChild: { ...schema.defaultChild },
    allowed: sets(schema.allowed),
  };
}

/**
 * `configureZeroSchema` replaces the schema every Zero Tree of this process
 * uses (PROTOTYPE: the schema is configuration, not document state, so every
 * replica has to configure the same one -- the plugin's contract checks that).
 */
export function configureZeroSchema(schema: Partial<ZeroSchema>): void {
  Object.assign(DefaultZeroSchema, schema);
}

/**
 * `ViewMarker` is the part of a marker token the view reads.
 */
export type ViewMarker = {
  type: string;
  depth: number;
  attrs: Record<string, string>;
  /** see `ZeroMarker.boundary` */
  boundary?: string;
  /** the LWW registers behind `attrs` (removed keys included) */
  registers?: Record<
    string,
    { value: ZeroAttrValue; at: { after(other: any): boolean } }
  >;
};

/**
 * `ViewEntry` is one live token: a character or a marker, with the string form
 * of its identity.
 */
export type ViewEntry = {
  id: string;
  char?: string;
  marker?: ViewMarker;
  /** markers of later concurrent splits of the same boundary (see `dealias`) */
  aliases?: Array<string>;
  /** the scoping marker the token was inserted in (see `ZeroTokens.scope`) */
  scope?: string;
};

/**
 * `ZeroLevelKey` is the reserved attribute that places a marker between two
 * whole depths: the marker given to a virtual node squeezed in below the
 * marker it was opened for (see `ZNode.level`). The marker's depth is the
 * next whole depth. Like the other `zt.*` keys, the editor never sees it.
 */
export const ZeroLevelKey = 'zt.level';

/**
 * `ZeroRegionPrefix` names the register a marker keeps a pending range write
 * in, keyed by the write's ticket, so a snapshot carries it.
 */
export const ZeroRegionPrefix = 'zt.r.';

/**
 * `levelOf` returns where a marker sits in the written-depth space: the
 * level it carries, or its depth.
 */
export function levelOf(marker: {
  depth: number;
  attrs: Record<string, string>;
}): number {
  const level = marker.attrs[ZeroLevelKey];
  return level !== undefined
    ? Number(JSON.parse(level))
    : Math.max(1, marker.depth);
}

/**
 * `dealias` folds the markers of concurrent splits of one boundary into the
 * first split there. Two people pressing Enter at the same place make one
 * line: the later run (in document order) is the same line, so its markers
 * open nothing -- their registers join the first run's (LWW per key) and
 * their ids join its groups, so a merge removes them too.
 *
 * A run is the markers of one SPLIT cascade: consecutive markers of one
 * boundary key with growing depth (outermost first). A later run of the same
 * key is folded marker by marker when its shape (type, depth) matches. It may
 * sit anywhere after the first run (the first author may have typed after
 * their Enter before the second run arrived), so the result has no gaps:
 * `live[k]` is the index in `entries` of the k-th returned entry.
 *
 * It also leaves out the tokens whose scope marker is not in the model (see
 * `ZeroSchema.scoped`): a scope marker always comes before what it scopes,
 * so one pass from the left decides it.
 */
export function dealias(
  entries: Array<ViewEntry>,
  schema: ZeroSchema = DefaultZeroSchema,
): {
  entries: Array<ViewEntry>;
  live: Array<number>;
} {
  const out: Array<ViewEntry> = [];
  const live: Array<number> = [];
  const firstRuns = new Map<string, Array<number>>();
  const shown = new Set<string>();
  // open shown markers by depth, with the child types seen under each
  const open: Array<{
    depth: number;
    type: string;
    seen: Set<string>;
    attrs?: Record<string, string>;
  }> = [{ depth: 0, type: schema.rootType, seen: new Set() }];
  let hideDepth = Infinity;
  let into: Array<number> | undefined;
  let isFirst = false;
  let j = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.scope && !shown.has(entry.scope)) {
      continue;
    }
    if (entry.marker && levelOf(entry.marker) <= hideDepth) {
      hideDepth = Infinity;
    }
    if (hideDepth !== Infinity) {
      continue;
    }
    if (entry.marker) {
      // a second child of a `single` type: left out with its span (a split
      // marker is never one: splits copy a node the parent already holds)
      const depth = levelOf(entry.marker);
      while (open.length > 1 && open[open.length - 1].depth >= depth) {
        open.pop();
      }
      const parent = open[open.length - 1];
      // a cell of a deleted column: left out with its span
      const col = entry.marker.attrs['zt.col'];
      if (col !== undefined && entry.marker.type === schema.grid?.cell) {
        const table = [...open]
          .reverse()
          .find((o) => o.type === schema.grid!.table);
        if (table?.attrs?.[`zt.del.${JSON.parse(col)}`] !== undefined) {
          hideDepth = depth;
          continue;
        }
      }
      if (
        !entry.marker.boundary &&
        schema.single?.[parent.type]?.has(entry.marker.type)
      ) {
        if (parent.seen.has(entry.marker.type)) {
          hideDepth = depth;
          continue;
        }
        parent.seen.add(entry.marker.type);
      }
      open.push({
        depth,
        type: entry.marker.type,
        seen: new Set(),
        attrs: entry.marker.attrs,
      });
    }
    if (entry.marker) {
      shown.add(entry.id);
    }
    const key = entry.marker?.boundary;
    if (!key) {
      out.push(entry);
      live.push(i);
      continue;
    }
    const prev = entries[i - 1]?.marker;
    if (prev?.boundary === key && entry.marker!.depth > prev.depth) {
      j++;
    } else {
      j = 0;
      into = firstRuns.get(key);
      isFirst = !into;
      if (isFirst) {
        firstRuns.set(key, []);
      }
    }
    const target =
      !isFirst && into?.[j] !== undefined ? out[into[j]] : undefined;
    if (
      target &&
      target.marker!.type === entry.marker!.type &&
      target.marker!.depth === entry.marker!.depth
    ) {
      const registers = { ...(target.marker!.registers ?? {}) };
      for (const [k, reg] of Object.entries(entry.marker!.registers ?? {})) {
        if (!registers[k] || reg.at.after(registers[k].at)) {
          registers[k] = reg;
        }
      }
      const attrs: Record<string, string> = {};
      for (const [k, reg] of Object.entries(registers)) {
        if (reg.value !== null) {
          attrs[k] = reg.value;
        }
      }
      out[into![j]] = {
        ...target,
        marker: { ...target.marker!, attrs, registers },
        aliases: [...(target.aliases ?? []), entry.id],
      };
      continue;
    }
    if (isFirst) {
      firstRuns.get(key)!.push(out.length);
    }
    out.push(entry);
    live.push(i);
  }
  return { entries: out, live };
}

/**
 * `ZNode` is a node of the view. `start`/`end` are live-token indexes of its
 * span (`start` is its marker for a real node), `textStart` is the index of
 * its first character for the text holder.
 */
export type ZNode = {
  type: string;
  depth: number;
  /**
   * the node's place in the stored-depth space the markers are written in:
   * a real node's marker depth; a virtual node sits between its parent and
   * the marker it was opened for. Closing compares marker depths with this.
   */
  level: number;
  /**
   * for a virtual node squeezed in below the marker it was opened for: that
   * marker's depth. A later marker of that depth stays in it only if the
   * node holds that type, directly or through its default children (a
   * sibling of the first one); otherwise it closes.
   */
  anchor?: number;
  /**
   * a virtual node standing in for the default child of an empty container
   * (the paragraph of an empty list item): the editor holds it as a real node
   */
  placeholder?: boolean;
  attrs: Record<string, string>;
  markerID?: string;
  virtual: boolean;
  children: Array<ZNode>;
  text: string;
  start: number;
  end: number;
  textStart: number;
  parent?: ZNode;
  /** ids of the markers this node is made of (same-boundary markers merge) */
  group?: Array<string>;
  /** the column key of a cell (see `ZeroSchema.grid`) */
  col?: string;
  registers?: ViewMarker['registers'];
};

/**
 * `isTextType` tells whether nodes of `type` hold text as character tokens.
 */
export function isTextType(schema: ZeroSchema, type: string): boolean {
  return type === schema.textType || !!schema.textTypes?.has(type);
}

/**
 * `textTypeFor` returns the text type a container of `type` holds its text
 * in: its default child when that is a text type, otherwise the first text
 * type it accepts, otherwise the schema's default text type.
 */
export function textTypeFor(schema: ZeroSchema, type: string): string {
  const def = schema.defaultChild[type];
  if (def && isTextType(schema, def)) {
    return def;
  }
  for (const child of schema.allowed[type] ?? []) {
    if (isTextType(schema, child)) {
      return child;
    }
  }
  return schema.textType;
}

/**
 * `isContainer` tells whether the type holds other elements.
 */
function isContainer(schema: ZeroSchema, type: string): boolean {
  return !isTextType(schema, type) && !schema.atomic.has(type);
}

/**
 * `accepts` tells whether the schema lets the parent type hold the child type.
 */
function accepts(schema: ZeroSchema, parent: string, child: string): boolean {
  if (!isContainer(schema, parent)) {
    return false;
  }
  const allowed = schema.allowed[parent];
  return !allowed || allowed.has(child);
}

/**
 * `buildView` builds the Zero model from the live tokens.
 *
 * Concurrent edits can leave a live token without the ancestors the schema
 * requires (a character whose inline marker was deleted, a paragraph whose
 * inlines were all deleted). Those gaps are filled with VIRTUAL nodes of the
 * schema's default type and no attributes. Virtual nodes are derived from the
 * live tokens alone, never from a tombstone, so they converge with them.
 */
export function buildView(
  entries: Array<ViewEntry>,
  schema: ZeroSchema = DefaultZeroSchema,
): ZNode {
  const root: ZNode = {
    type: schema.rootType,
    depth: 0,
    level: 0,
    attrs: {},
    virtual: false,
    children: [],
    text: '',
    start: 0,
    end: entries.length,
    textStart: 0,
  };
  const stack: Array<ZNode> = [root];
  const top = () => stack[stack.length - 1];
  // characters by holder, joined once at the end (`+=` per character keeps
  // a rope node per character alive)
  const texts = new Map<ZNode, Array<string>>();

  const open = (
    type: string,
    depth: number,
    at: number,
    attrs: Record<string, string> = {},
    markerID?: string,
    level?: number,
  ): ZNode => {
    const parent = top();
    const node: ZNode = {
      type,
      depth,
      level: level ?? parent.level + 1,
      attrs,
      markerID,
      virtual: !markerID,
      children: [],
      text: '',
      start: at,
      end: at,
      textStart: markerID ? at + 1 : at,
      parent,
    };
    parent.children.push(node);
    stack.push(node);
    return node;
  };

  const ensureChildren = (node: ZNode, at: number) => {
    if (!isContainer(schema, node.type) || node.children.length) {
      return;
    }
    const childType = schema.defaultChild[node.type];
    if (!childType) {
      return;
    }
    stack.push(node);
    const child = open(childType, node.depth + 1, at);
    child.placeholder = true;
    ensureChildren(child, at);
    child.end = at;
    stack.pop();
    stack.pop();
  };

  const close = (at: number) => {
    const node = stack.pop()!;
    node.end = Math.max(node.end, at);
    ensureChildren(node, node.end);
    return node;
  };

  // Place a node of `type` under the nearest open node that accepts it. A
  // container that does not accept it directly gets its schema default child
  // (virtual) when that one does (a cell whose body marker is gone); a leaf
  // (text, atomic) or a container with no such default is closed. A marker
  // whose ancestors are gone thus joins the nearest one that can hold it (an
  // inline of a deleted link joins the paragraph).
  // The container type to fill under `parent` so that `type` can be held:
  // the schema default child first, then any other accepted child, as long
  // as a chain of containers from it reaches `type` (an orphan table-row
  // under content gets a virtual table).
  const reaches = (from: string, type: string, budget: number): boolean => {
    if (accepts(schema, from, type)) {
      return true;
    }
    if (budget <= 0 || !isContainer(schema, from)) {
      return false;
    }
    return candidatesOf(from).some((c) => reaches(c, type, budget - 1));
  };
  const candidatesOf = (from: string): Array<string> => {
    const list: Array<string> = [];
    const def = schema.defaultChild[from];
    if (def) {
      list.push(def);
    }
    schema.allowed[from]?.forEach((c) => {
      if (c !== def && isContainer(schema, c)) {
        list.push(c);
      }
    });
    return list.filter((c) => isContainer(schema, c) && c !== from);
  };
  const fillFor = (from: string, type: string): string | undefined =>
    candidatesOf(from).find((c) => reaches(c, type, 5));
  // whether `from` holds `type` directly or down its default children
  const holds = (from: string, type: string, budget = 5): boolean => {
    if (accepts(schema, from, type)) {
      return true;
    }
    const def = schema.defaultChild[from];
    return (
      budget > 0 &&
      !!def &&
      def !== from &&
      isContainer(schema, def) &&
      holds(def, type, budget - 1)
    );
  };

  // `anchor` is the marker depth of what is being placed (Infinity for
  // characters). Virtual nodes opened for it get levels between the parent's
  // and the anchor's, so a later marker of the anchor's depth (its sibling as
  // written) does not close them.
  const settle = (type: string, at: number, anchor = Infinity) => {
    const fills: Array<ZNode> = [];
    const place = () => {
      if (!fills.length) {
        return;
      }
      const p = fills[0].parent!.level;
      const n = fills.length;
      fills.forEach((f, j) => {
        // under the root, keep whole levels: a depth-1 marker must close
        // everything before it (top-level blocks build on their own)
        if (p === 0 || anchor - p - 1 >= n) {
          f.level = p + j + 1;
        } else {
          f.level = p + ((j + 1) * (anchor - p)) / (n + 1);
          f.anchor = anchor;
        }
      });
    };
    for (let guard = 0; guard < 64; guard++) {
      const parent = top();
      if (accepts(schema, parent.type, type)) {
        place();
        return;
      }
      const fill = isContainer(schema, parent.type)
        ? fillFor(parent.type, type)
        : undefined;
      if (fill) {
        fills.push(open(fill, parent.depth + 1, at));
        continue;
      }
      if (parent === root) {
        place();
        return;
      }
      close(at);
    }
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.marker) {
      const { type, attrs } = entry.marker;
      const depth = levelOf(entry.marker);
      // A marker right after a marker of the same boundary (concurrent splits
      // of one boundary) is the same node: merge its registers, LWW per key.
      const prev = entries[i - 1];
      const current = top();
      if (
        entry.marker.boundary &&
        prev?.marker &&
        prev.marker.boundary === entry.marker.boundary &&
        prev.marker.type === type &&
        prev.marker.depth === entry.marker.depth &&
        current.group?.includes(prev.id)
      ) {
        const merged = { ...(current.registers ?? {}) };
        for (const [key, reg] of Object.entries(entry.marker.registers ?? {})) {
          if (!merged[key] || reg.at.after(merged[key].at)) {
            merged[key] = reg;
          }
        }
        current.registers = merged;
        current.attrs = {};
        for (const [key, reg] of Object.entries(merged)) {
          if (reg.value !== null) {
            current.attrs[key] = reg.value;
          }
        }
        current.group.push(entry.id);
        current.textStart = i + 1;
        current.end = i + 1;
        continue;
      }
      while (
        top().level >= depth ||
        (top().anchor === depth && !holds(top().type, type))
      ) {
        close(i);
      }
      settle(type, i, depth);
      const node = open(type, top().depth + 1, i, attrs, entry.id, depth);
      node.group = [entry.id, ...(entry.aliases ?? [])];
      node.registers = entry.marker.registers;
      if (attrs['zt.col'] !== undefined) {
        node.col = JSON.parse(attrs['zt.col']);
      }
      continue;
    }

    // a character belongs to a text holder
    if (!isTextType(schema, top().type)) {
      let textType = textTypeFor(schema, top().type);
      if (!accepts(schema, top().type, textType)) {
        settle(schema.textType, i);
        textType = textTypeFor(schema, top().type);
      }
      open(textType, top().depth + 1, i);
    }
    const holder = top();
    let chars = texts.get(holder);
    if (!chars) {
      chars = [];
      texts.set(holder, chars);
      if (holder.virtual) {
        holder.textStart = i;
      }
    }
    chars.push(entry.char!);
    for (const n of stack) {
      n.end = i + 1;
    }
  }
  while (stack.length > 1) {
    close(entries.length);
  }
  texts.forEach((chars, node) => {
    node.text = chars.join('');
  });
  ensureChildren(root, entries.length);
  padColumns(root);
  fixSpans(root);
  return root;

  /**
   * A row without a cell for a live column (it was added while someone added
   * the column) gets an empty virtual cell there. Columns are ordered by how
   * the rows order them; a cell is live when it is in the model at all.
   */
  function padColumns(node: ZNode): void {
    const grid = schema.grid;
    if (!grid) {
      return;
    }
    node.children.forEach(padColumns);
    if (node.type !== grid.table) {
      return;
    }
    const rows = node.children.filter((r) => r.type === grid.row);
    const order: Array<string> = [];
    for (const row of rows) {
      let at = 0;
      for (const cell of row.children) {
        if (cell.col === undefined) {
          continue;
        }
        const k = order.indexOf(cell.col);
        if (k < 0) {
          order.splice(at, 0, cell.col);
          at++;
        } else {
          at = Math.max(at, k + 1);
        }
      }
    }
    const spanKeys = rows.some((r) =>
      r.children.some((c) => 'attribute.colspan' in c.attrs),
    );
    for (const row of rows) {
      const have = new Set(row.children.map((c) => c.col));
      if (!row.children.every((c) => c.col !== undefined)) {
        continue; // cells without keys: nothing to align by
      }
      order.forEach((key, k) => {
        if (have.has(key)) {
          return;
        }
        const next = order
          .slice(k + 1)
          .map((later) => row.children.find((c) => c.col === later))
          .find((c) => c !== undefined);
        const at = next ? next.start : row.end;
        stack.push(row);
        const cell = open(grid.cell, row.depth + 1, at);
        stack.pop();
        stack.pop();
        cell.col = key;
        cell.attrs = spanKeys
          ? {
              'attribute.colspan': '1',
              'attribute.rowspan': '1',
              'attribute.spanned': 'false',
            }
          : {};
        row.children.pop();
        row.children.splice(
          next ? row.children.indexOf(next) : row.children.length,
          0,
          cell,
        );
        ensureChildren(cell, at);
        cell.end = at;
        have.add(key);
      });
    }
  }
}

/**
 * `fixSpans` widens each node's token span to cover its children.
 */
function fixSpans(node: ZNode): void {
  for (const child of node.children) {
    fixSpans(child);
  }
  if (node.children.length) {
    if (node.virtual) {
      node.start = Math.min(node.start, node.children[0].start);
    }
    node.end = Math.max(node.end, node.children[node.children.length - 1].end);
  }
}

/**
 * `decodeAttrs` turns the flat attribute keys of a marker (`style.bold`,
 * `attribute.provider`, `data.src`, `data`) back into a Zero node's props.
 */
export function decodeAttrs(attrs: Record<string, string>): {
  style?: Record<string, unknown>;
  attribute?: Record<string, unknown>;
  data?: unknown;
} {
  const props: {
    style?: Record<string, unknown>;
    attribute?: Record<string, unknown>;
    data?: any;
  } = {};
  for (const [key, raw] of Object.entries(attrs)) {
    const value = JSON.parse(raw);
    if (value === null) {
      continue;
    }
    const dot = key.indexOf('.');
    const group = dot < 0 ? key : key.slice(0, dot);
    const name = dot < 0 ? '' : key.slice(dot + 1);
    if (group === 'style' || group === 'attribute') {
      props[group] = { ...(props[group] || {}), [name]: value };
    } else if (group === 'data') {
      if (!name) {
        props.data = value;
      } else {
        props.data = { ...(props.data || {}), [name]: value };
      }
    }
  }
  return props;
}

/**
 * `flattenProps` turns Zero node props (or an UPDATE delta) into flat
 * attribute writes. `null` means "remove the key".
 */
export function flattenProps(
  props: Record<string, any>,
  isText: boolean,
): Array<[string, ZeroAttrValue]> {
  const writes: Array<[string, ZeroAttrValue]> = [];
  for (const group of ['style', 'attribute']) {
    const values = props[group];
    if (values && typeof values === 'object') {
      for (const [k, v] of Object.entries(values)) {
        writes.push([`${group}.${k}`, v === null ? null : JSON.stringify(v)]);
      }
    }
  }
  if (!isText && props.data !== undefined) {
    if (props.data && typeof props.data === 'object') {
      for (const [k, v] of Object.entries(props.data)) {
        writes.push([`data.${k}`, v === null ? null : JSON.stringify(v)]);
      }
    } else {
      writes.push([
        'data',
        props.data === null ? null : JSON.stringify(props.data),
      ]);
    }
  }
  return writes;
}

/**
 * `toNodeJSON` converts a view node to the Zero JSON form.
 */
export function toNodeJSON(
  node: ZNode,
  schema: ZeroSchema = DefaultZeroSchema,
): ZeroNodeJSON {
  const props = decodeAttrs(node.attrs);
  const json: ZeroNodeJSON = { type: node.type };
  if (props.style && Object.keys(props.style).length) {
    json.style = props.style;
  }
  if (props.attribute && Object.keys(props.attribute).length) {
    json.attribute = props.attribute;
  }
  if (isTextType(schema, node.type)) {
    json.data = node.text;
  } else if (props.data !== undefined) {
    json.data = props.data;
  }
  if (isContainer(schema, node.type)) {
    json.children = node.children.map((c) => toNodeJSON(c, schema));
  }
  return json;
}

/**
 * `findNode` returns the view node at the given path.
 */
export function findNode(root: ZNode, path: Array<number>): ZNode | undefined {
  let node: ZNode | undefined = root;
  for (const idx of path) {
    node = node?.children[idx];
  }
  return node;
}

/**
 * `pathOf` returns the path of the given view node.
 */
export function pathOf(node: ZNode): Array<number> {
  const path: Array<number> = [];
  let cur = node;
  while (cur.parent) {
    path.unshift(cur.parent.children.indexOf(cur));
    cur = cur.parent;
  }
  return path;
}

/**
 * `insertIndexAt` returns the live index where a node inserted at
 * `children[idx]` of `parent` would start.
 */
export function insertIndexAt(parent: ZNode, idx: number): number {
  if (idx < parent.children.length) {
    return parent.children[idx].start;
  }
  if (parent.children.length) {
    return parent.children[parent.children.length - 1].end;
  }
  return parent.virtual ? parent.start : parent.start + 1;
}

/**
 * `resolveText` returns the text holder and offset for a text path, or
 * undefined when the path does not end inside a text holder.
 */
export function resolveText(
  root: ZNode,
  path: Array<number>,
  schema: ZeroSchema = DefaultZeroSchema,
): [ZNode, number] | undefined {
  const holder = findNode(root, path.slice(0, -1));
  if (!holder || !isTextType(schema, holder.type)) {
    return;
  }
  return [holder, path[path.length - 1]];
}

// ---------------------------------------------------------------------------
// Zero model applier — mirrors the semantics of the Zero editor's operations
// on JSON content. Used to check every event this type emits against the model
// it is meant to produce.
// ---------------------------------------------------------------------------

/**
 * `clone` returns a deep copy of a JSON value.
 */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * `nodeAt` returns the node at the given path.
 */
function nodeAt(content: ZeroNodeJSON, path: Array<number>): ZeroNodeJSON {
  let node = content;
  for (const idx of path) {
    if (!node.children || !node.children[idx]) {
      throw new Error(`no node at ${JSON.stringify(path)}`);
    }
    node = node.children[idx];
  }
  return node;
}

/**
 * `mergeProps` applies a delta to a style or attribute map; a null value
 * removes the key.
 */
function mergeProps(
  target: Record<string, any> | undefined,
  delta: Record<string, any>,
): Record<string, any> | undefined {
  const next: Record<string, any> = { ...(target || {}) };
  for (const [k, v] of Object.entries(delta)) {
    if (v === null) {
      delete next[k];
    } else {
      next[k] = v;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

/**
 * `applyZeroOperation` applies one Zero operation to the given JSON content
 * (in place) with the editor's semantics.
 */
export function applyZeroOperation(
  content: ZeroNodeJSON,
  op: ZeroOperation,
  schema: ZeroSchema = DefaultZeroSchema,
): void {
  const [kind, path, data] = op;
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  const parent = nodeAt(content, parentPath);
  const isText = isTextType(schema, parent.type);

  switch (kind) {
    case 'insert': {
      if (isText) {
        const text = String(parent.data ?? '');
        parent.data =
          text.substring(0, last) + String(data) + text.substring(last);
      } else {
        const nodes =
          typeof data === 'string'
            ? [{ type: textTypeFor(schema, parent.type), data }]
            : (clone(data) as Array<ZeroNodeJSON>);
        parent.children = parent.children || [];
        parent.children.splice(last, 0, ...nodes);
      }
      return;
    }
    case 'delete': {
      const count = (data as number) ?? 1;
      if (isText) {
        const text = String(parent.data ?? '');
        parent.data = text.substring(0, last) + text.substring(last + count);
      } else {
        parent.children!.splice(last, count);
      }
      return;
    }
    case 'split': {
      if (isText) {
        // split a text holder: [.., holder, offset]
        const grand = nodeAt(content, parentPath.slice(0, -1));
        const idx = parentPath[parentPath.length - 1];
        const text = String(parent.data ?? '');
        const right: ZeroNodeJSON = clone({
          ...parent,
          data: text.slice(last),
        });
        parent.data = text.slice(0, last);
        grand.children!.splice(idx + 1, 0, right);
      } else {
        const grand = nodeAt(content, parentPath.slice(0, -1));
        const idx = parentPath[parentPath.length - 1];
        const right: ZeroNodeJSON = clone({ ...parent, children: [] });
        right.children = parent.children!.splice(last);
        grand.children!.splice(idx + 1, 0, right);
      }
      return;
    }
    case 'merge': {
      const node = nodeAt(content, path);
      const prev = parent.children![last - 1];
      if (!prev) {
        throw new Error(`merge of the first child ${JSON.stringify(path)}`);
      }
      // The editor merges only nodes of the same type.
      if (prev.type !== node.type) {
        throw new Error(`merge of ${node.type} into ${prev.type}`);
      }
      if (isTextType(schema, node.type) && isTextType(schema, prev.type)) {
        // The editor merges two inline-texts only when their props agree;
        // otherwise the operation does nothing.
        if (
          stableStringify(prev.style ?? {}) !==
            stableStringify(node.style ?? {}) ||
          stableStringify(prev.attribute ?? {}) !==
            stableStringify(node.attribute ?? {})
        ) {
          throw new Error(`merge of inline-texts with different props`);
        }
        prev.data = String(prev.data ?? '') + String(node.data ?? '');
      } else {
        prev.children = [...(prev.children || []), ...(node.children || [])];
      }
      parent.children!.splice(last, 1);
      return;
    }
    case 'update': {
      const node = nodeAt(content, path);
      const props = data as Record<string, any>;
      if (props.style) {
        const style = mergeProps(node.style, props.style);
        if (style) {
          node.style = style;
        } else {
          delete node.style;
        }
      }
      if (props.attribute) {
        const attribute = mergeProps(node.attribute, props.attribute);
        if (attribute) {
          node.attribute = attribute;
        } else {
          delete node.attribute;
        }
      }
      if (props.data !== undefined && !isTextType(schema, node.type)) {
        if (props.data && typeof props.data === 'object') {
          node.data = mergeProps(node.data as any, props.data) ?? {};
        } else {
          node.data = props.data;
        }
      }
      return;
    }
  }
  throw new Error(`unknown zero operation ${kind}`);
}

/**
 * `stableStringify` stringifies with sorted keys and drops empty props.
 */
export function stableStringify(value: unknown): string {
  const norm = (v: any): any => {
    if (Array.isArray(v)) {
      return v.map(norm);
    }
    if (v && typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) {
        if (
          (k === 'style' || k === 'attribute') &&
          v[k] &&
          typeof v[k] === 'object' &&
          !Object.keys(v[k]).length
        ) {
          continue;
        }
        if (v[k] === undefined || k === 'id') {
          continue;
        }
        out[k] = norm(v[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

// ---------------------------------------------------------------------------
// Event compiler — turns a change of the live token sequence into the Zero
// operations that take the editor model from the old view to the new one.
// ---------------------------------------------------------------------------

/**
 * `CompileStats` counts how often the compiler had to fall back to replacing
 * whole top-level blocks because no natural operation reproduced the model.
 */
export const CompileStats = {
  steps: 0,
  fallbacks: 0,
  /** how changes were compiled: `same`, `text`, `narrow`, `window` */
  ways: {} as Record<string, number>,
  /** compile the whole document too and count where a window differs */
  verifyWindow: false,
  windows: 0,
  windowMismatches: [] as Array<{
    windowed: unknown;
    whole: unknown;
    way?: string;
  }>,
  samples: [] as Array<{
    from: unknown;
    to: unknown;
    tried: unknown;
    error?: string;
  }>,
};

/**
 * `contentOf` returns the model the given view entries describe.
 */
function contentOf(entries: Array<ViewEntry>, schema: ZeroSchema) {
  return toNodeJSON(buildView(entries, schema), schema);
}

/**
 * `replaceOps` returns the Zero operations that turn the children of `from`
 * into the children of `to`.
 */
function replaceOps(
  from: ZeroNodeJSON,
  to: ZeroNodeJSON,
): Array<ZeroOperation> {
  const a = from.children || [];
  const b = to.children || [];
  let s = 0;
  while (
    s < a.length &&
    s < b.length &&
    stableStringify(a[s]) === stableStringify(b[s])
  ) {
    s++;
  }
  let e = 0;
  while (
    e < a.length - s &&
    e < b.length - s &&
    stableStringify(a[a.length - 1 - e]) ===
      stableStringify(b[b.length - 1 - e])
  ) {
    e++;
  }
  const ops: Array<ZeroOperation> = [];
  const inserted = b.slice(s, b.length - e);
  if (inserted.length) {
    ops.push(['insert', [s], clone(inserted)]);
  }
  const removed = a.length - s - e;
  if (removed) {
    ops.push(['delete', [s + inserted.length], removed]);
  }
  return ops;
}

/**
 * `step` takes the first candidate operation list that reproduces the model
 * of `after` from the model of `before`, and falls back to a block
 * replacement when none does.
 */
function step(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  candidates: Array<Array<ZeroOperation>>,
  schema: ZeroSchema,
  out: Array<ZeroOperation>,
): void {
  CompileStats.steps++;
  const from = contentOf(before, schema);
  const to = contentOf(after, schema);
  const target = stableStringify(to);
  let error: string | undefined;
  const attrOnly = attrOnlyOps(from, to);
  // before replacing whole top-level blocks: change only the nodes that differ
  // (a cell added to a row, not the table)
  const diff = treeDiffOps(from, to, schema, []);
  for (const ops of [
    ...candidates,
    ...(attrOnly ? [attrOnly] : []),
    [],
    ...(diff && diff.length ? [diff] : []),
  ]) {
    const model = clone(from);
    try {
      for (const op of ops) {
        applyZeroOperation(model, op, schema);
      }
    } catch (e) {
      error = String(e);
      continue;
    }
    if (stableStringify(model) === target) {
      out.push(...ops);
      return;
    }
  }
  CompileStats.fallbacks++;
  if (CompileStats.samples.length < 40) {
    CompileStats.samples.push({ from, to, tried: candidates, error });
  }
  out.push(...replaceOps(from, to));
}

/**
 * `propsDelta` returns the UPDATE props that turn the props of `from` into
 * those of `to` (`null` removes a key; the data of a text node is its text and
 * is not a prop), or undefined when they are the same.
 */
function propsDelta(
  from: ZeroNodeJSON,
  to: ZeroNodeJSON,
  schema: ZeroSchema,
): Record<string, any> | undefined {
  const delta: Record<string, any> = {};
  const groupDelta = (
    a: Record<string, unknown> | undefined,
    b: Record<string, unknown> | undefined,
  ) => {
    const d: Record<string, unknown> = {};
    for (const k of new Set([
      ...Object.keys(a ?? {}),
      ...Object.keys(b ?? {}),
    ])) {
      if (!b || !(k in b)) {
        d[k] = null;
      } else if (stableStringify(a?.[k]) !== stableStringify(b[k])) {
        d[k] = b[k];
      }
    }
    return Object.keys(d).length ? d : undefined;
  };
  const style = groupDelta(from.style, to.style);
  if (style) {
    delta.style = style;
  }
  const attribute = groupDelta(from.attribute, to.attribute);
  if (attribute) {
    delta.attribute = attribute;
  }
  if (
    !isTextType(schema, from.type) &&
    stableStringify(from.data) !== stableStringify(to.data) &&
    to.data !== undefined
  ) {
    const objects =
      from.data &&
      typeof from.data === 'object' &&
      to.data &&
      typeof to.data === 'object';
    delta.data = objects
      ? (groupDelta(
          from.data as Record<string, unknown>,
          to.data as Record<string, unknown>,
        ) ?? {})
      : to.data;
  }
  return Object.keys(delta).length ? delta : undefined;
}

/**
 * `treeDiffOps` returns operations that turn the model `from` into `to` by
 * comparing them node by node: changed props become an UPDATE, changed text
 * a DELETE and INSERT inside the text node, and a run of children that
 * differs a DELETE and INSERT of just that run (a cell, not the whole table).
 * Undefined when a node changed its type. `step` verifies the result.
 */
function treeDiffOps(
  from: ZeroNodeJSON,
  to: ZeroNodeJSON,
  schema: ZeroSchema,
  path: Array<number>,
): Array<ZeroOperation> | undefined {
  if (from.type !== to.type) {
    return;
  }
  const ops: Array<ZeroOperation> = [];
  if (isTextType(schema, from.type)) {
    const a = Array.from(String(from.data ?? ''));
    const b = Array.from(String(to.data ?? ''));
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) {
      p++;
    }
    let q = 0;
    while (
      q < a.length - p &&
      q < b.length - p &&
      a[a.length - 1 - q] === b[b.length - 1 - q]
    ) {
      q++;
    }
    if (a.length - p - q > 0) {
      ops.push(['delete', [...path, p], a.length - p - q]);
    }
    if (b.length - p - q > 0) {
      ops.push(['insert', [...path, p], b.slice(p, b.length - q).join('')]);
    }
  }
  const delta = path.length ? propsDelta(from, to, schema) : undefined;
  if (delta) {
    ops.push(['update', path, delta]);
  }
  if (!isContainer(schema, from.type)) {
    return ops;
  }
  const ca = from.children ?? [];
  const cb = to.children ?? [];
  const same = (x: ZeroNodeJSON, y: ZeroNodeJSON) =>
    stableStringify(x) === stableStringify(y);
  let p = 0;
  while (p < ca.length && p < cb.length && same(ca[p], cb[p])) {
    p++;
  }
  let q = 0;
  while (
    q < ca.length - p &&
    q < cb.length - p &&
    same(ca[ca.length - 1 - q], cb[cb.length - 1 - q])
  ) {
    q++;
  }
  const ma = ca.slice(p, ca.length - q);
  const mb = cb.slice(p, cb.length - q);
  if (ma.length === mb.length) {
    ma.forEach((child, i) => {
      const sub = treeDiffOps(child, mb[i], schema, [...path, p + i]);
      if (sub) {
        ops.push(...sub);
      } else {
        ops.push(
          ['delete', [...path, p + i], 1],
          ['insert', [...path, p + i], [clone(mb[i])]],
        );
      }
    });
    return ops;
  }
  if (ma.length) {
    ops.push(['delete', [...path, p], ma.length]);
  }
  if (mb.length) {
    ops.push(['insert', [...path, p], clone(mb)]);
  }
  return ops;
}

/**
 * `attrOnlyOps` returns UPDATEs when the two models differ only in props
 * (same types, children and text), otherwise undefined.
 */
function attrOnlyOps(
  from: ZeroNodeJSON,
  to: ZeroNodeJSON,
): Array<ZeroOperation> | undefined {
  const ops: Array<ZeroOperation> = [];
  const props = (n: ZeroNodeJSON) => ({
    style: n.style,
    attribute: n.attribute,
    data: typeof n.data === 'string' ? undefined : n.data,
  });
  const delta = (a: Record<string, any> = {}, b: Record<string, any> = {}) => {
    const d: Record<string, any> = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) {
        d[k] = null;
      } else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        d[k] = b[k];
      }
    }
    return Object.keys(d).length ? d : undefined;
  };
  const walk = (
    a: ZeroNodeJSON,
    b: ZeroNodeJSON,
    path: Array<number>,
  ): boolean => {
    if (
      a.type !== b.type ||
      (typeof a.data === 'string' || typeof b.data === 'string'
        ? a.data !== b.data
        : false) ||
      (a.children?.length ?? -1) !== (b.children?.length ?? -1)
    ) {
      return false;
    }
    if (path.length) {
      const pa = props(a);
      const pb = props(b);
      const update: Record<string, any> = {};
      const style = delta(pa.style, pb.style);
      const attribute = delta(pa.attribute, pb.attribute);
      if (style) {
        update.style = style;
      }
      if (attribute) {
        update.attribute = attribute;
      }
      if (
        JSON.stringify(pa.data) !== JSON.stringify(pb.data) &&
        pb.data !== undefined
      ) {
        update.data =
          pb.data && typeof pb.data === 'object'
            ? delta(
                pa.data as Record<string, any>,
                pb.data as Record<string, any>,
              )
            : pb.data;
      }
      if (Object.keys(update).length) {
        ops.push(['update', path, update]);
      }
    }
    return (a.children ?? []).every((c, i) =>
      walk(c, b.children![i], [...path, i]),
    );
  };
  return walk(from, to, []) && ops.length ? ops : undefined;
}

/**
 * `attrDiff` returns the style and attribute changes from `from` to `to`.
 */
function attrDiff(
  from: Record<string, string>,
  to: Record<string, string>,
): Record<string, any> | undefined {
  const a = decodeAttrs(from);
  const b = decodeAttrs(to);
  const delta: Record<string, any> = {};
  for (const group of ['style', 'attribute'] as const) {
    const ga = a[group] || {};
    const gb = b[group] || {};
    const d: Record<string, any> = {};
    for (const k of new Set([...Object.keys(ga), ...Object.keys(gb)])) {
      if (!(k in gb)) {
        d[k] = null;
      } else if (JSON.stringify(ga[k]) !== JSON.stringify(gb[k])) {
        d[k] = gb[k];
      }
    }
    if (Object.keys(d).length) {
      delta[group] = d;
    }
  }
  if (
    JSON.stringify(a.data) !== JSON.stringify(b.data) &&
    b.data !== undefined
  ) {
    if (b.data && typeof b.data === 'object') {
      const da = (a.data as Record<string, any>) || {};
      const db = b.data as Record<string, any>;
      const d: Record<string, any> = {};
      for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) {
        if (!(k in db)) {
          d[k] = null;
        } else if (JSON.stringify(da[k]) !== JSON.stringify(db[k])) {
          d[k] = db[k];
        }
      }
      delta.data = d;
    } else {
      delta.data = b.data;
    }
  }
  return Object.keys(delta).length ? delta : undefined;
}

/**
 * `findByMarker` returns the view node of the given marker id.
 */
function findByMarker(root: ZNode, id: string): ZNode | undefined {
  if (root.markerID === id || root.group?.includes(id)) {
    return root;
  }
  for (const child of root.children) {
    const found = findByMarker(child, id);
    if (found) {
      return found;
    }
  }
  return;
}

/**
 * `sameSplitAs` keeps the identity of a folded split across an edit. When the
 * split that stands for a boundary changes (a concurrent same-place Enter
 * arrives before it in document order, or the standing one is undone and a
 * folded one takes over), the model is the same line: give the new standing
 * marker the old one's id, so the edit compiles to nothing instead of a merge
 * and a split (which would move the caret of whoever is on that line).
 */
function sameSplitAs(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
): Array<ViewEntry> {
  const afterIDs = new Set(after.map((e) => e.id));
  const beforeIDs = new Set(before.map((e) => e.id));
  const gone = new Map<string, string>(); // any id of a departed marker -> its id
  for (const e of before) {
    if (e.marker && !afterIDs.has(e.id)) {
      gone.set(e.id, e.id);
      e.aliases?.forEach((a) => gone.set(a, e.id));
    }
  }
  if (!gone.size) {
    return after;
  }
  return after.map((e) => {
    if (!e.marker || beforeIDs.has(e.id)) {
      return e;
    }
    const old = [e.id, ...(e.aliases ?? [])]
      .map((id) => gone.get(id))
      .find((id) => id !== undefined);
    if (old === undefined) {
      return e;
    }
    gone.forEach((v, k) => v === old && gone.delete(k));
    return { ...e, id: old };
  });
}

/**
 * `removedNodeEndingAt` returns the outermost real node, other than a text
 * holder, whose span ends at token `i` and whose every token is removed.
 * Text holders keep the finer path (a run of characters, then the marker).
 */
function removedNodeEndingAt(
  root: ZNode,
  i: number,
  work: Array<ViewEntry>,
  afterIDs: Set<string>,
  schema: ZeroSchema,
): ZNode | undefined {
  const removed = (node: ZNode) => {
    for (let k = node.start; k < node.end; k++) {
      if (afterIDs.has(work[k].id)) {
        return false;
      }
    }
    return true;
  };
  const visit = (node: ZNode): ZNode | undefined => {
    for (const child of node.children) {
      if (child.start > i || child.end <= i) {
        continue;
      }
      if (
        !child.virtual &&
        !isTextType(schema, child.type) &&
        child.end === i + 1 &&
        removed(child)
      ) {
        return child;
      }
      return visit(child);
    }
    return;
  };
  return visit(root);
}

/**
 * `shiftOps` moves operations on a window's top-level nodes to the document.
 */
function shiftOps(
  ops: Array<ZeroOperation>,
  offset: number,
): Array<ZeroOperation> {
  if (!offset) {
    return ops;
  }
  return ops.map(([kind, path, data]) => {
    const moved = [path[0] + offset, ...path.slice(1)];
    return data === undefined ? [kind, moved] : [kind, moved, data];
  });
}

/**
 * `compileEdit` returns the Zero operations that turn the view of `before`
 * into the view of `after`, where `after` is `before` with some tokens removed
 * and one or more runs of tokens inserted (what one edit of the CRDT does).
 */
export function compileEdit(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  schema: ZeroSchema = DefaultZeroSchema,
): Array<ZeroOperation> {
  return compileWhole(before, after, schema);
}

/**
 * `ZeroModelChange` is what a change did to the model: the view entries of a
 * run of whole top-level nodes before and after it, `offset` top-level nodes
 * in front of them (see `ZeroBlockIndex`). Checking, the whole document too.
 */
export type ZeroModelChange = {
  before: Array<ViewEntry>;
  after: Array<ViewEntry>;
  offset: number;
  /** some rows of a table: the table marker and rows from `rows` on */
  rows?: number;
  widen?: () => { before: Array<ViewEntry>; after: Array<ViewEntry> };
  wholeBefore?: Array<ViewEntry>;
  wholeAfter?: Array<ViewEntry>;
};

/**
 * `sameEntry` tells whether two view entries are the same token holding the
 * same content: for a marker, its shape, attributes, registers and folded
 * markers too (what `buildView` reads).
 */
function sameEntry(x: ViewEntry, y: ViewEntry): boolean {
  if (x === y) {
    return true;
  }
  if (x.id !== y.id || x.char !== y.char || x.scope !== y.scope) {
    return false;
  }
  const a = x.marker;
  const b = y.marker;
  if (!a || !b) {
    return !a && !b;
  }
  if (
    a.type !== b.type ||
    a.depth !== b.depth ||
    a.boundary !== b.boundary ||
    (x.aliases ?? []).join() !== (y.aliases ?? []).join()
  ) {
    return false;
  }
  const ka = Object.keys(a.registers ?? {});
  if (ka.length !== Object.keys(b.registers ?? {}).length) {
    return false;
  }
  for (const k of ka) {
    const ra = a.registers![k];
    const rb = b.registers![k];
    if (
      !rb ||
      ra.value !== rb.value ||
      (ra.at !== rb.at && (ra.at.after(rb.at) || rb.at.after(ra.at)))
    ) {
      return false;
    }
  }
  const aa = Object.keys(a.attrs);
  if (aa.length !== Object.keys(b.attrs).length) {
    return false;
  }
  return aa.every((k) => a.attrs[k] === b.attrs[k]);
}

/**
 * `Difference` is where two runs of view entries differ: [from, beforeEnd)
 * of `before` became [from, afterEnd) of `after`, with their models.
 */
type Difference = {
  from: number;
  beforeEnd: number;
  afterEnd: number;
  viewBefore: ZNode;
  viewAfter: ZNode;
};

/**
 * `differenceOf` returns where `before` and `after` differ, or undefined
 * when they hold the same tokens.
 */
function differenceOf(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  schema: ZeroSchema,
): Difference | undefined {
  const n = Math.min(before.length, after.length);
  let p = 0;
  while (p < n && sameEntry(before[p], after[p])) {
    p++;
  }
  if (p === before.length && p === after.length) {
    return;
  }
  let q = 0;
  while (
    q < n - p &&
    sameEntry(before[before.length - 1 - q], after[after.length - 1 - q])
  ) {
    q++;
  }
  return {
    from: p,
    beforeEnd: before.length - q,
    afterEnd: after.length - q,
    viewBefore: buildView(before, schema),
    viewAfter: buildView(after, schema),
  };
}

/**
 * `holderOver` returns the text node whose characters cover [from, to).
 */
function holderOver(
  node: ZNode,
  from: number,
  to: number,
  schema: ZeroSchema,
): ZNode | undefined {
  for (const child of node.children) {
    if (child.start > from) {
      break;
    }
    if (to > child.end) {
      continue;
    }
    if (isTextType(schema, child.type)) {
      if (
        child.textStart <= from &&
        to <= child.textStart + child.text.length
      ) {
        return child;
      }
      continue;
    }
    const found = holderOver(child, from, to, schema);
    if (found) {
      return found;
    }
  }
  return;
}

/**
 * `plainAncestry` tells whether every ancestor of a node is a real node and
 * no table among them pads a row (see `padded`).
 */
function plainAncestry(node: ZNode, schema: ZeroSchema): boolean {
  for (let n = node.parent; n && n.parent; n = n.parent) {
    if (n.virtual || padded(n, schema)) {
      return false;
    }
  }
  return true;
}

/**
 * `textOps` returns the operations of a change that only removed and
 * inserted characters of one text node, the ones `compileWhole` arrives at
 * (checked against it in tests). Undefined for any other change.
 */
function textOps(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  d: Difference,
  schema: ZeroSchema,
): Array<ZeroOperation> | undefined {
  const { from, beforeEnd, afterEnd } = d;
  // one run gone and one run new: nothing between them that stayed
  const ids = new Set<string>();
  for (let i = from; i < beforeEnd; i++) {
    if (before[i].char === undefined) {
      return;
    }
    ids.add(before[i].id);
  }
  for (let i = from; i < afterEnd; i++) {
    if (after[i].char === undefined || ids.has(after[i].id)) {
      return;
    }
  }
  // markers of one boundary merge when adjacent (see `buildView`): the
  // characters must not come between such two, nor leave them adjacent
  const left = before[from - 1]?.marker?.boundary;
  if (
    left &&
    (before[beforeEnd]?.marker?.boundary === left ||
      after[afterEnd]?.marker?.boundary === left)
  ) {
    return;
  }
  const ops: Array<ZeroOperation> = [];
  if (beforeEnd > from) {
    const holder = holderOver(d.viewBefore, from, beforeEnd, schema);
    // a real text node, still there after (a virtual one may vanish)
    if (!holder || holder.virtual || !plainAncestry(holder, schema)) {
      return;
    }
    const path = pathOf(holder);
    if (findNode(d.viewAfter, path)?.markerID !== holder.markerID) {
      return;
    }
    ops.push(['delete', [...path, from - holder.textStart], beforeEnd - from]);
  }
  if (afterEnd > from) {
    const holder = holderOver(d.viewAfter, from, afterEnd, schema);
    if (!holder || holder.virtual || !plainAncestry(holder, schema)) {
      return;
    }
    const path = pathOf(holder);
    const prior = findNode(d.viewBefore, path);
    if (
      !prior ||
      !isTextType(schema, prior.type) ||
      prior.markerID !== holder.markerID
    ) {
      return;
    }
    ops.push([
      'insert',
      [...path, from - holder.textStart],
      after
        .slice(from, afterEnd)
        .map((e) => e.char)
        .join(''),
    ]);
  }
  return ops;
}

/**
 * `Narrowed` is a change cut down to the children of the deepest node
 * holding it: the window's entries behind the markers of that node and its
 * ancestors, and how to take operations on it back to the window.
 */
type Narrowed = {
  before: Array<ViewEntry>;
  after: Array<ViewEntry>;
  back: (ops: Array<ZeroOperation>) => Array<ZeroOperation> | undefined;
};

/**
 * `padded` tells whether a table has an empty cell for a column one of its
 * rows missed (see `padColumns`): which columns there are depends on every
 * row, so its rows are not compiled apart.
 */
export function padded(node: ZNode, schema: ZeroSchema): boolean {
  if (node.type !== schema.grid?.table) {
    return false;
  }
  return node.children.some(
    (row) => row.virtual || row.children.some((cell) => cell.virtual),
  );
}

/**
 * `narrow` cuts a change down to the children of the deepest real node
 * that holds it in both models (a row, a cell, a paragraph): the operations
 * of those children with the node's markers in front are the operations of
 * the window. Undefined when the change is not inside such a node.
 */
function narrow(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  d: Difference,
  schema: ZeroSchema,
): Narrowed | undefined {
  const { from, beforeEnd, afterEnd } = d;
  const delta = after.length - before.length;
  const chain: Array<[ZNode, number]> = [];
  let nb = d.viewBefore;
  let na = d.viewAfter;
  for (;;) {
    let k = -1;
    for (let i = 0; i < nb.children.length; i++) {
      const c = nb.children[i];
      if (c.start >= from) {
        break;
      }
      if (beforeEnd <= c.end) {
        k = i;
        break;
      }
    }
    const c = nb.children[k];
    const c2 = na.children[k];
    if (
      !c ||
      !c2 ||
      c.virtual ||
      c2.virtual ||
      !c.markerID ||
      c2.markerID !== c.markerID ||
      c2.start !== c.start ||
      c2.end !== c.end + delta ||
      afterEnd > c2.end ||
      isTextType(schema, c.type) ||
      !c.children.length ||
      before[c.start]?.id !== c.markerID ||
      padded(c, schema) ||
      padded(c2, schema)
    ) {
      break;
    }
    chain.push([c, k]);
    nb = c;
    na = c2;
  }
  if (!chain.length) {
    return;
  }
  // the children of the node, from the one holding the token before the
  // change to the one after it
  const cb = nb.children;
  const ca = na.children;
  let k0 = 0;
  for (let i = 0; i < cb.length && cb[i].start <= from - 1; i++) {
    k0 = i;
  }
  const start = cb[k0]?.start;
  if (start === undefined || start > from || ca[k0]?.start !== start) {
    return;
  }
  let endBefore = nb.end;
  let endAfter = na.end;
  for (const c of cb) {
    if (c.start > start && c.start >= beforeEnd) {
      if (ca.some((x) => x.start === c.start + delta)) {
        endBefore = c.start;
        endAfter = c.start + delta;
      }
      break;
    }
  }
  if (!ca.some((x) => x.start >= start && x.start < endAfter)) {
    return;
  }
  // `compileWhole` takes a new marker with the tokens behind it down to the
  // next marker no deeper than it: a deeper one right behind the window (an
  // orphan left by a re-inserted node) would join it there and not here
  const known = new Set(before.slice(start, endBefore).map((e) => e.id));
  let newest = Infinity;
  for (let i = start; i < endAfter; i++) {
    const m = after[i].marker;
    if (m && !known.has(after[i].id)) {
      newest = Math.min(newest, m.depth);
    }
  }
  const next = after[endAfter]?.marker;
  if (next && next.depth > newest) {
    return;
  }
  const head = chain.map(([c]) => before[c.start]);
  const prefix = chain.map(([, k]) => k);
  const depth = chain.length;
  return {
    before: [...head, ...before.slice(start, endBefore)],
    after: [...head, ...after.slice(start, endAfter)],
    back: (ops) => {
      const out: Array<ZeroOperation> = [];
      for (const [kind, path, data] of ops) {
        if (path.length <= depth || path.slice(0, depth).some((x) => x !== 0)) {
          return;
        }
        const moved = [...prefix, path[depth] + k0, ...path.slice(depth + 1)];
        out.push(data === undefined ? [kind, moved] : [kind, moved, data]);
      }
      return out;
    },
  };
}

/**
 * `countWay` counts how a change was compiled (tests read it).
 */
function countWay(way: string): void {
  CompileStats.ways[way] = (CompileStats.ways[way] ?? 0) + 1;
}

/**
 * `compileChange` returns the Zero operations of an edit of the tokens.
 * Characters of one text node: the operations straight away. Otherwise the
 * window is cut down to the deepest node holding the change, so the
 * compiler's checks run over a row or a paragraph, not a whole table.
 */
export function compileChange(
  change: ZeroModelChange | undefined,
  schema: ZeroSchema = DefaultZeroSchema,
): Array<ZeroOperation> {
  if (!change) {
    return [];
  }
  const [ops, way] = compileRows(change, (before, after) =>
    compileWindow(before, after, schema),
  );
  countWay(way);
  if (change.wholeBefore && change.wholeAfter) {
    CompileStats.windows++;
    verifyWindowed(
      ops,
      compileWhole(change.wholeBefore, change.wholeAfter, schema),
      way,
    );
  }
  return ops;
}

/**
 * `compileWindow` compiles a window of whole nodes: characters of one text
 * node straight away, otherwise cut down to the deepest node holding the
 * change (see `narrow`), otherwise as it is.
 */
function compileWindow(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  schema: ZeroSchema,
): [Array<ZeroOperation>, string] {
  const d = differenceOf(before, after, schema);
  if (!d) {
    return [[], 'same'];
  }
  const text = textOps(before, after, d, schema);
  if (text) {
    return [text, 'text'];
  }
  const n = narrow(before, after, d, schema);
  const narrowed = n && n.back(compileWhole(n.before, n.after, schema));
  if (narrowed) {
    return [narrowed, 'narrow'];
  }
  return [compileWhole(before, after, schema), 'window'];
}

/**
 * `compileRows` compiles a change with `compile`, taking the operations of
 * some rows of a table to the table (or compiling the whole table when they
 * reach beyond its rows), then to the document.
 */
function compileRows(
  change: ZeroModelChange,
  compile: (
    before: Array<ViewEntry>,
    after: Array<ViewEntry>,
  ) => [Array<ZeroOperation>, string],
): [Array<ZeroOperation>, string] {
  let [ops, way] = compile(change.before, change.after);
  if (change.rows !== undefined) {
    const base = change.rows;
    const moved: Array<ZeroOperation> = [];
    for (const [kind, path, data] of ops) {
      if (path.length < 2 || path[0] !== 0) {
        const wide = change.widen!();
        [ops, way] = compile(wide.before, wide.after);
        return [shiftOps(ops, change.offset), `${way}:wide`];
      }
      const p = [0, path[1] + base, ...path.slice(2)];
      moved.push(data === undefined ? [kind, p] : [kind, p, data]);
    }
    ops = moved;
    way = `${way}:rows`;
  }
  return [shiftOps(ops, change.offset), way];
}

/**
 * `compileStyleChange` returns the UPDATE of an attribute change.
 */
export function compileStyleChange(
  change: ZeroModelChange | undefined,
  markerID: string,
  schema: ZeroSchema = DefaultZeroSchema,
): Array<ZeroOperation> {
  if (!change) {
    return [];
  }
  const [ops, way] = compileRows(change, (before, after) => {
    const d = differenceOf(before, after, schema);
    if (!d) {
      return [[], 'same'];
    }
    const n = narrow(before, after, d, schema);
    const narrowed =
      n && n.back(compileStyleWhole(n.before, n.after, markerID, schema));
    if (narrowed) {
      return [narrowed, 'narrow'];
    }
    return [compileStyleWhole(before, after, markerID, schema), 'window'];
  });
  countWay(way);
  if (change.wholeBefore && change.wholeAfter) {
    CompileStats.windows++;
    verifyWindowed(
      ops,
      compileStyleWhole(
        change.wholeBefore,
        change.wholeAfter,
        markerID,
        schema,
      ),
      way,
    );
  }
  return ops;
}

/**
 * `verifyWindowed` records where a windowed compile differs from compiling
 * the whole document (`CompileStats.verifyWindow`).
 */
function verifyWindowed(
  windowed: Array<ZeroOperation>,
  whole: Array<ZeroOperation>,
  way?: string,
): void {
  if (JSON.stringify(windowed) !== JSON.stringify(whole)) {
    CompileStats.windowMismatches.push({ windowed, whole, way });
  }
}

/**
 * `compileWhole` compiles an edit over all of the given entries.
 */
function compileWhole(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  schema: ZeroSchema,
): Array<ZeroOperation> {
  const out: Array<ZeroOperation> = [];
  after = sameSplitAs(before, after);
  const afterIDs = new Set(after.map((e) => e.id));
  const beforeIDs = new Set(before.map((e) => e.id));

  // 01. deletions, right to left
  let work = before.slice();
  for (let i = work.length - 1; i >= 0; i--) {
    if (afterIDs.has(work[i].id)) {
      continue;
    }
    const view = buildView(work, schema);
    // A whole node removed with everything inside it is one DELETE, as the
    // editor does it. Taking it token by token would pass through models the
    // editor never holds -- an image whose inline-image is gone gets a
    // virtual inline-image without data, which no editor accepts.
    const whole = removedNodeEndingAt(view, i, work, afterIDs, schema);
    if (whole) {
      const next = work.slice(0, whole.start).concat(work.slice(i + 1));
      const path = pathOf(whole);
      const candidates: Array<Array<ZeroOperation>> = [[['delete', path, 1]]];
      const takeover = findNode(buildView(next, schema), path);
      if (takeover && takeover.virtual) {
        candidates.push([
          ['delete', path, 1],
          ['insert', path, [toNodeJSON(takeover, schema)]],
        ]);
      }
      step(work, next, candidates, schema, out);
      work = next;
      i = whole.start;
      continue;
    }
    const entry = work[i];
    if (entry.char !== undefined) {
      // the maximal run of removed characters ending at i inside one holder
      let j = i;
      while (
        j - 1 >= 0 &&
        work[j - 1].char !== undefined &&
        !afterIDs.has(work[j - 1].id)
      ) {
        j--;
      }
      const holder = findHolder(view, i);
      if (holder) {
        j = Math.max(j, holder.textStart);
      }
      const next = work.slice(0, j).concat(work.slice(i + 1));
      const ops: Array<ZeroOperation> = [];
      if (holder) {
        ops.push([
          'delete',
          [...pathOf(holder), j - holder.textStart],
          i - j + 1,
        ]);
      }
      step(work, next, [ops], schema, out);
      work = next;
      i = j;
      continue;
    }
    const node = findByMarker(view, entry.id)!;
    const next = work.slice(0, i).concat(work.slice(i + 1));
    const path = pathOf(node);
    const candidates: Array<Array<ZeroOperation>> = [];
    if (path[path.length - 1] > 0) {
      // The chars of a deleted inline marker join the inline before it and
      // take its props. The editor merges only inlines whose props agree, so
      // first give the right one the left one's props.
      const ops: Array<ZeroOperation> = [];
      const prev = node.parent!.children[path[path.length - 1] - 1];
      if (isTextType(schema, node.type) && isTextType(schema, prev.type)) {
        const delta = attrDiff(node.attrs, prev.attrs);
        if (delta) {
          ops.push(['update', path, delta]);
        }
      }
      ops.push(['merge', path]);
      candidates.push(ops);
      // a block merge whose seam inlines join as well (the moved first inline
      // had no marker of its own): MERGE [b] then MERGE [b-1, k]
      if (
        !isTextType(schema, node.type) &&
        prev.children.length &&
        node.children.length
      ) {
        const prevPath = pathOf(prev);
        const k = prev.children.length;
        const left = prev.children[k - 1];
        const right = node.children[0];
        const seam: Array<ZeroOperation> = [['merge', path]];
        if (isTextType(schema, left.type) && isTextType(schema, right.type)) {
          const delta = attrDiff(right.attrs, left.attrs);
          if (delta) {
            seam.push(['update', [...prevPath, k], delta]);
          }
        }
        seam.push(['merge', [...prevPath, k]]);
        candidates.push(seam);
      }
    }
    candidates.push([['delete', path, 1]]);
    // a virtual node of the schema's default takes the deleted node's place
    const takeover = findNode(buildView(next, schema), path);
    if (takeover && takeover.type === node.type) {
      const delta = attrDiff(node.attrs, takeover.attrs);
      candidates.push(delta ? [['update', path, delta]] : []);
    }
    step(work, next, candidates, schema, out);
    work = next;
  }

  // 02. insertions, left to right
  const isOld = (e: ViewEntry) => beforeIDs.has(e.id);
  let w = 0; // position in `work` aligned with `a`
  for (let a = 0; a < after.length; ) {
    if (isOld(after[a])) {
      a++;
      w++;
      continue;
    }
    const entry = after[a];
    if (entry.char !== undefined) {
      let b = a;
      while (
        b < after.length &&
        !isOld(after[b]) &&
        after[b].char !== undefined
      ) {
        b++;
      }
      const run = after.slice(a, b);
      const next = work.slice(0, w).concat(run, work.slice(w));
      const view = buildView(next, schema);
      const holder = findHolder(view, w);
      const ops: Array<ZeroOperation> = [];
      if (holder) {
        const viewBefore = buildView(work, schema);
        const prior = findNode(viewBefore, pathOf(holder));
        const existed =
          !!prior &&
          isTextType(schema, prior.type) &&
          prior.markerID === holder.markerID;
        if (!existed) {
          ops.push([
            'insert',
            pathOf(holder),
            [{ type: holder.type, data: run.map((e) => e.char).join('') }],
          ]);
        } else {
          ops.push([
            'insert',
            [...pathOf(holder), w - holder.textStart],
            run.map((e) => e.char).join(''),
          ]);
        }
      }
      step(work, next, [ops], schema, out);
      work = next;
      w += run.length;
      a = b;
      continue;
    }

    // a marker: a fresh subtree when every token of its span is new
    const depth = entry.marker!.depth;
    let spanEnd = a + 1;
    while (
      spanEnd < after.length &&
      !(after[spanEnd].marker && after[spanEnd].marker!.depth <= depth)
    ) {
      spanEnd++;
    }
    const span = after.slice(a, spanEnd);
    if (span.every((e) => !isOld(e))) {
      const next = work.slice(0, w).concat(span, work.slice(w));
      const view = buildView(next, schema);
      const node = findByMarker(view, entry.id)!;
      step(
        work,
        next,
        [[['insert', pathOf(node), [toNodeJSON(node, schema)]]]],
        schema,
        out,
      );
      work = next;
      w += span.length;
      a = spanEnd;
      continue;
    }

    // otherwise a split: take the run of new markers in front of old tokens
    let b = a;
    while (b < after.length && !isOld(after[b]) && after[b].marker) {
      b++;
    }
    const run = after.slice(a, b);
    const next = work.slice(0, w).concat(run, work.slice(w));
    const candidates = splitOps(
      buildView(work, schema),
      buildView(next, schema),
      w,
      run,
      schema,
    );
    step(work, next, candidates, schema, out);
    work = next;
    w += run.length;
    a = b;
  }

  // 03. what tokens alone do not show: a folded split's markers carry
  // registers, so adding or removing one can change the merged props of a
  // node whose tokens stay (see `dealias`)
  if (
    stableStringify(contentOf(work, schema)) !==
    stableStringify(contentOf(after, schema))
  ) {
    step(work, after, [], schema, out);
  }

  return out;
}

/**
 * `findHolder` returns the text holder that covers the given text index.
 */
function findHolder(view: ZNode, index: number): ZNode | undefined {
  return collectHolders(view).find(
    (h) => h.textStart <= index && index < h.textStart + h.text.length,
  );
}

/**
 * `collectHolders` returns the leaves of the view in document order.
 */
function collectHolders(node: ZNode, acc: Array<ZNode> = []): Array<ZNode> {
  for (const child of node.children) {
    if (child.children.length) {
      collectHolders(child, acc);
    } else {
      acc.push(child);
    }
  }
  return acc;
}

/**
 * `splitOps` expresses the insertion of a run of new markers at `x` as the
 * cascade of SPLITs the editor itself issues for it, followed by UPDATEs that
 * give the created nodes the markers' attributes. Returns candidates, most
 * natural first.
 */
function splitOps(
  view: ZNode,
  nextView: ZNode,
  x: number,
  run: Array<ViewEntry>,
  schema: ZeroSchema,
): Array<Array<ZeroOperation>> {
  const depths = new Set(run.map((e) => e.marker!.depth));
  const minDepth = Math.min(...depths);
  const updates = (chain: Array<ZNode>): Array<ZeroOperation> => {
    const ops: Array<ZeroOperation> = [];
    for (const e of run) {
      const node = findByMarker(nextView, e.id);
      if (!node) {
        continue;
      }
      const original = chain.find((n) => n.depth === node.depth);
      const delta = attrDiff(original ? original.attrs : {}, node.attrs);
      if (delta) {
        ops.push(['update', pathOf(node), delta]);
      }
    }
    return ops;
  };
  const cascade = (chain: Array<ZNode>): Array<ZeroOperation> => {
    const ops: Array<ZeroOperation> = [];
    for (const node of chain) {
      const path = pathOf(node);
      if (isTextType(schema, node.type)) {
        ops.push(['split', [...path, x - node.textStart]]);
      } else {
        const j = node.children.findIndex((c) => c.start >= x);
        ops.push(['split', [...path, j < 0 ? node.children.length : j]]);
      }
    }
    return [...ops, ...updates(chain)];
  };

  // nodes containing x, deepest first; a node that ENDS at x is split too
  // when the run creates a node of its depth (Enter at the end of a text)
  const strict: Array<ZNode> = [];
  const loose: Array<ZNode> = [];
  let node = view;
  for (;;) {
    const inside = node.children.find((c) => c.start < x && x < c.end);
    const ending = node.children.find((c) => c.start < x && x === c.end);
    const child =
      inside ?? (ending && depths.has(ending.depth) ? ending : undefined);
    if (!child) {
      break;
    }
    loose.unshift(child);
    if (inside) {
      strict.unshift(child);
    }
    node = child;
  }
  const keep = (chain: Array<ZNode>) =>
    chain.filter((n) => n.depth >= minDepth);
  const candidates: Array<Array<ZeroOperation>> = [];
  if (keep(loose).length) {
    candidates.push(cascade(keep(loose)));
  }
  if (keep(strict).length && keep(strict).length !== keep(loose).length) {
    candidates.push(cascade(keep(strict)));
  }
  // A run that starts exactly where a virtual node of the same type starts
  // only gives that node a marker: an UPDATE, not a split.
  candidates.push(updates([]));
  return candidates;
}

/**
 * `compileStyle` returns the UPDATE for an attribute change of one marker.
 */
export function compileStyle(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  markerID: string,
  schema: ZeroSchema = DefaultZeroSchema,
): Array<ZeroOperation> {
  return compileStyleWhole(before, after, markerID, schema);
}

/**
 * `compileStyleWhole` compiles a style change over all of the given entries.
 */
function compileStyleWhole(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  markerID: string,
  schema: ZeroSchema,
): Array<ZeroOperation> {
  const out: Array<ZeroOperation> = [];
  const prev = buildView(before, schema);
  const next = buildView(after, schema);
  const node = findByMarker(next, markerID);
  const old = findByMarker(prev, markerID);
  // a range write may change other nodes than its own, or only those (the
  // marker's own register kept a newer value): `step` finds them
  const delta = node && old ? attrDiff(old.attrs, node.attrs) : undefined;
  step(
    before,
    after,
    delta ? [[['update', pathOf(node!), delta]]] : [],
    schema,
    out,
  );
  return out;
}
