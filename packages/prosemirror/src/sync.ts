import { EditorState, TextSelection } from 'prosemirror-state';
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
): void {
  const treeJSON = JSON.parse(tree.toJSON());
  const pmJSON = yorkieToJSON(treeJSON, elementToMarkMapping);

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

  // Preserve selection position if possible
  const oldSelection = view.state.selection;
  const newState = EditorState.create({
    doc: newDoc,
    plugins: view.state.plugins,
  });

  // Try to restore cursor near original position
  const maxPos = newDoc.content.size;
  const newFrom = Math.min(oldSelection.from, maxPos);
  const newTo = Math.min(oldSelection.to, maxPos);
  let selection;
  try {
    selection = TextSelection.create(newDoc, newFrom, newTo);
  } catch {
    selection = TextSelection.create(newDoc, Math.min(1, maxPos));
  }

  view.updateState(
    newState.apply(
      newState.tr.setSelection(selection).setMeta('yorkie-remote', true),
    ),
  );
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
): void {
  try {
    const treeJSON = JSON.parse(tree.toJSON());
    const pmJSON = yorkieToJSON(treeJSON, elementToMarkMapping);
    const newDoc = Node.fromJSON(schema, pmJSON);

    const diff = diffDocs(view.state.doc, newDoc);
    if (!diff) return; // No changes

    const { fromPos, toPos, newNodes } = diff;
    const tr = view.state.tr;

    if (newNodes.length === 0) {
      tr.delete(fromPos, toPos);
    } else {
      tr.replaceWith(fromPos, toPos, newNodes);
    }

    tr.setMeta('yorkie-remote', true);
    tr.setMeta('addToHistory', false);
    view.dispatch(tr);
  } catch (e) {
    onLog?.(
      'error',
      `Incremental sync failed, falling back to full rebuild: ${(e as Error).message}`,
    );
    syncToPM(view, tree, schema, elementToMarkMapping, onLog);
  }
}
