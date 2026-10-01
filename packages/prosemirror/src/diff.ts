/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { MarkMapping, YorkieTreeJSON, TextEdit } from './types';
import { pmToYorkie } from './convert';
import {
  yorkieNodeSize,
  blockIndexToYorkieIndex,
  collectText,
  findTextSplitOffset,
  computeSplitLevel,
  computeMergeBoundary,
} from './position';

/**
 * Deep compare two Yorkie tree nodes for structural equality.
 *
 * Both sides must come from the same `pmToYorkie` path: the comparison is
 * exact, so it is key-order-dependent on attributes and counts text nodes.
 * To compare a PM-serialized node with the CRDT's own copy of it, use
 * `yorkieNodesEquivalent` instead.
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
 * Merge adjacent text siblings into a single node.
 *
 * The CRDT keeps whatever text runs the edits happened to produce: a paragraph
 * typed into twice serializes as two sibling text nodes (see
 * `toTreeNode` in `sdk/src/document/crdt/tree.ts`, which maps `children`
 * straight through). ProseMirror, by contrast, coalesces adjacent text with
 * identical marks into one node. So the two sides of a PM-vs-tree comparison
 * describe the same content with a different number of text nodes, and only
 * the run-merged forms are comparable.
 *
 * Merging is index-safe: a text node's flat size is its length with no
 * open/close tags (`yorkieNodeSize`), so how a text run is split never shifts
 * any Yorkie index derived from the merged form.
 */
function mergeTextRuns(children: Array<YorkieTreeJSON>): Array<YorkieTreeJSON> {
  const merged: Array<YorkieTreeJSON> = [];
  for (const child of children) {
    const last = merged[merged.length - 1];
    if (child.type === 'text' && last && last.type === 'text') {
      merged[merged.length - 1] = {
        type: 'text',
        value: (last.value || '') + (child.value || ''),
      };
      continue;
    }
    merged.push(child);
  }
  return merged;
}

/**
 * Compare attribute maps by key/value, independent of key order.
 *
 * `yorkieNodesEqual` can compare serialized attributes because both of its
 * sides come from the same `pmToYorkie` path. A PM-vs-tree comparison cannot:
 * the CRDT's own attribute map decides its key order, so ordering carries no
 * information about whether the two blocks agree.
 */
function attributesEquivalent(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const aKeys = Object.keys(a || {});
  const bKeys = Object.keys(b || {});
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a![key] !== b?.[key]) return false;
  }
  return true;
}

/**
 * Deep compare a ProseMirror-serialized node with the CRDT tree's own copy of
 * it, ignoring the two representational differences that carry no meaning:
 * how the CRDT fragmented its text runs, and what order its attribute map
 * enumerates in.
 *
 * Use this — never `yorkieNodesEqual` — whenever one side is `tree.toJSON()`.
 * Strict equality reports divergence on a block that is perfectly in step as
 * soon as it has been typed into twice, which silently disables the
 * intra-block, split and merge paths and, in `alignBlockIndex`, drops the
 * local edit altogether.
 */
export function yorkieNodesEquivalent(
  a: YorkieTreeJSON,
  b: YorkieTreeJSON,
): boolean {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'text') return (a.value || '') === (b.value || '');

  if (!attributesEquivalent(a.attributes, b.attributes)) return false;

  const aChildren = mergeTextRuns(a.children || []);
  const bChildren = mergeTextRuns(b.children || []);
  if (aChildren.length !== bChildren.length) return false;
  for (let i = 0; i < aChildren.length; i++) {
    if (!yorkieNodesEquivalent(aChildren[i], bChildren[i])) return false;
  }
  return true;
}

