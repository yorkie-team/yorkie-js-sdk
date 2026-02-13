import { TextSelection } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Node } from 'prosemirror-model';
import type { Schema } from 'prosemirror-model';
import { yorkieToJSON } from './convert';

/**
 * Describes a range of top-level blocks that differ between two PM docs.
 */
export type DocDiff = {
  /** Start position in the old doc (inclusive). */
  fromPos: number;
  /** End position in the old doc (exclusive). */
  toPos: number;
  /** Replacement nodes from the new doc. */
  newNodes: Array<Node>;
};

/**
 * Diff two PM docs at the top-level block level.
 *
 * Finds the first and last differing top-level children, then returns a
 * `DocDiff` describing the range in the old doc and the replacement nodes
 * from the new doc. Returns `undefined` if the documents are equal.
 */
export function diffDocs(oldDoc: Node, newDoc: Node): DocDiff | undefined {
  const oldContent = oldDoc.content;
  const newContent = newDoc.content;
  const oldCount = oldContent.childCount;
  const newCount = newContent.childCount;

  // Find first differing block from the start
  const minCount = Math.min(oldCount, newCount);
  let firstDiff = -1;
  for (let i = 0; i < minCount; i++) {
    if (!oldContent.child(i).eq(newContent.child(i))) {
      firstDiff = i;
      break;
    }
  }

  // If all shared blocks are equal, check for length difference
  if (firstDiff === -1) {
    if (oldCount === newCount) {
      return undefined; // Docs are equal
    }
    firstDiff = minCount;
  }

  // Find last differing block from the end
  let oldEnd = oldCount;
  let newEnd = newCount;
  while (oldEnd > firstDiff && newEnd > firstDiff) {
    if (oldContent.child(oldEnd - 1).eq(newContent.child(newEnd - 1))) {
      oldEnd--;
      newEnd--;
    } else {
      break;
    }
  }

  // Compute PM positions by summing nodeSize of preceding blocks
  let fromPos = 0;
  for (let i = 0; i < firstDiff; i++) {
    fromPos += oldContent.child(i).nodeSize;
  }

  let toPos = fromPos;
  for (let i = firstDiff; i < oldEnd; i++) {
    toPos += oldContent.child(i).nodeSize;
  }

  // Collect new nodes
  const newNodes: Array<Node> = [];
  for (let i = firstDiff; i < newEnd; i++) {
    newNodes.push(newContent.child(i));
  }

  return { fromPos, toPos, newNodes };
}

/**
 * Sync Yorkie remote changes to ProseMirror (downstream sync).
 * Rebuilds the PM doc from the Yorkie tree and applies it.
 */
export function syncToPM(
  view: EditorView,
  tree: { toJSON(): string },
  schema: Schema,
  elementToMarkMapping: Record<string, string>,
  onLog?: (type: 'local' | 'remote' | 'error', message: string) => void,
  wrapperElementName: string = 'span',
): void {
  const treeJSON = JSON.parse(tree.toJSON());
  const pmJSON = yorkieToJSON(
    treeJSON,
    elementToMarkMapping,
    [],
    wrapperElementName,
  );

  let newDoc;
  try {
    newDoc = Node.fromJSON(schema, pmJSON);
  } catch (e) {
    onLog?.(
      'error',
      `Failed to parse Yorkie tree as PM doc: ${(e as Error).message}`,
    );
    return;
  }

  // Use a transaction to replace content, preserving plugin state (undo history, etc.)
  const oldSelection = view.state.selection;
  const tr = view.state.tr.replaceWith(
    0,
    view.state.doc.content.size,
    newDoc.content,
  );
  tr.setMeta('yorkie-remote', true);
  tr.setMeta('addToHistory', false);

  // Restore selection near original position
  const maxPos = tr.doc.content.size;
  const newFrom = Math.min(oldSelection.from, maxPos);
  const newTo = Math.min(oldSelection.to, maxPos);
  try {
    tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo));
  } catch {
    tr.setSelection(TextSelection.create(tr.doc, Math.min(1, maxPos)));
  }

  view.dispatch(tr);
}

/**
 * Build a ProseMirror document from the current Yorkie tree state.
 */
export function buildDocFromYorkieTree(
  tree: { toJSON(): string },
  schema: Schema,
  elementToMarkMapping: Record<string, string>,
  wrapperElementName: string = 'span',
): Node {
  const treeJSON = JSON.parse(tree.toJSON());
  const pmJSON = yorkieToJSON(
    treeJSON,
    elementToMarkMapping,
    [],
    wrapperElementName,
  );
  return Node.fromJSON(schema, pmJSON);
}

/**
 * Try to apply a character-level diff within a single block.
 *
 * When one block is replaced with one block of the same type, uses
 * Fragment.findDiffStart/findDiffEnd to find the minimal changed range.
 * This produces a precise ReplaceStep that ProseMirror's step mapping
 * can correctly map cursors through, instead of replacing the whole block
 * (which maps all interior cursors to the end of the replacement).
 *
 * Returns true if successful, false to fall back to block-level replacement.
 */
