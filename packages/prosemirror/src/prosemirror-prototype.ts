import '../../sdk/src/yorkie.ts';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { exampleSetup } from 'prosemirror-example-setup';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

import {
  defaultMarkMapping,
  invertMapping,
  pmToYorkie,
  syncToYorkie,
  syncToPM,
  syncToPMIncremental,
  buildPositionMap,
  pmPosToYorkieIdx,
  yorkieIdxToPmPos,
  CursorManager,
} from '@yorkie-js/prosemirror';

// ============================================================
// 1. Schema Setup
// ============================================================
const mySchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks,
});

const markMapping = defaultMarkMapping;
const elementToMark = invertMapping(markMapping);

// ============================================================
// 2. Debug Logging
// ============================================================

/**
 * `log` appends a message to the sync-log panel and console.
 */
function log(type: string, message: string) {
  const el = document.getElementById('sync-log')!;
  const line = document.createElement('div');
  line.className = type;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  el.prepend(line);
  while (el.children.length > 50) el.removeChild(el.lastChild!);
  console.log(
    `%c[${type}] ${message}`,
    `color: ${type === 'local' ? 'green' : type === 'remote' ? 'blue' : 'red'}`,
  );
}

/**
 * `updateDebugPanels` refreshes the debug JSON panels.
 */
function updateDebugPanels(view: EditorView, tree: any) {
  document.getElementById('pm-doc')!.textContent = JSON.stringify(
    view.state.doc.toJSON(),
    null,
    2,
  );

  if (tree) {
    const treeJSON = JSON.parse(tree.toJSON());
    document.getElementById('yorkie-tree')!.textContent = JSON.stringify(
      treeJSON,
      null,
      2,
    );
    document.getElementById('yorkie-xml')!.textContent = tree.toXML();
  }
}

// ============================================================
// 3. Main: Wire everything together
// ============================================================

declare const yorkie: any;

/**
 * `main` initializes the ProseMirror editor and Yorkie connection.
 */
