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
    if (entry.marker && entry.marker.depth <= hideDepth) {
      hideDepth = Infinity;
    }
    if (hideDepth !== Infinity) {
      continue;
    }
    if (entry.marker) {
      // a second child of a `single` type: left out with its span (a split
      // marker is never one: splits copy a node the parent already holds)
      const depth = entry.marker.depth;
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

  const open = (
    type: string,
    depth: number,
    at: number,
    attrs: Record<string, string> = {},
    markerID?: string,
  ): ZNode => {
    const parent = top();
    const node: ZNode = {
      type,
      depth,
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

  const settle = (type: string, at: number) => {
    for (let guard = 0; guard < 64; guard++) {
      const parent = top();
      if (accepts(schema, parent.type, type)) {
        return;
      }
      const fill = isContainer(schema, parent.type)
        ? fillFor(parent.type, type)
        : undefined;
      if (fill) {
        open(fill, parent.depth + 1, at);
        continue;
      }
      if (parent === root) {
        return;
      }
      close(at);
    }
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.marker) {
      const { type, attrs } = entry.marker;
      const depth = Math.max(1, entry.marker.depth);
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
      while (top().depth >= depth) {
        close(i);
      }
      settle(type, i);
      const node = open(type, top().depth + 1, i, attrs, entry.id);
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
    if (!holder.text.length && holder.virtual) {
      holder.textStart = i;
    }
    holder.text += entry.char;
    for (const n of stack) {
      n.end = i + 1;
    }
  }
  while (stack.length > 1) {
    close(entries.length);
  }
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
  for (const ops of [...candidates, ...(attrOnly ? [attrOnly] : []), []]) {
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
 * `compileEdit` returns the Zero operations that turn the view of `before`
 * into the view of `after`, where `after` is `before` with some tokens removed
 * and one or more runs of tokens inserted (what one edit of the CRDT does).
 */
export function compileEdit(
  before: Array<ViewEntry>,
  after: Array<ViewEntry>,
  schema: ZeroSchema = DefaultZeroSchema,
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
  const out: Array<ZeroOperation> = [];
  const prev = buildView(before, schema);
  const next = buildView(after, schema);
  const node = findByMarker(next, markerID);
  const old = findByMarker(prev, markerID);
  if (!node || !old) {
    return out;
  }
  const delta = attrDiff(old.attrs, node.attrs);
  step(
    before,
    after,
    delta ? [[['update', pathOf(node), delta]]] : [],
    schema,
    out,
  );
  return out;
}
