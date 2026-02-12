import { describe, it, assert, vi } from 'vitest';
import { Schema, Node } from 'prosemirror-model';
import { pmToYorkie, yorkieToJSON } from '../../src/convert';
import { syncToYorkie } from '../../src/diff';
import {
  defaultMarkMapping,
  invertMapping,
  buildMarkMapping,
} from '../../src/defaults';
import { buildPositionMap } from '../../src/position';
import { yText, createMockTree } from './helpers';

/**
 * Custom schema matching the prosemirror-example.ts prototype.
 * Includes notegroup > note nesting, star inline node,
 * boring_paragraph (no marks), and a `shouting` mark.
 */
const customSchema = new Schema({
  nodes: {
    doc: { content: '(paragraph | notegroup | boring_paragraph)*' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    boring_paragraph: {
      content: 'text*',
      group: 'block',
      marks: '',
      parseDOM: [{ tag: 'p.boring' }],
      toDOM() {
        return ['p', { class: 'boring' }, 0];
      },
    },
    notegroup: {
      content: 'note+',
      group: 'block',
      parseDOM: [{ tag: 'notegroup' }],
      toDOM() {
        return ['notegroup', 0];
      },
    },
    note: {
      content: 'text*',
      parseDOM: [{ tag: 'note' }],
      toDOM() {
        return ['note', 0];
      },
    },
    star: {
      inline: true,
      group: 'inline',
      parseDOM: [{ tag: 'star' }],
      toDOM() {
        return ['star'];
      },
    },
    text: { group: 'inline' },
  },
  marks: {
    shouting: {
      parseDOM: [{ tag: 'shouting' }],
      toDOM() {
        return ['shouting', 0];
      },
    },
  },
});

/** Create a doc node with given content. */
function cDoc(...content: Array<Node>) {
  return customSchema.node('doc', null, content);
}
/** Create a paragraph node with given content. */
function cParagraph(...content: Array<Node | string>) {
  return customSchema.node(
    'paragraph',
    null,
    content.map((c) => (typeof c === 'string' ? customSchema.text(c) : c)),
  );
}
/** Create a boring_paragraph node (marks disabled) with given content. */
function cBoringParagraph(...content: Array<Node | string>) {
  return customSchema.node(
    'boring_paragraph',
    null,
    content.map((c) => (typeof c === 'string' ? customSchema.text(c) : c)),
  );
}
/** Create a notegroup node wrapping note children. */
function cNotegroup(...notes: Array<Node>) {
  return customSchema.node('notegroup', null, notes);
}
/** Create a note node with given content. */
function cNote(...content: Array<Node | string>) {
  return customSchema.node(
    'note',
    null,
    content.map((c) => (typeof c === 'string' ? customSchema.text(c) : c)),
  );
}
/** Create a star inline leaf node. */
function cStar() {
  return customSchema.node('star');
}
/** Create text with the shouting mark applied. */
function cShouting(text: string) {
  return customSchema.text(text, [customSchema.marks.shouting.create()]);
}

// Mark mapping built from the custom schema
const customMarkMapping = buildMarkMapping(customSchema);
const customElementToMarkMapping = invertMapping(customMarkMapping);

/**
 * Coerce numeric-looking string attributes back to numbers
 * for Node.fromJSON compatibility.
 */
function coerceAttrs(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json;
  if (Array.isArray(json)) return json.map(coerceAttrs);
  const obj = json as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'attrs' && typeof value === 'object' && value !== null) {
      const attrs: Record<string, unknown> = {};
      for (const [ak, av] of Object.entries(value as Record<string, unknown>)) {
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

/** Convert PM -> Yorkie -> PM and return the reconstructed node. */
function roundTrip(pmNode: Node) {
  const yorkieJSON = pmToYorkie(pmNode, customMarkMapping);
  const pmJSON = yorkieToJSON(yorkieJSON, customElementToMarkMapping);
  const coerced = coerceAttrs(pmJSON);
  return Node.fromJSON(
    customSchema,
    coerced as Parameters<typeof Node.fromJSON>[1],
  );
}

describe('custom schema', () => {
  describe('buildMarkMapping', () => {
    it('should auto-detect marks from the schema', () => {
      const mapping = buildMarkMapping(customSchema);
      assert.equal(mapping['shouting'], 'shouting');
    });

    it('should allow overrides to rename marks', () => {
      const mapping = buildMarkMapping(customSchema, {
        shouting: 'yelling',
      });
      assert.equal(mapping['shouting'], 'yelling');
    });

    it('should include all marks from the basic schema', async () => {
      // The basic schema has: link, em, strong, code
      const { schema: basicSchema } = await import('prosemirror-schema-basic');
      const mapping = buildMarkMapping(basicSchema);
      assert.equal(mapping['link'], 'link');
      assert.equal(mapping['em'], 'em');
      assert.equal(mapping['strong'], 'strong');
      assert.equal(mapping['code'], 'code');
    });
  });

  describe('pmToYorkie conversion', () => {
    it('should convert notegroup > notes to correct Yorkie nesting', () => {
      const pmDoc = cDoc(cNotegroup(cNote('cd'), cNote('ef')));
      const result = pmToYorkie(pmDoc, customMarkMapping);
      assert.equal(result.type, 'doc');
      assert.equal(result.children!.length, 1);
      const ng = result.children![0];
      assert.equal(ng.type, 'notegroup');
      assert.equal(ng.children!.length, 2);
      assert.equal(ng.children![0].type, 'note');
      assert.deepEqual(ng.children![0].children, [yText('cd')]);
      assert.equal(ng.children![1].type, 'note');
      assert.deepEqual(ng.children![1].children, [yText('ef')]);
    });

    it('should convert star inline node to leaf element with empty children', () => {
      const pmDoc = cDoc(cParagraph(cStar()));
      const result = pmToYorkie(pmDoc, customMarkMapping);
      const para = result.children![0];
      assert.equal(para.children![0].type, 'star');
      assert.deepEqual(para.children![0].children, []);
    });

    it('should convert boring_paragraph with plain text', () => {
      const pmDoc = cDoc(cBoringParagraph('gh'));
      const result = pmToYorkie(pmDoc, customMarkMapping);
      const bp = result.children![0];
      assert.equal(bp.type, 'boring_paragraph');
      assert.deepEqual(bp.children, [yText('gh')]);
    });

    it('should convert paragraph with shouting mark using custom mapping', () => {
      const pmDoc = cDoc(cParagraph(cShouting('loud')));
      const result = pmToYorkie(pmDoc, customMarkMapping);
      const para = result.children![0];
      assert.equal(para.children![0].type, 'shouting');
      assert.equal(para.children![0].children![0].type, 'text');
      assert.equal(para.children![0].children![0].value, 'loud');
    });

    it('should drop shouting mark with defaultMarkMapping and warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pmDoc = cDoc(cParagraph(cShouting('loud')));
      const result = pmToYorkie(pmDoc, defaultMarkMapping);
      // With default mapping, shouting is not mapped, so text is bare
      const para = result.children![0];
      assert.equal(para.children![0].type, 'text');
      assert.equal(para.children![0].value, 'loud');
      assert.isTrue(
        warnSpy.mock.calls.some((c) => (c[0] as string).includes('shouting')),
      );
      warnSpy.mockRestore();
    });
  });

  describe('round-trip conversion', () => {
    it('should round-trip a full doc with paragraph, notegroup, and boring_paragraph', () => {
      const original = cDoc(
        cParagraph('ab'),
        cNotegroup(cNote('cd'), cNote('ef')),
        cBoringParagraph('gh'),
      );
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip a doc with shouting mark', () => {
      const original = cDoc(cParagraph(cShouting('LOUD')));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip mixed plain and marked text', () => {
      const original = cDoc(cParagraph('quiet ', cShouting('LOUD'), ' quiet'));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });

    it('should round-trip star inline nodes', () => {
      const original = cDoc(cParagraph('before ', cStar(), ' after'));
      const result = roundTrip(original);
      assert.isTrue(original.eq(result));
    });
  });

  describe('syncToYorkie with custom schema', () => {
    it('should handle text edit inside a note within a notegroup', () => {
      const oldDoc = cDoc(
        cParagraph('ab'),
        cNotegroup(cNote('cd'), cNote('ef')),
      );
      const newDoc = cDoc(
        cParagraph('ab'),
        cNotegroup(cNote('cXd'), cNote('ef')),
      );
      const yorkieTree = pmToYorkie(oldDoc, customMarkMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, customMarkMapping);
      // Should produce character-level edits (intra-block diff)
      assert.isTrue(calls.length > 0);
    });

    it('should handle adding a new note to a notegroup', () => {
      const oldDoc = cDoc(cNotegroup(cNote('ab')));
      const newDoc = cDoc(cNotegroup(cNote('ab'), cNote('cd')));
      const yorkieTree = pmToYorkie(oldDoc, customMarkMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, customMarkMapping);
      // Structure changed (new note child), should do block replacement
      assert.isTrue(calls.length > 0);
    });

    it('should handle removing a note from a notegroup', () => {
      const oldDoc = cDoc(cNotegroup(cNote('ab'), cNote('cd')));
      const newDoc = cDoc(cNotegroup(cNote('ab')));
      const yorkieTree = pmToYorkie(oldDoc, customMarkMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, customMarkMapping);
      assert.isTrue(calls.length > 0);
    });
  });

  describe('cross-level merge/deletion', () => {
    it('should merge note content into preceding paragraph', () => {
      const oldDoc = cDoc(
        cParagraph('ab'),
        cNotegroup(cNote('cd'), cNote('ef')),
      );
      const newDoc = cDoc(cParagraph('abcd'), cNotegroup(cNote('ef')));
      const yorkieTree = pmToYorkie(oldDoc, customMarkMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, customMarkMapping);
      assert.isTrue(calls.length > 0);
      // Both the paragraph and notegroup changed, so edit/editBulk is used
      const hasStructuralEdit = calls.some(
        (c) => c.method === 'edit' || c.method === 'editBulk',
      );
      assert.isTrue(hasStructuralEdit);
    });

    it('should delete entire notegroup by merging into paragraph', () => {
      const oldDoc = cDoc(cParagraph('ab'), cNotegroup(cNote('cd')));
      const newDoc = cDoc(cParagraph('abcd'));
      const yorkieTree = pmToYorkie(oldDoc, customMarkMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, customMarkMapping);
      assert.isTrue(calls.length > 0);
      // Verify the notegroup is removed via block replacement
      const hasEdit = calls.some(
        (c) => c.method === 'edit' || c.method === 'editBulk',
      );
      assert.isTrue(hasEdit);
    });

    it('should handle deletion spanning from paragraph through notegroup to next paragraph', () => {
      const oldDoc = cDoc(
        cParagraph('ab'),
        cNotegroup(cNote('cd'), cNote('ef')),
        cParagraph('gh'),
      );
      const newDoc = cDoc(cParagraph('agh'));
      const yorkieTree = pmToYorkie(oldDoc, customMarkMapping);
      const { tree, calls } = createMockTree(yorkieTree);

      syncToYorkie(tree, oldDoc, newDoc, customMarkMapping);
      assert.isTrue(calls.length > 0);
      // 3 old blocks replaced by 1 new block — should use a single edit
      const editCall = calls.find((c) => c.method === 'edit');
      assert.isDefined(editCall);
    });

    it('should produce valid position map after merge', () => {
      const mergedDoc = cDoc(cParagraph('abcd'), cNotegroup(cNote('ef')));
      const yorkieTree = pmToYorkie(mergedDoc, customMarkMapping);
      // buildPositionMap should not throw for a valid doc/tree pair
      const map = buildPositionMap(mergedDoc, yorkieTree);
      assert.isTrue(map.pmPositions.length > 0);
      assert.equal(map.pmPositions.length, map.yorkieIndices.length);
    });

    it('should produce valid position map after full merge into single paragraph', () => {
      const mergedDoc = cDoc(cParagraph('abcd'));
      const yorkieTree = pmToYorkie(mergedDoc, customMarkMapping);
      const map = buildPositionMap(mergedDoc, yorkieTree);
      assert.equal(map.pmPositions.length, 4); // 'a','b','c','d'
      assert.equal(map.yorkieIndices.length, 4);
    });
  });
});
