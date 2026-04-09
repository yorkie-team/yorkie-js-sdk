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
 * Collect all text content from a Yorkie tree node, concatenated.
 */
export function collectText(node: YorkieTreeJSON): string {
  if (node.type === 'text') return node.value || '';
  return (node.children || []).map(collectText).join('');
}

/**
 * Find the Yorkie flat index of a text split point within a block.
 * `charOffset` is the number of characters before the split point.
 * Returns the flat index where the split should occur, or -1 on failure.
 */
export function findTextSplitOffset(
  node: YorkieTreeJSON,
  charOffset: number,
  baseIdx: number,
): number {
  if (node.type === 'text') {
    const len = (node.value || '').length;
    if (charOffset <= len) return baseIdx + charOffset;
    return -1;
  }

  let childIdx = baseIdx + 1; // skip element open tag
  for (const child of node.children || []) {
    const childText = collectText(child);
    if (charOffset <= childText.length) {
      return findTextSplitOffset(child, charOffset, childIdx);
    }
    charOffset -= childText.length;
    childIdx += yorkieNodeSize(child);
  }
  // charOffset exactly at end of node
  if (charOffset === 0) return childIdx;
  return -1;
}

/**
 * Compute the splitLevel by comparing the old block structure with the
 * new blocks produced by a split. Walks from the deepest text level
 * upward, counting how many element levels are duplicated.
 *
 * For example:
 * - `<p>abcd</p>` → `<p>ab</p><p>cd</p>`: splitLevel = 1
 * - `<li><p>abcd</p></li>` → `<li><p>ab</p></li><li><p>cd</p></li>`: splitLevel = 2
 */
export function computeSplitLevel(
  oldBlock: YorkieTreeJSON,
  newBlocks: Array<YorkieTreeJSON>,
): number {
  if (newBlocks.length < 2) return 0;

  // Walk down the first new block's rightmost path and the second new
  // block's leftmost path, counting shared element boundary levels.
  let level = 0;
  let first: YorkieTreeJSON = newBlocks[0];
  let second: YorkieTreeJSON = newBlocks[1];

  // Each level: if both are elements of the same type, a split occurred
  // at this level.
  while (true) {
    if (first.type === 'text' || second.type === 'text') break;
    if (first.type !== second.type) break;

    // Attributes must match (same element type at this level)
    const aAttrs = JSON.stringify(first.attributes || {});
    const bAttrs = JSON.stringify(second.attributes || {});
    if (aAttrs !== bAttrs) break;

    level++;

    // Walk deeper: rightmost child of first, leftmost child of second
    const firstChildren = first.children || [];
    const secondChildren = second.children || [];
    if (firstChildren.length === 0 || secondChildren.length === 0) break;

    first = firstChildren[firstChildren.length - 1];
    second = secondChildren[0];
  }

  return level;
}

/**
 * Compute the Yorkie flat index range for the merge boundary between
 * two adjacent blocks. The boundary spans from the last close tag of
 * `blockA` to the first open tag of `blockB`.
 *
 * Returns `[fromIdx, toIdx]` for `tree.edit(fromIdx, toIdx)`.
 */
export function computeMergeBoundary(
  yorkieBlocks: Array<YorkieTreeJSON>,
  fromBlockIdx: number,
  toBlockIdx: number,
): [number, number] {
  // Walk to the innermost last child of fromBlock and innermost first
  // child of toBlock to find the tightest boundary.
  const fromBlockStart = blockIndexToYorkieIndex(yorkieBlocks, fromBlockIdx);
  const toBlockStart = blockIndexToYorkieIndex(yorkieBlocks, toBlockIdx);

  // Find innermost close tag of fromBlock's last-child chain
  const fromNode = yorkieBlocks[fromBlockIdx];
  const fromEnd = fromBlockStart + yorkieNodeSize(fromNode);
  // fromEnd points past the block's close tag. The merge boundary starts
  // at the inner content end of the deepest last child.
  let innerFrom = fromEnd;
  let node = fromNode;
  while (node.type !== 'text') {
    const children = node.children || [];
    if (children.length === 0) {
      // Empty element: boundary is just inside the close tag
      innerFrom = innerFrom - 1; // before close tag
      break;
    }
    // Go deeper into last child
    innerFrom = innerFrom - 1; // skip this element's close tag
    node = children[children.length - 1];
    if (node.type === 'text') {
      // Text node has no close tag; boundary is after the text
      break;
    }
  }

  // Find innermost open tag of toBlock's first-child chain
  let innerTo = toBlockStart;
  node = yorkieBlocks[toBlockIdx];
  while (node.type !== 'text') {
    innerTo = innerTo + 1; // skip this element's open tag
    const children = node.children || [];
    if (children.length === 0) break;
    node = children[0];
    if (node.type === 'text') break;
  }

  return [innerFrom, innerTo];
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
