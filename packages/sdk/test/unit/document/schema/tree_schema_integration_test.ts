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
import { buildRuleset } from '@yorkie-js/schema';
import { YorkieTypeRule } from '@yorkie-js/schema/src/rulesets';
import { validateYorkieRuleset } from '@yorkie-js/sdk/src/document/schema/ruleset_validator';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { RHT } from '@yorkie-js/sdk/src/document/crdt/rht';
import { posT, timeT } from '@yorkie-js/sdk/test/helper/helper';

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

/**
 * `createCRDTObjectWithTree` creates a CRDTObject containing a CRDTTree
 * at the given key, simulating a document root.
 */
function createCRDTObjectWithTree(key: string, tree: CRDTTree): CRDTObject {
  const ticket = timeT();
  const obj = CRDTObject.create(ticket);
  obj.set(key, tree, timeT());
  return obj;
}

describe('Tree Schema Integration (full pipeline)', () => {
  // A schema DSL with a document containing a tree with multiple node types,
  // marks, and group definitions.
  const schemaDSL = `
    type Document = {
      content: yorkie.Tree<{
        doc: { content: "paragraph+"; };
        paragraph: { content: "text*"; marks: "bold italic"; group: "block"; };
        heading: { content: "text*"; marks: "bold"; group: "block"; };
        text: {};
      }>;
    };
  `;

  describe('buildRuleset from schema DSL with tree nodes', () => {
    it('should produce rules containing treeNodes for yorkie.Tree', () => {
      const rules = buildRuleset(schemaDSL);

      // Find the tree rule
      const treeRule = rules.find((r) => r.type === 'yorkie.Tree');
      expect(treeRule).toBeDefined();
      expect(treeRule!.type).toBe('yorkie.Tree');
      expect(treeRule!.path).toBe('$.content');

      // Verify treeNodes are present and correct
      const yorkieRule = treeRule as YorkieTypeRule;
      expect(yorkieRule.treeNodes).toBeDefined();
      expect(yorkieRule.treeNodes).toHaveLength(4);

      // Verify individual node rules
      const nodeTypes = yorkieRule.treeNodes!.map((n) => n.nodeType);
      expect(nodeTypes).toContain('doc');
      expect(nodeTypes).toContain('paragraph');
      expect(nodeTypes).toContain('heading');
      expect(nodeTypes).toContain('text');

      // Verify specific node properties
      const docNode = yorkieRule.treeNodes!.find((n) => n.nodeType === 'doc')!;
      expect(docNode.content).toBe('paragraph+');
      expect(docNode.marks).toBe('');
      expect(docNode.group).toBe('');

      const paraNode = yorkieRule.treeNodes!.find(
        (n) => n.nodeType === 'paragraph',
      )!;
      expect(paraNode.content).toBe('text*');
      expect(paraNode.marks).toBe('bold italic');
      expect(paraNode.group).toBe('block');

      const headingNode = yorkieRule.treeNodes!.find(
        (n) => n.nodeType === 'heading',
      )!;
      expect(headingNode.content).toBe('text*');
      expect(headingNode.marks).toBe('bold');
      expect(headingNode.group).toBe('block');

      const textNode = yorkieRule.treeNodes!.find(
        (n) => n.nodeType === 'text',
      )!;
      expect(textNode.content).toBe('');
      expect(textNode.marks).toBe('');
    });

    it('should also produce an object rule for the root document', () => {
      const rules = buildRuleset(schemaDSL);
      const objRule = rules.find((r) => r.type === 'object');
      expect(objRule).toBeDefined();
      expect(objRule!.path).toBe('$');
    });
  });

  describe('valid tree structures through full pipeline', () => {
    it('should validate doc > paragraph > text', () => {
      const rules = buildRuleset(schemaDSL);

      const text = createTextNode('hello');
      const para = createElementNode('paragraph', [text]);
      const root = createElementNode('doc', [para]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
      expect(result.errors?.length ?? 0).toBe(0);
    });

    it('should validate doc > multiple paragraphs > text', () => {
      const rules = buildRuleset(schemaDSL);

      const text1 = createTextNode('hello');
      const text2 = createTextNode('world');
      const para1 = createElementNode('paragraph', [text1]);
      const para2 = createElementNode('paragraph', [text2]);
      const root = createElementNode('doc', [para1, para2]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });

    it('should validate paragraph with no text children (text* allows zero)', () => {
      const rules = buildRuleset(schemaDSL);

      const para = createElementNode('paragraph', []);
      const root = createElementNode('doc', [para]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });

    it('should validate text with allowed marks (bold on paragraph)', () => {
      const rules = buildRuleset(schemaDSL);

      const attrs = new RHT();
      attrs.set('bold', '"true"', timeT());
      const text = createTextNode('hello', attrs);
      const para = createElementNode('paragraph', [text]);
      const root = createElementNode('doc', [para]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });

    it('should validate text with multiple allowed marks (bold + italic on paragraph)', () => {
      const rules = buildRuleset(schemaDSL);

      const attrs = new RHT();
      attrs.set('bold', '"true"', timeT());
      attrs.set('italic', '"true"', timeT());
      const text = createTextNode('styled text', attrs);
      const para = createElementNode('paragraph', [text]);
      const root = createElementNode('doc', [para]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });
  });

  describe('invalid tree structures through full pipeline', () => {
    it('should reject doc with no children (paragraph+ requires at least one)', () => {
      const rules = buildRuleset(schemaDSL);

      const root = createElementNode('doc', []);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0].path).toBe('$.content');
      expect(result.errors![0].message).toContain('doc');
    });

    it('should reject unknown node types', () => {
      const rules = buildRuleset(schemaDSL);

      const text = createTextNode('hello');
      const div = createElementNode('div', [text]);
      const root = createElementNode('doc', [div]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Unknown node type');
      expect(result.errors![0].message).toContain('div');
    });

    it('should reject wrong child type (heading under doc that requires paragraph+)', () => {
      const rules = buildRuleset(schemaDSL);

      // The doc rule requires "paragraph+" which means only paragraph nodes.
      // Heading is not paragraph, so it should be rejected.
      const text = createTextNode('title');
      const heading = createElementNode('heading', [text]);
      const root = createElementNode('doc', [heading]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('doc');
    });

    it('should reject disallowed marks on text children', () => {
      const rules = buildRuleset(schemaDSL);

      // Paragraph allows "bold italic" marks, so "underline" should be rejected.
      const attrs = new RHT();
      attrs.set('underline', '"true"', timeT());
      const text = createTextNode('hello', attrs);
      const para = createElementNode('paragraph', [text]);
      const root = createElementNode('doc', [para]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('disallowed mark');
      expect(result.errors![0].message).toContain('underline');
    });
  });

  describe('schema with groups through full pipeline', () => {
    // A schema where the doc content uses a group reference
    const groupSchemaDSL = `
      type Document = {
        content: yorkie.Tree<{
          doc: { content: "block+"; };
          paragraph: { content: "text*"; group: "block"; };
          heading: { content: "text*"; group: "block"; };
          text: {};
        }>;
      };
    `;

    it('should validate mixed block types (paragraph and heading)', () => {
      const rules = buildRuleset(groupSchemaDSL);

      const text1 = createTextNode('hello');
      const text2 = createTextNode('title');
      const para = createElementNode('paragraph', [text1]);
      const heading = createElementNode('heading', [text2]);
      const root = createElementNode('doc', [para, heading]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });

    it('should reject non-block types under doc (expects block+)', () => {
      const rules = buildRuleset(groupSchemaDSL);

      // text is not in the "block" group
      const text = createTextNode('raw text');
      const root = createElementNode('doc', [text]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('doc');
    });
  });

  describe('deeply nested schema through full pipeline', () => {
    const nestedSchemaDSL = `
      type Document = {
        content: yorkie.Tree<{
          doc: { content: "section+"; };
          section: { content: "paragraph+"; };
          paragraph: { content: "text*"; };
          text: {};
        }>;
      };
    `;

    it('should validate valid deeply nested tree', () => {
      const rules = buildRuleset(nestedSchemaDSL);

      const text = createTextNode('hello');
      const para = createElementNode('paragraph', [text]);
      const section = createElementNode('section', [para]);
      const root = createElementNode('doc', [section]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });

    it('should reject errors at nested level (section with no paragraphs)', () => {
      const rules = buildRuleset(nestedSchemaDSL);

      // section requires paragraph+ but has no children
      const section = createElementNode('section', []);
      const root = createElementNode('doc', [section]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('section');
    });
  });

  describe('schema with alternative content expression through full pipeline', () => {
    const altSchemaDSL = `
      type Document = {
        content: yorkie.Tree<{
          doc: { content: "(paragraph | heading)+"; };
          paragraph: { content: "text*"; };
          heading: { content: "text*"; };
          text: {};
        }>;
      };
    `;

    it('should validate mixed paragraph and heading under doc', () => {
      const rules = buildRuleset(altSchemaDSL);

      const text1 = createTextNode('hello');
      const text2 = createTextNode('title');
      const para = createElementNode('paragraph', [text1]);
      const heading = createElementNode('heading', [text2]);
      const root = createElementNode('doc', [para, heading, para]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });
  });

  describe('non-tree type mismatches through full pipeline', () => {
    it('should reject when value at path is not a CRDTTree', () => {
      const rules = buildRuleset(schemaDSL);

      // Create a CRDTObject with a nested CRDTObject at 'content' instead of a CRDTTree
      const ticket = timeT();
      const obj = CRDTObject.create(ticket);
      const innerObj = CRDTObject.create(timeT());
      obj.set('content', innerObj, timeT());

      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('yorkie.Tree');
    });
  });

  describe('yorkie.Tree without tree schema through full pipeline', () => {
    it('should pass validation for yorkie.Tree rule without treeNodes', () => {
      const noSchemaTreeDSL = `
        type Document = {
          content: yorkie.Tree;
        };
      `;
      const rules = buildRuleset(noSchemaTreeDSL);

      // A tree with any structure should be valid when no treeNodes are specified
      const text = createTextNode('hello');
      const customNode = createElementNode('anything', [text]);
      const root = createElementNode('root', [customNode]);
      const tree = new CRDTTree(root, timeT());

      const obj = createCRDTObjectWithTree('content', tree);
      const result = validateYorkieRuleset(obj, rules);

      expect(result.valid).toBe(true);
    });
  });
});
