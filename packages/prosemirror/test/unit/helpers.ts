import { Node as PMNode } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import type { YorkieTreeJSON } from '../../src/types';

/** Re-export the basic schema for tests. */
export const testSchema = basicSchema;

/** Create a doc node with given content. */
export function doc(...content: Array<PMNode>) {
  return testSchema.node('doc', null, content);
}

/** Create a paragraph node with given content. */
export function p(...content: Array<PMNode | string>) {
  return testSchema.node(
    'paragraph',
    null,
    content.map((c) => (typeof c === 'string' ? testSchema.text(c) : c)),
  );
}

/** Create bold text. */
export function strong(text: string) {
  return testSchema.text(text, [testSchema.marks.strong.create()]);
}

/** Create italic text. */
export function em(text: string) {
  return testSchema.text(text, [testSchema.marks.em.create()]);
}

/** Create bold+italic text. */
export function strongEm(text: string) {
  return testSchema.text(text, [
    testSchema.marks.strong.create(),
    testSchema.marks.em.create(),
  ]);
}

/** Create code-marked text. */
export function code(text: string) {
  return testSchema.text(text, [testSchema.marks.code.create()]);
}

/** Create link text with href. */
export function link(text: string, href: string) {
  return testSchema.text(text, [testSchema.marks.link.create({ href })]);
}

/** Create a heading node with given level and content. */
export function heading(level: number, ...content: Array<PMNode | string>) {
  return testSchema.node(
    'heading',
    { level },
    content.map((c) => (typeof c === 'string' ? testSchema.text(c) : c)),
  );
}

/** Create a blockquote node. */
export function blockquote(...content: Array<PMNode>) {
  return testSchema.node('blockquote', null, content);
}

/** Create a hard_break node. */
export function hardBreak() {
  return testSchema.node('hard_break');
}

/** Create a horizontal_rule node. */
export function hr() {
  return testSchema.node('horizontal_rule');
}

/** Create a Yorkie text node JSON. */
export function yText(value: string): YorkieTreeJSON {
  return { type: 'text', value };
}

/** Create a Yorkie element node JSON. */
export function yElem(
  type: string,
  children: Array<YorkieTreeJSON>,
  attributes?: Record<string, string>,
): YorkieTreeJSON {
  const node: YorkieTreeJSON = { type, children };
  if (attributes) node.attributes = attributes;
  return node;
}

/** Create a mock tree object for diff tests. */
export function createMockTree(yorkieJSON: YorkieTreeJSON) {
  const calls: Array<{
    method: string;
    args: Array<unknown>;
  }> = [];
  return {
    tree: {
      /** Return JSON string of the tree. */
      toJSON() {
        return JSON.stringify(yorkieJSON);
      },
      /** Record an edit call. */
      edit(fromIdx: number, toIdx: number, content?: YorkieTreeJSON) {
        calls.push({ method: 'edit', args: [fromIdx, toIdx, content] });
      },
      /** Record a bulk edit call. */
      editBulk(
        fromIdx: number,
        toIdx: number,
        contents: Array<YorkieTreeJSON>,
      ) {
        calls.push({ method: 'editBulk', args: [fromIdx, toIdx, contents] });
      },
    },
    calls,
  };
}
