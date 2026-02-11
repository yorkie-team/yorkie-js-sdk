import { describe, it, assert } from 'vitest';
import {
  yorkieNodeSize,
  blockIndexToYorkieIndex,
  buildPositionMap,
  pmPosToYorkieIdx,
  yorkieIdxToPmPos,
} from '../../src/position';
import { pmToYorkie } from '../../src/convert';
import { defaultMarkMapping } from '../../src/defaults';
import { doc, p, heading, strong, yText, yElem } from './helpers';

describe('position', () => {
  describe('yorkieNodeSize', () => {
    it('should return text length for text nodes', () => {
      assert.equal(yorkieNodeSize(yText('hello')), 5);
    });

    it('should return 0 for empty text nodes', () => {
      assert.equal(yorkieNodeSize(yText('')), 0);
    });

    it('should return 0 for text nodes with undefined value', () => {
      assert.equal(yorkieNodeSize({ type: 'text' }), 0);
    });

    it('should return 2 for an empty element node', () => {
      assert.equal(yorkieNodeSize(yElem('p', [])), 2);
    });

    it('should return 2 + text length for element with one text child', () => {
      assert.equal(yorkieNodeSize(yElem('p', [yText('hello')])), 7);
    });

    it('should sum sizes recursively for nested elements', () => {
      // strong > text "hi" => 2 + 2 = 4
      // paragraph > strong > text "hi" => 2 + 4 = 6
      const node = yElem('paragraph', [yElem('strong', [yText('hi')])]);
      assert.equal(yorkieNodeSize(node), 6);
    });

    it('should handle multiple children', () => {
      // p > [text "ab", text "cd"] => 2 + 2 + 2 = 6
      const node = yElem('p', [yText('ab'), yText('cd')]);
      assert.equal(yorkieNodeSize(node), 6);
    });

    it('should handle deeply nested structures', () => {
      // doc > blockquote > paragraph > text "x"
      // text: 1, paragraph: 2+1=3, blockquote: 2+3=5, doc: 2+5=7
      const node = yElem('doc', [
        yElem('blockquote', [yElem('paragraph', [yText('x')])]),
      ]);
      assert.equal(yorkieNodeSize(node), 7);
    });
  });

  describe('blockIndexToYorkieIndex', () => {
    it('should return 0 for blockIndex 0', () => {
      const blocks = [yElem('p', [yText('hello')])];
      assert.equal(blockIndexToYorkieIndex(blocks, 0), 0);
    });

    it('should return the size of the first block for blockIndex 1', () => {
      // p > text "hello" => size 7
      const blocks = [yElem('p', [yText('hello')])];
      assert.equal(blockIndexToYorkieIndex(blocks, 1), 7);
    });

    it('should sum sizes of preceding blocks', () => {
      // p > text "ab" => size 4, p > text "cd" => size 4
      const blocks = [
        yElem('p', [yText('ab')]),
        yElem('p', [yText('cd')]),
        yElem('p', [yText('ef')]),
      ];
      assert.equal(blockIndexToYorkieIndex(blocks, 0), 0);
      assert.equal(blockIndexToYorkieIndex(blocks, 1), 4);
      assert.equal(blockIndexToYorkieIndex(blocks, 2), 8);
      assert.equal(blockIndexToYorkieIndex(blocks, 3), 12);
    });

    it('should clamp to array length if blockIndex exceeds it', () => {
      const blocks = [yElem('p', [yText('ab')]), yElem('p', [yText('cd')])];
      // size of both = 4 + 4 = 8
      assert.equal(blockIndexToYorkieIndex(blocks, 10), 8);
    });

    it('should return 0 for empty blocks array', () => {
      assert.equal(blockIndexToYorkieIndex([], 0), 0);
    });

    it('should handle blocks of different sizes', () => {
      // p > text "a" => 2+1=3, p > text "hello world" => 2+11=13
      const blocks = [
        yElem('p', [yText('a')]),
        yElem('p', [yText('hello world')]),
      ];
      assert.equal(blockIndexToYorkieIndex(blocks, 0), 0);
      assert.equal(blockIndexToYorkieIndex(blocks, 1), 3);
      assert.equal(blockIndexToYorkieIndex(blocks, 2), 16);
    });
  });

  describe('buildPositionMap', () => {
    it('should build an empty map for a doc with an empty paragraph', () => {
      const pmDoc = doc(p());
      const yorkieTree = pmToYorkie(pmDoc, defaultMarkMapping);
      const map = buildPositionMap(pmDoc, yorkieTree);
      assert.deepEqual(map.pmPositions, []);
      assert.deepEqual(map.yorkieIndices, []);
    });

    it('should map positions for a simple one-paragraph document', () => {
      const pmDoc = doc(p('hello'));
      const yorkieTree = pmToYorkie(pmDoc, defaultMarkMapping);
      const map = buildPositionMap(pmDoc, yorkieTree);

      // PM: doc opens at 0, paragraph opens at 0, text starts at pos 1
      assert.deepEqual(map.pmPositions, [1, 2, 3, 4, 5]);
      // Yorkie: paragraph opens at idx 0, text starts at idx 1
      assert.deepEqual(map.yorkieIndices, [1, 2, 3, 4, 5]);
    });

    it('should map positions for a two-paragraph document', () => {
      const pmDoc = doc(p('ab'), p('cd'));
      const yorkieTree = pmToYorkie(pmDoc, defaultMarkMapping);
      const map = buildPositionMap(pmDoc, yorkieTree);

      // PM positions: "a"=1, "b"=2, then para close=3, between=4, para open: "c"=5, "d"=6
      assert.deepEqual(map.pmPositions, [1, 2, 5, 6]);
      // Yorkie: para1 at 0: text at 1,2; para2 at 4: text at 5,6
      assert.deepEqual(map.yorkieIndices, [1, 2, 5, 6]);
    });

    it('should map positions for a document with marked text', () => {
      // p("a", strong("b")) => Yorkie: p > [span>[text "a"], strong>[text "b"]]
      const pmDoc = doc(p('a', strong('b')));
      const yorkieTree = pmToYorkie(pmDoc, defaultMarkMapping);
      const map = buildPositionMap(pmDoc, yorkieTree);

      // PM positions: "a"=1, "b"=2
      assert.deepEqual(map.pmPositions, [1, 2]);
      // Yorkie: p(0) > span(1) > text "a" at idx 2, then strong(4) > text "b" at idx 5
      assert.deepEqual(map.yorkieIndices, [2, 5]);
    });

    it('should handle heading nodes with attributes', () => {
      const pmDoc = doc(heading(2, 'Title'));
      const yorkieTree = pmToYorkie(pmDoc, defaultMarkMapping);
      const map = buildPositionMap(pmDoc, yorkieTree);

      // PM: "T"=1, "i"=2, "t"=3, "l"=4, "e"=5
      assert.deepEqual(map.pmPositions, [1, 2, 3, 4, 5]);
      // Yorkie: heading opens at 0, text starts at 1
      assert.deepEqual(map.yorkieIndices, [1, 2, 3, 4, 5]);
    });
  });

  describe('pmPosToYorkieIdx', () => {
    it('should find an exact PM position match', () => {
      const map = {
        pmPositions: [1, 2, 3],
        yorkieIndices: [1, 2, 3],
      };
      assert.equal(pmPosToYorkieIdx(map, 2), 2);
    });

    it('should return the next yorkie index when PM position falls between entries', () => {
      const map = {
        pmPositions: [1, 3, 5],
        yorkieIndices: [1, 5, 9],
      };
      // pmPos 2 is between 1 and 3, so returns yorkieIndices for pmPos 3
      assert.equal(pmPosToYorkieIdx(map, 2), 5);
    });

    it('should return last yorkie index + 1 when PM position is beyond all entries', () => {
      const map = {
        pmPositions: [1, 2, 3],
        yorkieIndices: [1, 2, 3],
      };
      assert.equal(pmPosToYorkieIdx(map, 100), 4);
    });

    it('should return 0 for an empty map', () => {
      const map = {
        pmPositions: [] as Array<number>,
        yorkieIndices: [] as Array<number>,
      };
      assert.equal(pmPosToYorkieIdx(map, 5), 0);
    });

    it('should handle PM position 0 (before first character)', () => {
      const map = {
        pmPositions: [1, 2, 3],
        yorkieIndices: [1, 2, 3],
      };
      // pmPos 0 < 1 (first entry), returns yorkieIndices[0]
      assert.equal(pmPosToYorkieIdx(map, 0), 1);
    });
  });

  describe('yorkieIdxToPmPos', () => {
    it('should find an exact Yorkie index match', () => {
      const map = {
        pmPositions: [1, 2, 3],
        yorkieIndices: [1, 2, 3],
      };
      assert.equal(yorkieIdxToPmPos(map, 2), 2);
    });

    it('should return the next PM position when Yorkie index falls between entries', () => {
      const map = {
        pmPositions: [1, 3, 5],
        yorkieIndices: [1, 5, 9],
      };
      // yorkieIdx 3 is between 1 and 5, returns pmPositions for yorkieIdx 5
      assert.equal(yorkieIdxToPmPos(map, 3), 3);
    });

    it('should return last PM position + 1 when Yorkie index is beyond all entries', () => {
      const map = {
        pmPositions: [1, 2, 3],
        yorkieIndices: [1, 2, 3],
      };
      assert.equal(yorkieIdxToPmPos(map, 100), 4);
    });

    it('should return 0 for an empty map', () => {
      const map = {
        pmPositions: [] as Array<number>,
        yorkieIndices: [] as Array<number>,
      };
      assert.equal(yorkieIdxToPmPos(map, 5), 0);
    });

    it('should be consistent with pmPosToYorkieIdx for exact matches', () => {
      const pmDoc = doc(p('hello'), p('world'));
      const yorkieTree = pmToYorkie(pmDoc, defaultMarkMapping);
      const map = buildPositionMap(pmDoc, yorkieTree);

      for (let i = 0; i < map.pmPositions.length; i++) {
        const pmPos = map.pmPositions[i];
        const yorkieIdx = map.yorkieIndices[i];
        assert.equal(pmPosToYorkieIdx(map, pmPos), yorkieIdx);
        assert.equal(yorkieIdxToPmPos(map, yorkieIdx), pmPos);
      }
    });
  });
});
