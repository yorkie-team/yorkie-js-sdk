// Types
export type {
  MarkMapping,
  YorkieTreeJSON,
  PMNodeJSON,
  PositionMap,
  TextEdit,
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
  yorkieNodeSize,
  blockIndexToYorkieIndex,
  buildPositionMap,
  pmPosToYorkieIdx,
  yorkieIdxToPmPos,
} from './position';

// Diffing & upstream sync
export {
  yorkieNodesEqual,
  sameStructure,
  findTextDiffs,
  tryIntraBlockDiff,
  syncToYorkie,
} from './diff';

// Downstream sync
export type { DocDiff } from './sync';
export { syncToPM, syncToPMIncremental, diffDocs } from './sync';

// Cursor
export { CursorManager } from './cursor';

// Binding (main API)
export { YorkieProseMirrorBinding } from './binding';