/**
 * Compare two Yorkie tree nodes for structural equality,
 * ignoring text content. Used to determine if intra-block
 * character-level diffing is possible.
 *
 * Text containers (elements whose children are all text nodes, or
 * that are empty) are considered structurally equivalent regardless
 * of how many text children they have — the difference is purely
 * text content that `findTextDiffs` can handle.
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

  // Text containers (all-text children or empty) differ only in text
  // content, not structure — character-level diffing can handle them.
  if (
    aChildren.every((c) => c.type === 'text') &&
    bChildren.every((c) => c.type === 'text')
  ) {
    return true;
  }

  if (aChildren.length !== bChildren.length) return false;
  for (let i = 0; i < aChildren.length; i++) {
    if (!sameStructure(aChildren[i], bChildren[i])) return false;
  }
  return true;
}

/**
 * Compute a minimal text edit (insert/delete/replace) between two strings.
 * Uses longest common prefix + suffix to find the changed range.
 */
function diffText(
  oldText: string,
  newText: string,
  startIdx: number,
  edits: Array<TextEdit>,
): void {
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

  const from = startIdx + prefixLen;
  const to = startIdx + oldEnd + 1;
  const insertText = newText.substring(prefixLen, newEnd + 1);

  edits.push({
    from,
    to,
    text: insertText.length > 0 ? insertText : undefined,
  });
}

/**
 * Walk two structurally-identical Yorkie subtrees in parallel,
 * collecting character-level text diffs with their Yorkie flat indices.
 *
 * For text containers (elements with only text children, or empty),
 * concatenates all text content and diffs as a single range. This
 * handles the empty-to-non-empty paragraph case that previously
 * forced a full block replacement.
 */
