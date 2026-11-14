import { StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import { strokeOf } from './utils';

export type RemoteCursor = {
  name: string;
  color: string;
  from: number;
  to: number;
};

/**
 * `setRemoteCursors` replaces every peer's caret and selection at once.
 */
export const setRemoteCursors = StateEffect.define<Array<RemoteCursor>>();

// A caret with the peer's name above it.
class CaretWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly color: string,
  ) {
    super();
  }

  eq(other: CaretWidget) {
    return other.name === this.name && other.color === this.color;
  }

  toDOM() {
    const caret = document.createElement('span');
    caret.className = 'cm-remote-caret';
    caret.style.borderColor = strokeOf(this.color);
    const label = document.createElement('span');
    label.className = 'cm-remote-label';
    label.style.backgroundColor = this.color;
    label.textContent = this.name;
    caret.appendChild(label);
    return caret;
  }
}

/**
 * `remoteCursors` draws other peers' carets and selections. Local edits move
 * them along with the text; `setRemoteCursors` redraws them from presence.
 */
export const remoteCursors = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(cursors, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setRemoteCursors)) continue;
      const length = tr.state.doc.length;
      const ranges = [];
      for (const { name, color, from, to } of effect.value) {
        const start = Math.min(from, to, length);
        const end = Math.min(Math.max(from, to), length);
        if (start < end) {
          ranges.push(
            Decoration.mark({
              attributes: { style: `background-color: ${color}40` },
            }).range(start, end),
          );
        }
        ranges.push(
          Decoration.widget({
            widget: new CaretWidget(name, color),
            side: 1,
          }).range(Math.min(to, length)),
        );
      }
      return Decoration.set(ranges, true);
    }
    return cursors.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});
