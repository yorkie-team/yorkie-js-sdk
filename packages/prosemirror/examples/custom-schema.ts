import yorkie from '@yorkie-js/sdk';
import { EditorState, Plugin, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { toggleMark, baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import {
  YorkieProseMirrorBinding,
  buildMarkMapping,
  remoteSelectionPlugin,
} from '@yorkie-js/prosemirror';

const pmJsonEl = document.getElementById('pm-json')!;
const yorkieXmlEl = document.getElementById('yorkie-xml')!;
const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;
const editorEl = document.getElementById('editor')!;
const cursorOverlayEl = document.getElementById('cursor-overlay')!;
const editorWrapperEl = document.getElementById('editor-wrapper')!;

// Document key from URL query param or date-based fallback
const params = new URLSearchParams(window.location.search);
const docKey =
  params.get('key') ||
  `pm-custom-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

/** Update the connection status indicator. */
function setStatus(text: string, type: 'connecting' | 'connected' | 'error') {
  statusEl.textContent = text;
  statusEl.className = `status ${type === 'connecting' ? '' : type}`;
}

// ── Custom schema ─────────────────────────────────────────────
const mySchema = new Schema({
  nodes: {
    doc: { content: '(paragraph | notegroup | boring_paragraph)*' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    boring_paragraph: {
      content: 'text*',
      group: 'block',
      marks: '',
      parseDOM: [{ tag: 'p.boring', priority: 60 }],
      toDOM() {
        return ['p', { class: 'boring' }, 0];
      },
    },
    notegroup: {
      content: 'note+',
      group: 'block',
      parseDOM: [{ tag: 'notegroup' }],
      toDOM() {
        return ['notegroup', 0];
      },
    },
    note: {
      content: 'text*',
      parseDOM: [{ tag: 'note' }],
      toDOM() {
        return ['note', 0];
      },
    },
    star: {
      inline: true,
      group: 'inline',
      parseDOM: [{ tag: 'star' }],
      toDOM() {
        return ['star'];
      },
    },
    text: { group: 'inline' },
  },
  marks: {
    shouting: {
      parseDOM: [{ tag: 'shouting' }],
      toDOM() {
        return ['shouting', 0];
      },
    },
  },
});

// Build mark mapping from schema (auto-detects shouting)
const markMapping = buildMarkMapping(mySchema);

// Yorkie doc reference, set after attach
let yorkieDoc: any;

/** Append a timestamped entry to the log panel. */
function appendLog(type: string, message: string) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] [${type}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

/** Update the debug panels with PM JSON and Yorkie XML. */
function updateDebugPanels(view: EditorView) {
  pmJsonEl.textContent = JSON.stringify(view.state.doc.toJSON(), null, 2);

  // Defer XML read: the PM plugin fires during updateState(), before the
  // binding syncs to Yorkie in the same dispatchTransaction(). A microtask
  // runs after that sync completes, so the XML reflects the latest state.
  queueMicrotask(() => {
    if (yorkieDoc) {
      const tree = yorkieDoc.getRoot().tree;
      if (tree) {
        try {
          yorkieXmlEl.textContent = tree.toXML();
        } catch {
          // Tree may not be ready yet
        }
      }
    }
  });
}

/** PM plugin that updates debug panels on every state change. */
function debugPanelPlugin() {
  return new Plugin({
    view(editorView) {
      updateDebugPanels(editorView);
      return {
        update(view) {
          updateDebugPanels(view);
        },
      };
    },
  });
}

/** Insert a star node at the current cursor position. */
function insertStar(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const type = mySchema.nodes.star;
  const { $from } = state.selection;
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) {
    return false;
  }
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(type.create()));
  }
  return true;
}

// ── Initial document ──────────────────────────────────────────
const initialDoc = mySchema.node('doc', null, [
  mySchema.node('paragraph', null, [mySchema.text('ab')]),
  mySchema.node('notegroup', null, [
    mySchema.node('note', null, [mySchema.text('cd')]),
    mySchema.node('note', null, [mySchema.text('ef')]),
  ]),
  mySchema.node('boring_paragraph', null, [mySchema.text('gh')]),
]);

/** Connect to Yorkie server and initialize collaborative editor. */
async function main() {
  setStatus(`Connecting to Yorkie server... (doc: ${docKey})`, 'connecting');

  try {
    // 1. Create and activate Yorkie client
    const client = new yorkie.Client({
      rpcAddr:
        (import.meta as any).env?.VITE_YORKIE_API_ADDR ||
        'http://localhost:8080',
      apiKey: (import.meta as any).env?.VITE_YORKIE_API_KEY,
    });
    await client.activate();

    // 2. Create and attach document
    const doc = new yorkie.Document<Record<string, any>, Record<string, any>>(
      docKey,
      { enableDevtools: true },
    );
    await client.attach(doc, {
      initialPresence: {},
    });
    yorkieDoc = doc;

    setStatus(`Connected — doc: ${docKey}`, 'connected');
    appendLog('local', `Attached to document: ${docKey}`);

    // 3. Create ProseMirror editor
    const state = EditorState.create({
      doc: initialDoc,
      plugins: [
        history(),
        keymap({
          'Mod-b': toggleMark(mySchema.marks.shouting),
          'Mod-u': insertStar,
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
        }),
        keymap(baseKeymap),
        remoteSelectionPlugin(),
        debugPanelPlugin(),
      ],
    });

    const view = new EditorView(editorEl, { state });

    // 4. Create and initialize binding
    const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
      markMapping,
      cursors: {
        enabled: true,
        overlayElement: cursorOverlayEl,
        wrapperElement: editorWrapperEl,
      },
      onLog(type, message) {
        appendLog(type, message);
      },
    });
    binding.initialize();

    view.focus();
  } catch (e) {
    setStatus(`Connection failed: ${(e as Error).message}`, 'error');
    console.error(e);
  }
}

main();
