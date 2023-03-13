/* eslint-disable jsdoc/require-jsdoc */
import yorkie, {
  type TextChange,
  type Text as YorkieText,
} from 'yorkie-js-sdk';
import { basicSetup, EditorView } from 'codemirror';
import { keymap } from '@codemirror/view';
import {
  markdown,
  markdownKeymap,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import { Transaction, type ChangeSpec } from '@codemirror/state';
import { network } from './network';
import { displayLog, displayPeers } from './utils';
import './style.css';

type YorkieDoc = {
  content: YorkieText;
};

const editorParentElem = document.getElementById('editor')!;
const peersElem = document.getElementById('peers')!;
const documentElem = document.getElementById('document')!;
const documentTextElem = document.getElementById('document-text')!;
const networkStatusElem = document.getElementById('network-status')!;

async function main() {
  // 01. create client with RPCAddr(envoy) then activate it.
  const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  // subscribe peer change event
  client.subscribe((event) => {
    network.statusListener(networkStatusElem)(event);
    if (event.type === 'peers-changed') {
      displayPeers(peersElem, event.value[doc.getKey()], client.getID() ?? '');
    }
  });

  // 02-1. create a document then attach it into the client.
  const doc = new yorkie.Document<YorkieDoc>(
    `codemirror6-${new Date()
      .toISOString()
      .substring(0, 10)
      .replace(/-/g, '')}`,
  );
  await client.attach(doc);
  doc.update((root) => {
    if (!root.content) {
      root.content = new yorkie.Text();
    }
  }, 'create content if not exists');

  // 02-2. subscribe document event.
  const syncText = () => {
    const text = doc.getRoot().content;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text.toString() },
      annotations: [Transaction.remote.of(true)],
    });
  };
  doc.subscribe((event) => {
    if (event.type === 'snapshot') {
      // The text is replaced to snapshot and must be re-synced.
      syncText();
    }
    displayLog(documentElem, documentTextElem, doc);
  });
  await client.sync();

  // 03-1. define function that bind the document with the codemirror(broadcast local changes to peers)
  const updateListener = EditorView.updateListener.of((viewUpdate) => {
    if (viewUpdate.docChanged) {
      for (const tr of viewUpdate.transactions) {
        const events = ['select', 'input', 'delete', 'move', 'undo', 'redo'];
        if (!events.map((event) => tr.isUserEvent(event)).some(Boolean)) {
          continue;
        }
        if (tr.annotation(Transaction.remote)) {
          continue;
        }
        tr.changes.iterChanges((fromA, toA, _, __, inserted) => {
          doc.update((root) => {
            root.content.edit(fromA, toA, inserted.toJSON().join('\n'));
          }, `update content byA ${client.getID()}`);
        });
      }
    }
  });

  // 03-2. create codemirror instance
  const view = new EditorView({
    doc: '',
    extensions: [
      basicSetup,
      markdown({ base: markdownLanguage }),
      keymap.of(markdownKeymap),
      updateListener,
    ],
    parent: editorParentElem,
  });

  // 03-3. define event handler that apply remote changes to local
  const changeEventHandler = (changes: Array<TextChange>) => {
    const clientId = client.getID();
    const changeSpecs: Array<ChangeSpec> = changes
      .filter(
        (change) => change.type === 'content' && change.actor !== clientId,
      )
      .map((change) => ({
        from: Math.max(0, change.from),
        to: Math.max(0, change.to),
        insert: change.value!.content,
      }));

    view.dispatch({
      changes: changeSpecs,
      annotations: [Transaction.remote.of(true)],
    });
  };
  const text = doc.getRoot().content;
  text.onChanges(changeEventHandler);
  syncText();
  displayLog(documentElem, documentTextElem, doc);
}

main();
