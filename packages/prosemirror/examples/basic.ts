import yorkie from '@yorkie-js/sdk';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { exampleSetup } from 'prosemirror-example-setup';
import {
  YorkieProseMirrorBinding,
  remoteSelectionPlugin,
} from '@yorkie-js/prosemirror';

// Extend basic schema with bullet_list, ordered_list, list_item
const mySchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks,
});

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
  `pm-basic-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

/** Update the connection status indicator. */
function setStatus(text: string, type: 'connecting' | 'connected' | 'error') {
  statusEl.textContent = text;
  statusEl.className = `status ${type === 'connecting' ? '' : type}`;
}

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

// Initial document with various marks
const initialDoc = mySchema.node('doc', null, [
  mySchema.node('heading', { level: 2 }, [mySchema.text('Hello ProseMirror')]),
  mySchema.node('paragraph', null, [
    mySchema.text('This is '),
    mySchema.text('bold', [mySchema.marks.strong.create()]),
    mySchema.text(' and '),
    mySchema.text('italic', [mySchema.marks.em.create()]),
    mySchema.text(' text with '),
    mySchema.text('inline code', [mySchema.marks.code.create()]),
    mySchema.text('.'),
  ]),
  mySchema.node('blockquote', null, [
    mySchema.node('paragraph', null, [
      mySchema.text('A blockquote with '),
      mySchema.text('bold italic', [
        mySchema.marks.strong.create(),
        mySchema.marks.em.create(),
      ]),
      mySchema.text(' text.'),
    ]),
  ]),
  mySchema.node('bullet_list', null, [
    mySchema.node('list_item', null, [
      mySchema.node('paragraph', null, [mySchema.text('First item')]),
    ]),
    mySchema.node('list_item', null, [
      mySchema.node('paragraph', null, [mySchema.text('Second item')]),
    ]),
    mySchema.node('list_item', null, [
      mySchema.node('paragraph', null, [
        mySchema.text('Third item with '),
        mySchema.text('bold', [mySchema.marks.strong.create()]),
      ]),
    ]),
  ]),
  mySchema.node('paragraph', null, [
    mySchema.text('Edit this document and watch the debug panels update live.'),
  ]),
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
        ...exampleSetup({ schema: mySchema }),
        remoteSelectionPlugin(),
        debugPanelPlugin(),
      ],
    });

    const view = new EditorView(editorEl, { state });

    // 4. Create and initialize binding
    const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
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
