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
 * The rich-text view of a Zero Tree (prototype). The Zero model keeps the
 * boundaries of its text nodes: two neighbours with the same style stay two
 * nodes, and an empty text node stays. A rich-text editor (ProseMirror,
 * Slate, ...) normalizes both away, so its paths do not address the Zero
 * model. This view is that normalized model, and operations written against
 * it are translated to Zero operations on the current model. The tokens and
 * how they converge do not change: only what is read and how paths map.
 */
import {
  ZeroNodeJSON,
  ZeroOperation,
  ZeroSchema,
  isTextType,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `RichOperation` is an operation on the rich-text view. Besides the Zero
 * `insert`, `delete` and `update`, `format` writes attributes on a range of
 * a container's text: `['format', containerPath, {from, to, style}]`, with
 * offsets counting characters (an atom counts one).
 */
export type RichOperation =
  | ZeroOperation
  | [
      'format',
      Array<number>,
      { from: number; to: number; style?: Record<string, unknown> },
    ];

const sameProps = (a: ZeroNodeJSON, b: ZeroNodeJSON): boolean =>
  a.type === b.type &&
  JSON.stringify(a.style ?? {}) === JSON.stringify(b.style ?? {}) &&
  JSON.stringify(a.attribute ?? {}) === JSON.stringify(b.attribute ?? {});

/**
 * `runs` returns, for each child of the rich view of `node`, the range of
 * the Zero children it is made of. Empty text nodes belong to no run.
 */
function runs(
  node: ZeroNodeJSON,
  schema: ZeroSchema,
): Array<{ start: number; end: number; text: boolean }> {
  const out: Array<{ start: number; end: number; text: boolean }> = [];
  const children = node.children ?? [];
  let lastText: ZeroNodeJSON | undefined;
  children.forEach((c, i) => {
    if (!isTextType(schema, c.type)) {
      out.push({ start: i, end: i + 1, text: false });
      lastText = undefined;
      return;
    }
    if (!String(c.data ?? '').length) {
      if (lastText) {
        out[out.length - 1].end = i + 1;
      }
      return;
    }
    if (lastText && sameProps(lastText, c)) {
      out[out.length - 1].end = i + 1;
      return;
    }
    out.push({ start: i, end: i + 1, text: true });
    lastText = c;
  });
  return out;
}

/**
 * `toRichContent` returns the rich-text view of a Zero model.
 */
export function toRichContent(
  node: ZeroNodeJSON,
  schema: ZeroSchema,
): ZeroNodeJSON {
  if (!node.children) {
    return { ...node };
  }
  const children = node.children;
  return {
    ...node,
    children: runs(node, schema).map(({ start, end, text }) => {
      if (!text) {
        return toRichContent(children[start], schema);
      }
      const data = children
        .slice(start, end)
        .map((c) => String(c.data ?? ''))
        .join('');
      return { ...children[start], data };
    }),
  };
}

/**
 * `zeroParent` follows a rich path of containers down the Zero model and
 * returns the Zero path and node it ends at.
 */
function zeroParent(
  root: ZeroNodeJSON,
  path: Array<number>,
  schema: ZeroSchema,
): [Array<number>, ZeroNodeJSON] {
  let node = root;
  const out: Array<number> = [];
  for (const index of path) {
    const run = runs(node, schema)[index];
    if (!run) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `no rich node at ${JSON.stringify(path)}`,
      );
    }
    out.push(run.start);
    node = node.children![run.start];
  }
  return [out, node];
}

/**
 * `textAt` returns where character `offset` of a text run falls: the Zero
 * child and the offset in it (at a boundary, the end of the earlier one).
 */
function textAt(
  parent: ZeroNodeJSON,
  run: { start: number; end: number },
  offset: number,
): [number, number] {
  const children = parent.children!;
  let last = run.start;
  for (let i = run.start; i < run.end; i++) {
    const len = String(children[i].data ?? '').length;
    if (!len) {
      continue;
    }
    if (offset <= len) {
      return [i, offset];
    }
    offset -= len;
    last = i;
  }
  return [last, String(children[last].data ?? '').length];
}

