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

import type { Node as PMNode } from 'prosemirror-model';
import type { MarkMapping, YorkieTreeJSON, PMNodeJSON } from './types';

/**
 * Attribute names a ProseMirror schema resolves as a URL when it renders.
 * The default `link` mark puts `href` straight into `['a', {href}, 0]`, so
 * these values reach the DOM exactly as a remote peer wrote them.
 */
const UrlAttrNames = new Set([
  'href',
  'src',
  'srcset',
  'xlink:href',
  'action',
  'formaction',
  'background',
  'poster',
  'cite',
  'longdesc',
  'data',
  'codebase',
  'profile',
]);

/**
 * Whether a URL string can run script in the local origin.
 *
 * A deny-list, not an allow-list, and deliberately so: an app's own custom
 * scheme, or a relative URL, must survive the round trip untouched. Control
 * characters and whitespace are stripped first because browsers ignore them
 * when resolving the scheme (`java\tscript:alert(1)` navigates just fine).
 */
function isScriptUrl(raw: string): boolean {
  // Strip C0 controls and space in one pass. Nothing at or below U+0020 is a
  // surrogate, so walking code units is equivalent to walking code points
  // without the per-character array the previous `Array.from` allocated.
  let stripped = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) > 0x20) stripped += raw[i];
  }
  const normalized = stripped.toLowerCase();
  if (/^(?:javascript|vbscript|livescript):/.test(normalized)) return true;
  // `data:` can carry markup that runs script (`data:text/html,<script>`),
  // and an SVG payload is markup too. Raster images cannot.
  return (
    normalized.startsWith('data:') &&
    !/^data:image\/(?:png|jpe?g|gif|webp|bmp|x-icon)[;,]/.test(normalized)
  );
}

/**
 * Inert stand-in for a URL value the sanitizer refuses to hand to `toDOM`,
 * and the registry that maps it back to what the peer actually wrote.
 *
 * Blanking the value in place is not enough on its own: the PM doc this
 * converter produces is also the input to the upstream path — `syncToYorkie`
 * re-serializes the local doc with `pmToYorkie` on every local transaction —
 * so a blanked value is pushed back into the shared tree the first time the
 * containing block is replaced, and every peer loses the attribute. A local
 * rendering decision must not become a destructive edit for everyone, least
 * of all on a false positive. So the sanitizer substitutes an inert
 * `about:blank#…` placeholder on the way in and `restoreBlockedUrl` swaps the
 * original back on the way out, leaving the CRDT byte-identical.
 *
 * The registry is keyed by the stringified original, so re-rendering the same
 * document does not grow it, and it is capped so a peer streaming distinct
 * blocked URLs cannot grow it without bound. Past the cap the value falls
 * back to the empty string — safe, but no longer round-trip preserving.
 */
const BlockedUrlPrefix = 'about:blank#yorkie-blocked-';
const MaxBlockedUrls = 1024;
const blockedUrlByOriginal = new Map<string, string>();
const originalByBlockedUrl = new Map<string, string>();

/** The placeholder standing in for `raw`, registering it on first sight. */
function blockUrlValue(raw: string): string {
  const existing = blockedUrlByOriginal.get(raw);
  if (existing !== undefined) return existing;
  if (blockedUrlByOriginal.size >= MaxBlockedUrls) return '';
  const placeholder = `${BlockedUrlPrefix}${blockedUrlByOriginal.size + 1}`;
  blockedUrlByOriginal.set(raw, placeholder);
  originalByBlockedUrl.set(placeholder, raw);
  return placeholder;
}

/** The original a placeholder stands in for, or the value itself. */
function restoreBlockedUrl(value: string): string {
  if (!value.startsWith(BlockedUrlPrefix)) return value;
  return originalByBlockedUrl.get(value) ?? value;
}

