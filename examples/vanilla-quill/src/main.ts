import yorkie, { DocEventType, Indexable, OpInfo } from '@yorkie-js/sdk';
import ColorHash from 'color-hash';
import Quill, { Delta, type Op } from 'quill';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css';
import { network } from './network';
import './style.css';
import { YorkieDoc, YorkiePresence } from './type';
import { displayPeers } from './utils';

type TextValueType = {
  attributes?: Indexable;
  content?: string;
};

const peersElem = document.getElementById('peers')!;
const networkStatusElem = document.getElementById('network-status')!;
const colorHash = new ColorHash();

// Get document key from query string or use date-based key as fallback
const params = new URLSearchParams(window.location.search);
const documentKey =
  params.get('key') ||
  `vanilla-quill-${new Date()
    .toISOString()
    .substring(0, 10)
    .replace(/-/g, '')}`;

// Filter out null values from attributes
function filterNullAttrs(attributes?: Indexable): Indexable | undefined {
  if (!attributes) return;

  const filtered: Indexable = {};
  let hasNonNullValue = false;

  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null) {
      filtered[key] = value;
      hasNonNullValue = true;
    }
  }

  return hasNonNullValue ? filtered : undefined;
}

function toDeltaOperation<T extends TextValueType>(
  textValue: T,
  filterNull: boolean = false,
): Op {
  const { embed, ...restAttributes } = textValue.attributes ?? {};
  if (embed) {
    return {
      insert: JSON.parse(embed.toString()),
      attributes: filterNull ? filterNullAttrs(restAttributes) : restAttributes,
    };
  }

  return {
    insert: textValue.content || '',
    attributes: filterNull
      ? filterNullAttrs(textValue.attributes)
      : textValue.attributes,
  };
}

async function main() {
  // 01-1. create client with RPCAddr then activate it.
  const client = new yorkie.Client({
    rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  // 02-1. create a document then attach it into the client.
  const doc = new yorkie.Document<YorkieDoc, YorkiePresence>(documentKey, {
    enableDevtools: true,
  });
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
      // Simplified toolbar: keep only core formatting features.
      // Add or remove items easily by editing this array.
      toolbar: {
        container: [
          ['bold', 'italic', 'underline'],
          [{ header: 1 }, { header: 2 }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'code-block'],
          ['image', 'video'],
          ['clean'],
        ],
        handlers: {
          image: imageHandler,
        },
      },
      cursors: true,
    },
    theme: 'snow',
  });
  const cursors = quill.getModule('cursors') as QuillCursors;

  // Custom image handler to check file size (max 1MB)
  function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const maxSize = 1 * 1024 * 1024; // 1MB in bytes
      if (file.size > maxSize) {
        alert(
          `Image size is too large. (Max: 1MB)\nCurrent file size: ${(
            file.size /
            1024 /
            1024
          ).toFixed(2)}MB`,
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const range = quill.getSelection(true);
        const imageData = e.target?.result;

        // Insert image in Quill editor first
        quill.insertEmbed(range.index, 'image', imageData, 'user');
        quill.setSelection(range.index + 1, 0, 'silent');
      };
      reader.readAsDataURL(file);
    };
  }

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
      doc.update((root, presence) => {
        for (const op of delta.ops) {
          if (op.attributes !== undefined || op.insert !== undefined) {
            if (op.retain !== undefined && typeof op.retain === 'number') {
              to = from + op.retain;
            }
            console.log(
              `%c local: ${from}-${to}: ${op.insert} ${
                op.attributes ? JSON.stringify(op.attributes) : '{}'
              }`,
              'color: green',
            );

            let range;
            if (op.attributes !== undefined && op.insert === undefined) {
              root.content.setStyle(from, to, op.attributes as Indexable);
              from = to;
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
                range = root.content.edit(
                  from,
                  to,
                  op.insert,
                  op.attributes as Indexable,
                );
              }
              from =
                to + (typeof op.insert === 'string' ? op.insert.length : 1);
            }

            if (range) {
              presence.set({
                selection: root.content.indexRangeToPosRange(range),
              });
            }
          } else if (op.delete !== undefined) {
            to = from + op.delete;
            console.log(`%c local: ${from}-${to}: ''`, 'color: green');

            const range = root.content.edit(from, to, '');
            if (range) {
              presence.set({
                selection: root.content.indexRangeToPosRange(range),
              });
            }
            // After delete, 'to' should stay at 'from' since content was removed
            to = from;
          } else if (op.retain !== undefined && typeof op.retain === 'number') {
            from = to + op.retain;
            to = from;
          }
        }
      });
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

  // Handle selection changes when mouse is released outside the editor
  document.addEventListener('mouseup', () => {
    const range = quill.getSelection();
    if (range) {
      doc.update((root, presence) => {
        presence.set({
          selection: root.content.indexRangeToPosRange([
            range.index,
            range.index + range.length,
          ]),
        });
      }, `update selection by ${client.getID()}`);
    }
  });

  // 04-2. document to Quill(remote).
  function handleOperations(ops: Array<OpInfo>) {
    const deltaOperations = [];
    let prevTo = 0;
    for (const op of ops) {
      if (op.type === 'edit') {
        const from = op.from;
        const to = op.to;
        const retainFrom = from - prevTo;
        const retainTo = to - from;

        const { insert, attributes } = toDeltaOperation(op.value!, true);
        console.log(`%c remote: ${from}-${to}: ${insert}`, 'color: skyblue');

        if (retainFrom) {
          deltaOperations.push({ retain: retainFrom });
        }
        if (retainTo) {
          deltaOperations.push({ delete: retainTo });
        }
        const insertLength = typeof insert === 'string' ? insert.length : 0;
        if (insert) {
          const op: Op = { insert };
          if (attributes) {
            op.attributes = attributes;
          }
          deltaOperations.push(op);
        }
        // Update prevTo considering the actual text change:
        // from + length of inserted text (delete is already handled by retainTo)
        prevTo = from + insertLength;
      } else if (op.type === 'style') {
        const from = op.from;
        const to = op.to;
        const retainFrom = from - prevTo;
        const retainTo = to - from;
        const { attributes } = toDeltaOperation(op.value!, false);
        console.log(
          `%c remote: ${from}-${to}: ${JSON.stringify(attributes)}`,
          'color: skyblue',
        );

        if (retainFrom) {
          deltaOperations.push({ retain: retainFrom });
        }
        if (attributes) {
          const op: Op = { attributes };
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
      const delta = new Delta(deltaOperations);
      quill.updateContents(delta, 'api');
    }
  }

  // 05. synchronize text of document and Quill.
  function syncText() {
    const text = doc.getRoot().content;
    const delta = new Delta(
      text.values().map((value) => toDeltaOperation(value, true)),
    );
    quill.setContents(delta, 'api');
  }

  syncText();
  updateAllCursors();
}

main();
