import yorkie, { DocEventType, type Tree } from '@yorkie-js/sdk';
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
import { displayError, displayStatus, statusListener } from './network';
import {
  PEER_COLORS,
  createPeer,
  displayPeers,
  getDocKey,
  linkToDoc,
  peerColor,
  strokeOf,
} from './utils';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-example-setup/style/style.css';
import './style.css';

type YorkieDoc = { tree: Tree };
type YorkiePresence = { username: string; color: string };

const statusElem = document.getElementById('network-status')!;
const peersElem = document.getElementById('peers')!;
const errorElem = document.getElementById('error')!;
const editorEl = document.getElementById('editor')!;
const cursorOverlayEl = document.getElementById('cursor-overlay')!;
const editorWrapperEl = document.getElementById('editor-wrapper')!;
const shareLinkElem = document.getElementById(
  'share-link',
) as HTMLAnchorElement;

const rpcAddr = import.meta.env.VITE_YORKIE_API_ADDR;
const docKey = getDocKey('pm-vanilla');
linkToDoc(shareLinkElem, docKey);

// Extend basic schema with list nodes
const mySchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks,
});

// The first client to open the document seeds it with this content.
const initialDoc = mySchema.node('doc', null, [
  mySchema.node('heading', { level: 2 }, [
    mySchema.text('Collaborative ProseMirror'),
  ]),
  mySchema.node('paragraph', null, [
    mySchema.text('Start editing to collaborate in real time.'),
  ]),
]);

async function main() {
  displayStatus(statusElem, 'connecting');

  // 01. create a client and activate it.
  const client = new yorkie.Client({
    rpcAddr,
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  // 02. attach the document with this peer's name and colour as presence.
  // The binding adds the selection to the same presence.
  const doc = new yorkie.Document<YorkieDoc, YorkiePresence>(docKey, {
    enableDevtools: import.meta.env.DEV,
  });
  doc.subscribe('connection', statusListener(statusElem));
  doc.subscribe('presence', (event) => {
    // Names and colours never change, so only joins and leaves redraw the
    // avatars. Presences are keyed by the client's actor ID.
    if (event.type !== DocEventType.PresenceChanged) {
      displayPeers(peersElem, doc.getPresences(), client.getActorID()!);
    }
  });
  await client.attach(doc, {
    initialPresence: createPeer(client.getActorID()!),
  });

  // 03. create the editor and bind it to the document's `tree`.
  const state = EditorState.create({
    doc: initialDoc,
    plugins: [...exampleSetup({ schema: mySchema }), remoteSelectionPlugin()],
  });
  const view = new EditorView(editorEl, { state });

  const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
    client,
    cursors: {
      enabled: true,
      overlayElement: cursorOverlayEl,
      wrapperElement: editorWrapperEl,
      colors: PEER_COLORS,
    },
  });
  binding.initialize();

  // The binding labels a remote cursor with the last two characters of the
  // peer's ID and colours it in arrival order. Relabel each new caret and
  // label with the name and colour that peer shares in presence, so they match
  // their avatar. The selection highlight is drawn separately by the binding
  // and keeps its arrival-order colour, so it can differ from the caret.
  new MutationObserver(() => {
    const labels = cursorOverlayEl.querySelectorAll<HTMLElement>(
      '.remote-cursor-label:not([data-named])',
    );
    labels.forEach((label) => {
      // Two characters can match more than one peer. Leave the label as the
      // binding drew it rather than guess which peer it belongs to.
      const peers = doc
        .getOthersPresences()
        .filter(({ clientID }) => clientID.endsWith(label.textContent!));
      if (peers.length !== 1) return;
      const { username } = peers[0].presence;
      const color = peerColor(peers[0].presence.color);
      label.dataset.named = '';
      label.textContent = username;
      label.style.backgroundColor = color;
      const caret = label.previousElementSibling as HTMLElement;
      caret.style.backgroundColor = strokeOf(color);
    });
  }).observe(cursorOverlayEl, { childList: true });
}

main().catch(() => {
  displayError(statusElem, errorElem, rpcAddr);
});
