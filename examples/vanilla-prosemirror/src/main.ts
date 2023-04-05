import yorkie, { Text, Document } from 'yorkie-js-sdk';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, Node } from 'prosemirror-model';
import { exampleSetup } from 'prosemirror-example-setup';
import { toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';

import './style.css';

const mySchema = new Schema({
  nodes: {
    text: {
      group: 'inline',
    },
    star: {
      inline: true,
      group: 'inline',
      toDOM() {
        return ['star', '<🌟>'];
      },
      parseDOM: [{ tag: 'star' }],
    },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM() {
        return ['p', 0];
      },
      parseDOM: [{ tag: 'p' }],
    },
    boring_paragraph: {
      group: 'block',
      content: 'text*',
      marks: '',
      toDOM() {
        return ['p', { class: 'boring' }, 0];
      },
      parseDOM: [{ tag: 'p.boring', priority: 60 }],
    },
    note: {
      group: 'block',
      content: 'text*',
      toDOM() {
        return ['note', 0];
      },
      parseDOM: [{ tag: 'note' }],
    },
    notegroup: {
      group: 'block',
      content: 'note+',
      toDOM() {
        return ['notegroup', 0];
      },
      parseDOM: [{ tag: 'notegroup' }],
    },
    doc: {
      content: 'block+',
    },
  },
  marks: {
    shouting: {
      toDOM() {
        return ['shouting', 0];
      },
      parseDOM: [{ tag: 'shouting' }],
    },
  },
});

const initialDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'para ',
        },
        {
          type: 'star',
        },
      ],
    },
    {
      type: 'notegroup',
      content: [
        {
          type: 'note',
          content: [
            {
              type: 'text',
              text: 'This is note 1',
            },
          ],
        },
        {
          type: 'note',
          content: [
            {
              type: 'text',
              text: 'This is note 2',
            },
          ],
        },
      ],
    },
    {
      type: 'boring_paragraph',
      content: [
        {
          type: 'text',
          text: 'boring para',
        },
      ],
    },
  ],
};

/**
 * Insert a star at the current cursor position.
 */
function insertStar(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const type = mySchema.nodes.star;
  const { $from } = state.selection;
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) {
    return false;
  }

  dispatch!(state.tr.replaceSelectionWith(type.create()));
  return true;
}

/**
 * Run main.
 */
async function main() {
  const client = new yorkie.Client('http://localhost:8080');
  await client.activate();

  // 01. Build yorkie.Text from ProseMirror doc.
  const doc = new yorkie.Document<{ text: Text }>('prosemirror');
  await client.attach(doc);
  doc.update((root) => {
    root.text = new yorkie.Text();

    let idx = 0;
    traverseDoc(initialDoc, 0, (node: any, depth: number) => {
      if (node.type === 'text') {
        root.text.edit(idx, idx, node.text, { type: node.type, depth });
        idx += node.text.length;
      } else {
        root.text.edit(idx, idx, '\n', { type: node.type, depth });
        idx += 1;
      }
    });
  });

  const state = EditorState.create({
    doc: Node.fromJSON(mySchema, initialDoc),
    plugins: [
      keymap({
        'Ctrl-b': toggleMark(mySchema.marks.shouting),
        'Ctrl-u': insertStar,
      }),
      ...exampleSetup({ schema: mySchema }),
    ],
  });
  const view = new EditorView(document.querySelector('#app'), {
    state,
    dispatchTransaction: (transaction) => {
      // 02. Apply transaction to yorkie.Text.
      view.updateState(view.state.apply(transaction));

      // If the steps are empty, it means the transaction is not applied to the document.
      // Only the selection is changed.
      if (!transaction.steps.length) {
        return;
      }

      doc.update((root) => {
        for (const step of transaction.steps) {
          const {
            from,
            to,
            slice: { content },
          } = step as any;

          // TODO(hackerwins): We need to change yorkie.Tree to support depth and path.
          // TODO(hackerwins): We need to understand how to handle steps.
          // TODO(hackerwins): We need to understand the indexes of the ProseMirror.

          // 02-1. Delete the given range.
          if (!content.content.length) {
            root.text.delete(from - 1, to - 1);
            return;
          }

          // 02-2. Edit the given range with the given content.
          for (const node of content.content) {
            if (node.isText) {
              root.text.edit(from - 1, to - 1, node.text, {
                type: node.type.name,
                // TODO(hackerwins): Add depth to yorkie.Text.
                depth: 0,
              });
            } else {
              root.text.edit(from - 1, to - 1, '\n', {
                type: node.type.name,
                // TODO(hackerwins): Add depth to yorkie.Text.
                depth: 0,
              });
            }
          }
        }
      });
      printYorkieDoc(doc);
    },
  });
  view.focus();

  // 03. Subscribe the changes of yorkie.Text and apply them to ProseMirror.
  // TODO(hackerwins): Implement this.
}

/**
 * `printYorkieDoc` prints the content of the yorkie.Text.
 */
function printYorkieDoc(doc: Document<{ text: Text }>) {
  console.log(JSON.stringify(doc.getRoot().toJS!().text));
  // console.log(JSON.stringify(doc.getRoot().toJS!().text, null, 4));
}

/**
 * `traverseDoc` traverses the ProseMirror doc. It calls the callback function
 * for each node. And this function traverses the children of the node
 * in post-order traversal.
 */
function traverseDoc(
  doc: any,
  depth: number,
  callback: (node: any, depth: number) => void,
) {
  if (doc.content) {
    doc.content.forEach((child: any) => {
      traverseDoc(child, depth + 1, callback);
    });
  }
  callback(doc, depth);
}

main();
