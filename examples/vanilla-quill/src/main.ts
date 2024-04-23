/* eslint-disable jsdoc/require-jsdoc */
import yorkie, { DocEventType, Indexable, OperationInfo } from 'yorkie-js-sdk';
import Quill, { type DeltaOperation, type DeltaStatic } from 'quill';
import QuillCursors from 'quill-cursors';
import ColorHash from 'color-hash';
import { network } from './network';
import { displayLog, displayPeers } from './utils';
import { YorkieDoc, YorkiePresence } from './type';
import 'quill/dist/quill.snow.css';
import './style.css';

type TextValueType = {
  attributes?: Indexable;
  content?: string;
};

const peersElem = document.getElementById('peers')!;
const documentElem = document.getElementById('document')!;
const documentTextElem = document.getElementById('document-text')!;
const networkStatusElem = document.getElementById('network-status')!;
const colorHash = new ColorHash();
const documentKey = `vanilla-quill-${new Date()
  .toISOString()
  .substring(0, 10)
  .replace(/-/g, '')}`;

function toDeltaOperation<T extends TextValueType>(
  textValue: T,
): DeltaOperation {
  const { embed, ...restAttributes } = textValue.attributes ?? {};
  if (embed) {
    return { insert: JSON.parse(embed), attributes: restAttributes };
  }

  return {
    insert: textValue.content || '',
    attributes: textValue.attributes,
  };
}

async function main() {
  // 01-1. create client with RPCAddr then activate it.
  const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  // 01-2. subscribe client event.
  client.subscribe((event) => {
    network.statusListener(networkStatusElem)(event);
  });

  // 02-1. create a document then attach it into the client.
  const doc = new yorkie.Document<YorkieDoc, YorkiePresence>(documentKey);
  doc.subscribe('presence', (event) => {
    if (event.type !== DocEventType.PresenceChanged) {
      displayPeers(peersElem, doc.getPresences(), client.getID()!);
    }
  });

  await client.attach(doc, {
    initialPresence: {
      username: client.getID()!.slice(-2),
      color: colorHash.hex(client.getID()!.slice(-2)),
      selection: undefined,
    },
  });

  doc.update((root) => {
    if (!root.content) {
      root.content = new yorkie.Text();
      root.content.edit(0, 0, '\n');
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

  doc.subscribe('$.content', (event) => {
    if (event.type === 'remote-change') {
      handleOperations(event.value.operations);
    }
    updateAllCursors();
  });
  doc.subscribe('others', (event) => {
    if (event.type === DocEventType.Unwatched) {
      cursors.removeCursor(event.value.clientID);
    } else if (event.type === DocEventType.PresenceChanged) {
      updateCursor(event.value);
    }
  });

  function updateCursor(user: { clientID: string; presence: YorkiePresence }) {
    const { clientID, presence } = user;
    if (clientID === client.getID()) return;
    // TODO(chacha912): After resolving the presence initialization issue(#608),
    // remove the following check.
    if (!presence) return;

    const { username, color, selection } = presence;
    if (!selection) return;
    const range = doc.getRoot().content.posRangeToIndexRange(selection);
    cursors.createCursor(clientID, username, color);
    cursors.moveCursor(clientID, {
      index: range[0],
      length: range[1] - range[0],
    });
  }

  function updateAllCursors() {
    for (const user of doc.getPresences()) {
      updateCursor(user);
    }
  }

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

          doc.update((root, presence) => {
            let range;
            if (op.attributes !== undefined && op.insert === undefined) {
              root.content.setStyle(from, to, op.attributes);
            } else if (op.insert !== undefined) {
              if (to < from) {
                to = from;
              }

              if (typeof op.insert === 'object') {
                range = root.content.edit(from, to, ' ', {
                  embed: JSON.stringify(op.insert),
                  ...op.attributes,
                });
              } else {
                range = root.content.edit(from, to, op.insert, op.attributes);
              }
              from = to + op.insert.length;
            }

            range &&
              presence.set({
                selection: root.content.indexRangeToPosRange(range),
              });
          }, `update style by ${client.getID()}`);
        } else if (op.delete !== undefined) {
          to = from + op.delete;
          console.log(`%c local: ${from}-${to}: ''`, 'color: green');

          doc.update((root, presence) => {
            const range = root.content.edit(from, to, '');
            range &&
              presence.set({
                selection: root.content.indexRangeToPosRange(range),
              });
          }, `update content by ${client.getID()}`);
        } else if (op.retain !== undefined) {
          from = to + op.retain;
          to = from;
        }
      }
    })
    .on('selection-change', (range, _, source) => {
      if (!range) {
        return;
      }

      // NOTE(chacha912): If the selection in the Quill editor does not match the range computed by yorkie,
      // additional updates are necessary. This condition addresses situations where Quill's selection behaves
      // differently, such as when inserting text before a range selection made by another user, causing
      // the second character onwards to be included in the selection.
      if (source === 'api') {
        const { selection } = doc.getMyPresence();
        if (selection) {
          const [from, to] = doc
            .getRoot()
            .content.posRangeToIndexRange(selection);
          const { index, length } = range;
          if (from === index && to === index + length) {
            return;
          }
        }
      }

      doc.update((root, presence) => {
        presence.set({
          selection: root.content.indexRangeToPosRange([
            range.index,
            range.index + range.length,
          ]),
        });
      }, `update selection by ${client.getID()}`);
    });

  // 04-2. document to Quill(remote).
  function handleOperations(ops: Array<OperationInfo>) {
    const deltaOperations = [];
    let prevTo = 0;
    for (const op of ops) {
      if (op.type === 'edit') {
        const from = op.from;
        const to = op.to;
        const retainFrom = from - prevTo;
        const retainTo = to - from;

        const { insert, attributes } = toDeltaOperation(op.value!);
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
        prevTo = to;
      } else if (op.type === 'style') {
        const from = op.from;
        const to = op.to;
        const retainFrom = from - prevTo;
        const retainTo = to - from;
        const { attributes } = toDeltaOperation(op.value!);
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
        prevTo = to;
      }
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

    const delta = {
      ops: text.values().map((val) => toDeltaOperation(val)),
    } as DeltaStatic;
    quill.setContents(delta, 'api');
  }

  syncText();
  updateAllCursors();
  displayLog(documentElem, documentTextElem, doc);
}

main();
