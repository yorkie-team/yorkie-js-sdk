import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Node } from 'prosemirror-model';
import type { Schema } from 'prosemirror-model';
import { yorkieToJSON } from './convert';

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
