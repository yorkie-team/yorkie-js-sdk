// Types
export type {
  MarkMapping,
  YorkieTreeJSON,
  PMNodeJSON,
  PositionMap,
  CursorOptions,
  YorkieProseMirrorOptions,
} from './types';

// Defaults
export {
  defaultMarkMapping,
  defaultCursorColors,
  invertMapping,
} from './defaults';

// Conversion
export { pmToYorkie, yorkieToJSON } from './convert';

// Position mapping
export {
  buildPositionMap,
  pmPosToYorkieIdx,
  yorkieIdxToPmPos,
} from './position';

// Upstream sync
export { syncToYorkie } from './diff';

// Downstream sync
export type { DocDiff } from './sync';
export { syncToPM, syncToPMIncremental, diffDocs } from './sync';

// Cursor
export { CursorManager } from './cursor';

// Binding (main API)
export { YorkieProseMirrorBinding } from './binding';
