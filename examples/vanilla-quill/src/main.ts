/* eslint-disable jsdoc/require-jsdoc */
import yorkie, { type TextChange, RichText, Indexable } from 'yorkie-js-sdk';
import Quill, { type DeltaOperation, type DeltaStatic } from 'quill';
import QuillCursors from 'quill-cursors';
import ShortUniqueId from 'short-unique-id';
import ColorHash from 'color-hash';
import { network } from './network';
import { displayLog, displayPeers } from './utils';
import 'quill/dist/quill.snow.css';
import './style.css';

type YorkieDoc = {
  content: RichText;
};

type RichTextVal = {
  attributes?: Indexable;
  content?: string;
};

type RichTextChange = Array<TextChange & { attributes?: Indexable }>;

const peersElem = document.getElementById('peers')!;
const documentElem = document.getElementById('document')!;
const documentTextElem = document.getElementById('document-text')!;
const networkStatusElem = document.getElementById('network-status')!;
const shortUniqueID = new ShortUniqueId();
const colorHash = new ColorHash();

function toDeltaOperation<T extends RichTextVal>(
  richTextValue: T,
): DeltaOperation {
  const { embed, ...restAttributes } = richTextValue.attributes ?? {};
  if (embed) {
    return { insert: JSON.parse(embed), attributes: restAttributes };
  }

  return {
    insert: richTextValue.content || '',
    attributes: richTextValue.attributes,
  };
}

function findDefectors(
  peers: Record<string, Indexable>,
  newPeers: Record<string, Indexable>,
) {
  const usernames = [];
  for (const [clientID, presence] of Object.entries(peers)) {
    if (!newPeers[clientID]) {
      usernames.push(presence.username);
    }
  }
  return usernames;
}

