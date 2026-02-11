import '../../sdk/src/yorkie.ts';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, Node } from 'prosemirror-model';
import { exampleSetup } from 'prosemirror-example-setup';
import { toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';

declare const yorkie: any;

const colors = ['#FECEEA', '#FEF1D2', '#A9FDD8', '#D7F8FF', '#CEC5FA'];
let nextColorIdx = 0;
const transactions: Array<any> = [];

const selectionMap = new Map<string, any>();

/**
 * `updateSelectionLayer` updates the selection layer of the given actor.
 */
function updateSelectionLayer(view: EditorView, tree: any, actor: string) {
  const { layer, fromPos, toPos } = selectionMap.get(actor)!;
  const [fromIndex, toIndex] = tree.posRangeToIndexRange([fromPos, toPos]);
  // NOTE: fromIndex/toIndex are Yorkie flat indices, not PM positions.
  // This works for this simple example (no marks), but for schemas with marks,
  // use buildPositionMap + yorkieIdxToPmPos for correct conversion.
  const coords = view.coordsAtPos(Math.min(fromIndex, toIndex));

  layer.style.left = `${coords.left - 10}px`;
  if (coords.top < 130) {
    layer.classList.add('first-top');
    layer.style.top = `${coords.top + 10}px`;
  } else {
    layer.classList.remove('first-top');
    layer.style.top = `${coords.top - 30}px`;
  }
}

/**
 * `displayRemoteSelection` displays the remote selection of the given actor.
 */
function displayRemoteSelection(
  view: EditorView,
  tree: any,
  fromPos: any,
  toPos: any,
  actor: string,
) {
  if (!selectionMap.has(actor)) {
    const color = colors[nextColorIdx];
    nextColorIdx = (nextColorIdx + 1) % colors.length;

    const layer = document.createElement('div');
    layer.className = 'username-layer';
    layer.textContent = actor.slice(-2);
    layer.style.position = 'absolute';
    layer.style.backgroundColor = color;
    layer.style.color = 'black';
    selectionMap.set(actor, { color, layer });

    view.dom.parentNode!.appendChild(layer);
  }
  selectionMap.get(actor)!.fromPos = fromPos;
  selectionMap.get(actor)!.toPos = toPos;

  for (const [a] of selectionMap) {
    updateSelectionLayer(view, tree, a);
  }
}

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
 * `docToTreeNode` converts ProseMirror's document to Yorkie.TreeNode.
 */
function docToTreeNode(pmNode: any): any {
  if (pmNode.type === 'text') {
    return {
      type: 'text',
      value: pmNode.text,
    };
  }

  const node: any = {
    type: pmNode.type,
    children: [],
  };
  const content = pmNode.content || [];
  for (const child of content) {
    node.children.push(docToTreeNode(child));
  }
  return node;
}

/**
 * `treeNodeToDoc` converts Yorkie.TreeNode to ProseMirror's document.
 */
function treeNodeToDoc(treeNode: any): any {
  if (treeNode.type === 'text') {
    return {
      type: 'text',
      text: treeNode.value,
    };
  }

  const node: any = {
    type: treeNode.type,
    content: [],
  };
  for (const child of treeNode.children) {
    node.content.push(treeNodeToDoc(child));
  }
  return node;
}

/**
 * Insert a star at the current cursor position.
 */
function insertStar(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const type = mySchema.nodes.star;
  const { $from } = state.selection;
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) {
    return false;
  }

  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(type.create()));
  }
  return true;
}

let view: EditorView;

/**
 * `paintTransaction` renders the selected transaction details.
 */
function paintTransaction(index?: number) {
  const transaction = transactions[index ?? 0];

  if (transaction) {
    if (transaction.type === 'selection') {
      document.getElementById('tr-info')!.innerHTML =
        `<pre>selection: ${JSON.stringify(
          transaction.selection.toJSON(),
          null,
          2,
        )}</pre>`;
    } else {
      document.getElementById('tr-info')!.innerHTML =
        `<pre>selection: ${JSON.stringify(
          transaction.transaction.curSelection.toJSON(),
          null,
          2,
        )},\nsteps: ${JSON.stringify(transaction.transaction.steps, null, 2)}
    </pre>`;
    }
  }
}

