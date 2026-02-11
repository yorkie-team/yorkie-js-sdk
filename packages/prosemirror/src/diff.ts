import type { Node as PMNode } from 'prosemirror-model';
import type { MarkMapping, YorkieTreeJSON, TextEdit } from './types';
import { pmToYorkie } from './convert';
import { yorkieNodeSize, blockIndexToYorkieIndex } from './position';

/**
 * Deep compare two Yorkie tree nodes for structural equality.
 *
 * Note: attribute comparison uses JSON.stringify, which is key-order-dependent.
 * This is safe here because both sides are produced by the same `pmToYorkie`
 * path, which always inserts keys in a consistent order.
 */
export function yorkieNodesEqual(
  a: YorkieTreeJSON,
  b: YorkieTreeJSON,
): boolean {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'text') return a.value === b.value;

  const aAttrs = JSON.stringify(a.attributes || {});
  const bAttrs = JSON.stringify(b.attributes || {});
  if (aAttrs !== bAttrs) return false;

  const aChildren = a.children || [];
  const bChildren = b.children || [];
  if (aChildren.length !== bChildren.length) return false;
  for (let i = 0; i < aChildren.length; i++) {
    if (!yorkieNodesEqual(aChildren[i], bChildren[i])) return false;
  }
  return true;
}

/**
 * Compare two Yorkie tree nodes for structural equality,
 * ignoring text content. Used to determine if intra-block
 * character-level diffing is possible.
 */
export function sameStructure(a: YorkieTreeJSON, b: YorkieTreeJSON): boolean {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'text') return true; // text content may differ

  const aAttrs = JSON.stringify(a.attributes || {});
  const bAttrs = JSON.stringify(b.attributes || {});
  if (aAttrs !== bAttrs) return false;

  const aChildren = a.children || [];
  const bChildren = b.children || [];
  if (aChildren.length !== bChildren.length) return false;
  for (let i = 0; i < aChildren.length; i++) {
    if (!sameStructure(aChildren[i], bChildren[i])) return false;
  }
  return true;
}

/**
 * Walk two structurally-identical Yorkie subtrees in parallel,
 * collecting character-level text diffs with their Yorkie flat indices.
 */
export function findTextDiffs(
  oldNode: YorkieTreeJSON,
  newNode: YorkieTreeJSON,
  currentIdx: number,
  edits: Array<TextEdit>,
): void {
  if (oldNode.type === 'text') {
    const oldText = oldNode.value || '';
    const newText = newNode.value || '';
    if (oldText === newText) return;

    // Find longest common prefix
    let prefixLen = 0;
    while (
      prefixLen < oldText.length &&
      prefixLen < newText.length &&
      oldText[prefixLen] === newText[prefixLen]
    ) {
      prefixLen++;
    }

    // Find longest common suffix (not overlapping with prefix)
    let oldEnd = oldText.length - 1;
    let newEnd = newText.length - 1;
    while (
      oldEnd >= prefixLen &&
      newEnd >= prefixLen &&
      oldText[oldEnd] === newText[newEnd]
    ) {
      oldEnd--;
      newEnd--;
    }

    const from = currentIdx + prefixLen;
    const to = currentIdx + oldEnd + 1;
    const insertText = newText.substring(prefixLen, newEnd + 1);

    edits.push({
      from,
      to,
      text: insertText.length > 0 ? insertText : undefined,
    });
    return;
  }

  // Element node: recurse into children
  const oldChildren = oldNode.children || [];
  const newChildren = newNode.children || [];
  let childIdx = currentIdx + 1; // +1 to skip element open tag

  for (let i = 0; i < oldChildren.length; i++) {
    findTextDiffs(oldChildren[i], newChildren[i], childIdx, edits);
    childIdx += yorkieNodeSize(oldChildren[i]);
  }
}

/**
 * Try intra-block character-level diffing for a single changed block.
 * Returns true if successful, false if structure differs (caller
 * should fall back to full block replacement).
 */
