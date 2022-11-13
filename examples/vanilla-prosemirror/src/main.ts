import yorkie, { type Text } from 'yorkie-js-sdk';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, Node } from 'prosemirror-model';
import { exampleSetup } from 'prosemirror-example-setup';
import { toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';

import './style.css';

type DocType = {
  text: Text;
};

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

  const doc = new yorkie.Document<DocType>('prosemirror');
  await client.attach(doc);
  doc.update((root) => {
    if (!root.text) {
      root.text = new yorkie.Text();
    }
  }, 'create content if not exists');

  const state = EditorState.create({
    doc: Node.fromJSON(mySchema, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Paragraph ',
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
              text: 'This is a boring paragraph',
            },
          ],
        },
      ],
    }),
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
      view.updateState(view.state.apply(transaction));
    },
  });
  view.focus();
}

main();
