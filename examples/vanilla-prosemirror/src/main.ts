import yorkie from '@yorkie-js/sdk';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { exampleSetup } from 'prosemirror-example-setup';
import {
  YorkieProseMirrorBinding,
  remoteSelectionPlugin,
} from '@yorkie-js/prosemirror';
import './style.css';

const statusEl = document.getElementById('status')!;
const editorEl = document.getElementById('editor')!;
const cursorOverlayEl = document.getElementById('cursor-overlay')!;
const editorWrapperEl = document.getElementById('editor-wrapper')!;

// Extend basic schema with list nodes
const mySchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks,
});

// Document key from URL query param or date-based fallback
const params = new URLSearchParams(window.location.search);
const docKey =
  params.get('key') ||
  `pm-vanilla-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

function setStatus(text: string, type: 'connecting' | 'connected' | 'error') {
  statusEl.textContent = text;
  statusEl.className = `status ${type === 'connecting' ? '' : type}`;
}

// Initial document
const initialDoc = mySchema.node('doc', null, [
  mySchema.node('heading', { level: 2 }, [
    mySchema.text('Collaborative ProseMirror'),
  ]),
  mySchema.node('paragraph', null, [
    mySchema.text('Start editing to collaborate in real time.'),
  ]),
]);

async function main() {
  setStatus(`Connecting to Yorkie server... (doc: ${docKey})`, 'connecting');

  try {
    const client = new yorkie.Client({
      rpcAddr:
        (import.meta as any).env?.VITE_YORKIE_API_ADDR ||
        'http://localhost:8080',
      apiKey: (import.meta as any).env?.VITE_YORKIE_API_KEY,
    });
    await client.activate();

    const doc = new yorkie.Document<Record<string, any>, Record<string, any>>(
      docKey,
      { enableDevtools: true },
    );
    await client.attach(doc, { initialPresence: {} });

    setStatus(`Connected — doc: ${docKey}`, 'connected');

    const state = EditorState.create({
      doc: initialDoc,
      plugins: [
        ...exampleSetup({ schema: mySchema }),
        remoteSelectionPlugin(),
      ],
    });

    const view = new EditorView(editorEl, { state });

    const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
      cursors: {
        enabled: true,
        overlayElement: cursorOverlayEl,
        wrapperElement: editorWrapperEl,
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