/**
 * `richToZero` translates one rich operation to Zero operations on the
 * current Zero model `root`.
 */
export function richToZero(
  root: ZeroNodeJSON,
  op: RichOperation,
  schema: ZeroSchema,
): Array<ZeroOperation> {
  const [kind, path, data] = op;
  if (kind === 'format') {
    const { from, to, style } = data as {
      from: number;
      to: number;
      style?: Record<string, unknown>;
    };
    const [zpath, parent] = zeroParent(root, path, schema);
    return formatOps(zpath, parent, from, to, style ?? {}, schema);
  }
  const [zpath, parent] = zeroParent(root, path.slice(0, -1), schema);
  const all = runs(parent, schema);
  const index = path[path.length - 1];
  const holder = parent.children?.[all[index]?.start ?? -1];
  // a text offset: [..., rich text child, offset]
  if (
    path.length >= 2 &&
    (kind === 'insert' || kind === 'delete') &&
    typeof data !== 'object'
  ) {
    const [tpath, tparent] = zeroParent(root, path.slice(0, -2), schema);
    const run = runs(tparent, schema)[path[path.length - 2]];
    if (run?.text) {
      const offset = path[path.length - 1];
      if (kind === 'insert') {
        const [i, o] = textAt(tparent, run, offset);
        return [['insert', [...tpath, i, o], data as string]];
      }
      // a deletion may span several Zero text nodes: last one first
      const count = (data as number) ?? 1;
      const ops: Array<ZeroOperation> = [];
      let start = 0;
      for (let i = run.start; i < run.end; i++) {
        const len = String(tparent.children![i].data ?? '').length;
        const a = Math.max(offset, start);
        const b = Math.min(offset + count, start + len);
        if (a < b) {
          ops.unshift(['delete', [...tpath, i, a - start], b - a]);
        }
        start += len;
      }
      return ops;
    }
  }
  if (kind === 'insert') {
    const at = index < all.length ? all[index].start : parent.children!.length;
    return [['insert', [...zpath, at], data]];
  }
  if (kind === 'delete') {
    const count = (data as number) ?? 1;
    const first = all[index];
    const last = all[index + count - 1];
    if (!first || !last) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `no rich node to delete at ${JSON.stringify(path)}`,
      );
    }
    return [['delete', [...zpath, first.start], last.end - first.start]];
  }
  if (kind === 'update' && holder) {
    const run = all[index];
    const ops: Array<ZeroOperation> = [];
    for (let i = run.start; i < run.end; i++) {
      ops.push(['update', [...zpath, i], data]);
    }
    return ops;
  }
  throw new YorkieError(
    Code.ErrInvalidArgument,
    `unsupported rich operation: ${kind} ${JSON.stringify(path)}`,
  );
}

/**
 * `formatOps` returns what formats characters [from, to) of `parent` (at
 * Zero path `zpath`): a split at each end inside a text node, then an update
 * of every text node in between, as Zero formats a selection.
 */
function formatOps(
  zpath: Array<number>,
  parent: ZeroNodeJSON,
  from: number,
  to: number,
  style: Record<string, unknown>,
  schema: ZeroSchema,
): Array<ZeroOperation> {
  const ops: Array<ZeroOperation> = [];
  const lens = (parent.children ?? []).map((c) =>
    isTextType(schema, c.type) ? String(c.data ?? '').length : 1,
  );
  const text = (parent.children ?? []).map((c) => isTextType(schema, c.type));
  const splitAt = (off: number) => {
    let start = 0;
    for (let i = 0; i < lens.length; i++) {
      if (text[i] && off > start && off < start + lens[i]) {
        ops.push(['split', [...zpath, i, off - start]]);
        lens.splice(i, 1, off - start, start + lens[i] - off);
        text.splice(i, 0, true);
        return;
      }
      start += lens[i];
    }
  };
  splitAt(to);
  splitAt(from);
  let start = 0;
  for (let i = 0; i < lens.length; i++) {
    if (text[i] && lens[i] && start >= from && start + lens[i] <= to) {
      ops.push(['update', [...zpath, i], { style }]);
    }
    start += lens[i];
  }
  return ops;
}