/**
 * The replacement for a remote URL attribute value, or `undefined` to keep it.
 *
 * `unknown` rather than `string` is the honest input type: attributes arrive
 * as `JSON.parse` output (`parseObjectValues` in the SDK decodes every stored
 * attribute), so a peer calling `tree.style(from, to, { href:
 * ['javascript:alert(1)'] })` delivers an array here. `toDOM`/`setAttribute`
 * stringify it straight back into a live scheme, so the check has to see the
 * string the DOM would see.
 */
function blockedUrlReplacement(value: unknown): string | undefined {
  let raw: string;
  try {
    raw = String(value);
  } catch {
    // Fail closed. A value whose primitive conversion throws cannot be
    // inspected, and an uninspectable value is not one to hand to `toDOM`;
    // there is also no string to key the registry with, so this is the one
    // case that blanks rather than round-trips.
    return '';
  }
  return isScriptUrl(raw) ? blockUrlValue(raw) : undefined;
}

/**
 * Coerce Yorkie string attributes back to their original types.
 * Yorkie stores all attribute values as strings, so numeric-looking
 * strings (e.g., "2" from heading level) must be converted back to numbers
 * for ProseMirror's `Node.fromJSON` compatibility.
 *
 * Values arrive from remote peers, so a URL attribute carrying an executable
 * scheme is blanked rather than handed to the schema's `toDOM`.
 *
 * The values are typed `string` upstream but are not: `CRDTTree.toJSON` runs
 * every stored attribute through `JSON.parse`, so a remote peer can put a
 * number, boolean, array or object here. The URL check therefore runs on
 * every value regardless of type, and only the string-shaped coercions below
 * are type-gated — a non-string is already the type `JSON.parse` decided.
 */
function deserializeAttrs(
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  // `Object.create(null)`, not `{}`: an attribute literally named `__proto__`
  // is an own-property write on a null-prototype object but a *prototype
  // assignment* on an object literal. On a literal, a peer sending
  // `__proto__: { href: 'javascript:alert(1)' }` would leave no own `href`
  // for the sanitizer above to see while ProseMirror's `computeAttrs` — which
  // reads `attrs[name]` straight through the prototype chain — still resolves
  // one. With no prototype there is no chain to smuggle anything along.
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(attrs)) {
    const blocked = UrlAttrNames.has(key)
      ? blockedUrlReplacement(value)
      : undefined;
    if (blocked !== undefined) {
      result[key] = blocked;
    } else if (typeof value !== 'string') {
      result[key] = value;
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      result[key] = Number(value);
    } else if (value === 'true') {
      result[key] = true;
    } else if (value === 'false') {
      result[key] = false;
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract non-null attributes from a PM node as string key-value pairs.
 *
 * A URL the sanitizer replaced with a placeholder is restored to the peer's
 * original value here, so re-serializing a locally rendered doc leaves the
 * shared tree exactly as it was.
 */
function serializeAttrs(
  attrs: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!attrs) return undefined;
  const result: Record<string, string> = {};
  let hasAttrs = false;
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) {
      result[key] = restoreBlockedUrl(String(value));
      hasAttrs = true;
    }
  }
  return hasAttrs ? result : undefined;
}

/**
 * Check if two mark arrays are deeply equal (same mark types and attrs).
 */
function marksEqual(
  a: Array<{ type: string; attrs?: Record<string, unknown> }> | undefined,
  b: Array<{ type: string; attrs?: Record<string, unknown> }> | undefined,
): boolean {
  if (!a?.length && !b?.length) return true;
  if (!a?.length || !b?.length) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type) return false;
    const aAttrs = a[i].attrs;
    const bAttrs = b[i].attrs;
    if (!aAttrs && !bAttrs) continue;
    if (!aAttrs || !bAttrs) return false;
    const aKeys = Object.keys(aAttrs);
    const bKeys = Object.keys(bAttrs);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (aAttrs[key] !== bAttrs[key]) return false;
    }
  }
  return true;
}

