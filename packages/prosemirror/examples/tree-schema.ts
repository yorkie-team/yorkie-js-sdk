import yorkie from '@yorkie-js/sdk';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { exampleSetup } from 'prosemirror-example-setup';
import {
  YorkieProseMirrorBinding,
  remoteSelectionPlugin,
} from '@yorkie-js/prosemirror';

// ── Yorkie Tree Schema Definition ──────────────────────────────
// This defines the schema that will be registered on the Yorkie server.
// ProseMirror marks (strong, em, code) become element nodes in the Yorkie tree,
// and bare text mixed with marks gets wrapped in <span> elements.
const schemaName = 'pm-tree-schema';
const schemaVersion = 2;
const schemaKey = `${schemaName}@${schemaVersion}`;
const schemaBody = 'type Document = {tree: yorkie.Tree;};';
const treeNodeRules = [
  { nodeType: 'doc', content: 'block+', marks: '', group: '' },
  {
    nodeType: 'paragraph',
    content: '(text | span | strong | em | code)*',
    marks: '',
    group: 'block',
  },
  {
    nodeType: 'heading',
    content: '(text | span | strong | em)*',
    marks: '',
    group: 'block',
  },
  { nodeType: 'span', content: 'text*', marks: '', group: '' },
  { nodeType: 'strong', content: '(text | em | code)*', marks: '', group: '' },
  {
    nodeType: 'em',
    content: '(text | strong | code)*',
    marks: '',
    group: '',
  },
  { nodeType: 'code', content: 'text*', marks: '', group: '' },
  { nodeType: 'text', content: '', marks: '', group: '' },
];

// ── ProseMirror Schema ─────────────────────────────────────────
const mySchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    heading: {
      content: 'inline*',
      group: 'block',
      attrs: { level: { default: 2 } },
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
      ],
      toDOM(node) {
        return [`h${node.attrs.level}`, 0];
      },
    },
    text: { group: 'inline' },
  },
  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM() {
        return ['strong', 0];
      },
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM() {
        return ['em', 0];
      },
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() {
        return ['code', 0];
      },
    },
  },
});

// ── DOM Elements ───────────────────────────────────────────────
const pmJsonEl = document.getElementById('pm-json')!;
const yorkieXmlEl = document.getElementById('yorkie-xml')!;
const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;
const editorEl = document.getElementById('editor')!;
const cursorOverlayEl = document.getElementById('cursor-overlay')!;
const editorWrapperEl = document.getElementById('editor-wrapper')!;
const setupEl = document.getElementById('setup-guide')!;

const params = new URLSearchParams(window.location.search);
const docKey =
  params.get('key') ||
  `pm-tree-schema-v2-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

const rpcAddr =
  (import.meta as any).env?.VITE_YORKIE_API_ADDR || 'http://localhost:8080';

/** Update the status indicator element. */
function setStatus(text: string, type: 'connecting' | 'connected' | 'error') {
  statusEl.textContent = text;
  statusEl.className = `status ${type === 'connecting' ? '' : type}`;
}

let yorkieDoc: any;

/** Append a timestamped entry to the log panel. */
function appendLog(type: string, message: string) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] [${type}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

/** Refresh the JSON and XML debug panels with current state. */
function updateDebugPanels(view: EditorView) {
  pmJsonEl.textContent = JSON.stringify(view.state.doc.toJSON(), null, 2);
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

/** ProseMirror plugin that updates debug panels on every editor update. */
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

const initialDoc = mySchema.node('doc', null, [
  mySchema.node('heading', { level: 2 }, [
    mySchema.text('Tree Schema + ProseMirror'),
  ]),
  mySchema.node('paragraph', null, [
    mySchema.text('This editor uses '),
    mySchema.text('Yorkie tree schema', [mySchema.marks.strong.create()]),
    mySchema.text(' validation. The schema restricts this document to '),
    mySchema.text('paragraphs', [mySchema.marks.code.create()]),
    mySchema.text(' and '),
    mySchema.text('headings', [mySchema.marks.code.create()]),
    mySchema.text(' only.'),
  ]),
  mySchema.node('paragraph', null, [
    mySchema.text('Try editing with '),
    mySchema.text('bold', [mySchema.marks.strong.create()]),
    mySchema.text(', '),
    mySchema.text('italic', [mySchema.marks.em.create()]),
    mySchema.text(', and '),
    mySchema.text('code', [mySchema.marks.code.create()]),
    mySchema.text(' marks.'),
  ]),
]);

// ── Admin API helpers for schema setup ─────────────────────────

/** Send a POST request to the Yorkie admin API. */
async function adminPost(path: string, body: object, authHeader?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) {
    headers['authorization'] = authHeader;
  }
  const res = await fetch(`${rpcAddr}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch {
      // use raw text
    }
    throw new Error(msg);
  }
  return res.json();
}