export function tryIntraBlockDiff(
  tree: {
    edit(fromIdx: number, toIdx: number, content?: YorkieTreeJSON): void;
  },
  oldBlock: YorkieTreeJSON,
  newBlock: YorkieTreeJSON,
  blockStartIdx: number,
  onLog?: (type: 'local' | 'remote' | 'error', message: string) => void,
): boolean {
  if (!sameStructure(oldBlock, newBlock)) {
    return false;
  }

  const edits: Array<TextEdit> = [];
  findTextDiffs(oldBlock, newBlock, blockStartIdx, edits);

  if (edits.length === 0) return true; // no changes

  // Apply edits in REVERSE order so indices don't shift
  for (let i = edits.length - 1; i >= 0; i--) {
    const { from, to, text } = edits[i];
    if (text != null && text.length > 0) {
      tree.edit(from, to, { type: 'text', value: text });
    } else {
      tree.edit(from, to);
    }
  }

  onLog?.(
    'local',
    `intra-block: ${edits.length} char-level edit(s) at block idx ${blockStartIdx}`,
  );
  return true;
}

/**
 * Sync a ProseMirror transaction to the Yorkie tree (upstream sync).
 *
 * Strategy:
 * 1. Find which top-level blocks changed (by diffing Yorkie-format trees)
 * 2. If exactly one block changed and its structure is the same,
 *    do character-level diffing (best for concurrent editing)
 * 3. Otherwise, fall back to full block replacement
 */
export function syncToYorkie(
  tree: {
    toJSON(): string;
    edit(fromIdx: number, toIdx: number, content?: YorkieTreeJSON): void;
    editBulk(
      fromIdx: number,
      toIdx: number,
      contents: Array<YorkieTreeJSON>,
    ): void;
  },
  oldDoc: PMNode,
  newDoc: PMNode,
  markMapping: MarkMapping,
  onLog?: (type: 'local' | 'remote' | 'error', message: string) => void,
): void {
  const oldYorkie = pmToYorkie(oldDoc, markMapping);
  const newYorkie = pmToYorkie(newDoc, markMapping);
  const oldBlocks = oldYorkie.children || [];
  const newBlocks = newYorkie.children || [];

  // Get current Yorkie tree state (for computing indices)
  const treeJSON = JSON.parse(tree.toJSON());
  const currentYorkieBlocks: Array<YorkieTreeJSON> = treeJSON.children || [];

  // Find the first block that differs
  let firstDiff = 0;
  while (
    firstDiff < oldBlocks.length &&
    firstDiff < newBlocks.length &&
    yorkieNodesEqual(oldBlocks[firstDiff], newBlocks[firstDiff])
  ) {
    firstDiff++;
  }

  // Find the last block that differs (from the end)
  let oldEndDiff = oldBlocks.length - 1;
  let newEndDiff = newBlocks.length - 1;
  while (
    oldEndDiff > firstDiff &&
    newEndDiff > firstDiff &&
    yorkieNodesEqual(oldBlocks[oldEndDiff], newBlocks[newEndDiff])
  ) {
    oldEndDiff--;
    newEndDiff--;
  }

  if (firstDiff > oldEndDiff && firstDiff > newEndDiff) {
    onLog?.('local', 'No block-level changes detected');
    return;
  }

  // OPTIMIZATION: If exactly one block changed and structure is the same,
  // use character-level diffing for better concurrent editing support.
  if (firstDiff === oldEndDiff && firstDiff === newEndDiff) {
    const blockStartIdx = blockIndexToYorkieIndex(
      currentYorkieBlocks,
      firstDiff,
    );
    if (
      tryIntraBlockDiff(
        tree,
        oldBlocks[firstDiff],
        newBlocks[firstDiff],
        blockStartIdx,
        onLog,
      )
    ) {
      return;
    }
    onLog?.(
      'local',
      'Structure changed, falling back to full block replacement',
    );
  }

  // Full block replacement (for structural changes, splits, merges, etc.)
  const yorkieFromIdx = blockIndexToYorkieIndex(currentYorkieBlocks, firstDiff);
  const yorkieToIdx = blockIndexToYorkieIndex(
    currentYorkieBlocks,
    oldEndDiff + 1,
  );

  const newContent: Array<YorkieTreeJSON> = [];
  for (let i = firstDiff; i <= newEndDiff; i++) {
    newContent.push(newBlocks[i]);
  }

  onLog?.(
    'local',
    `block-replace: blocks[${firstDiff}..${oldEndDiff}] -> ${newContent.length} new (idx: ${yorkieFromIdx}-${yorkieToIdx})`,
  );

  if (newContent.length === 0) {
    tree.edit(yorkieFromIdx, yorkieToIdx);
  } else if (newContent.length === 1) {
    tree.edit(yorkieFromIdx, yorkieToIdx, newContent[0]);
  } else {
    tree.editBulk(yorkieFromIdx, yorkieToIdx, newContent);
  }
}
