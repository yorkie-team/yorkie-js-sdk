import yorkie, { DocEventType, Indexable, OpInfo } from '@yorkie-js/sdk';
import Quill, { Delta, type Op } from 'quill';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css';
import { displayError, displayStatus, statusListener } from './network';
import './style.css';
import { YorkieDoc, YorkiePresence } from './type';
import {
  createPeer,
  displayPeers,
  getDocKey,
  linkToDoc,
  peerColor,
} from './utils';

type TextValueType = {
  attributes?: Indexable;
  content?: string;
};

const statusElem = document.getElementById('network-status')!;
const peersElem = document.getElementById('peers')!;
const errorElem = document.getElementById('error')!;
const noticeElem = document.getElementById('notice')!;
const shareLinkElem = document.getElementById(
  'share-link',
) as HTMLAnchorElement;

const rpcAddr = import.meta.env.VITE_YORKIE_API_ADDR;
const documentKey = getDocKey('vanilla-quill');
linkToDoc(shareLinkElem, documentKey);

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
  displayStatus(statusElem, 'connecting');

  // 01-1. create client with RPCAddr then activate it.
  const client = new yorkie.Client({
    rpcAddr,
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  // 02-1. create a document then attach it into the client.
  const doc = new yorkie.Document<YorkieDoc, YorkiePresence>(documentKey, {
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

  doc.update((root) => {
    if (!root.content) {
      root.content = new yorkie.Text();
      root.content.edit(0, 0, '\n');
    }
  }, 'create content if not exists');

  function updateCursor(user: { clientID: string; presence: YorkiePresence }) {
    const { clientID, presence } = user;
    if (clientID === client.getActorID()) return;

    const { username, color, selection } = presence;
    if (!selection) return;
    // A peer's selection can point at text this client hasn't received yet;
    // skip that peer until it arrives instead of failing every peer.
    let range: [number, number];
    try {
      range = doc.getRoot().content.posRangeToIndexRange(selection);
    } catch {
      return;
    }
    cursors.createCursor(clientID, username, peerColor(color));
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
  // Track composition state to prevent selection updates during IME input
  let isComposing = false;

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
      history: {
        maxStack: 0, // Disable Quill's built-in undo/redo in favor of Yorkie's
      },
    },
    theme: 'snow',
  });
  const cursors = quill.getModule('cursors') as QuillCursors;

  // 03-1. subscribe document event, now that the editor exists to apply
  // remote changes and cursors to.
  doc.subscribe((event) => {
    if (event.type === 'snapshot') {
      // The text is replaced to snapshot and must be re-synced.
      syncText();
    }
  });

  doc.subscribe('$.content', (event) => {
    if (event.type === 'remote-change') {
      handleOperations(event.value.operations);
    } else if (event.source === 'undoredo') {
      handleOperations(event.value.operations, true);
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

  // Custom image handler to check file size (max 1MB)
  function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      // Images are stored inline in the document, so keep them small.
      const maxSize = 1 * 1024 * 1024; // 1MB in bytes
      noticeElem.hidden = file.size <= maxSize;
      if (file.size > maxSize) {
        const size = (file.size / 1024 / 1024).toFixed(2);
        noticeElem.textContent = `That image is ${size} MB. Pick one under 1 MB.`;
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
  // Track composition events to prevent selection updates during IME input
  const editorElement = quill.root;
  editorElement.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  editorElement.addEventListener('compositionend', () => {
    isComposing = false;
  });

  // 04-0. bind Yorkie undo/redo to keyboard shortcuts.
  editorElement.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        if (doc.history.canRedo()) {
          doc.history.redo();
        }
      } else {
        if (doc.history.canUndo()) {
          doc.history.undo();
        }
      }
      e.preventDefault();
    }
  });

  // 04-1. Quill to Document.
  quill
    .on('text-change', (delta, _, source) => {
      if (source === 'api' || !delta.ops) {
        return;
      }

      let from = 0,
        to = 0;
      try {
        doc.update((root, presence) => {
          for (const op of delta.ops) {
            if (op.attributes !== undefined || op.insert !== undefined) {
              if (op.retain !== undefined && typeof op.retain === 'number') {
                to = from + op.retain;
              }
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
                to = from;
              }

              if (range) {
                presence.set({
                  selection: root.content.indexRangeToPosRange(range),
                });
              }
            } else if (op.delete !== undefined) {
              to = from + op.delete;
              const range = root.content.edit(from, to, '');
              if (range) {
                presence.set({
                  selection: root.content.indexRangeToPosRange(range),
                });
              }
              // After delete, 'to' should stay at 'from' since content was removed
              to = from;
            } else if (
              op.retain !== undefined &&
              typeof op.retain === 'number'
            ) {
              from += op.retain;
              to = from;
            }
          }
        });
      } catch (err) {
        // `Text.edit` refuses an index that splits a UTF-16 surrogate pair,
        // and content carrying a lone half of one, so a local Quill change is
        // not guaranteed to reach the document. `doc.update` discarded the
        // whole delta, so rebuild the editor from the document instead of
        // leaving the two silently diverged.
        console.error('local edit rejected, re-syncing editor:', err);
        syncText();
        updateAllCursors();
      }
    })
    .on('selection-change', (range, _, source) => {
      if (!range) {
        return;
      }

      // Ignore selection changes during composition (e.g., Korean IME input)
      // to prevent cursor position from being broadcast incorrectly to other users
      if (isComposing) {
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

  // Handle selection changes when mouse is released outside the editor.
  // Only write presence when the selection actually moved, so a click
  // elsewhere on the page doesn't send an update to every peer.
  document.addEventListener('mouseup', () => {
    // Ignore selection changes during composition
    if (isComposing) {
      return;
    }

    const range = quill.getSelection();
    if (!range) return;
    const { selection } = doc.getMyPresence();
    if (selection) {
      const [from, to] = doc.getRoot().content.posRangeToIndexRange(selection);
      if (from === range.index && to === range.index + range.length) return;
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

  // 04-2. document to Quill(remote and undo/redo).
  function handleOperations(ops: Array<OpInfo>, moveCursor: boolean = false) {
    const hasFocus = quill.hasFocus();

    // On Safari, DOM mutations in a contenteditable element can steal focus
    // from other iframes. Temporarily disable contenteditable for remote
    // updates when this editor doesn't have focus.
    if (!hasFocus) {
      quill.root.setAttribute('contenteditable', 'false');
    }

    let cursorPosition = -1;
    for (const op of ops) {
      if (op.type === 'edit') {
        const from = op.from;
        const to = op.to;
        const { insert, attributes } = toDeltaOperation(op.value!, true);

        const deltaOperations: Op[] = [];

        if (from > 0) {
          deltaOperations.push({ retain: from });
        }

        const deleteLength = to - from;
        if (deleteLength > 0) {
          deltaOperations.push({ delete: deleteLength });
        }

        if (insert) {
          const op: Op = { insert };
          if (attributes) {
            op.attributes = attributes;
          }
          deltaOperations.push(op);
        }

        if (deltaOperations.length > 0) {
          const delta = new Delta(deltaOperations);
          quill.updateContents(delta, 'api');
        }

        if (moveCursor) {
          const insertLength =
            typeof insert === 'string' ? insert.length : insert ? 1 : 0;
          cursorPosition = from + insertLength;
        }
      } else if (op.type === 'style') {
        const from = op.from;
        const to = op.to;
        const { attributes } = toDeltaOperation(op.value!, false);

        if (attributes) {
          const deltaOperations: Op[] = [];

          if (from > 0) {
            deltaOperations.push({ retain: from });
          }

          const op: Op = { attributes };
          const retainLength = to - from;
          if (retainLength > 0) {
            op.retain = retainLength;
          }
          deltaOperations.push(op);

          const delta = new Delta(deltaOperations);
          quill.updateContents(delta, 'api');
        }

        if (moveCursor) {
          cursorPosition = to;
        }
      }
    }

    // Move cursor to the changed position for undo/redo
    if (moveCursor && cursorPosition >= 0) {
      quill.setSelection(cursorPosition, 0, 'api');
    }

    if (!hasFocus) {
      quill.root.setAttribute('contenteditable', 'true');
    }
  }

  // 05. synchronize text of document and Quill.
  function syncText() {
    const hasFocus = quill.hasFocus();
    if (!hasFocus) {
      quill.root.setAttribute('contenteditable', 'false');
    }

    const text = doc.getRoot().content;
    const delta = new Delta(
      text.values().map((value) => toDeltaOperation(value, true)),
    );
    quill.setContents(delta, 'api');

    if (!hasFocus) {
      quill.root.setAttribute('contenteditable', 'true');
    }
  }

  syncText();
  updateAllCursors();
}

main().catch(() => {
  displayError(statusElem, errorElem, rpcAddr);
});