/**
 * Merge adjacent text nodes with identical marks in a PM JSON content array.
 *
 * ProseMirror's `Fragment.fromJSON` uses `new Fragment()` directly (not
 * `fromArray()`), so it does NOT auto-merge adjacent same-mark text nodes.
 * Unmerged text nodes cause `Fragment.findDiffEnd` to produce non-minimal
 * diffs (it compares one node pair at a time and can't match across text
 * node boundaries), which breaks cursor position mapping during downstream
 * sync.
 */
function mergeAdjacentTextNodes(nodes: Array<PMNodeJSON>): Array<PMNodeJSON> {
  if (nodes.length <= 1) return nodes;
  const result: Array<PMNodeJSON> = [nodes[0]];
  for (let i = 1; i < nodes.length; i++) {
    const prev = result[result.length - 1];
    const curr = nodes[i];
    if (
      prev.type === 'text' &&
      curr.type === 'text' &&
      marksEqual(prev.marks, curr.marks)
    ) {
      result[result.length - 1] = {
        ...prev,
        text: (prev.text || '') + (curr.text || ''),
      };
    } else {
      result.push(curr);
    }
  }
  return result;
}

/**
 * Convert a ProseMirror Node to a Yorkie TreeNode JSON.
 * Marks on text nodes are expanded into inline wrapper elements.
 *
 * PM:    paragraph > [text("hello", [bold]), text(" world")]
 * Yorkie: <paragraph><strong><text>hello</text></strong><text> world</text></paragraph>
 */
export function pmToYorkie(
  pmNode: PMNode,
  markMapping: MarkMapping,
  wrapperElementName: string = 'span',
): YorkieTreeJSON {
  if (pmNode.isText) {
    let yorkieNode: YorkieTreeJSON = {
      type: 'text',
      value: pmNode.text || '',
    };

    // Wrap in mark elements from innermost to outermost
    const marks = pmNode.marks || [];
    for (let i = marks.length - 1; i >= 0; i--) {
      const mark = marks[i];
      const elemType = markMapping[mark.type.name];
      if (!elemType) {
        console.warn(
          `[yorkie-prosemirror] Mark "${mark.type.name}" has no mapping and will be dropped. ` +
            `Use buildMarkMapping(schema) or provide a custom markMapping.`,
        );
      }
      if (elemType) {
        const wrapper: YorkieTreeJSON = {
          type: elemType,
          children: [yorkieNode],
        };
        // Store mark attributes if any (e.g., href for links)
        if (
          mark.attrs &&
          Object.keys(mark.attrs).some((k) => mark.attrs[k] != null)
        ) {
          wrapper.attributes = {};
          for (const [k, v] of Object.entries(mark.attrs)) {
            // Same restore as `serializeAttrs`: a sanitized `href` must go
            // back to the tree as the peer wrote it, not as the placeholder
            // this client rendered.
            if (v != null) wrapper.attributes[k] = restoreBlockedUrl(String(v));
          }
        }
        yorkieNode = wrapper;
      }
    }
    return yorkieNode;
  }

  // Leaf nodes (hard_break, horizontal_rule, image, etc.)
  if (pmNode.isLeaf) {
    const result: YorkieTreeJSON = { type: pmNode.type.name, children: [] };
    const attrs = serializeAttrs(pmNode.attrs);
    if (attrs) result.attributes = attrs;
    return result;
  }

  // Element node with children
  const children: Array<YorkieTreeJSON> = [];
  pmNode.forEach((child) => {
    children.push(pmToYorkie(child, markMapping, wrapperElementName));
  });

  // Yorkie constraint: a parent's children must be ALL text or ALL element.
  // When marks produce inline wrapper elements (strong, em, etc.) alongside
  // bare text nodes, we wrap bare text in <span> to make children homogeneous.
  const hasText = children.some((c) => c.type === 'text');
  const hasElem = children.some((c) => c.type !== 'text');
  if (hasText && hasElem) {
    for (let i = 0; i < children.length; i++) {
      if (children[i].type === 'text') {
        children[i] = { type: wrapperElementName, children: [children[i]] };
      }
    }
  }

  const result: YorkieTreeJSON = {
    type: pmNode.type.name,
    children,
  };

  // Copy non-null node attributes (e.g., level for headings)
  const attrs = serializeAttrs(pmNode.attrs);
  if (attrs) result.attributes = attrs;

  return result;
}

