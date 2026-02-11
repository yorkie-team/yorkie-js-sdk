import type { Node as PMNode } from 'prosemirror-model';
import type { MarkMapping, YorkieTreeJSON, PMNodeJSON } from './types';

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
 * Convert a ProseMirror Node to a Yorkie TreeNode JSON.
 * Marks on text nodes are expanded into inline wrapper elements.
 *
 * PM:    paragraph > [text("hello", [bold]), text(" world")]
 * Yorkie: <paragraph><strong><text>hello</text></strong><text> world</text></paragraph>
 */
export function pmToYorkie(
  pmNode: PMNode,
  markMapping: MarkMapping,
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
    children.push(pmToYorkie(child, markMapping));
  });

  // Yorkie constraint: a parent's children must be ALL text or ALL element.
  // When marks produce inline wrapper elements (strong, em, etc.) alongside
  // bare text nodes, we wrap bare text in <span> to make children homogeneous.
  const hasText = children.some((c) => c.type === 'text');
  const hasElem = children.some((c) => c.type !== 'text');
  if (hasText && hasElem) {
    for (let i = 0; i < children.length; i++) {
      if (children[i].type === 'text') {
        children[i] = { type: 'span', children: [children[i]] };
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
): PMNodeJSON | Array<PMNodeJSON> {
  if (yorkieNode.type === 'text') {
    const result: PMNodeJSON = { type: 'text', text: yorkieNode.value };
    if (markStack.length > 0) {
      result.marks = markStack.map((m) => ({ ...m }));
    }
    return result;
  }

  // Unwrap <span> (neutral wrapper for bare text alongside mark elements)
  if (yorkieNode.type === 'span') {
    const flatChildren: Array<PMNodeJSON> = [];
    for (const child of yorkieNode.children || []) {
      const result = yorkieToJSON(child, elementToMarkMapping, markStack);
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
      markEntry.attrs = { ...yorkieNode.attributes };
    }

    const newMarkStack = [...markStack, markEntry];
    const flatChildren: Array<PMNodeJSON> = [];
    for (const child of yorkieNode.children || []) {
      const result = yorkieToJSON(child, elementToMarkMapping, newMarkStack);
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
    result.attrs = { ...yorkieNode.attributes };
  }

  // Process children, flattening any mark-unwrapped arrays
  const children: Array<PMNodeJSON> = [];
  for (const child of yorkieNode.children || []) {
    const converted = yorkieToJSON(child, elementToMarkMapping, []);
    if (Array.isArray(converted)) {
      children.push(...converted);
    } else {
      children.push(converted);
    }
  }
  if (children.length > 0) {
    result.content = children;
  }

  return result;
}