export function findTextDiffs(
  oldNode: YorkieTreeJSON,
  newNode: YorkieTreeJSON,
  currentIdx: number,
  edits: Array<TextEdit>,
): void {
  if (oldNode.type === 'text') {
    diffText(oldNode.value || '', newNode.value || '', currentIdx, edits);
    return;
  }

  // Element node: recurse into children
  const oldChildren = oldNode.children || [];
  const newChildren = newNode.children || [];

  // When child counts differ, both sides are text containers
  // (guaranteed by sameStructure). Concatenate and diff as text.
  if (oldChildren.length !== newChildren.length) {
    const oldText = oldChildren.map((c) => c.value || '').join('');
    const newText = newChildren.map((c) => c.value || '').join('');
    diffText(oldText, newText, currentIdx + 1, edits);
    return;
  }

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
/**
 * Detect a split: one old block became two or more new blocks with
 * text content preserved. Returns the split char offset and splitLevel,
 * or null if detection fails.
 */
export function detectSplit(
  oldBlock: YorkieTreeJSON,
  newBlocks: Array<YorkieTreeJSON>,
): { charOffset: number; splitLevel: number } | undefined {
  if (newBlocks.length < 2) return undefined;

  const oldText = collectText(oldBlock);
  const newText = newBlocks.map(collectText).join('');
  if (oldText !== newText) return undefined;

  // Find split point: text length of first new block
  const charOffset = collectText(newBlocks[0]).length;
  if (charOffset === 0 || charOffset === oldText.length) return undefined;

  const splitLevel = computeSplitLevel(oldBlock, newBlocks);
  if (splitLevel === 0) return undefined;

  return { charOffset, splitLevel };
}

/**
 * Detect a merge: two or more old blocks became one new block with
 * text content preserved. Returns true if detected, false otherwise.
 */
export function detectMerge(
  oldBlocks: Array<YorkieTreeJSON>,
  newBlock: YorkieTreeJSON,
): boolean {
  if (oldBlocks.length < 2) return false;

  const oldText = oldBlocks.map(collectText).join('');
  const newText = collectText(newBlock);
  return oldText === newText;
}

/**
 * Map a PM-side top-level block boundary onto the tree's own block indices.
 *
 * `syncToYorkie` locates the changed blocks by diffing the transaction's two
 * ProseMirror docs, then turns those block indices into Yorkie character
 * indices against the *current* tree. That conversion assumes PM block `i` is
 * tree block `i`, which only holds while the view is in step with the tree.
 * It is not during a composition: the binding defers remote changes to the
 * compositionend flush — totally so in the sync modes it does not pause — while
 * local composing transactions keep arriving here, so the tree can hold whole
 * blocks the PM doc has not seen yet.
 *
 * Align by the common prefix and suffix, which is the shape whole-block remote
 * insertions and deletions take, and return undefined for a boundary that
 * falls inside the diverged region, where no offset is correct.
 *
 * The two sides are different representations of the same content, so the
 * comparison is `yorkieNodesEquivalent`, not `yorkieNodesEqual`: the CRDT's
 * text fragmentation is not divergence, and treating it as such would make
 * every ordinary multi-block edit look like it landed in a diverged region
 * and get dropped.
 */
export function alignBlockIndex(
  pmBlocks: Array<YorkieTreeJSON>,
  treeBlocks: Array<YorkieTreeJSON>,
  index: number,
): number | undefined {
  const pmLen = pmBlocks.length;
  const treeLen = treeBlocks.length;

  let prefix = 0;
  while (
    prefix < pmLen &&
    prefix < treeLen &&
    yorkieNodesEquivalent(pmBlocks[prefix], treeBlocks[prefix])
  ) {
    prefix++;
  }
  // Covers the in-step case whole: identical block lists leave `prefix` at
  // `pmLen`, so every boundary maps to itself.
  if (index <= prefix) return index;

  let suffix = 0;
  while (
    suffix < pmLen - prefix &&
    suffix < treeLen - prefix &&
    yorkieNodesEquivalent(
      pmBlocks[pmLen - 1 - suffix],
      treeBlocks[treeLen - 1 - suffix],
    )
  ) {
    suffix++;
  }
  if (index >= pmLen - suffix) return treeLen - (pmLen - index);

  return undefined;
}

/**
 * Outcome of an upstream sync: `'synced'` means the tree now holds the
 * transaction's content, `'skipped'` means nothing was written because the
 * edit could not be mapped onto the tree.
 */
export type SyncToYorkieResult = 'synced' | 'skipped';

/**
 * Sync a ProseMirror transaction to the Yorkie tree (upstream sync).
 *
 * Strategy:
 * 1. Find which top-level blocks changed (by diffing Yorkie-format trees)
 * 2. If exactly one block changed and its structure is the same,
 *    do character-level diffing (best for concurrent editing)
 * 3. Detect splits/merges and use native CRDT operations
 * 4. Otherwise, fall back to full block replacement
 *
 * Returns `'skipped'` when the edit could not be mapped onto the tree and
 * nothing was written, `'synced'` otherwise. The caller has to tell the two
 * apart: after `'skipped'` the view is knowingly ahead of the tree, so any
 * further work that assumes the two agree — building a position map for the
 * selection, say — would fail and be misread as divergence.
 */
export function syncToYorkie(
  tree: {
    toJSON(): string;
    edit(
      fromIdx: number,
      toIdx: number,
      content?: YorkieTreeJSON,
      splitLevel?: number,
    ): void;
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
  wrapperElementName: string = 'span',
): SyncToYorkieResult {
  // Both docs are re-serialized wholesale, so every block this function
  // rewrites is pushed to peers as whatever the local PM doc holds — including
  // blocks the user never touched. `pmToYorkie` therefore has to be
  // round-trip faithful: the URL sanitizer in `yorkieToJSON` renders a blocked
  // scheme as an inert placeholder and `pmToYorkie` restores the peer's
  // original, so a local rendering decision is never written back into the
  // shared tree.
  const oldYorkie = pmToYorkie(oldDoc, markMapping, wrapperElementName);
  const newYorkie = pmToYorkie(newDoc, markMapping, wrapperElementName);
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
    return 'synced';
  }

  // Every index above is PM-side. Map the touched range onto the tree's own
  // block indices, which differ whenever the view is behind the tree — the
  // state a composition leaves it in while remote changes are deferred.
  const treeFromBlock = alignBlockIndex(
    oldBlocks,
    currentYorkieBlocks,
    firstDiff,
  );
  const treeToBlock = alignBlockIndex(
    oldBlocks,
    currentYorkieBlocks,
    oldEndDiff + 1,
  );
  if (treeFromBlock === undefined || treeToBlock === undefined) {
    // The edited blocks sit inside the region the tree changed underneath us.
    // No index here is right, so write nothing: the deferred remote changes
    // are flushed into the view shortly and the edit can be re-derived from a
    // doc that is back in step, which beats corrupting the tree at a guessed
    // index.
    onLog?.(
      'error',
      'Local edit overlaps blocks the tree changed meanwhile; skipping upstream sync',
    );
    return 'skipped';
  }

  // The three optimizations below read the tree's copy of a block and index
  // into it with offsets measured on the PM copy, so they hold only while the
  // two copies hold the same content. Full block replacement needs no such
  // agreement.
  //
  // "Same content" is `yorkieNodesEquivalent`, not `yorkieNodesEqual`: the
  // tree's text runs are however the edits left them, so a block the user has
  // typed into twice is one text node on the PM side and several on the tree
  // side. That difference never moves an index — a text node's flat size is
  // its length — so it must not disqualify the optimizations, or every block
  // past its first edit falls back to whole-block replacement and clobbers
  // concurrent peer edits.
  const blocksAligned =
    treeToBlock - treeFromBlock === oldEndDiff + 1 - firstDiff &&
    oldBlocks
      .slice(firstDiff, oldEndDiff + 1)
      .every((block, i) =>
        yorkieNodesEquivalent(block, currentYorkieBlocks[treeFromBlock + i]),
      );

  // OPTIMIZATION: If exactly one block changed and structure is the same,
  // use character-level diffing for better concurrent editing support.
  if (firstDiff === oldEndDiff && firstDiff === newEndDiff && blocksAligned) {
    const blockStartIdx = blockIndexToYorkieIndex(
      currentYorkieBlocks,
      treeFromBlock,
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
      return 'synced';
    }
    onLog?.(
      'local',
      'Structure changed, falling through to split/merge detection',
    );
  }

  // SPLIT DETECTION: one old block → two or more new blocks
  const oldCount = oldEndDiff - firstDiff + 1;
  const newCount = newEndDiff - firstDiff + 1;

  if (oldCount === 1 && newCount >= 2 && blocksAligned) {
    const oldBlock = oldBlocks[firstDiff];
    const changedNewBlocks = newBlocks.slice(firstDiff, newEndDiff + 1);
    const split = detectSplit(oldBlock, changedNewBlocks);

    if (split) {
      const blockStartIdx = blockIndexToYorkieIndex(
        currentYorkieBlocks,
        treeFromBlock,
      );
      const splitIdx = findTextSplitOffset(
        currentYorkieBlocks[treeFromBlock],
        split.charOffset,
        blockStartIdx,
      );

      if (splitIdx >= 0) {
        tree.edit(splitIdx, splitIdx, undefined, split.splitLevel);
        onLog?.(
          'local',
          `native-split: at idx ${splitIdx}, splitLevel=${split.splitLevel}`,
        );
        return 'synced';
      }
    }
  }

  // MERGE DETECTION: two or more old blocks → one new block
  if (oldCount >= 2 && newCount === 1 && blocksAligned) {
    const changedOldBlocks = oldBlocks.slice(firstDiff, oldEndDiff + 1);
    const newBlock = newBlocks[firstDiff];

    if (detectMerge(changedOldBlocks, newBlock)) {
      // Apply boundary deletions right-to-left to avoid index shifts
      for (let i = oldEndDiff; i > firstDiff; i--) {
        const treeIdx = treeFromBlock + (i - firstDiff);
        const [bFrom, bTo] = computeMergeBoundary(
          currentYorkieBlocks,
          treeIdx - 1,
          treeIdx,
        );
        tree.edit(bFrom, bTo);
        onLog?.('local', `native-merge: boundary delete idx ${bFrom}-${bTo}`);
      }
      return 'synced';
    }
  }

  // Full block replacement (fallback for structural changes)
  const yorkieFromIdx = blockIndexToYorkieIndex(
    currentYorkieBlocks,
    treeFromBlock,
  );
  const yorkieToIdx = blockIndexToYorkieIndex(currentYorkieBlocks, treeToBlock);

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

  return 'synced';
}
