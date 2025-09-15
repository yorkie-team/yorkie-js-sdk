import type { EditOpInfo, OpInfo } from '@yorkie-js/sdk';
import yorkie, { DocEventType } from '@yorkie-js/sdk';
import { basicSetup, EditorView } from 'codemirror';
import { keymap } from '@codemirror/view';
import { Transaction, TransactionSpec } from '@codemirror/state';
import { network } from './network';
import { displayLog, displayPeers } from './utils';
import { YorkieDoc, YorkiePresence } from './type';
import './style.css';

const networkStatusElem = document.getElementById('network-status')!;
const peersElem = document.getElementById('peers')!;
const editorParentElem = document.getElementById('editor')!;

async function main() {
  // 01. create client with RPCAddr then activate it.
  const client = new yorkie.Client({
    rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  // 02-1. create a document then attach it into the client.
  const doc = new yorkie.Document<YorkieDoc, YorkiePresence>(
    `codemirror6-${new Date()
      .toISOString()
      .substring(0, 10)
      .replace(/-/g, '')}`,
    {
      enableDevtools: true,
    },
  );
  doc.subscribe('connection', (event) => {
    network.statusListener(networkStatusElem)(event);
  });
  doc.subscribe('presence', (event) => {
    if (event.type !== DocEventType.PresenceChanged) {
      displayPeers(peersElem, doc.getPresences(), client.getID()!);
    }
  });
  await client.attach(doc, {
    initialPresence: {
      username: client.getID()!.slice(-2),
    },
  });
  doc.update((root) => {
    if (!root.content) {
      root.content = new yorkie.Text();
    }
  }, 'create content if not exists');

  // 02-2. subscribe document event.
  const syncText = () => {
    const text = doc.getRoot().content;
    const selection = doc.getMyPresence().selection;
    const transactionSpec: TransactionSpec = {
      changes: { from: 0, to: view.state.doc.length, insert: text.toString() },
      annotations: [Transaction.remote.of(true)],
    };

    if (selection) {
      // Restore the cursor position when the text is replaced.
      const cursor = text.posRangeToIndexRange(selection);
      transactionSpec['selection'] = {
        anchor: cursor[0],
        head: cursor[1],
      };
    }
    view.dispatch(transactionSpec);
  };
  doc.subscribe((event) => {
    if (event.type === 'snapshot') {
      // The text is replaced to snapshot and must be re-synced.
      syncText();
    }
  });

  // Apply both remote changes and undo/redo-driven local changes coming from Yorkie.
  doc.subscribe('$.content', (event) => {
    // `remote-change` -> changes from other peers
    // `source === 'undoredo'` -> undo/redo executed via Yorkie (local but applied through history)
    if (
      event.type === 'remote-change' ||
      (event as any).source === 'undoredo'
    ) {
      const { operations } = event.value;
      handleOperations(operations);
    }
  });

  await client.sync();

  // 03-1. define function that bind the document with the codemirror(broadcast local changes to peers)
  const updateListener = EditorView.updateListener.of((viewUpdate) => {
    if (viewUpdate.docChanged) {
      for (const tr of viewUpdate.transactions) {
        // Note: undo/redo keyboard handling is intercepted by a custom keymap
        // so we don't treat native CM undo/redo transactions as local
        // operations to send to Yorkie here.
        const events = ['select', 'input', 'delete', 'move'];
        if (!events.map((event) => tr.isUserEvent(event)).some(Boolean)) {
          continue;
        }
        if (tr.annotation(Transaction.remote)) {
          continue;
        }
        let adj = 0;
        tr.changes.iterChanges((fromA, toA, _, __, inserted) => {
          const insertText = inserted.toJSON().join('\n');
          doc.update((root) => {
            root.content.edit(fromA + adj, toA + adj, insertText);
          }, `update content byA ${client.getID()}`);
          adj += insertText.length - (toA - fromA);
        });
      }
    }

    const hasFocus =
      viewUpdate.view.hasFocus && viewUpdate.view.dom.ownerDocument.hasFocus();
    const sel = hasFocus ? viewUpdate.state.selection.main : null;

    doc.update((root, presence) => {
      if (sel && root.content) {
        const selection = root.content.indexRangeToPosRange([
          sel.anchor,
          sel.head,
        ]);

        if (
          JSON.stringify(selection) !==
          JSON.stringify(presence.get('selection'))
        ) {
          presence.set({
            selection,
          });
        }
      } else if (presence.get('selection')) {
        presence.set({
          selection: undefined,
        });
      }
    });
  });

  // Intercept keyboard undo/redo and route through Yorkie's history.
  // This ensures multi-user undo/redo is coordinated by Yorkie and the
  // local CodeMirror undo stack doesn't diverge.
  const cmUndoRedoKeymap = keymap.of([
    {
      key: 'Mod-z',
      run: () => {
        console.log('undo');
        if (doc.history.canUndo()) {
          doc.history.undo();
          return true;
        }
        return false;
      },
    },
    {
      key: 'Mod-y',
      run: () => {
        console.log('redo');
        if (doc.history.canRedo()) {
          doc.history.redo();
          return true;
        }
        return false;
      },
    },
    {
      key: 'Mod-Shift-z',
      run: () => {
        console.log('redo');
        if (doc.history.canRedo()) {
          doc.history.redo();
          return true;
        }
        return false;
      },
    },
  ]);

  // 03-2. create codemirror instance
  // Height: show about 10 lines without needing actual blank text lines.
  // Adjust the px value if font-size/line-height changes.
  const fixedHeightTheme = EditorView.theme({
    '.cm-content, .cm-gutter': { minHeight: '210px' }, // ~10 lines (≈21px per line including padding)
  });
  console.log('EditorView', EditorView);
  const view = new EditorView({
    doc: '',
    extensions: [
      basicSetup,
      fixedHeightTheme,
      cmUndoRedoKeymap,
      updateListener,
    ],
    parent: editorParentElem,
  });

  // 03-3. define event handler that apply remote changes to local
  function handleOperations(operations: Array<OpInfo>) {
    for (const op of operations) {
      if (op.type === 'edit') {
        handleEditOp(op);
      }
    }
  }
  function handleEditOp(op: EditOpInfo) {
    const changes = [
      {
        from: Math.max(0, op.from),
        to: Math.max(0, op.to),
        insert: op.value!.content,
      },
    ];

    view.dispatch({
      changes,
      annotations: [Transaction.remote.of(true)],
    });
  }

  syncText();
}

main();
