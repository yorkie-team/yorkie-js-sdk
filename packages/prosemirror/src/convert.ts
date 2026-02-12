import type { Node as PMNode } from 'prosemirror-model';
import type { MarkMapping, YorkieTreeJSON, PMNodeJSON } from './types';

/**
 * Coerce Yorkie string attributes back to their original types.
 * Yorkie stores all attribute values as strings, so numeric-looking
 * strings (e.g., "2" from heading level) must be converted back to numbers
 * for ProseMirror's `Node.fromJSON` compatibility.
 */
function deserializeAttrs(
  attrs: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
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
 */
function serializeAttrs(
  attrs: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!attrs) return undefined;
  const result: Record<string, string> = {};
  let hasAttrs = false;
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) {
      result[key] = String(value);
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
            if (v != null) wrapper.attributes[k] = String(v);
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

  // Check if this is a mark element (strong, em, etc.)
  const markName = elementToMarkMapping[yorkieNode.type];
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
