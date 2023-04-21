import yorkie, { Tree, Document } from 'yorkie-js-sdk';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, Node } from 'prosemirror-model';
import { exampleSetup } from 'prosemirror-example-setup';
import { toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import './style.css';

const mySchema = new Schema({
  nodes: {
    text: { group: 'inline' },
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
    doc: { content: 'block+' },
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
      content: [{ type: 'text', text: 'ab' }],
    },
    {
      type: 'notegroup',
      content: [
        { type: 'note', content: [{ type: 'text', text: 'cd' }] },
        { type: 'note', content: [{ type: 'text', text: 'ef' }] },
      ],
    },
    {
      type: 'boring_paragraph',
      content: [{ type: 'text', text: 'gh' }],
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
 * main is the entry point of the example.
 */
async function main() {
  // TODO(hackerwins): Uncomment this after implementing CRDT.
  // const client = new yorkie.Client('http://localhost:8080');
  // await client.activate();

  // 01. Build yorkie.Text from ProseMirror doc.
  const doc = new yorkie.Document<{ tree: Tree }>('prosemirror');
  // await client.attach(doc);
  doc.update((root) => {
    root.tree = new Tree(initialDoc as any);
  });

  // 02. Create ProseMirror Editor.
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

  // 03. Upstream: ProseMirror to yorkie.Text.
  const view = new EditorView(document.querySelector('#app'), {
    state,
    dispatchTransaction: (transaction) => {
      view.updateState(view.state.apply(transaction));

      // If the steps are empty, it means the transaction is not applied to the document.
      // Only the selection is changed.
      if (!transaction.steps.length) {
        console.log(transaction.selection.$anchor.pos);
        return;
      }

      doc.update((root) => {
        for (const step of transaction.steps) {
          const {
            from,
            to,
            slice: { content },
          } = step as any;

          // 02-1. Delete the given range.
          if (!content.content.length) {
            root.tree.edit(from, to);
            return;
          }

          // TODO(hackerwins): We need to understand how to handle steps.
          // 02-2. Edit the given range with the given content.
          for (const node of content.content) {
            root.tree.edit(from, to, node.toJSON());
          }
        }
      });
      printYorkieDoc(doc);
    },
  });

  // 04. Downstream: yorkie.Text to ProseMirror.
  // TODO(hackerwins): Implement this.

  view.focus();
  printYorkieDoc(doc);
}

/**
 * `printYorkieDoc` prints the content of the yorkie.Text.
 */
function printYorkieDoc(doc: Document<{ tree: Tree }>) {
  console.log(JSON.stringify(doc.getRoot().toJS!().tree));
  // console.log(JSON.stringify(doc.getRoot().toJS!().tree, null, 4));
}

main();
