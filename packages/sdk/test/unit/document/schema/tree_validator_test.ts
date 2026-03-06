/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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

import { describe, it, expect } from 'vitest';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { RHT } from '@yorkie-js/sdk/src/document/crdt/rht';
import { posT, timeT } from '@yorkie-js/sdk/test/helper/helper';
import {
  buildGroupResolver,
  validateTreeAgainstSchema,
  TreeNodeRuleInput,
} from '@yorkie-js/sdk/src/document/schema/tree-validator';

/**
 * `createTextNode` creates a CRDTTreeNode of type "text" with the given value.
 */
function createTextNode(value: string, attrs?: RHT): CRDTTreeNode {
  return new CRDTTreeNode(posT(), 'text', value, attrs);
}

/**
 * `createElementNode` creates a CRDTTreeNode of the given type with children.
 */
function createElementNode(
  type: string,
  children: Array<CRDTTreeNode>,
): CRDTTreeNode {
  const node = new CRDTTreeNode(posT(), type, []);
  for (const child of children) {
    node.append(child);
  }
  return node;
}

describe('buildGroupResolver', () => {
  it('should resolve group names to node types', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'paragraph', content: 'text*', marks: '', group: 'block' },
      { nodeType: 'heading', content: 'text*', marks: '', group: 'block' },
      { nodeType: 'blockquote', content: 'block+', marks: '', group: 'block' },
    ];

    const resolver = buildGroupResolver(rules);
    expect(resolver('block')).toEqual(['paragraph', 'heading', 'blockquote']);
  });

  it('should return the name itself if not a group', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'paragraph', content: 'text*', marks: '', group: 'block' },
    ];

    const resolver = buildGroupResolver(rules);
    expect(resolver('paragraph')).toEqual(['paragraph']);
    expect(resolver('unknown')).toEqual(['unknown']);
  });

  it('should handle nodes with multiple groups', () => {
    const rules: Array<TreeNodeRuleInput> = [
      {
        nodeType: 'paragraph',
        content: 'text*',
        marks: '',
        group: 'block flow',
      },
    ];

    const resolver = buildGroupResolver(rules);
    expect(resolver('block')).toEqual(['paragraph']);
    expect(resolver('flow')).toEqual(['paragraph']);
  });

  it('should handle empty group', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'paragraph', content: 'text*', marks: '', group: '' },
    ];

    const resolver = buildGroupResolver(rules);
    expect(resolver('paragraph')).toEqual(['paragraph']);
  });
});

