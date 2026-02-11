import { describe, it, assert, vi } from 'vitest';
import {
  yorkieNodesEqual,
  sameStructure,
  findTextDiffs,
  tryIntraBlockDiff,
  syncToYorkie,
} from '../../src/diff';
import { pmToYorkie } from '../../src/convert';
import { defaultMarkMapping } from '../../src/defaults';
import type { YorkieTreeJSON, TextEdit } from '../../src/types';
import { doc, p, strong, yText, yElem, createMockTree } from './helpers';

describe('diff', () => {
  describe('yorkieNodesEqual', () => {
    it('should return true for identical text nodes', () => {
      assert.isTrue(yorkieNodesEqual(yText('hello'), yText('hello')));
    });

    it('should return false for text nodes with different values', () => {
      assert.isFalse(yorkieNodesEqual(yText('hello'), yText('world')));
    });

    it('should return false when types differ', () => {
      assert.isFalse(
        yorkieNodesEqual(yText('hello'), yElem('p', [yText('hello')])),
      );
    });

    it('should return true for identical element nodes with children', () => {
      const a = yElem('p', [yText('hello')]);
      const b = yElem('p', [yText('hello')]);
      assert.isTrue(yorkieNodesEqual(a, b));
    });

    it('should return false when children differ', () => {
      const a = yElem('p', [yText('hello')]);
      const b = yElem('p', [yText('world')]);
      assert.isFalse(yorkieNodesEqual(a, b));
    });

    it('should return false when child count differs', () => {
      const a = yElem('p', [yText('a')]);
      const b = yElem('p', [yText('a'), yText('b')]);
      assert.isFalse(yorkieNodesEqual(a, b));
    });

    it('should return true for elements with matching attributes', () => {
      const a = yElem('heading', [yText('Title')], { level: '2' });
      const b = yElem('heading', [yText('Title')], { level: '2' });
      assert.isTrue(yorkieNodesEqual(a, b));
    });

    it('should return false for elements with different attributes', () => {
      const a = yElem('heading', [yText('Title')], { level: '2' });
      const b = yElem('heading', [yText('Title')], { level: '3' });
      assert.isFalse(yorkieNodesEqual(a, b));
    });

    it('should return false when either argument is falsy', () => {
      assert.isFalse(
        yorkieNodesEqual(null as unknown as YorkieTreeJSON, yText('hello')),
      );
      assert.isFalse(
        yorkieNodesEqual(
          yText('hello'),
          undefined as unknown as YorkieTreeJSON,
        ),
      );
    });

    it('should handle deeply nested identical structures', () => {
      const a = yElem('blockquote', [
        yElem('p', [yElem('strong', [yText('hello')])]),
      ]);
      const b = yElem('blockquote', [
        yElem('p', [yElem('strong', [yText('hello')])]),
      ]);
      assert.isTrue(yorkieNodesEqual(a, b));
    });

    it('should return true for empty element nodes', () => {
      assert.isTrue(yorkieNodesEqual(yElem('p', []), yElem('p', [])));
    });

    it('should treat missing children as empty array', () => {
      assert.isTrue(yorkieNodesEqual({ type: 'p' }, yElem('p', [])));
    });
  });

  describe('sameStructure', () => {
    it('should return true for text nodes regardless of value', () => {
      assert.isTrue(sameStructure(yText('hello'), yText('world')));
    });

    it('should return false when types differ', () => {
      assert.isFalse(
        sameStructure(yText('hello'), yElem('p', [yText('hello')])),
      );
    });

    it('should return true for elements with same structure but different text', () => {
      const a = yElem('p', [yText('aaa')]);
      const b = yElem('p', [yText('zzz')]);
      assert.isTrue(sameStructure(a, b));
    });

    it('should return false when child count differs', () => {
      const a = yElem('p', [yText('a')]);
      const b = yElem('p', [yText('a'), yText('b')]);
      assert.isFalse(sameStructure(a, b));
    });

    it('should return false when attributes differ', () => {
      const a = yElem('heading', [yText('Title')], { level: '2' });
      const b = yElem('heading', [yText('Title')], { level: '3' });
      assert.isFalse(sameStructure(a, b));
    });

    it('should return true for deeply nested same-structure nodes', () => {
      const a = yElem('blockquote', [
        yElem('p', [yElem('strong', [yText('aaa')])]),
      ]);
      const b = yElem('blockquote', [
        yElem('p', [yElem('strong', [yText('zzz')])]),
      ]);
      assert.isTrue(sameStructure(a, b));
    });

    it('should return false when either argument is falsy', () => {
      assert.isFalse(
        sameStructure(null as unknown as YorkieTreeJSON, yText('hello')),
      );
    });
  });

  describe('findTextDiffs', () => {
    it('should find no diffs for identical text nodes', () => {
      const edits: Array<TextEdit> = [];
      findTextDiffs(yText('hello'), yText('hello'), 0, edits);
      assert.equal(edits.length, 0);
    });

    it('should detect a complete text replacement', () => {
      const edits: Array<TextEdit> = [];
      findTextDiffs(yText('abc'), yText('xyz'), 0, edits);
      assert.equal(edits.length, 1);
      assert.equal(edits[0].from, 0);
      assert.equal(edits[0].to, 3);
      assert.equal(edits[0].text, 'xyz');
    });

    it('should detect an insertion at the end', () => {
      const edits: Array<TextEdit> = [];
      findTextDiffs(yText('hello'), yText('hello world'), 0, edits);
      assert.equal(edits.length, 1);
      assert.equal(edits[0].from, 5);
      assert.equal(edits[0].to, 5);
      assert.equal(edits[0].text, ' world');
    });

    it('should detect a deletion at the end', () => {
      const edits: Array<TextEdit> = [];
      findTextDiffs(yText('hello world'), yText('hello'), 0, edits);
      assert.equal(edits.length, 1);
      assert.equal(edits[0].from, 5);
      assert.equal(edits[0].to, 11);
      assert.isUndefined(edits[0].text);
    });

    it('should detect a change in the middle', () => {
      const edits: Array<TextEdit> = [];
      findTextDiffs(yText('abcdef'), yText('abXYef'), 0, edits);
      assert.equal(edits.length, 1);
      assert.equal(edits[0].from, 2);
      assert.equal(edits[0].to, 4);
      assert.equal(edits[0].text, 'XY');
    });

    it('should respect currentIdx offset', () => {
      const edits: Array<TextEdit> = [];
      findTextDiffs(yText('abc'), yText('aXc'), 10, edits);
      assert.equal(edits[0].from, 11);
      assert.equal(edits[0].to, 12);
      assert.equal(edits[0].text, 'X');
    });

    it('should handle text diffs inside nested element structures', () => {
      const oldNode = yElem('p', [yText('hello')]);
      const newNode = yElem('p', [yText('world')]);
      const edits: Array<TextEdit> = [];
      findTextDiffs(oldNode, newNode, 0, edits);
      assert.equal(edits.length, 1);
      // Element open tag at 0, text starts at 1
      assert.equal(edits[0].from, 1);
      assert.equal(edits[0].to, 6);
      assert.equal(edits[0].text, 'world');
    });

    it('should collect multiple diffs across sibling text nodes', () => {
      const oldNode = yElem('p', [
        yElem('strong', [yText('aaa')]),
        yElem('span', [yText('bbb')]),
      ]);
      const newNode = yElem('p', [
        yElem('strong', [yText('xxx')]),
        yElem('span', [yText('yyy')]),
      ]);
      const edits: Array<TextEdit> = [];
      findTextDiffs(oldNode, newNode, 0, edits);
      assert.equal(edits.length, 2);
    });

    it('should handle deletion of all text (new is empty)', () => {
      const edits: Array<TextEdit> = [];
      findTextDiffs(yText('hello'), yText(''), 0, edits);
      assert.equal(edits.length, 1);
      assert.equal(edits[0].from, 0);
      assert.equal(edits[0].to, 5);
      assert.isUndefined(edits[0].text);
    });
  });

  describe('tryIntraBlockDiff', () => {
    it('should return false when structure differs', () => {
      const mockTree = {
        edit: vi.fn(),
      };
      const oldBlock = yElem('p', [yText('a')]);
      const newBlock = yElem('p', [yElem('strong', [yText('a')])]);
      const result = tryIntraBlockDiff(mockTree, oldBlock, newBlock, 0);
      assert.isFalse(result);
      assert.equal(mockTree.edit.mock.calls.length, 0);
    });

    it('should return true with no edits when text is identical', () => {
      const mockTree = {
        edit: vi.fn(),
      };
      const block = yElem('p', [yText('hello')]);
      const result = tryIntraBlockDiff(mockTree, block, block, 0);
      assert.isTrue(result);
      assert.equal(mockTree.edit.mock.calls.length, 0);
    });

    it('should apply a single text edit to the tree', () => {
      const mockTree = {
        edit: vi.fn(),
      };
      const oldBlock = yElem('p', [yText('hello')]);
      const newBlock = yElem('p', [yText('world')]);
      const result = tryIntraBlockDiff(mockTree, oldBlock, newBlock, 0);
      assert.isTrue(result);
      assert.isTrue(mockTree.edit.mock.calls.length > 0);
    });

    it('should apply edits in reverse order', () => {
      const editArgs: Array<[number, number, unknown]> = [];
      const mockTree = {
        edit(from: number, to: number, content?: YorkieTreeJSON) {
          editArgs.push([from, to, content]);
        },
      };
      // Two text nodes that both change
      const oldBlock = yElem('p', [
        yElem('strong', [yText('aaa')]),
        yElem('span', [yText('bbb')]),
      ]);
      const newBlock = yElem('p', [
        yElem('strong', [yText('xxx')]),
        yElem('span', [yText('yyy')]),
      ]);
      tryIntraBlockDiff(mockTree, oldBlock, newBlock, 0);
      // Should have 2 edits, applied in reverse (higher index first)
      assert.equal(editArgs.length, 2);
      assert.isTrue(editArgs[0][0] > editArgs[1][0]);
    });

    it('should call tree.edit with content for replacements', () => {
      const mockTree = {
        edit: vi.fn(),
      };
      const oldBlock = yElem('p', [yText('abc')]);
      const newBlock = yElem('p', [yText('aXc')]);
      tryIntraBlockDiff(mockTree, oldBlock, newBlock, 0);
      const call = mockTree.edit.mock.calls[0];
      // Third argument should be the text node content
      assert.isDefined(call[2]);
      assert.equal(call[2].type, 'text');
      assert.equal(call[2].value, 'X');
    });

    it('should call tree.edit without content for pure deletions', () => {
      const mockTree = {
        edit: vi.fn(),
      };
      const oldBlock = yElem('p', [yText('hello')]);
      const newBlock = yElem('p', [yText('hel')]);
      tryIntraBlockDiff(mockTree, oldBlock, newBlock, 0);
      const call = mockTree.edit.mock.calls[0];
      // For deletion, no content argument (undefined)
      assert.isUndefined(call[2]);
    });

    it('should call onLog when edits are applied', () => {
      const onLog = vi.fn();
      const mockTree = {
        edit: vi.fn(),
      };
      const oldBlock = yElem('p', [yText('hello')]);
      const newBlock = yElem('p', [yText('world')]);
      tryIntraBlockDiff(mockTree, oldBlock, newBlock, 0, onLog);
      assert.isTrue(onLog.mock.calls.length > 0);
      assert.equal(onLog.mock.calls[0][0], 'local');
    });
  });

  describe('syncToYorkie', () => {
    const markMapping = defaultMarkMapping;

    it('should detect no changes when old and new docs are identical', () => {
      const pmDoc = doc(p('hello'));
      const yorkieTree = pmToYorkie(pmDoc, markMapping);
      const { tree, calls } = createMockTree(yorkieTree);
      const onLog = vi.fn();

      syncToYorkie(tree, pmDoc, pmDoc, markMapping, onLog);
      assert.equal(calls.length, 0);
      assert.isTrue(
        onLog.mock.calls.some((c: Array<unknown>) =>
          (c[1] as string).includes('No block-level changes'),
        ),
      );
    });

    it('should use intra-block diff for a single block text change', () => {
      const oldDoc = doc(p('hello'));
      const newDoc = doc(p('hello world'));
      const yorkieTree = pmToYorkie(oldDoc, markMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, markMapping);
      // Should use char-level edit, not editBulk
      assert.isTrue(calls.every((c) => c.method === 'edit'));
      assert.isTrue(calls.length > 0);
    });

    it('should fall back to block replacement when structure changes', () => {
      const oldDoc = doc(p('hello'));
      const newDoc = doc(p(strong('hello')));
      const yorkieTree = pmToYorkie(oldDoc, markMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, markMapping);
      // Structure changed (added strong wrapper), should do block replacement
      assert.isTrue(calls.length > 0);
      // Block replacement uses edit with content
      const editCall = calls.find((c) => c.method === 'edit');
      assert.isDefined(editCall);
    });

    it('should handle block insertion (new has more blocks)', () => {
      const oldDoc = doc(p('a'));
      const newDoc = doc(p('a'), p('b'));
      const yorkieTree = pmToYorkie(oldDoc, markMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, markMapping);
      assert.isTrue(calls.length > 0);
    });

    it('should handle block deletion', () => {
      const oldDoc = doc(p('a'), p('b'));
      const newDoc = doc(p('a'));
      const yorkieTree = pmToYorkie(oldDoc, markMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, markMapping);
      assert.isTrue(calls.length > 0);
      // Deletion: edit with no content
      const editCall = calls.find((c) => c.method === 'edit');
      assert.isDefined(editCall);
    });

    it('should handle multi-block replacement', () => {
      const oldDoc = doc(p('a'), p('b'), p('c'));
      const newDoc = doc(p('a'), p('x'), p('y'), p('c'));
      const yorkieTree = pmToYorkie(oldDoc, markMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, markMapping);
      assert.isTrue(calls.length > 0);
    });

    it('should use editBulk when inserting multiple new blocks', () => {
      const oldDoc = doc(p('a'));
      const newDoc = doc(p('a'), p('b'), p('c'));
      const yorkieTree = pmToYorkie(oldDoc, markMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, markMapping);
      // Should use editBulk for 2 new blocks
      const bulkCall = calls.find((c) => c.method === 'editBulk');
      assert.isDefined(bulkCall);
    });
  });
});
