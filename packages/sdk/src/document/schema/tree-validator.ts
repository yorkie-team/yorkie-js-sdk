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

import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import {
  parseContentExpression,
  matchContentExpression,
} from '@yorkie-js/sdk/src/document/schema/content-expression';

/**
 * `TreeNodeRuleInput` represents the input for a tree node rule,
 * matching the TreeNodeRule type from the schema package.
 */
export type TreeNodeRuleInput = {
  nodeType: string;
  content: string;
  marks: string;
  group: string;
};

/**
 * `TreeValidationResult` represents the result of tree validation.
 */
export type TreeValidationResult = {
  valid: boolean;
  error?: string;
};

/**
 * `buildGroupResolver` builds a group resolver function from the given
 * tree node rules. The resolver maps a name to the list of node types
 * that belong to that group. If the name is not a group, it returns
 * the name itself (treating it as a concrete node type).
 */
export function buildGroupResolver(
  treeNodes: Array<TreeNodeRuleInput>,
): (name: string) => Array<string> {
  const groupMap = new Map<string, Array<string>>();

  for (const node of treeNodes) {
    if (node.group) {
      const groups = node.group.split(/\s+/);
      for (const group of groups) {
        if (!groupMap.has(group)) {
          groupMap.set(group, []);
        }
        groupMap.get(group)!.push(node.nodeType);
      }
    }
  }

  return (name: string): Array<string> => {
    if (groupMap.has(name)) {
      return groupMap.get(name)!;
    }
    return [name];
  };
}

/**
 * `validateTreeAgainstSchema` validates a CRDTTree's structure against
 * the given tree node rules. It checks:
 * 1. Each node's type exists in the rules
 * 2. Children match the content expression (for non-text nodes)
 * 3. Text node marks are allowed by the parent's marks rule
 */
export function validateTreeAgainstSchema(
  tree: CRDTTree,
  treeNodes: Array<TreeNodeRuleInput>,
): TreeValidationResult {
  const ruleMap = new Map<string, TreeNodeRuleInput>();
  for (const node of treeNodes) {
    ruleMap.set(node.nodeType, node);
  }

  const resolver = buildGroupResolver(treeNodes);
  const root = tree.getRoot();

  return validateNode(root, ruleMap, resolver);
}

/**
 * `validateNode` recursively validates a CRDTTreeNode against the rules.
 */
function validateNode(
  node: CRDTTreeNode,
  ruleMap: Map<string, TreeNodeRuleInput>,
  resolver: (name: string) => Array<string>,
): TreeValidationResult {
  // Check that the node type exists in the rules
  const rule = ruleMap.get(node.type);
  if (!rule) {
    return {
      valid: false,
      error: `Unknown node type: "${node.type}"`,
    };
  }

  // Skip further validation for text nodes - they are leaf nodes validated
  // by their parent's marks rule
  if (node.isText) {
    return { valid: true };
  }

  // Get non-removed children
  const children = node.children;

  // Check that all non-text children have known types
  for (const child of children) {
    if (!child.isText && !ruleMap.has(child.type)) {
      return {
        valid: false,
        error: `Unknown node type: "${child.type}"`,
      };
    }
  }

  // Validate content expression (empty string means no children allowed)
  if (rule.content !== undefined) {
    const childTypes = children.map((child) => child.type);
    const expr = parseContentExpression(rule.content);
    const result = matchContentExpression(expr, childTypes, resolver);
    if (!result.valid) {
      return {
        valid: false,
        error: `Node "${node.type}": ${result.error}`,
      };
    }
  }

  // Validate marks on text children if the rule specifies allowed marks
  if (rule.marks) {
    const allowedMarks = rule.marks.split(/\s+/);
    const markResult = validateChildMarks(node, children, allowedMarks);
    if (!markResult.valid) {
      return markResult;
    }
  }

  // Recurse into non-text children
  for (const child of children) {
    if (!child.isText) {
      const result = validateNode(child, ruleMap, resolver);
      if (!result.valid) {
        return result;
      }
    }
  }

  return { valid: true };
}

/**
 * `validateChildMarks` checks that text children of a node only have
 * marks that are listed in the allowed marks.
 */
function validateChildMarks(
  parent: CRDTTreeNode,
  children: Array<CRDTTreeNode>,
  allowedMarks: Array<string>,
): TreeValidationResult {
  for (const child of children) {
    if (!child.isText) {
      continue;
    }

    if (!child.attrs) {
      continue;
    }

    for (const rhtNode of child.attrs) {
      if (rhtNode.isRemoved()) {
        continue;
      }
      const markName = rhtNode.getKey();
      if (!allowedMarks.includes(markName)) {
        return {
          valid: false,
          error: `Node "${parent.type}": text child has disallowed mark "${markName}". Allowed marks: ${allowedMarks.join(', ')}`,
        };
      }
    }
  }

  return { valid: true };
}