/**
 * Convert a Yorkie TreeNode JSON to PM-compatible JSON.
 * Inline mark elements are collapsed into PM marks on text nodes.
 * The result can be passed to `Node.fromJSON(schema, json)`.
 */
export function yorkieToJSON(
  yorkieNode: YorkieTreeJSON,
  elementToMarkMapping: Record<string, string>,
  markStack: Array<{ type: string; attrs?: Record<string, unknown> }> = [],
  wrapperElementName: string = 'span',
): PMNodeJSON | Array<PMNodeJSON> {
  if (yorkieNode.type === 'text') {
    const result: PMNodeJSON = { type: 'text', text: yorkieNode.value };
    if (markStack.length > 0) {
      result.marks = markStack.map((m) => ({ ...m }));
    }
    return result;
  }

  // Unwrap wrapper element (neutral wrapper for bare text alongside mark elements)
  if (yorkieNode.type === wrapperElementName) {
    const flatChildren: Array<PMNodeJSON> = [];
    for (const child of yorkieNode.children || []) {
      const result = yorkieToJSON(
        child,
        elementToMarkMapping,
        markStack,
        wrapperElementName,
      );
      if (Array.isArray(result)) {
        flatChildren.push(...result);
      } else {
        flatChildren.push(result);
      }
    }
    return flatChildren;
  }

  // Check if this is a mark element (strong, em, etc.).
  // `yorkieNode.type` is remote-controlled and the mapping is a plain object,
  // so a node named `constructor` or `toString` would otherwise resolve to an
  // inherited function and be spliced into the mark stack as a mark type.
  // Own keys only; anything else is a regular element, which is what the
  // remote tree says it is.
  const markName = Object.prototype.hasOwnProperty.call(
    elementToMarkMapping,
    yorkieNode.type,
  )
    ? elementToMarkMapping[yorkieNode.type]
    : undefined;
  if (markName) {
    const markEntry: { type: string; attrs?: Record<string, unknown> } = {
      type: markName,
    };
    if (
      yorkieNode.attributes &&
      Object.keys(yorkieNode.attributes).length > 0
    ) {
      markEntry.attrs = deserializeAttrs(yorkieNode.attributes);
    }

    const newMarkStack = [...markStack, markEntry];
    const flatChildren: Array<PMNodeJSON> = [];
    for (const child of yorkieNode.children || []) {
      const result = yorkieToJSON(
        child,
        elementToMarkMapping,
        newMarkStack,
        wrapperElementName,
      );
      if (Array.isArray(result)) {
        flatChildren.push(...result);
      } else {
        flatChildren.push(result);
      }
    }
    return flatChildren;
  }

  // Regular element node
  const result: PMNodeJSON = { type: yorkieNode.type };

  if (yorkieNode.attributes && Object.keys(yorkieNode.attributes).length > 0) {
    result.attrs = deserializeAttrs(yorkieNode.attributes);
  }

  // Process children, flattening any mark-unwrapped arrays
  const children: Array<PMNodeJSON> = [];
  for (const child of yorkieNode.children || []) {
    const converted = yorkieToJSON(
      child,
      elementToMarkMapping,
      [],
      wrapperElementName,
    );
    if (Array.isArray(converted)) {
      children.push(...converted);
    } else {
      children.push(converted);
    }
  }
  // Merge adjacent text nodes with the same marks.
  // Fragment.fromJSON uses `new Fragment()` directly (not fromArray),
  // so it does NOT merge adjacent same-mark text nodes. Without this,
  // the PM doc can have fragmented text nodes whose boundaries don't
  // match the new doc from Yorkie, causing findDiffEnd to produce a
  // non-minimal diff and breaking cursor position mapping.
  const merged = mergeAdjacentTextNodes(children);
  if (merged.length > 0) {
    result.content = merged;
  }

  return result;
}
