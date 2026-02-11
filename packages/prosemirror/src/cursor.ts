import type { EditorView } from 'prosemirror-view';
import { defaultCursorColors } from './defaults';
import type { CursorOptions } from './types';

type CursorEntry = {
  color: string;
  layer: HTMLElement;
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

      const layer = document.createElement('div');
      layer.className = 'username-layer';
      layer.textContent = clientID.slice(-2);
      layer.style.position = 'absolute';
      layer.style.backgroundColor = color;
      layer.style.color = 'black';
      layer.style.zIndex = '10';
      layer.style.pointerEvents = 'none';
      this.cursors.set(clientID, { color, layer, pmPos });
      this.overlayElement.appendChild(layer);
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
      entry.layer.remove();
      this.cursors.delete(clientID);
    }
  }

  /**
   * Remove all cursors and clean up.
   */
  destroy(): void {
    for (const [, entry] of this.cursors) {
      entry.layer.remove();
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

      entry.layer.style.left = `${left}px`;
      entry.layer.style.top = `${top - 20}px`;
    } catch {
      // Cursor positioning can fail during document transitions
    }
  }
}