async function main() {
  let yorkieTree: any = null;
  let doc: any = null;
  let isSyncing = false;

  // Cursor manager
  const cursorManager = new CursorManager({
    enabled: true,
    overlayElement: document.getElementById('cursor-overlay')!,
    wrapperElement: document.getElementById('app-wrapper')!,
  });

  // Initial PM doc
  const initialDoc = mySchema.node('doc', null, [
    mySchema.node('paragraph', null, [
      mySchema.text('Hello '),
      mySchema.text('world', [mySchema.marks.strong.create()]),
      mySchema.text('! This is a '),
      mySchema.text('ProseMirror', [mySchema.marks.em.create()]),
      mySchema.text(' + Yorkie prototype.'),
    ]),
    mySchema.node('paragraph', null, [
      mySchema.text('Try typing, applying '),
      mySchema.text('bold', [mySchema.marks.strong.create()]),
      mySchema.text(' (Ctrl+B) or '),
      mySchema.text('italic', [mySchema.marks.em.create()]),
      mySchema.text(' (Ctrl+I), and splitting paragraphs.'),
    ]),
  ]);

  // Create PM editor state
  const state = EditorState.create({
    doc: initialDoc,
    plugins: exampleSetup({ schema: mySchema }).reduce(
      (uniquePlugins: Array<any>, plugin: any) => {
        if (!uniquePlugins.some((p: any) => p.key === plugin.key)) {
          uniquePlugins.push(plugin);
        }
        return uniquePlugins;
      },
      [],
    ),
  });

  // Create PM editor view
  const view = new EditorView(document.querySelector('#app'), {
    state,
    dispatchTransaction: (transaction) => {
      const newState = view.state.apply(transaction);
      view.updateState(newState);

      if (transaction.getMeta('yorkie-remote') || isSyncing) {
        updateDebugPanels(view, yorkieTree);
        return;
      }

      if (!transaction.steps.length) {
        if (yorkieTree && doc) {
          try {
            const treeJSON = JSON.parse(yorkieTree.toJSON());
            const map = buildPositionMap(newState.doc, treeJSON);
            const yorkieFrom = pmPosToYorkieIdx(map, newState.selection.from);
            const yorkieTo = pmPosToYorkieIdx(map, newState.selection.to);
            doc.update((root: any, presence: any) => {
              presence.set({
                selection: root.tree.indexRangeToPosRange([
                  yorkieFrom,
                  yorkieTo,
                ]),
              });
            });
          } catch (e: any) {
            log('error', `Selection sync failed: ${e.message}`);
            console.error(e);
          }
        }
        updateDebugPanels(view, yorkieTree);
        return;
      }

      if (yorkieTree && doc) {
        const oldDoc = transaction.before;
        const newDoc = newState.doc;

        log(
          'local',
          `steps: [${transaction.steps.map((s: any) => s.jsonID).join(', ')}], old blocks: ${oldDoc.childCount}, new blocks: ${newDoc.childCount}`,
        );

        doc.update((root: any, presence: any) => {
          try {
            isSyncing = true;
            syncToYorkie(root.tree, oldDoc, newDoc, markMapping, log);

            const treeJSON = JSON.parse(root.tree.toJSON());
            const map = buildPositionMap(newDoc, treeJSON);
            const yorkieFrom = pmPosToYorkieIdx(map, newState.selection.from);
            const yorkieTo = pmPosToYorkieIdx(map, newState.selection.to);
            presence.set({
              selection: root.tree.indexRangeToPosRange([yorkieFrom, yorkieTo]),
            });
          } catch (e: any) {
            log('error', `Upstream sync failed: ${e.message}`);
            console.error(e);
          } finally {
            isSyncing = false;
          }
        });
      }

      updateDebugPanels(view, yorkieTree);
    },
  });

  (window as any).view = view;
  updateDebugPanels(view, null);

  // ---- Connect to Yorkie ----
  try {
    const client = new yorkie.Client({ rpcAddr: 'http://localhost:8080' });
    await client.activate();

    doc = new yorkie.Document('pm-prototype', {
      enableDevtools: true,
    });
    (window as any).doc = doc;
    await client.attach(doc);

    doc.update((root: any) => {
      if (!root.tree) {
        const yorkieDoc = pmToYorkie(initialDoc, markMapping);
        log('local', `Initializing Yorkie tree: ${yorkieDoc.type}`);
        root.tree = new yorkie.Tree(yorkieDoc);
      }
    });

    yorkieTree = doc.getRoot().tree;

    // If tree already existed (second client), load its state into PM
    try {
      syncToPM(view, yorkieTree, mySchema, elementToMark, log);
      log('local', 'Loaded existing Yorkie tree into PM');
    } catch (e: any) {
      log('error', `Failed to load existing tree: ${e.message}`);
    }

    // Subscribe to remote changes
    doc.subscribe((event: any) => {
      if (event.type !== 'remote-change') return;
      if (isSyncing) return;

      const { operations } = event.value;
      const hasTreeOps = operations.some(
        (op: any) => op.type === 'tree-edit' || op.type === 'tree-style',
      );

      if (hasTreeOps) {
        log('remote', `Received ${operations.length} remote operations`);
        try {
          isSyncing = true;
          syncToPMIncremental(
            view,
            doc.getRoot().tree,
            mySchema,
            elementToMark,
            log,
          );
        } catch (e: any) {
          log('error', `Downstream sync failed: ${e.message}`);
          console.error(e);
        } finally {
          isSyncing = false;
        }
        updateDebugPanels(view, doc.getRoot().tree);
        cursorManager.repositionAll(view);
      }
    });

    // Subscribe to remote presence (cursor positions)
    doc.subscribe('others', (event: any) => {
      log('remote', `Presence event: ${event.type}`);
      if (event.type === 'presence-changed') {
        const { clientID, presence } = event.value;
        log('remote', `Presence from ${clientID}: ${JSON.stringify(presence)}`);
        if (presence.selection) {
          try {
            const tree = doc.getRoot().tree;
            const [fromIdx, toIdx] = tree.posRangeToIndexRange([
              presence.selection[0],
              presence.selection[1],
            ]);
            log('remote', `Yorkie indices: ${fromIdx}, ${toIdx}`);
            const treeJSON = JSON.parse(tree.toJSON());
            const map = buildPositionMap(view.state.doc, treeJSON);
            const pmFrom = yorkieIdxToPmPos(map, Math.min(fromIdx, toIdx));
            log('remote', `PM position: ${pmFrom}`);
            cursorManager.displayCursor(view, pmFrom, clientID);
          } catch (e: any) {
            log('error', `Remote cursor failed: ${e.message}`);
            console.error(e);
          }
        }
      }
    });

    // Set initial presence
    try {
      const treeJSON = JSON.parse(yorkieTree.toJSON());
      const map = buildPositionMap(view.state.doc, treeJSON);
      const sel = view.state.selection;
      const yorkieFrom = pmPosToYorkieIdx(map, sel.from);
      const yorkieTo = pmPosToYorkieIdx(map, sel.to);
      doc.update((_root: any, presence: any) => {
        presence.set({
          selection: yorkieTree.indexRangeToPosRange([yorkieFrom, yorkieTo]),
        });
      });
      log(
        'local',
        `Initial presence set: PM ${sel.from}-${sel.to} -> Yorkie ${yorkieFrom}-${yorkieTo}`,
      );
    } catch (e: any) {
      log('error', `Initial presence failed: ${e.message}`);
      console.error(e);
    }

    document.getElementById('status')!.className = 'status connected';
    document.getElementById('status')!.textContent =
      `Connected (doc: ${doc.getKey()})`;
    log('local', 'Connected to Yorkie server');
    updateDebugPanels(view, yorkieTree);
  } catch (e: any) {
    document.getElementById('status')!.textContent =
      'Offline mode (Yorkie server not available)';
    log('error', `Failed to connect: ${e.message}. Running in offline mode.`);
  }

  view.focus();
}

main();