function tryIntraBlockPMDiff(
  tr: Transaction,
  diff: DocDiff,
  oldDoc: Node,
): boolean {
  const { fromPos, toPos, newNodes } = diff;
  if (newNodes.length !== 1) return false;

  const newNode = newNodes[0];
  const oldNode = oldDoc.nodeAt(fromPos);
  if (!oldNode || oldNode.type !== newNode.type) return false;

  // Ensure the diff covers exactly one old block
  if (toPos - fromPos !== oldNode.nodeSize) return false;

  // Find the first position where the block contents diverge
  const start = oldNode.content.findDiffStart(newNode.content);
  if (start == null) return false;

  // Find where the contents stop diverging from the end
  const end = oldNode.content.findDiffEnd(newNode.content);
  if (!end) return false;

  // Handle overlap between prefix match and suffix match.
  // This happens for pure insertions where prefix + suffix > content length.
  let { a: endA, b: endB } = end;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }

  // Convert block-content-relative positions to document positions.
  // fromPos points to the block node; fromPos + 1 is the start of its content.
  const contentStart = fromPos + 1;

  // Use `Node.slice` + `tr.replace` instead of `content.cut` + `tr.replaceWith`.
  // For deeply nested blocks (e.g. bullet_list > list_item > paragraph),
  // `content.cut` returns a fragment with wrapper nodes (list_item, paragraph)
  // that `replaceWith` would insert as new siblings. `Node.slice` computes
  // the correct openStart/openEnd depths so `tr.replace` can match the
  // wrappers against the existing structure and only insert the inner content.
  tr.replace(
    contentStart + start,
    contentStart + endA,
    newNode.slice(start, endB),
  );

  return true;
}

/**
 * Find the document position corresponding to a text character offset
 * from a starting position. Walks through text nodes counting characters,
 * skipping block boundaries.
 */
function findPositionAtCharOffset(
  doc: Node,
  fromPos: number,
  charOffset: number,
): number {
  if (charOffset === 0) return fromPos;

  let remaining = charOffset;
  let targetPos = fromPos;

  doc.nodesBetween(fromPos, doc.content.size, (node, pos) => {
    if (remaining <= 0) return false;
    if (node.isText) {
      const textStart = Math.max(pos, fromPos);
      const available = pos + node.nodeSize - textStart;
      if (remaining <= available) {
        targetPos = textStart + remaining;
        remaining = 0;
        return false;
      }
      remaining -= available;
      targetPos = pos + node.nodeSize;
    }
    return undefined;
  });

  return targetPos;
}

/**
 * Apply a pre-computed DocDiff to the ProseMirror view as a remote transaction.
 *
 * When a single block is changed, tries character-level diffing first so that
 * ProseMirror's step mapping correctly preserves cursor positions within the
 * block. Falls back to full block replacement for structural changes.
 *
 * For block-level replacements (splits, merges, type changes), ProseMirror's
 * StepMap maps all interior positions to the end of the replacement. To
 * preserve the cursor, we restore it by matching its text character offset
 * in the new content.
 */
export function applyDocDiff(view: EditorView, diff: DocDiff): void {
  let tr = view.state.tr;

  let applied = false;
  try {
    applied = tryIntraBlockPMDiff(tr, diff, view.state.doc);
  } catch {
    // Intra-block diff failed (e.g. invalid step), start fresh
    tr = view.state.tr;
  }

  if (!applied) {
    const { fromPos, toPos, newNodes } = diff;
    if (newNodes.length === 0) {
      tr.delete(fromPos, toPos);
    } else {
      tr.replaceWith(fromPos, toPos, newNodes);

      // Block-level replacement maps all interior cursor positions to
      // the end of the replacement (StepMap behavior). Restore the
      // cursor by preserving its text character offset within the
      // replaced range.
      const selFrom = view.state.selection.from;
      if (selFrom > fromPos && selFrom < toPos) {
        const charOffset = view.state.doc.textBetween(fromPos, selFrom).length;
        const newPos = findPositionAtCharOffset(tr.doc, fromPos, charOffset);
        try {
          tr.setSelection(TextSelection.create(tr.doc, newPos));
        } catch {
          // Position invalid, let the default step mapping stand
        }
      }
    }
  }

  tr.setMeta('yorkie-remote', true);
  tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}

/**
 * Incrementally sync Yorkie remote changes to ProseMirror (downstream sync).
 *
 * Instead of rebuilding the entire EditorState, this function:
 * 1. Builds a new PM doc from the Yorkie tree
 * 2. Diffs it against the current PM doc at the block level
 * 3. Dispatches a minimal transaction that only touches changed blocks
 *
 * This preserves cursor position (via step mapping), undo history, and
 * avoids a full DOM re-render. Falls back to `syncToPM()` on errors.
 */
export function syncToPMIncremental(
  view: EditorView,
  tree: { toJSON(): string },
  schema: Schema,
  elementToMarkMapping: Record<string, string>,
  onLog?: (type: 'local' | 'remote' | 'error', message: string) => void,
  wrapperElementName: string = 'span',
): void {
  try {
    const newDoc = buildDocFromYorkieTree(
      tree,
      schema,
      elementToMarkMapping,
      wrapperElementName,
    );

    const diff = diffDocs(view.state.doc, newDoc);
    if (!diff) return; // No changes

    applyDocDiff(view, diff);
  } catch (e) {
    onLog?.(
      'error',
      `Incremental sync failed, falling back to full rebuild: ${(e as Error).message}`,
    );
    syncToPM(
      view,
      tree,
      schema,
      elementToMarkMapping,
      onLog,
      wrapperElementName,
    );
  }
}
