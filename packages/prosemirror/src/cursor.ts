import type { EditorView } from 'prosemirror-view';
import { defaultCursorColors } from './defaults';
import type { CursorOptions } from './types';

type CursorEntry = {
  color: string;
  container: HTMLElement;
  caret: HTMLElement;
  label: HTMLElement;
  pmPos: number;
};

/**
 * Manages remote cursor display overlays for collaborative editing.
 */
export class CursorManager {
  private enabled: boolean;
  private overlayElement: HTMLElement;
  private wrapperElement: HTMLElement | undefined;
  private colors: Array<string>;
  private nextColorIdx = 0;
  private cursors = new Map<string, CursorEntry>();

  constructor(options: CursorOptions) {
    this.enabled = options.enabled;
    this.overlayElement = options.overlayElement;
    this.wrapperElement = options.wrapperElement;
    this.colors = options.colors || defaultCursorColors;
  }

  /**
   * Create or update a cursor overlay for the given client.
   */
  displayCursor(view: EditorView, pmPos: number, clientID: string): void {
    if (!this.enabled) return;

    if (!this.cursors.has(clientID)) {
      const colors = this.colors.length > 0 ? this.colors : defaultCursorColors;
      const color = colors[this.nextColorIdx % colors.length];
      this.nextColorIdx = (this.nextColorIdx + 1) % colors.length;

      const container = document.createElement('div');
      container.className = 'remote-cursor';
      container.style.position = 'absolute';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '10';

      const caret = document.createElement('div');
      caret.className = 'remote-cursor-caret';
      caret.style.position = 'absolute';
      caret.style.width = '2px';
      caret.style.backgroundColor = color;
      container.appendChild(caret);

      const label = document.createElement('div');
      label.className = 'remote-cursor-label';
      label.textContent = clientID.slice(-2);
      label.style.position = 'absolute';
      label.style.backgroundColor = color;
      label.style.color = 'white';
      label.style.fontSize = '10px';
      label.style.padding = '1px 4px';
      label.style.borderRadius = '2px';
      label.style.whiteSpace = 'nowrap';
      label.style.lineHeight = '1.3';
      container.appendChild(label);

      this.cursors.set(clientID, { color, container, caret, label, pmPos });
      this.overlayElement.appendChild(container);
    }

    const entry = this.cursors.get(clientID)!;
    entry.pmPos = pmPos;

    requestAnimationFrame(() => {
      this.positionCursorLayer(view, entry);
    });
  }

  /**
   * Reposition all remote cursors (e.g., after a doc rebuild).
   */
  repositionAll(view: EditorView): void {
    if (!this.enabled) return;

    requestAnimationFrame(() => {
      for (const [, entry] of this.cursors) {
        this.positionCursorLayer(view, entry);
      }
    });
  }

  /**
   * Remove a specific client's cursor.
   */
  removeCursor(clientID: string): void {
    const entry = this.cursors.get(clientID);
    if (entry) {
      entry.container.remove();
      this.cursors.delete(clientID);
    }
  }

  /**
   * Remove all cursors and clean up.
   */
  destroy(): void {
    for (const [, entry] of this.cursors) {
      entry.container.remove();
    }
    this.cursors.clear();
  }

  private positionCursorLayer(view: EditorView, entry: CursorEntry): void {
    try {
      const clampedPos = Math.max(
        0,
        Math.min(entry.pmPos, view.state.doc.content.size),
      );
      const coords = view.coordsAtPos(clampedPos);
      const wrapper = this.wrapperElement || this.overlayElement.parentElement;
      if (!wrapper) return;

      const wrapperRect = wrapper.getBoundingClientRect();
      const left = coords.left - wrapperRect.left;
      const top = coords.top - wrapperRect.top;
      const caretHeight = coords.bottom - coords.top;

      entry.container.style.left = `${left}px`;
      entry.container.style.top = `${top}px`;

      entry.caret.style.height = `${caretHeight}px`;
      entry.caret.style.top = '0';
      entry.caret.style.left = '0';

      entry.label.style.left = '0';
      entry.label.style.top = `${-entry.label.offsetHeight}px`;
    } catch {
      // Cursor positioning can fail during document transitions
    }
  }
}