async function main() {
  let peers: Record<string, Indexable>;

  // 01. create client with RPCAddr(envoy) then activate it.
  const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
    presence: {
      username: `username-${shortUniqueID()}`,
    },
  });
  await client.activate();

  // 01-2. subscribe client event.
  client.subscribe((event) => {
    network.statusListener(networkStatusElem)(event);
    if (event.type === 'peers-changed') {
      const newPeers = event.value[doc.getKey()];
      if (peers) {
        for (const username of findDefectors(peers, newPeers)) {
          cursors.removeCursor(username);
        }
      }
      peers = newPeers;
      displayPeers(peersElem, event.value[doc.getKey()], client.getID() || '');
    }
  });

  // 02-1. create a document then attach it into the client.
  const doc = new yorkie.Document<YorkieDoc>('vanilla-quill');
  await client.attach(doc);

  doc.update((root) => {
    if (!root.content) {
      root.content = new yorkie.RichText();
    }
  }, 'create content if not exists');

  // 02-2. subscribe document event.
  doc.subscribe((event) => {
    if (event.type === 'snapshot') {
      // The text is replaced to snapshot and must be re-synced.
      syncText();
    }
    displayLog(documentElem, documentTextElem, doc);
  });
  await client.sync();

  // 03. create an instance of Quill
  Quill.register('modules/cursors', QuillCursors);
  const quill = new Quill('#editor', {
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ header: 1 }, { header: 2 }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ script: 'sub' }, { script: 'super' }],
        [{ indent: '-1' }, { indent: '+1' }],
        [{ direction: 'rtl' }],
        [{ size: ['small', false, 'large', 'huge'] }],
        [{ header: [1, 2, 3, 4, 5, 6, false] }],
        [{ color: [] }, { background: [] }],
        [{ font: [] }],
        [{ align: [] }],
        ['image', 'video'],
        ['clean'],
      ],
      cursors: true,
    },
    theme: 'snow',
  });
  const cursors = quill.getModule('cursors');

  // 04. bind the document with the Quill.
  // 04-1. Quill to Document.
  quill
    .on('text-change', (delta, _, source) => {
      if (source === 'api' || !delta.ops) {
        return;
      }

      let from = 0,
        to = 0;
      console.log(`%c quill: ${JSON.stringify(delta.ops)}`, 'color: green');
      for (const op of delta.ops) {
        if (op.attributes !== undefined || op.insert !== undefined) {
          if (op.retain !== undefined) {
            to = from + op.retain;
          }
          console.log(
            `%c local: ${from}-${to}: ${op.insert} ${
              op.attributes ? JSON.stringify(op.attributes) : '{}'
            }`,
            'color: green',
          );

          doc.update((root) => {
            if (op.attributes !== undefined && op.insert === undefined) {
              root.content.setStyle(from, to, op.attributes);
            } else if (op.insert !== undefined) {
              if (to < from) {
                to = from;
              }

              if (typeof op.insert === 'object') {
                root.content.edit(from, to, ' ', {
                  embed: JSON.stringify(op.insert),
                  ...op.attributes,
                });
              } else {
                root.content.edit(from, to, op.insert, op.attributes);
              }
              from = to + op.insert.length;
            }
          }, `update style by ${client.getID()}`);
        } else if (op.delete !== undefined) {
          to = from + op.delete;
          console.log(`%c local: ${from}-${to}: ''`, 'color: green');

          doc.update((root) => {
            root.content.edit(from, to, '');
          }, `update content by ${client.getID()}`);
        } else if (op.retain !== undefined) {
          from = to + op.retain;
          to = from;
        }
      }
    })
    .on('selection-change', (range, _, source) => {
      if (source === 'api' || !range) {
        return;
      }

      doc.update((root) => {
        root.content.select(range.index, range.index + range.length);
      }, `update selection by ${client.getID()}`);
    });

  // 04-2. document to Quill(remote).
  function changeEventHandler(changes: RichTextChange) {
    const deltaOperations = [];
    let prevTo = 0;
    for (const change of changes) {
      const actor = change.actor;
      if (actor === client.getID()) {
        continue;
      }

      const actorName = peers[actor]['username'];
      const from = change.from;
      const to = change.to;
      const retainFrom = from - prevTo;
      const retainTo = to - from;

      if (change.type === 'content') {
        const { insert, attributes } = toDeltaOperation(change);
        console.log(`%c remote: ${from}-${to}: ${insert}`, 'color: skyblue');

        if (retainFrom) {
          deltaOperations.push({ retain: retainFrom });
        }
        if (retainTo) {
          deltaOperations.push({ delete: retainTo });
        }
        if (insert) {
          const op: DeltaOperation = { insert };
          if (attributes) {
            op.attributes = attributes;
          }
          deltaOperations.push(op);
        }
      } else if (change.type === 'style') {
        const { attributes } = toDeltaOperation(change);
        console.log(
          `%c remote: ${from}-${to}: ${JSON.stringify(attributes)}`,
          'color: skyblue',
        );

        if (retainFrom) {
          deltaOperations.push({ retain: retainFrom });
        }
        if (attributes) {
          const op: DeltaOperation = { attributes };
          if (retainTo) {
            op.retain = retainTo;
          }

          deltaOperations.push(op);
        }
      } else if (change.type === 'selection') {
        cursors.createCursor(actorName, actorName, colorHash.hex(actorName));
        cursors.moveCursor(actorName, {
          index: from,
          length: retainTo,
        });
      }

      prevTo = to;
    }

    if (deltaOperations.length) {
      console.log(
        `%c to quill: ${JSON.stringify(deltaOperations)}`,
        'color: green',
      );
      const delta = {
        ops: deltaOperations,
      } as DeltaStatic;
      quill.updateContents(delta, 'api');
    }
  }

  // 05. synchronize text of document and Quill.
  function syncText() {
    const text = doc.getRoot().content;
    text.onChanges(changeEventHandler);

    const delta = {
      ops: text.values().map((val) => toDeltaOperation(val)),
    } as DeltaStatic;
    quill.setContents(delta, 'api');
  }
  syncText();
  displayLog(documentElem, documentTextElem, doc);
}

main();