/**
 * `buildNodes` builds a flat list of nodes for display.
 */
function buildNodes(
  node: any,
  depth: number,
  nodes: Array<any>,
  index?: number,
) {
  const nodeType = node.type.name || node.type;
  if (nodeType === 'text') {
    nodes.push({
      type: nodeType,
      depth,
      index,
      value: node.text || node.value,
    });
    return;
  }

  nodes.push({
    type: nodeType,
    depth,
    index,
    size: node.content?.size || node.size,
  });
  const children = node.content?.content || node.children || [];
  for (let i = 0; i < children.length; i++) {
    buildNodes(children[i], depth + 1, nodes, i);
  }
}

/**
 * `paintTree` renders the document tree to the given element.
 */
function paintTree(doc: any, id: string) {
  const nodes: Array<any> = [];
  buildNodes(doc, 0, nodes);

  const html = nodes
    .map((node) => {
      if (node.type === 'text') {
        return `<div class="inline" style="padding-left: ${
          node.index === 0 ? node.depth * 14 : 0
        }px">${node.value === ' ' ? '&nbsp;&nbsp;' : node.value}</div>`;
      }
      return `<div class="block" style="padding-left: ${
        node.depth * 14
      }px;">${node.type}${
        node.size ? `<span class="size">(${node.size})</span>` : ''
      }</div>`;
    })
    .join('');
  document.getElementById(id)!.innerHTML = html;
}

/**
 * `paintData` refreshes all display panels.
 */
function paintData() {
  document.getElementById('tr-log')!.innerHTML = transactions
    .slice(0, 100)
    .map((transaction, index) => {
      return transaction.type === 'selection'
        ? ''
        : `<span data-index="${index}" class="tr-item">T</span>`;
    })
    .join('');

  paintTree(view.state.doc, 'pm-log');
  paintTransaction();
}

/**
 * main is the entry point of the example.
 */
