/**
 * Maps ProseMirror mark type names to Yorkie element type names.
 * e.g., `{ strong: 'strong', em: 'em', code: 'code', link: 'link' }`
 */
export type MarkMapping = Record<string, string>;

/**
 * JSON representation of a Yorkie tree node.
 */
export type YorkieTreeJSON = {
  type: string;
  value?: string;
  children?: Array<YorkieTreeJSON>;
  attributes?: Record<string, string>;
};

/**
 * ProseMirror-compatible JSON node (for `Node.fromJSON`).
 */
export type PMNodeJSON = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: Array<PMNodeJSON>;
};

/**
 * Bidirectional position map between PM positions and Yorkie flat indices.
 * Both arrays have one entry per character in the document, in document order.
 */
export type PositionMap = {
  pmPositions: Array<number>;
  yorkieIndices: Array<number>;
};

/**
 * A character-level text edit within a Yorkie tree.
 */
export type TextEdit = {
  from: number;
  to: number;
  text: string | undefined;
};

/**
 * Configuration for remote cursor display.
 */
export type CursorOptions = {
  /** Whether cursor display is enabled. */
  enabled: boolean;
  /** The overlay container element for cursor elements. */
  overlayElement: HTMLElement;
  /** The wrapper element used as coordinate reference. */
  wrapperElement?: HTMLElement;
  /** Custom color palette for cursors. */
  colors?: Array<string>;
};

/**
 * Configuration options for `YorkieProseMirrorBinding`.
 */
export type YorkieProseMirrorOptions = {
  /** Mark name mapping from PM to Yorkie element types. */
  markMapping?: MarkMapping;
  /** Element name used to wrap bare text alongside mark elements. Defaults to `'span'`. */
  wrapperElementName?: string;
  /** Remote cursor display configuration. */
  cursors?: CursorOptions;
  /** Callback for sync log messages. */
  onLog?: (type: 'local' | 'remote' | 'error', message: string) => void;
};