/** Create the tree schema on the Yorkie server via admin API. */
async function createSchemaOnServer(): Promise<void> {
  const btn = document.getElementById('setup-btn') as HTMLButtonElement;
  const resultEl = document.getElementById('setup-result')!;
  btn.disabled = true;
  btn.textContent = 'Creating...';
  resultEl.textContent = '';

  try {
    // 1. Login to get admin token
    const loginRes = await adminPost('yorkie.v1.AdminService/LogIn', {
      username: 'admin',
      password: 'admin',
    });
    const token = loginRes.token;

    // 2. Get default project's secret key
    const projRes = await adminPost(
      'yorkie.v1.AdminService/GetProject',
      { name: 'default' },
      `Bearer ${token}`,
    );
    const secretKey = projRes.project.secretKey;

    // 3. Create schema with project API key
    await adminPost(
      'yorkie.v1.AdminService/CreateSchema',
      {
        schema_name: schemaName,
        schema_version: schemaVersion,
        schema_body: schemaBody,
        rules: [
          {
            path: '$.tree',
            type: 'yorkie.Tree',
            tree_nodes: treeNodeRules.map((r) => ({
              node_type: r.nodeType,
              content: r.content,
              marks: r.marks,
              group: r.group,
            })),
          },
        ],
      },
      `API-Key ${secretKey}`,
    );

    resultEl.style.color = '#155724';
    resultEl.textContent = `Schema "${schemaKey}" created successfully! Reloading...`;
    setTimeout(() => window.location.reload(), 1000);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('already exists')) {
      resultEl.style.color = '#155724';
      resultEl.textContent = `Schema "${schemaKey}" already exists. Reloading...`;
      setTimeout(() => window.location.reload(), 1000);
    } else {
      resultEl.style.color = '#721c24';
      resultEl.textContent = `Failed: ${msg}`;
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  }
}

/** Display the schema setup guide when schema is not found. */
function showSetupGuide(errorMsg: string) {
  setupEl.style.display = 'block';
  document.getElementById('setup-error-detail')!.textContent = errorMsg;
  document.getElementById('setup-btn')!.addEventListener('click', () => {
    createSchemaOnServer();
  });
}

/** Check if an error message indicates a missing schema. */
function isSchemaNotFoundError(msg: string): boolean {
  return msg.includes('schema not found') || msg.includes('schema_not_found');
}

// ── Main ───────────────────────────────────────────────────────

/** Initialize the Yorkie client, attach document, and set up ProseMirror. */
async function main() {
  setStatus(`Connecting to Yorkie server... (doc: ${docKey})`, 'connecting');

  try {
    const client = new yorkie.Client({
      rpcAddr,
      apiKey: (import.meta as any).env?.VITE_YORKIE_API_KEY,
    });
    await client.activate();

    const doc = new yorkie.Document<Record<string, any>, Record<string, any>>(
      docKey,
      { enableDevtools: true },
    );

    // Attach with tree schema validation
    await client.attach(doc, {
      initialPresence: {},
      schema: schemaKey,
    });
    yorkieDoc = doc;

    setStatus(`Connected — doc: ${docKey} (schema: ${schemaKey})`, 'connected');
    appendLog('local', `Attached with schema: ${schemaKey}`);

    const state = EditorState.create({
      doc: initialDoc,
      plugins: [
        ...exampleSetup({ schema: mySchema }),
        remoteSelectionPlugin(),
        debugPanelPlugin(),
      ],
    });

    const view = new EditorView(editorEl, { state });

    const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
      client,
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
    const msg = (e as Error).message;
    setStatus(`Connection failed: ${msg}`, 'error');
    appendLog('error', msg);
    console.error(e);

    if (isSchemaNotFoundError(msg)) {
      showSetupGuide(msg);
    }
  }
}

main();
