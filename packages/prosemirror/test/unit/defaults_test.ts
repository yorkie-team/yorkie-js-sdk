import { describe, it, assert } from 'vitest';
import {
  defaultMarkMapping,
  invertMapping,
  defaultCursorColors,
} from '../../src/defaults';

describe('defaults', () => {
  describe('defaultMarkMapping', () => {
    it('should map strong, em, code, and link', () => {
      assert.equal(defaultMarkMapping.strong, 'strong');
      assert.equal(defaultMarkMapping.em, 'em');
      assert.equal(defaultMarkMapping.code, 'code');
      assert.equal(defaultMarkMapping.link, 'link');
    });

    it('should have exactly 4 entries', () => {
      assert.equal(Object.keys(defaultMarkMapping).length, 4);
    });

    it('should have string values for all keys', () => {
      for (const value of Object.values(defaultMarkMapping)) {
        assert.typeOf(value, 'string');
      }
    });
  });

  describe('invertMapping', () => {
    it('should invert a simple identity mapping', () => {
      const result = invertMapping({ strong: 'strong', em: 'em' });
      assert.deepEqual(result, { strong: 'strong', em: 'em' });
    });

    it('should invert a non-identity mapping', () => {
      const result = invertMapping({ bold: 'strong', italic: 'em' });
      assert.deepEqual(result, { strong: 'bold', em: 'italic' });
    });

    it('should return an empty object for empty input', () => {
      assert.deepEqual(invertMapping({}), {});
    });

    it('should handle single-entry mappings', () => {
      const result = invertMapping({ code: 'code_elem' });
      assert.deepEqual(result, { code_elem: 'code' });
    });

    it('should round-trip with itself for identity mappings', () => {
      const mapping = { strong: 'strong', em: 'em' };
      assert.deepEqual(invertMapping(invertMapping(mapping)), mapping);
    });

    it('should produce correct reverse lookup for defaultMarkMapping', () => {
      const inverted = invertMapping(defaultMarkMapping);
      for (const [mark, elem] of Object.entries(defaultMarkMapping)) {
        assert.equal(inverted[elem], mark);
      }
    });
  });

  describe('defaultCursorColors', () => {
    it('should be an array of 5 hex color strings', () => {
      assert.equal(defaultCursorColors.length, 5);
      for (const color of defaultCursorColors) {
        assert.match(color, /^#[0-9A-Fa-f]{6}$/);
      }
    });
  });
});
