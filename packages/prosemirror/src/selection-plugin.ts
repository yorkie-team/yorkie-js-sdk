import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/**
 * Represents a remote user's selection range with color.
 */
export type RemoteSelection = {
  clientID: string;
  from: number;
  to: number;
  color: string;
};

export const remoteSelectionsKey = new PluginKey<DecorationSet>(
  'yorkie-remote-selections',
);

/**
 * ProseMirror plugin that renders inline decorations for remote selection
 * ranges. Collapsed selections (from === to) produce no decoration.
 */
export function remoteSelectionPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: remoteSelectionsKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, oldSet) {
        const meta = tr.getMeta(remoteSelectionsKey) as
          | Array<RemoteSelection>
          | undefined;
        if (meta) {
          const decos: Array<Decoration> = [];
          for (const sel of meta) {
            const from = Math.max(0, Math.min(sel.from, tr.doc.content.size));
            const to = Math.max(0, Math.min(sel.to, tr.doc.content.size));
            if (from === to) continue;
            const actualFrom = Math.min(from, to);
            const actualTo = Math.max(from, to);
            decos.push(
              Decoration.inline(actualFrom, actualTo, {
                style: `background-color: ${sel.color}40`,
              }),
            );
          }
          return DecorationSet.create(tr.doc, decos);
        }
        return oldSet.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return remoteSelectionsKey.getState(state);
      },
    },
  });
}
