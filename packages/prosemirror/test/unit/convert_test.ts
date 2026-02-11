import { describe, it, assert } from 'vitest';
import { Node } from 'prosemirror-model';
import { pmToYorkie, yorkieToJSON } from '../../src/convert';
import { defaultMarkMapping, invertMapping } from '../../src/defaults';
import {
  testSchema,
  doc,
  p,
  strong,
  em,
  strongEm,
  link,
  heading,
  blockquote,
  yText,
  yElem,
} from './helpers';

const markMapping = defaultMarkMapping;
const elementToMarkMapping = invertMapping(markMapping);

describe('convert', () => {
  describe('pmToYorkie', () => {
    describe('text nodes', () => {
      it('should convert plain text to a Yorkie text node', () => {
        const text = testSchema.text('hello');
        const result = pmToYorkie(text, markMapping);
        assert.deepEqual(result, { type: 'text', value: 'hello' });
      });

      it('should wrap a bold text node in a strong element', () => {
        const result = pmToYorkie(strong('hello'), markMapping);
        assert.deepEqual(result, {
          type: 'strong',
          children: [{ type: 'text', value: 'hello' }],
        });
      });

      it('should wrap an italic text node in an em element', () => {
        const result = pmToYorkie(em('hello'), markMapping);
        assert.deepEqual(result, {
          type: 'em',
          children: [{ type: 'text', value: 'hello' }],
        });
      });

      it('should nest multiple marks from innermost to outermost', () => {
        const result = pmToYorkie(strongEm('hello'), markMapping);
        // ProseMirror basic schema canonical mark order: link, em, strong, code
        // So strongEm produces marks [em, strong] in canonical order
        // Loop from i=1 (strong) to i=0 (em):
        //   i=1: wrap with strong, i=0: wrap with em
        // Result: em wraps strong wraps text
        assert.equal(result.type, 'em');
        assert.equal(result.children![0].type, 'strong');
        assert.equal(result.children![0].children![0].type, 'text');
        assert.equal(result.children![0].children![0].value, 'hello');
      });

      it('should preserve mark attributes (e.g., href on link)', () => {
        const result = pmToYorkie(
          link('click', 'http://example.com'),
          markMapping,
        );
        assert.equal(result.type, 'link');
        assert.deepEqual(result.attributes, { href: 'http://example.com' });
        assert.equal(result.children![0].type, 'text');
        assert.equal(result.children![0].value, 'click');
      });

      it('should omit null mark attributes', () => {
        // link mark has href and title; title defaults to null
        const result = pmToYorkie(
          link('click', 'http://example.com'),
          markMapping,
        );
        assert.isUndefined(result.attributes!['title']);
      });
    });

    describe('leaf nodes', () => {
      it('should convert a hard_break to an element with empty children', () => {
        const node = testSchema.node('hard_break');
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'hard_break');
        assert.deepEqual(result.children, []);
      });

      it('should convert a horizontal_rule to an element with empty children', () => {
        const node = testSchema.node('horizontal_rule');
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'horizontal_rule');
        assert.deepEqual(result.children, []);
      });

      it('should convert an image with non-null attributes', () => {
        const node = testSchema.node('image', {
          src: 'img.png',
          alt: null,
          title: null,
        });
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'image');
        assert.equal(result.attributes!['src'], 'img.png');
        assert.isUndefined(result.attributes!['alt']);
        assert.isUndefined(result.attributes!['title']);
      });
    });

    describe('element nodes', () => {
      it('should convert a paragraph with plain text', () => {
        const node = p('hello');
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'paragraph');
        assert.deepEqual(result.children, [{ type: 'text', value: 'hello' }]);
      });

      it('should wrap bare text in span when mixed with mark elements', () => {
        // p("plain", strong("bold"))
        const node = p('plain', strong('bold'));
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'paragraph');
        // First child: span wrapping bare text
        assert.equal(result.children![0].type, 'span');
        assert.deepEqual(result.children![0].children, [
          { type: 'text', value: 'plain' },
        ]);
        // Second child: strong wrapping text
        assert.equal(result.children![1].type, 'strong');
        assert.deepEqual(result.children![1].children, [
          { type: 'text', value: 'bold' },
        ]);
      });

      it('should NOT wrap text in span when all children are text (no marks)', () => {
        const node = p('hello world');
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.children![0].type, 'text');
        assert.equal(result.children![0].value, 'hello world');
      });

      it('should NOT wrap when all children are elements (all marked)', () => {
        const node = p(strong('bold'), em('italic'));
        const result = pmToYorkie(node, markMapping);
        // Both are mark elements, no bare text => no span wrapping
        assert.equal(result.children![0].type, 'strong');
        assert.equal(result.children![1].type, 'em');
      });

      it('should convert a heading with level attribute', () => {
        const node = heading(2, 'Title');
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'heading');
        assert.equal(result.attributes!['level'], '2');
        assert.deepEqual(result.children, [{ type: 'text', value: 'Title' }]);
      });

      it('should convert nested blockquote > paragraph structure', () => {
        const node = blockquote(p('quoted text'));
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'blockquote');
        assert.equal(result.children![0].type, 'paragraph');
        assert.deepEqual(result.children![0].children, [
          { type: 'text', value: 'quoted text' },
        ]);
      });

      it('should convert a doc with multiple paragraphs', () => {
        const node = doc(p('first'), p('second'));
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'doc');
        assert.equal(result.children!.length, 2);
        assert.equal(result.children![0].type, 'paragraph');
        assert.equal(result.children![1].type, 'paragraph');
      });

      it('should handle empty paragraph', () => {
        const node = p();
        const result = pmToYorkie(node, markMapping);
        assert.equal(result.type, 'paragraph');
        assert.deepEqual(result.children, []);
      });
    });
  });

  describe('yorkieToJSON', () => {
    describe('text nodes', () => {
      it('should convert a Yorkie text node to PM text JSON', () => {
        const result = yorkieToJSON(yText('hello'), elementToMarkMapping);
        assert.deepEqual(result, { type: 'text', text: 'hello' });
      });

      it('should apply marks from the mark stack', () => {
        const result = yorkieToJSON(yText('hello'), elementToMarkMapping, [
          { type: 'strong' },
        ]);
        assert.deepEqual(result, {
          type: 'text',
          text: 'hello',
          marks: [{ type: 'strong' }],
        });
      });

      it('should apply multiple marks from the stack', () => {
        const result = yorkieToJSON(yText('hello'), elementToMarkMapping, [
          { type: 'strong' },
          { type: 'em' },
        ]);
        const pmNode = result as { marks: Array<{ type: string }> };
        assert.equal(pmNode.marks.length, 2);
        assert.equal(pmNode.marks[0].type, 'strong');
        assert.equal(pmNode.marks[1].type, 'em');
      });

      it('should not include marks array when mark stack is empty', () => {
        const result = yorkieToJSON(yText('hello'), elementToMarkMapping);
        assert.isUndefined((result as { marks?: unknown }).marks);
      });
    });

    describe('span nodes (unwrapping)', () => {
      it('should unwrap span and return its children directly', () => {
        const node = yElem('span', [yText('hello')]);
        const result = yorkieToJSON(node, elementToMarkMapping);
        assert.isArray(result);
        assert.deepEqual(result, [{ type: 'text', text: 'hello' }]);
      });

      it('should pass current mark stack through to span children', () => {
        const node = yElem('span', [yText('hello')]);
        const result = yorkieToJSON(node, elementToMarkMapping, [
          { type: 'em' },
        ]);
        assert.isArray(result);
        const arr = result as Array<{ marks: Array<{ type: string }> }>;
        assert.equal(arr[0].marks[0].type, 'em');
      });

      it('should handle span with multiple children', () => {
        const node = yElem('span', [yText('a'), yText('b')]);
        const result = yorkieToJSON(node, elementToMarkMapping);
        assert.isArray(result);
        assert.equal((result as Array<unknown>).length, 2);
      });
    });

    describe('mark elements (collapsing)', () => {
      it('should collapse a strong element into a mark on its text child', () => {
        const node = yElem('strong', [yText('bold')]);
        const result = yorkieToJSON(node, elementToMarkMapping);
        assert.isArray(result);
        const arr = result as Array<{
          type: string;
          text: string;
          marks: Array<{ type: string }>;
        }>;
        assert.equal(arr[0].type, 'text');
        assert.equal(arr[0].text, 'bold');
        assert.equal(arr[0].marks[0].type, 'strong');
      });

      it('should accumulate nested marks', () => {
        // strong > em > text "both"
        const node = yElem('strong', [yElem('em', [yText('both')])]);
        const result = yorkieToJSON(node, elementToMarkMapping);
        assert.isArray(result);
        const arr = result as Array<{ marks: Array<{ type: string }> }>;
        assert.equal(arr[0].marks.length, 2);
        assert.equal(arr[0].marks[0].type, 'strong');
        assert.equal(arr[0].marks[1].type, 'em');
      });

      it('should preserve mark attributes (e.g., link href)', () => {
        const node = yElem('link', [yText('click')], {
          href: 'http://example.com',
        });
        const result = yorkieToJSON(node, elementToMarkMapping);
        assert.isArray(result);
        const arr = result as Array<{
          marks: Array<{ type: string; attrs?: Record<string, unknown> }>;
        }>;
        assert.equal(arr[0].marks[0].type, 'link');
        assert.deepEqual(arr[0].marks[0].attrs, { href: 'http://example.com' });
      });

      it('should not add attrs to mark entry when attributes are empty', () => {
        const node = yElem('strong', [yText('bold')]);
        const result = yorkieToJSON(node, elementToMarkMapping);
        const arr = result as Array<{
          marks: Array<{ type: string; attrs?: unknown }>;
        }>;
        assert.isUndefined(arr[0].marks[0].attrs);
      });
    });

    describe('regular element nodes', () => {
      it('should convert a paragraph with text children', () => {
        const node = yElem('paragraph', [yText('hello')]);
        const result = yorkieToJSON(node, elementToMarkMapping);
        assert.deepEqual(result, {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello' }],
        });
      });

      it('should reset mark stack for regular element children', () => {
        // Even with a non-empty mark stack, regular element children start fresh
        const node = yElem('paragraph', [yText('hello')]);
        const result = yorkieToJSON(node, elementToMarkMapping, [
          { type: 'strong' },
        ]);
        const pmNode = result as { content: Array<{ marks?: unknown }> };
        assert.isUndefined(pmNode.content[0].marks);
      });

      it('should include attrs when attributes are present', () => {
        const node = yElem('heading', [yText('Title')], { level: '2' });
        const result = yorkieToJSON(node, elementToMarkMapping);
        const pmNode = result as { attrs: Record<string, unknown> };
        assert.deepEqual(pmNode.attrs, { level: 2 });
      });

      it('should omit content when there are no children', () => {
        const node = yElem('horizontal_rule', []);
        const result = yorkieToJSON(node, elementToMarkMapping);
        assert.isUndefined((result as { content?: unknown }).content);
      });

      it('should flatten mark-element arrays in children', () => {
        // paragraph > [span>[text "a"], strong>[text "b"]]
        const node = yElem('paragraph', [
          yElem('span', [yText('a')]),
          yElem('strong', [yText('b')]),
        ]);
        const result = yorkieToJSON(node, elementToMarkMapping);
        const pmNode = result as { content: Array<{ type: string }> };
        assert.equal(pmNode.content.length, 2);
        assert.equal(pmNode.content[0].type, 'text');
        assert.equal(pmNode.content[1].type, 'text');
      });
    });
  });

  describe('round-trip conversion', () => {
    /**
     * Round-trip: PM → Yorkie → PM JSON → Node.fromJSON.
     *
     * Note: Yorkie stores all attributes as strings. For nodes whose
     * PM schema expects numeric attributes (e.g., heading level),
     * we coerce numeric-looking strings back to numbers before
     * calling Node.fromJSON.
     */
    function coerceAttrs(json: unknown): unknown {
      if (typeof json !== 'object' || json === null) return json;
      if (Array.isArray(json)) return json.map(coerceAttrs);
      const obj = json as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'attrs' && typeof value === 'object' && value !== null) {
          const attrs: Record<string, unknown> = {};
          for (const [ak, av] of Object.entries(
            value as Record<string, unknown>,
          )) {
            if (typeof av === 'string' && /^\d+$/.test(av)) {
              attrs[ak] = Number(av);
            } else {
              attrs[ak] = av;
            }
          }
          result[key] = attrs;
        } else if (key === 'content' && Array.isArray(value)) {
          result[key] = value.map(coerceAttrs);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    /** Convert PM → Yorkie → PM and return the reconstructed node. */
    function roundTrip(pmNode: ReturnType<typeof doc>) {
      const yorkieJSON = pmToYorkie(pmNode, markMapping);
      const pmJSON = yorkieToJSON(yorkieJSON, elementToMarkMapping);
      const coerced = coerceAttrs(pmJSON);
      return Node.fromJSON(
        testSchema,
        coerced as Parameters<typeof Node.fromJSON>[1],
      );
    }

    it('should round-trip a simple paragraph with plain text', () => {
      const original = doc(p('hello world'));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip a paragraph with bold text', () => {
      const original = doc(p(strong('bold')));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip a paragraph with mixed plain and bold text', () => {
      const original = doc(p('plain ', strong('bold')));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip a heading with level attribute', () => {
      const original = doc(heading(2, 'Title'));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip a doc with multiple paragraphs', () => {
      const original = doc(p('first'), p('second'));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip nested marks (bold+italic)', () => {
      const original = doc(p(strongEm('both')));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip a link with href attribute', () => {
      const original = doc(p(link('click', 'http://example.com')));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip a complex document', () => {
      const original = doc(
        heading(1, 'Title'),
        p('Some ', strong('bold'), ' and ', em('italic'), ' text.'),
        blockquote(p('A quote')),
        p(link('Link text', 'http://example.com')),
      );
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });
  });
});