async function main() {
  const client = new yorkie.Client({
    rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR || 'http://localhost:8080',
  });
  await client.activate();

  // 01. Build yorkie.Text from ProseMirror doc.
  const doc = new yorkie.Document('prosemirror', {
    enableDevtools: true,
  });
  (window as any).doc = doc;
  await client.attach(doc);
  doc.update((root: any) => {
    if (!root.tree) {
      root.tree = new yorkie.Tree(docToTreeNode(initialDoc));
    }
  });

  // 02. Create ProseMirror Editor.
  const state = EditorState.create({
    doc: Node.fromJSON(
      mySchema,
      treeNodeToDoc(JSON.parse(doc.getRoot().tree.toJSON())),
    ),
    plugins: [
      ...exampleSetup({ schema: mySchema }),
      keymap({
        'Ctrl-b': toggleMark(mySchema.marks.shouting),
        'Ctrl-u': insertStar,
      }),
    ],
  });

  // 03. Upstream: ProseMirror to yorkie.Text.
  view = new EditorView(document.querySelector('#app'), {
    state,
    dispatchTransaction: (transaction) => {
      view.updateState(view.state.apply(transaction));

      // If the steps are empty, it means the transaction is not applied to the document.
      // Only the selection is changed.
      if (!transaction.steps.length) {
        transactions.unshift({
          type: 'selection',
          selection: (transaction as any).curSelection,
        });

        doc.update((root: any, presence: any) => {
          presence.set({
            selection: root.tree.indexRangeToPosRange([
              (transaction as any).curSelection.from,
              (transaction as any).curSelection.to,
            ]),
          });
        });
        paintData();
        return;
      }

      transactions.unshift({
        type: 'transaction',
        transaction,
      });

      doc.update((root: any, presence: any) => {
        for (const step of transaction.steps) {
          const {
            jsonID: stepType,
            from,
            to,
            structure,
            slice: { content, openStart, openEnd },
          } = step as any;

          // 01. Move: level up/down, move left/right.
          if (stepType === 'replaceAround') {
            // TODO(hackerwins): replaceAround replaces the given range with given gap.
            // root.tree.move(from, to, gapFrom, gapTo);
            console.warn(
              `[yorkie] replaceAround step not yet supported — skipping (from=${from}, to=${to}). This may cause desync.`,
            );
            continue;
          }

          // 02. Split: split the given range.
          if (
            stepType === 'replace' &&
            openStart &&
            openStart === openEnd &&
            structure
          ) {
            // TODO(hackerwins): we need to handle more step cases.
            // - 1. openStart and openEnd can be assymetric.
            // - 2. content.content could be more than three.
            root.tree.edit(
              from,
              to,
              content.content.length == 3
                ? docToTreeNode(content.content[1])
                : undefined,
              openStart,
            );
            console.log(
              `%c local: ${from}-${to}: split(${openStart})`,
              'color: green',
            );
            continue;
          }

          // 03. Edit: Delete the given range.
          if (!content.content.length) {
            root.tree.edit(from, to);
            console.log(`%c local: ${from}-${to}: delete)`, 'color: green');
            continue;
          }

          // 04. Edit: Replace the given range with the given content.
          //
          // TODO(hackerwins): We need to handle unary element.
          // Unary element is a node that has no children. For example, <star></star>.
          //
          // TODO(hackerwins): We need to handle select all and replace.
          // There is an issue when we replace the whole document in ProseMirror.
          root.tree.editBulk(
            from,
            to,
            content.content.map((node: any) => docToTreeNode(node.toJSON())),
          );
          console.log(
            `%c local: ${from}-${to}: ${JSON.stringify(content.content)})`,
            'color: green',
          );
        }

        presence.set({
          selection: root.tree.indexRangeToPosRange([
            (transaction as any).curSelection.from,
            (transaction as any).curSelection.to,
          ]),
        });
      });
      paintData();
    },
  });

  doc.subscribe('others', (event: any) => {
    if (event.type === 'presence-changed') {
      const { clientID, presence } = event.value;
      displayRemoteSelection(
        view,
        doc.getRoot().tree,
        presence.selection[0],
        presence.selection[1],
        clientID,
      );
    }
  });

  // 03. Downstream: yorkie.Tree to ProseMirror.
  doc.subscribe((event: any) => {
    if (event.type !== 'remote-change') {
      return;
    }

    const { operations } = event.value;
    for (const op of operations) {
      if (op.type !== 'tree-edit') {
        continue;
      }
      const { from, to, value: contents, splitLevel } = op;
      const transform = view.state.tr;
      if (splitLevel) {
        transform.split(from, splitLevel);
        console.log(
          `%c remote: ${from}-${to}: split(${splitLevel})`,
          'color: skyblue',
        );
      } else if (contents) {
        console.log(
          `%c remote: ${from}-${to}: ${JSON.stringify(contents)}`,
          'color: skyblue',
        );
        transform.replaceWith(
          from,
          to,
          Array.from(contents).map((content: any) =>
            Node.fromJSON(mySchema, {
              type: content.type,
              text: content.value,
            }),
          ),
        );
      } else {
        console.log(`%c remote: ${from}-${to}: delete`, 'color: skyblue');
        transform.replace(from, to);
      }
      const newState = view.state.apply(transform);
      view.updateState(newState);
    }
    paintData();
  });

  (window as any).view = view;
  view.focus();
  paintData();
}

document.getElementById('tr-log')!.onclick = (e: any) => {
  const index = e.target.getAttribute('data-index');
  if (index) {
    paintTransaction(+index);
  }
};

main();
