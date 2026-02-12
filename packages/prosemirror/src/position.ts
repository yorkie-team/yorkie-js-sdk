import type { Node as PMNode } from 'prosemirror-model';
import type { YorkieTreeJSON, PositionMap } from './types';

/**
 * Compute the padded size of a Yorkie tree node (matching IndexTree's indexing).
 * Text nodes: size = text length
 * Element nodes: size = 2 + sum of children sizes
 */
export function yorkieNodeSize(node: YorkieTreeJSON): number {
  if (node.type === 'text') {
    return (node.value || '').length;
  }
  let size = 2; // open + close tag
  for (const child of node.children || []) {
    size += yorkieNodeSize(child);
  }
  return size;
}

/**
 * Convert a block index (nth top-level child) to a Yorkie tree flat index.
 */
export function blockIndexToYorkieIndex(
  yorkieBlocks: Array<YorkieTreeJSON>,
  blockIndex: number,
): number {
  let idx = 0;
  for (let i = 0; i < Math.min(blockIndex, yorkieBlocks.length); i++) {
    idx += yorkieNodeSize(yorkieBlocks[i]);
  }
  return idx;
}

/**
 * Build a bidirectional position map between PM positions and
 * Yorkie flat indices. Both arrays have one entry per character
 * in the document, in document order.
 */
export function buildPositionMap(
  pmDoc: PMNode,
  yorkieTreeJSON: YorkieTreeJSON,
): PositionMap {
  const pmPositions: Array<number> = [];
  const yorkieIndices: Array<number> = [];

  // Collect PM position for each character
  pmDoc.descendants((node, pos) => {
    if (node.isText) {
      for (let i = 0; i < node.text!.length; i++) {
        pmPositions.push(pos + i);
      }
    }
  });

  /**
   * `walkYorkie` collects the Yorkie flat index for each character.
   */
  function walkYorkie(node: YorkieTreeJSON, idx: number): void {
    if (node.type === 'text') {
      const text = node.value || '';
      for (let i = 0; i < text.length; i++) {
        yorkieIndices.push(idx + i);
      }
      return;
    }
    let childIdx = idx + 1; // skip element open tag
    for (const child of node.children || []) {
      walkYorkie(child, childIdx);
      childIdx += yorkieNodeSize(child);
    }
  }

  // Walk from root's children (tree indices don't include root's tags)
  let idx = 0;
  for (const child of yorkieTreeJSON.children || []) {
    walkYorkie(child, idx);
    idx += yorkieNodeSize(child);
  }

  if (pmPositions.length !== yorkieIndices.length) {
    throw new Error(
      `Position map mismatch: PM has ${pmPositions.length} chars, Yorkie has ${yorkieIndices.length} chars`,
    );
  }

  return { pmPositions, yorkieIndices };
}

/**
 * Convert a PM position to a Yorkie flat index.
 */
export function pmPosToYorkieIdx(map: PositionMap, pmPos: number): number {
  for (let i = 0; i < map.pmPositions.length; i++) {
    if (map.pmPositions[i] === pmPos) {
      return map.yorkieIndices[i];
    }
    if (map.pmPositions[i] > pmPos) {
      if (i > 0) {
        return map.yorkieIndices[i - 1] + 1;
      }
      return map.yorkieIndices[i];
    }
  }
  if (map.yorkieIndices.length > 0) {
    return map.yorkieIndices[map.yorkieIndices.length - 1] + 1;
  }
  return 0;
}

/**
 * Convert a Yorkie flat index to a PM position.
 */
export function yorkieIdxToPmPos(map: PositionMap, yorkieIdx: number): number {
  for (let i = 0; i < map.yorkieIndices.length; i++) {
    if (map.yorkieIndices[i] === yorkieIdx) {
      return map.pmPositions[i];
    }
    if (map.yorkieIndices[i] > yorkieIdx) {
      if (i > 0) {
        return map.pmPositions[i - 1] + 1;
      }
      return map.pmPositions[i];
    }
  }
  if (map.pmPositions.length > 0) {
    return map.pmPositions[map.pmPositions.length - 1] + 1;
  }
  return 0;
}
