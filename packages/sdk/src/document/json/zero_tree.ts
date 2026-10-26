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
 * PROTOTYPE — `ZeroTree`, the JSON-side handle of `CRDTZeroTree`.
 *
 * Its edit API IS the Zero editor's operation list: a binding passes
 * `data.getLastOperations()` unchanged. A SPLIT cascade (Enter is
 * `[split [b,i,o]] [split [b,i+1]]`, one level more inside a link or a table
 * cell) becomes ONE insertion of the markers it creates.
 */

import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import {
  CRDTZeroTree,
  ColumnKeys,
  ZeroMarker,
  ZeroStyleRange,
  ZeroTokens,
  toTokens,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree';
import {
  ZNode,
  ZeroNodeJSON,
  ZeroOperation,
  ZeroRegionPrefix,
  findNode,
  pathOf,
  flattenProps,
  insertIndexAt,
  isTextType,
  resolveText,
  textTypeFor,
  toNodeJSON,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import {
  ZeroTreeEditOperation,
  ZeroTreeStyleOperation,
} from '@yorkie-js/sdk/src/document/operation/zero_tree_operation';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import {
  RichOperation,
  richToZero,
  toRichContent,
} from '@yorkie-js/sdk/src/document/json/zero_tree_rich';
import {
  RGATreeSplitPos,
  RGATreeSplitPosStruct,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import type { ZeroAttrValue } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

/**
 * `ZeroTreePosStructRange` is a range of identity positions (survives
 * concurrent edits; used for remote cursors and undo selections).
 */
export type ZeroTreePosStructRange = [
  RGATreeSplitPosStruct,
  RGATreeSplitPosStruct,
];

/**
 * `ZeroTreeCrdtNode` is a node of `ZeroTree.toCrdtView` (the shape devtools
 * read from a Tree's index nodes).
 */
export type ZeroTreeCrdtNode = {
  isText: boolean;
  value: string;
  type?: string;
  id: { getCreatedAt(): TimeTicket; getOffset(): number };
  attrs?: { getNodeMapByKey(): Map<string, unknown> };
  children: Array<ZeroTreeCrdtNode>;
  allChildren?: Array<ZeroTreeCrdtNode>;
  isRemoved?: boolean;
  removedAt?: TimeTicket;
  virtual?: boolean;
};

/**
 * `childDepth` is the marker depth a new child of `parent` is written with.
 * Under a virtual parent squeezed in for a marker, that marker's depth: a
 * sibling of it stays in the parent (children written deeper elsewhere may
 * have joined it too). Otherwise that of its written children when it has
 * some, else the next depth below it.
 */
const childDepth = (parent: ZNode): number => {
  if (parent.anchor !== undefined) {
    return parent.anchor;
  }
  const written = parent.children.filter((c) => !c.virtual).map((c) => c.level);
  return written.length ? Math.min(...written) : Math.floor(parent.level) + 1;
};

/**
 * `markerDepth` is the depth a marker standing for `node` is written with:
 * its level, between two whole depths for a virtual node squeezed in below
 * the marker it was opened for (see `ZeroLevelKey`).
 */
const markerDepth = (node: ZNode): number => node.level;

/**
 * `emptiedKey` names a container for `ZeroTree.emptied`: its marker id, the
 * path of a virtual one, or '' for the root.
 */
const emptiedKey = (node: ZNode): string =>
  node.markerID ?? (node.parent ? `virtual:${pathOf(node).join(',')}` : '');

const clamp = (offset: number, length: number): number =>
  Math.min(Math.max(offset, 0), length);

/**
 * `isParentSplit` tells whether `outer` splits the parent of the text split
 * at `inner` right after it, which is how one Enter is written.
 */
function isParentSplit(inner: Array<number>, outer: Array<number>): boolean {
  if (outer.length !== inner.length - 1 || outer.length < 1) {
    return false;
  }
  for (let i = 0; i < outer.length - 1; i++) {
    if (outer[i] !== inner[i]) {
      return false;
    }
  }
  return outer[outer.length - 1] === inner[inner.length - 2] + 1;
}

/**
 * `ZeroTree` is a Zero document `content` shared through Yorkie.
 */
export class ZeroTree {
  private context?: ChangeContext;
  private tree?: CRDTZeroTree;
  private initialChildren: Array<ZeroNodeJSON>;

  constructor(content?: ZeroNodeJSON | Array<ZeroNodeJSON>) {
    this.initialChildren = Array.isArray(content)
      ? content
      : (content?.children ?? []);
  }

  /**
   * `initialize` binds this tree to the change context and its CRDT.
   */
  public initialize(context: ChangeContext, tree: CRDTZeroTree): void {
    this.context = context;
    this.tree = tree;
  }

  /**
   * `getInitialChildren` returns the content given at construction.
   */
  public getInitialChildren(): Array<ZeroNodeJSON> {
    return this.initialChildren;
  }

  /**
   * `getID` returns the creation time of this tree.
   */
  public getID(): TimeTicket {
    return this.ensure()[1].getID();
  }

  /**
   * `toZeroContent` returns the Zero `content` node of the current state.
   */
  public toZeroContent(): ZeroNodeJSON {
    return this.ensure()[1].toZeroContent();
  }

  /**
   * `toRichContent` returns the model as a rich-text editor holds it:
   * neighbouring text nodes with the same attributes joined, empty ones left
   * out (see `zero_tree_rich.ts`).
   */
  public toRichContent(): ZeroNodeJSON {
    const [, tree] = this.ensure();
    return toRichContent(tree.toZeroContent(), tree.getSchema());
  }

  /**
   * `applyRichOperations` applies operations whose paths address
   * `toRichContent`, each translated to Zero operations on the model it
   * finds.
   */
  public applyRichOperations(operations: Array<RichOperation>): void {
    const [, tree] = this.ensure();
    for (const op of operations) {
      this.applyZeroOperations(
        richToZero(tree.toZeroContent(), op, tree.getSchema()),
      );
    }
  }

  /**
   * `toJSON` returns the JSON encoding of this tree.
   */
  public toJSON(): string {
    return this.ensure()[1].toJSON();
  }

  /**
   * `toCrdtView` returns the CRDT state shaped like a Tree's index nodes, for
   * devtools: elements are markers (with their LWW attribute registers), the
   * text of an inline-text is its RGA pieces with who inserted them, and
   * tombstones (removed pieces and markers) stay where they were.
   */
  public toCrdtView(): ZeroTreeCrdtNode {
    const [, tree] = this.ensure();
    const schema = tree.getSchema();
    const view = tree.view();
    const fake = (createdAt: TimeTicket, offset: number) => ({
      getCreatedAt: () => createdAt,
      getOffset: () => offset,
    });
    const elementOf = new Map<ZNode, ZeroTreeCrdtNode>();
    const markerTicket = (node: ZNode): [TimeTicket, number] | undefined => {
      if (!node.markerID) {
        return;
      }
      const id = tree.idAt(node.start);
      return [id.getCreatedAt(), id.getOffset()];
    };
    const build = (
      node: ZNode,
      parent?: ZeroTreeCrdtNode,
    ): ZeroTreeCrdtNode => {
      const ticket = markerTicket(node);
      const marker = ticket
        ? tree.findMarker(tree.idAt(node.start))
        : undefined;
      const attrs = new Map<string, unknown>();
      marker?.attrs.forEach((attr, key) =>
        attrs.set(key, {
          getValue: () => attr.value ?? '',
          getUpdatedAt: () => attr.updatedAt,
          isRemoved: () => attr.value === null,
        }),
      );
      const element: ZeroTreeCrdtNode = {
        isText: false,
        value: '',
        type: node.type,
        id: ticket
          ? fake(ticket[0], ticket[1])
          : parent
            ? parent.id
            : fake(this.getID(), 0),
        attrs: { getNodeMapByKey: () => attrs },
        children: [],
        allChildren: [],
        virtual: node.virtual,
      };
      elementOf.set(node, element);
      for (const child of node.children) {
        const built = build(child, element);
        element.children.push(built);
        element.allChildren!.push(built);
      }
      return element;
    };
    const root = build(view);

    // live index -> view holder, then walk every RGA node (tombstones too)
    const holderAt: Array<ZNode | undefined> = [];
    const walk = (node: ZNode) => {
      if (isTextType(schema, node.type)) {
        for (let i = 0; i < node.text.length; i++) {
          holderAt[node.textStart + i] = node;
        }
      }
      node.children.forEach(walk);
    };
    walk(view);
    let index = 0;
    let lastHolder: ZNode | undefined;
    const lastElement: ZeroTreeCrdtNode = root;
    for (const piece of tree.getRGA()) {
      const value = piece.getValue();
      if (!value) {
        continue;
      }
      const removed = piece.isRemoved();
      const base = piece.getID().getOffset();
      let run = '';
      let runStart = 0;
      let runHolder: ZNode | undefined;
      const flush = () => {
        if (!run) {
          return;
        }
        const holder = runHolder ?? lastHolder;
        const target = holder ? elementOf.get(holder)! : lastElement;
        const text: ZeroTreeCrdtNode = {
          isText: true,
          value: run,
          id: fake(piece.getCreatedAt(), base + runStart),
          children: [],
          isRemoved: removed,
          removedAt: piece.getRemovedAt(),
        };
        target.allChildren!.push(text);
        if (!removed) {
          target.children.push(text);
        }
        run = '';
        runHolder = undefined;
      };
      value.tokens.forEach((token, i) => {
        if (typeof token === 'string') {
          if (!run) {
            runStart = i;
            runHolder = removed ? undefined : holderAt[index];
          }
          run += token;
          if (!removed) {
            lastHolder = holderAt[index] ?? lastHolder;
          }
        } else {
          flush();
          if (removed) {
            const owner = lastHolder ? elementOf.get(lastHolder)! : lastElement;
            owner.allChildren!.push({
              isText: false,
              value: '',
              type: token.type,
              id: fake(piece.getCreatedAt(), base + i),
              children: [],
              allChildren: [],
              isRemoved: true,
              removedAt: piece.getRemovedAt(),
            });
          }
        }
        if (!removed) {
          index++;
        }
      });
      flush();
    }
    return root;
  }

  /**
   * `toXML` renders the Zero content like a Tree's XML (debugging, fingerprints).
   */
  public toXML(): string {
    const esc = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const render = (node: ZeroNodeJSON): string => {
      const attrs = [
        ...Object.entries(node.style ?? {}).map(([k, v]) => [`style.${k}`, v]),
        ...Object.entries(node.attribute ?? {}).map(([k, v]) => [
          `attribute.${k}`,
          v,
        ]),
        ...(typeof node.data === 'object' && node.data
          ? Object.entries(node.data).map(([k, v]) => [`data.${k}`, v])
          : []),
      ]
        .sort(([a], [b]) => (String(a) < String(b) ? -1 : 1))
        .map(([k, v]) => ` ${k}="${esc(JSON.stringify(v))}"`)
        .join('');
      const inner =
        typeof node.data === 'string'
          ? esc(node.data)
          : (node.children ?? []).map(render).join('');
      return `<${node.type}${attrs}>${inner}</${node.type}>`;
    };
    return render(this.toZeroContent());
  }

  /**
   * `pathRangeToPosRange` converts a Zero range (text points) to identity
   * positions.
   */
  public pathRangeToPosRange(
    range: [Array<number>, Array<number>],
  ): ZeroTreePosStructRange {
    const [, tree] = this.ensure();
    const view = tree.view();
    const toIndex = (path: Array<number>): number => {
      const text = resolveText(view, path, tree.getSchema());
      if (text) {
        return text[0].textStart + clamp(text[1], text[0].text.length);
      }
      const parent = findNode(view, path.slice(0, -1));
      return parent ? insertIndexAt(parent, path[path.length - 1]) : 0;
    };
    return [
      tree.indexToPos(toIndex(range[0])).toStruct(),
      tree.indexToPos(toIndex(range[1])).toStruct(),
    ];
  }

  /**
   * `posRangeToPathRange` converts identity positions back to Zero text
   * points in the current state.
   */
  public posRangeToPathRange(
    range: ZeroTreePosStructRange,
  ): [Array<number>, Array<number>] {
    const [, tree] = this.ensure();
    const view = tree.view();
    const holders: Array<ZNode> = [];
    const walk = (node: ZNode) => {
      for (const child of node.children) {
        if (isTextType(tree.getSchema(), child.type)) {
          holders.push(child);
        } else {
          walk(child);
        }
      }
    };
    walk(view);
    const toPath = (struct: RGATreeSplitPosStruct): Array<number> => {
      const index = tree.posToIndex(RGATreeSplitPos.fromStruct(struct));
      const holder =
        holders.find(
          (h) => h.textStart <= index && index <= h.textStart + h.text.length,
        ) ??
        holders.find((h) => h.textStart >= index) ??
        holders[holders.length - 1];
      if (!holder) {
        return [0, 0, 0];
      }
      const offset = Math.min(
        Math.max(index - holder.textStart, 0),
        holder.text.length,
      );
      return [...pathOf(holder), offset];
    };
    return [toPath(range[0]), toPath(range[1])];
  }

  /**
   * `applyZeroOperations` applies Zero editor operations, in order.
   */
  public applyZeroOperations(operations: Array<ZeroOperation>): void {
    const [, tree] = this.ensure();
    this.columnGroups.clear();
    this.columnFlags.clear();
    this.emptied.clear();
    for (let i = 0; i < operations.length; ) {
      const op = operations[i];
      if (op[0] === 'split') {
        const cascade = [op];
        let j = i + 1;
        while (
          j < operations.length &&
          operations[j][0] === 'split' &&
          isParentSplit(cascade[cascade.length - 1][1], operations[j][1])
        ) {
          cascade.push(operations[j]);
          j++;
        }
        this.split(cascade.map((s) => s[1]));
        i = j;
        continue;
      }
      this.applyOne(op);
      i++;
    }
    for (const [table, cols] of this.columnFlags) {
      const marker = tree.markerIDOf(table);
      if (marker) {
        this.style(
          marker,
          [...cols].map((c) => [`zt.del.${c}`, 'true'] as [string, string]),
        );
      }
    }
    this.columnFlags.clear();
  }

  private ensure(): [ChangeContext, CRDTZeroTree] {
    if (!this.context || !this.tree) {
      throw new YorkieError(
        Code.ErrNotInitialized,
        'ZeroTree is not initialized yet',
      );
    }
    return [this.context, this.tree];
  }

  /** the cells one column insert adds share a key: table marker # index → key */
  private readonly columnGroups = new Map<string, string>();
  /** containers the batch deleted children of (see `emptiedKey`) */
  private readonly emptied = new Set<string>();
  /** columns deleted by the batch: table marker → column keys */
  private readonly columnFlags = new Map<string, Set<string>>();

  /**
   * `materializeCell` gives a virtual cell on `path` (a row's empty cell for
   * a column it missed, see `ZeroSchema.grid`) markers of its own before an
   * edit lands in it, so the edit has a place among the tokens.
   */
  private materializeCell(path: Array<number>): void {
    const [, tree] = this.ensure();
    const schema = tree.getSchema();
    if (!schema.grid) {
      return;
    }
    const view = tree.view();
    for (let k = 1; k <= path.length; k++) {
      const node = findNode(view, path.slice(0, k));
      if (!node) {
        return;
      }
      if (
        node.virtual &&
        node.type === schema.grid.cell &&
        node.col !== undefined
      ) {
        const json = toNodeJSON(node, schema);
        ColumnKeys.set(json, node.col);
        this.editWith(
          node.start,
          node.start,
          (ticket) => toTokens([json], markerDepth(node), ticket, schema),
          this.scopeOf(node.parent),
        );
        return;
      }
    }
  }

  /**
   * `materializePlaceholder` gives the default child an empty container
   * shows (virtual, see `ZNode.placeholder`) markers of its own before a node
   * is inserted next to it. The editor holds that child as a real node; left
   * virtual, it would vanish once the container has another child, and the
   * inserted node would take its index.
   */
  private materializePlaceholder(path: Array<number>): boolean {
    const [context, tree] = this.ensure();
    const schema = tree.getSchema();
    const parent = findNode(tree.view(), path);
    const placeholder = parent?.children.find((c) => c.placeholder);
    if (!parent || !placeholder) {
      return false;
    }
    // Only a default child the editor held before this batch is real there.
    // A container the batch emptied (deleting its children) or made (a split,
    // an inserted node) is empty in the editor until the batch fills it.
    const [lamport, actor] = context
      .getLastTimeTicket()
      .toIDString()
      .split(':');
    if (
      this.emptied.has(emptiedKey(parent)) ||
      parent.markerID?.startsWith(`${lamport}:${actor}:`)
    ) {
      return false;
    }
    const json = toNodeJSON(placeholder, schema);
    this.editWith(
      placeholder.start,
      placeholder.start,
      (ticket) => toTokens([json], childDepth(parent), ticket, schema),
      this.scopeOf(parent),
    );
    return true;
  }

  private applyOne(op: ZeroOperation): void {
    const [, tree] = this.ensure();
    const [kind, path, data] = op;
    // an insert lands beside the node at its path, not in it
    this.materializeCell(kind === 'insert' ? path.slice(0, -1) : path);
    const view = tree.view();
    const schema = tree.getSchema();

    switch (kind) {
      case 'insert': {
        const text = resolveText(view, path, schema);
        if (text && typeof data === 'string') {
          // The editor edits text with `substring`, which clamps offsets.
          const at = text[0].textStart + clamp(text[1], text[0].text.length);
          const chars = Array.from(data);
          this.editWith(at, at, () => chars, this.scopeOf(text[0]));
          return;
        }
        if (this.materializePlaceholder(path.slice(0, -1))) {
          this.applyOne(op);
          return;
        }
        const parent = this.nodeAt(view, path.slice(0, -1));
        const nodes: Array<ZeroNodeJSON> =
          typeof data === 'string'
            ? [{ type: textTypeFor(schema, parent.type), data }]
            : (data as Array<ZeroNodeJSON>);
        const index = path[path.length - 1];
        const grid = schema.grid;
        let group: string | undefined;
        if (grid && parent.type === grid.table) {
          // a new row takes the column keys of the row next to it
          const ref = parent.children[index - 1] ?? parent.children[index];
          for (const row of nodes) {
            (row.children ?? []).forEach((cell, c) => {
              const col = ref?.children[c]?.col;
              if (col !== undefined) {
                ColumnKeys.set(cell, col);
              }
            });
          }
        } else if (
          grid &&
          parent.type === grid.row &&
          parent.parent?.type === grid.table
        ) {
          // the cells of one column insert (one per row, same index) share a key
          group = `${parent.parent.markerID ?? ''}#${index}`;
        }
        const at = insertIndexAt(parent, index);
        this.editWith(
          at,
          at,
          (ticket) => {
            if (group !== undefined) {
              const key = this.columnGroups.get(group) ?? ticket.toIDString();
              this.columnGroups.set(group, key);
              nodes.forEach(
                (cell) => cell.type === grid!.cell && ColumnKeys.set(cell, key),
              );
            }
            return toTokens(nodes, childDepth(parent), ticket, schema);
          },
          this.scopeOf(parent),
        );
        return;
      }
      case 'delete': {
        const count = (data as number) ?? 1;
        const text = resolveText(view, path, schema);
        if (text) {
          // `substring` semantics: [clamp(o), clamp(o + n)), possibly empty
          const len = text[0].text.length;
          const from = clamp(text[1], len);
          const to = clamp(text[1] + count, len);
          if (from < to) {
            this.edit(text[0].textStart + from, text[0].textStart + to);
          }
          return;
        }
        const parent = this.nodeAt(view, path.slice(0, -1));
        this.emptied.add(emptiedKey(parent));
        const last = path[path.length - 1];
        const first = parent.children[last];
        const end = parent.children[last + count - 1];
        if (!first || !end) {
          throw new YorkieError(
            Code.ErrInvalidArgument,
            `no node to delete at ${JSON.stringify(path)}`,
          );
        }
        // the folded markers of the deleted nodes go too (one may sit after
        // the range: a later same-place Enter that arrived after typing)
        const folded: Array<string> = [];
        const collect = (n: ZNode) => {
          folded.push(...(n.group ?? []).slice(1));
          n.children.forEach(collect);
        };
        parent.children.slice(last, last + count).forEach(collect);
        // deleting cells is deleting a column: flag it on the table, so a row
        // added meanwhile leaves its cell of that column out too
        const grid = schema.grid;
        const table = parent.parent;
        const deletedCols =
          grid &&
          parent.type === grid.row &&
          table?.type === grid.table &&
          table.markerID
            ? parent.children
                .slice(last, last + count)
                .map((c) => c.col)
                .filter((c): c is string => c !== undefined)
            : [];
        this.edit(first.start, end.end);
        if (deletedCols.length) {
          // flagged after the whole batch: the flag hides the column's other
          // cells, which the next operations of the same delete still address
          const flags = this.columnFlags.get(table!.markerID!) ?? new Set();
          deletedCols.forEach((c) => flags.add(c));
          this.columnFlags.set(table!.markerID!, flags);
        }
        for (const id of folded) {
          const index = tree.liveIndexOfMarker(id);
          if (index >= 0) {
            this.editLive(index, index + 1);
          }
        }
        return;
      }
      case 'merge': {
        // The editor moves every child of the merged node, empty ones
        // included. A virtual child (no marker of its own) would vanish with
        // the merge here, so give it a marker first.
        for (let guard = 0; guard < 64; guard++) {
          const current = this.nodeAt(tree.view(), path);
          const child = current.children.find((c) => c.virtual);
          if (!child) {
            break;
          }
          this.editWith(
            child.start,
            child.start,
            (ticket) => [
              ZeroMarker.create(child.type, markerDepth(child), [], ticket),
            ],
            this.scopeOf(child.parent),
          );
        }
        const node = this.nodeAt(tree.view(), path);
        if (!node.virtual) {
          // every marker of the node goes, folded concurrent splits included
          // (those first, so the model never shows them on their own)
          for (const id of [...(node.group ?? [])].reverse()) {
            const index = tree.liveIndexOfMarker(id);
            if (index >= 0) {
              this.editLive(index, index + 1);
            }
          }
        }
        return;
      }
      case 'update': {
        const node = this.nodeAt(view, path);
        const writes = flattenProps(
          (data ?? {}) as Record<string, any>,
          isTextType(schema, node.type),
        );
        if (!writes.length) {
          return;
        }
        if (node.virtual) {
          // Give the virtual node a marker of its own, carrying the update.
          this.editWith(
            node.start,
            node.start,
            (ticket) => [
              ZeroMarker.create(node.type, markerDepth(node), writes, ticket),
            ],
            this.scopeOf(node.parent),
          );
          return;
        }
        // on a text node the write is a range, up to the node's last
        // character here: a node split off it concurrently gets it too (see
        // `ZeroStyleRegion`). Only from the node's own marker: a folded
        // split's marker may sit past that character. A node without
        // characters has nothing to split off.
        let range: ZeroStyleRange | undefined;
        if (isTextType(schema, node.type) && node.markerID && node.text) {
          range = { last: tree.idAt(node.textStart + node.text.length - 1) };
        }
        // every marker of the node: a folded split's marker may outlive the
        // standing one (its author undoes their Enter), the line keeps its props
        for (const id of node.writeGroup ?? node.group ?? []) {
          const marker = tree.markerIDOf(id);
          if (marker) {
            this.style(
              marker,
              writes,
              id === node.markerID ? range : undefined,
            );
          }
        }
        return;
      }
      case 'split': {
        this.split([path]);
        return;
      }
    }
    throw new YorkieError(
      Code.ErrInvalidArgument,
      `unsupported zero operation: ${kind}`,
    );
  }

  /**
   * `split` inserts the markers of a SPLIT cascade as one run. `paths[0]` is
   * the innermost split; each next one splits the parent at the new child.
   */
  private split(paths: Array<Array<number>>): void {
    const [, tree] = this.ensure();
    this.materializeCell(paths[0]);
    const schema = tree.getSchema();
    const view = tree.view();
    const first = paths[0];
    let at: number;
    const text = resolveText(view, first, schema);
    if (text) {
      at = text[0].textStart + text[1];
    } else {
      const parent = this.nodeAt(view, first.slice(0, -1));
      at = insertIndexAt(parent, first[first.length - 1]);
    }
    const splitNodes = paths.map((p) => this.nodeAt(view, p.slice(0, -1)));
    // A split of text gets a boundary key, so people splitting the same
    // boundary at once make ONE split: two concurrent Enters at one place
    // make one new line, the other Enter only moves its author's caret (see
    // `ZeroMarker.boundary`, `dealias`). The cascade length is part of the
    // key: an Enter and a formatting split of one place stay apart.
    // The key is the pair of tokens around the split point: only splits made
    // without knowing each other see the same pair (whoever saw an earlier
    // split there sees its marker on the right).
    let boundary: string | undefined;
    if (text && at > 0) {
      boundary = `${tree.viewIDAt(at - 1)}|${tree.viewIDAt(at) ?? '$'}`;
      if (paths.length > 1) {
        boundary += `#${paths.length}`;
      }
    }
    this.editWith(
      at,
      at,
      (ticket) =>
        splitNodes
          .map((n) => {
            const marker = ZeroMarker.create(
              n.type,
              markerDepth(n),
              [],
              ticket,
            );
            // the copy keeps when each value was written: a style written
            // concurrently on the node split from still wins over an older
            // value here (see `ZeroStyleRegion`). It keeps the writes the
            // register keeps too, so an undo of one reaches the copy, but not
            // the ones undone already: once everyone knows an undo, nothing
            // made after it may bring its write back (see `ZeroStyleCancel`).
            for (const [k, reg] of Object.entries(n.registers ?? {})) {
              if (k.startsWith(ZeroRegionPrefix)) {
                continue;
              }
              const history = reg.history
                ?.filter((e) => !tree.isCancelled(e.at as TimeTicket))
                .map((e) => ({ value: e.value, at: e.at as TimeTicket }));
              if (history?.length) {
                marker.attrs.set(k, {
                  value: reg.value,
                  updatedAt: reg.at as TimeTicket,
                  history,
                });
              } else if (reg.value !== null) {
                marker.attrs.set(k, {
                  value: reg.value,
                  updatedAt: reg.at as TimeTicket,
                });
              }
            }
            marker.boundary = boundary;
            return marker;
          })
          .reverse(),
      this.scopeOf(splitNodes[splitNodes.length - 1].parent),
    );
  }

  private nodeAt(view: ZNode, path: Array<number>): ZNode {
    const node = findNode(view, path);
    if (!node) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `no node at ${JSON.stringify(path)}`,
      );
    }
    return node;
  }

  private edit(from: number, to: number, chars?: Array<string>): void {
    this.editWith(from, to, chars ? () => chars : undefined);
  }

  private editLive(from: number, to: number): void {
    const [, tree] = this.ensure();
    this.editAt(tree.liveIndexToPos(from), tree.liveIndexToPos(to));
  }

  /**
   * `scopeOf` returns the id of the nearest table, row or cell marker at or
   * above `node` (see `ZeroSchema.scoped`): what is inserted under `node`
   * lives only while that marker does.
   */
  private scopeOf(node: ZNode | undefined): string | undefined {
    const [, tree] = this.ensure();
    const scoped = tree.getSchema().scoped;
    for (let n = node; n; n = n.parent) {
      if (n.markerID && !n.virtual && scoped?.has(n.type)) {
        return n.markerID;
      }
    }
    return;
  }

  private editWith(
    from: number,
    to: number,
    build?: (ticket: TimeTicket) => Array<string | ZeroMarker>,
    scope?: string,
  ): void {
    const [, tree] = this.ensure();
    const fromPos = tree.indexToPos(from);
    this.editAt(
      fromPos,
      from === to ? fromPos : tree.indexToPos(to, true),
      build,
      scope,
    );
  }

  private editAt(
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    build?: (ticket: TimeTicket) => Array<string | ZeroMarker>,
    scope?: string,
  ): void {
    const [context, tree] = this.ensure();
    const ticket = context.issueTimeTicket();
    const value = build ? new ZeroTokens(build(ticket), scope) : undefined;
    const [pairs, diff] = tree.edit(
      [fromPos, toPos],
      value ? value.substring(0) : undefined,
      ticket,
    );
    context.acc(diff);
    for (const pair of pairs) {
      context.registerGCPair(pair);
    }
    context.push(
      new ZeroTreeEditOperation(
        tree.getCreatedAt(),
        fromPos,
        toPos,
        value,
        ticket,
      ),
    );
  }

  private style(
    markerID: ReturnType<CRDTZeroTree['idAt']>,
    writes: Array<[string, ZeroAttrValue]>,
    range?: ZeroStyleRange,
  ): void {
    const [context, tree] = this.ensure();
    const ticket = context.issueTimeTicket();
    const [, pairs] = tree.setAttrs(markerID, writes, ticket, range);
    for (const pair of pairs) {
      context.registerGCPair(pair);
    }
    context.push(
      new ZeroTreeStyleOperation(
        tree.getCreatedAt(),
        markerID,
        writes,
        ticket,
        range,
      ),
    );
  }
}
