import type { Schema } from 'prosemirror-model';
import type { MarkMapping } from './types';

/**
 * Default mapping from ProseMirror mark names to Yorkie element type names.
 */
export const defaultMarkMapping: MarkMapping = {
  strong: 'strong',
  em: 'em',
  code: 'code',
  link: 'link',
};

/**
 * Build a mark mapping by iterating over the schema's marks.
 * Creates an identity mapping (mark name -> mark name) for each mark
 * in the schema. Optional overrides can rename specific marks.
 */
export function buildMarkMapping(
  schema: Schema,
  overrides?: MarkMapping,
): MarkMapping {
  const mapping: MarkMapping = {};
  for (const name in schema.marks) {
    mapping[name] = name;
  }
  if (overrides) {
    Object.assign(mapping, overrides);
  }
  return mapping;
}

/**
 * Invert a mark mapping (PM mark name -> Yorkie element type)
 * to produce element-to-mark lookup (Yorkie element type -> PM mark name).
 */
export function invertMapping(mapping: MarkMapping): Record<string, string> {
  const inverted: Record<string, string> = {};
  for (const [mark, elem] of Object.entries(mapping)) {
    inverted[elem] = mark;
  }
  return inverted;
}

/**
 * Default cursor color palette for remote presence display.
 */
export const defaultCursorColors: Array<string> = [
  '#FECEEA',
  '#FEF1D2',
  '#A9FDD8',
  '#D7F8FF',
  '#CEC5FA',
];