describe('validateTreeAgainstSchema', () => {
  const docRules: Array<TreeNodeRuleInput> = [
    { nodeType: 'doc', content: 'paragraph+', marks: '', group: '' },
    { nodeType: 'paragraph', content: 'text*', marks: '', group: '' },
  ];

  it('should validate a valid tree (doc > paragraph > text)', () => {
    const text = createTextNode('hello');
    const para = createElementNode('paragraph', [text]);
    const root = createElementNode('doc', [para]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, docRules);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should validate a tree with multiple paragraphs', () => {
    const text1 = createTextNode('hello');
    const text2 = createTextNode('world');
    const para1 = createElementNode('paragraph', [text1]);
    const para2 = createElementNode('paragraph', [text2]);
    const root = createElementNode('doc', [para1, para2]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, docRules);
    expect(result.valid).toBe(true);
  });

  it('should reject unknown node type', () => {
    const text = createTextNode('hello');
    const div = createElementNode('div', [text]);
    const root = createElementNode('doc', [div]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, docRules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown node type');
    expect(result.error).toContain('div');
  });

  it('should reject content expression violation (doc requires paragraph+ but has none)', () => {
    const root = createElementNode('doc', []);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, docRules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('doc');
  });

  it('should reject content expression violation (wrong child type)', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'paragraph+', marks: '', group: '' },
      { nodeType: 'paragraph', content: 'text*', marks: '', group: '' },
      { nodeType: 'heading', content: 'text*', marks: '', group: '' },
    ];

    const text = createTextNode('hello');
    const heading = createElementNode('heading', [text]);
    const root = createElementNode('doc', [heading]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('doc');
  });

  it('should validate with group resolver', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'block+', marks: '', group: '' },
      { nodeType: 'paragraph', content: 'text*', marks: '', group: 'block' },
      { nodeType: 'heading', content: 'text*', marks: '', group: 'block' },
    ];

    const text1 = createTextNode('hello');
    const text2 = createTextNode('world');
    const para = createElementNode('paragraph', [text1]);
    const heading = createElementNode('heading', [text2]);
    const root = createElementNode('doc', [para, heading]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(true);
  });

  it('should validate an empty content expression (no children required)', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'paragraph+', marks: '', group: '' },
      { nodeType: 'paragraph', content: '', marks: '', group: '' },
    ];

    const para = createElementNode('paragraph', []);
    const root = createElementNode('doc', [para]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(true);
  });

  it('should validate marks on text children', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'heading+', marks: '', group: '' },
      { nodeType: 'heading', content: 'text*', marks: 'bold', group: '' },
    ];

    // Create a text node with a "bold" mark
    const boldAttr = new RHT();
    boldAttr.set('bold', '"true"', timeT());
    const text = createTextNode('hello', boldAttr);
    const heading = createElementNode('heading', [text]);
    const root = createElementNode('doc', [heading]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(true);
  });

  it('should reject disallowed marks on text children', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'heading+', marks: '', group: '' },
      { nodeType: 'heading', content: 'text*', marks: 'bold', group: '' },
    ];

    // Create a text node with an "italic" mark (not allowed)
    const italicAttr = new RHT();
    italicAttr.set('italic', '"true"', timeT());
    const text = createTextNode('hello', italicAttr);
    const heading = createElementNode('heading', [text]);
    const root = createElementNode('doc', [heading]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('disallowed mark');
    expect(result.error).toContain('italic');
  });

  it('should allow multiple valid marks', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'paragraph+', marks: '', group: '' },
      {
        nodeType: 'paragraph',
        content: 'text*',
        marks: 'bold italic underline',
        group: '',
      },
    ];

    const attrs = new RHT();
    attrs.set('bold', '"true"', timeT());
    attrs.set('italic', '"true"', timeT());
    const text = createTextNode('hello', attrs);
    const para = createElementNode('paragraph', [text]);
    const root = createElementNode('doc', [para]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(true);
  });

  it('should validate deeply nested trees', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'section+', marks: '', group: '' },
      { nodeType: 'section', content: 'paragraph+', marks: '', group: '' },
      { nodeType: 'paragraph', content: 'text*', marks: '', group: '' },
    ];

    const text = createTextNode('hello');
    const para = createElementNode('paragraph', [text]);
    const section = createElementNode('section', [para]);
    const root = createElementNode('doc', [section]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(true);
  });

  it('should detect errors in nested children', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'section+', marks: '', group: '' },
      { nodeType: 'section', content: 'paragraph+', marks: '', group: '' },
      { nodeType: 'paragraph', content: 'text*', marks: '', group: '' },
    ];

    // section with no children (requires paragraph+)
    const section = createElementNode('section', []);
    const root = createElementNode('doc', [section]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('section');
  });

  it('should skip mark validation when marks rule is empty', () => {
    const rules: Array<TreeNodeRuleInput> = [
      { nodeType: 'doc', content: 'paragraph+', marks: '', group: '' },
      { nodeType: 'paragraph', content: 'text*', marks: '', group: '' },
    ];

    // Text node with marks but paragraph has no marks rule - should pass
    const attrs = new RHT();
    attrs.set('bold', '"true"', timeT());
    const text = createTextNode('hello', attrs);
    const para = createElementNode('paragraph', [text]);
    const root = createElementNode('doc', [para]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(true);
  });

  it('should handle alternative content expressions', () => {
    const rules: Array<TreeNodeRuleInput> = [
      {
        nodeType: 'doc',
        content: '(paragraph | heading)+',
        marks: '',
        group: '',
      },
      { nodeType: 'paragraph', content: 'text*', marks: '', group: '' },
      { nodeType: 'heading', content: 'text*', marks: '', group: '' },
    ];

    const text1 = createTextNode('hello');
    const text2 = createTextNode('title');
    const para = createElementNode('paragraph', [text1]);
    const heading = createElementNode('heading', [text2]);
    const root = createElementNode('doc', [para, heading]);
    const tree = new CRDTTree(root, timeT());

    const result = validateTreeAgainstSchema(tree, rules);
    expect(result.valid).toBe(true);
  });
});
