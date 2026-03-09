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

/**
 * `ContentExpr` represents a parsed ProseMirror-compatible content expression.
 *
 * Content expressions define what children a node can contain using a grammar:
 *   expr       -> sequence ('|' sequence)*     // alternatives
 *   sequence   -> element+                     // sequence
 *   element    -> atom quantifier?             // element + quantifier
 *   atom       -> name | '(' expr ')'          // node type or group
 *   quantifier -> '+' | '*' | '?'              // 1+, 0+, 0-1
 */
export interface ContentExpr {
  type: 'node' | 'sequence' | 'alternative' | 'repeat';
  children?: Array<ContentExpr>;
  nodeType?: string;
  min?: number;
  max?: number;
}

type Token = {
  type: 'name' | 'plus' | 'star' | 'question' | 'pipe' | 'lparen' | 'rparen';
  value: string;
};

/**
 * `tokenize` splits a content expression string into tokens.
 */
function tokenize(expr: string): Array<Token> {
  const tokens: Array<Token> = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }
    if (expr[i] === '+') {
      tokens.push({ type: 'plus', value: '+' });
      i++;
    } else if (expr[i] === '*') {
      tokens.push({ type: 'star', value: '*' });
      i++;
    } else if (expr[i] === '?') {
      tokens.push({ type: 'question', value: '?' });
      i++;
    } else if (expr[i] === '|') {
      tokens.push({ type: 'pipe', value: '|' });
      i++;
    } else if (expr[i] === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      i++;
    } else if (expr[i] === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      i++;
    } else {
      let name = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      if (name) {
        tokens.push({ type: 'name', value: name });
      } else {
        throw new Error(
          `Unexpected character '${expr[i]}' at position ${i} in content expression`,
        );
      }
    }
  }
  return tokens;
}

/**
 * `parseAlternatives` parses alternatives separated by '|'.
 */
function parseAlternatives(
  tokens: Array<Token>,
  pos: number,
): { expr: ContentExpr; pos: number } {
  const seqs: Array<ContentExpr> = [];
  let result = parseSequence(tokens, pos);
  seqs.push(result.expr);
  while (result.pos < tokens.length && tokens[result.pos]?.type === 'pipe') {
    result = parseSequence(tokens, result.pos + 1);
    seqs.push(result.expr);
  }
  if (seqs.length === 1) {
    return { expr: seqs[0], pos: result.pos };
  }
  return { expr: { type: 'alternative', children: seqs }, pos: result.pos };
}

/**
 * `parseSequence` parses a sequence of elements.
 */
function parseSequence(
  tokens: Array<Token>,
  pos: number,
): { expr: ContentExpr; pos: number } {
  const elements: Array<ContentExpr> = [];
  while (
    pos < tokens.length &&
    tokens[pos].type !== 'pipe' &&
    tokens[pos].type !== 'rparen'
  ) {
    const result = parseElement(tokens, pos);
    elements.push(result.expr);
    pos = result.pos;
  }
  if (elements.length === 1) {
    return { expr: elements[0], pos };
  }
  return { expr: { type: 'sequence', children: elements }, pos };
}

/**
 * `parseElement` parses an atom optionally followed by a quantifier.
 */
function parseElement(
  tokens: Array<Token>,
  pos: number,
): { expr: ContentExpr; pos: number } {
  const result = parseAtom(tokens, pos);
  let expr = result.expr;
  pos = result.pos;
  if (pos < tokens.length) {
    if (tokens[pos].type === 'plus') {
      expr = { type: 'repeat', children: [expr], min: 1, max: Infinity };
      pos++;
    } else if (tokens[pos].type === 'star') {
      expr = { type: 'repeat', children: [expr], min: 0, max: Infinity };
      pos++;
    } else if (tokens[pos].type === 'question') {
      expr = { type: 'repeat', children: [expr], min: 0, max: 1 };
      pos++;
    }
  }
  return { expr, pos };
}

/**
 * `parseAtom` parses a name or a parenthesized sub-expression.
 */
function parseAtom(
  tokens: Array<Token>,
  pos: number,
): { expr: ContentExpr; pos: number } {
  if (pos >= tokens.length) {
    throw new Error('Unexpected end of content expression');
  }
  if (tokens[pos].type === 'lparen') {
    const result = parseAlternatives(tokens, pos + 1);
    if (result.pos >= tokens.length || tokens[result.pos]?.type !== 'rparen') {
      throw new Error('Unmatched parenthesis in content expression');
    }
    return { expr: result.expr, pos: result.pos + 1 };
  }
  if (tokens[pos].type !== 'name') {
    throw new Error(
      `Expected node type name but got '${tokens[pos].value}' in content expression`,
    );
  }
  return { expr: { type: 'node', nodeType: tokens[pos].value }, pos: pos + 1 };
}

/**
 * `parseContentExpression` parses a ProseMirror-compatible content expression
 * string into a `ContentExpr` AST.
 *
 * Examples:
 *   - `"paragraph+"` -> 1+ paragraphs
 *   - `"text*"` -> 0+ text nodes
 *   - `"heading paragraph+"` -> one heading then 1+ paragraphs
 *   - `"paragraph | heading"` -> one paragraph or one heading
 *   - `"(paragraph | heading)+"` -> 1+ of paragraph or heading
 *   - `"block+"` -> 1+ nodes from "block" group (resolved via groupResolver)
 */
export function parseContentExpression(expr: string): ContentExpr {
  const trimmed = expr.trim();
  if (trimmed.length === 0) {
    return { type: 'sequence', children: [] };
  }
  const tokens = tokenize(trimmed);
  const result = parseAlternatives(tokens, 0);
  if (result.pos < tokens.length) {
    throw new Error(
      `Unexpected token '${tokens[result.pos].value}' at position ${result.pos} in content expression`,
    );
  }
  return result.expr;
}

/**
 * `matchExpr` attempts to match child types starting at any of the given
 * positions against the expression. Returns the set of all reachable
 * positions after matching, enabling backtracking for ambiguous expressions
 * like `a* a`.
 */
function matchExpr(
  expr: ContentExpr,
  types: Array<string>,
  positions: Set<number>,
  resolver: (name: string) => Array<string>,
): Set<number> {
  switch (expr.type) {
    case 'node': {
      const allowed = resolver(expr.nodeType!);
      const result = new Set<number>();
      for (const pos of positions) {
        if (pos < types.length && allowed.includes(types[pos])) {
          result.add(pos + 1);
        }
      }
      return result;
    }
    case 'sequence': {
      let current = positions;
      for (const child of expr.children!) {
        current = matchExpr(child, types, current, resolver);
        if (current.size === 0) {
          return current;
        }
      }
      return current;
    }
    case 'alternative': {
      const result = new Set<number>();
      for (const child of expr.children!) {
        for (const pos of matchExpr(child, types, positions, resolver)) {
          result.add(pos);
        }
      }
      return result;
    }
    case 'repeat': {
      const min = expr.min ?? 0;
      const max = expr.max ?? Infinity;
      // Collect all positions reachable with 0..max repetitions
      let current = positions;
      const reachable = new Set<number>();
      if (min === 0) {
        for (const p of current) reachable.add(p);
      }
      for (let count = 1; count <= max; count++) {
        const next = matchExpr(expr.children![0], types, current, resolver);
        // Remove positions we've already seen to avoid infinite loops
        const newPositions = new Set<number>();
        for (const p of next) {
          if (!reachable.has(p) || count < min) {
            newPositions.add(p);
          }
        }
        if (newPositions.size === 0) break;
        current = newPositions;
        if (count >= min) {
          for (const p of current) reachable.add(p);
        }
      }
      return reachable;
    }
  }
  return new Set();
}

/**
 * `matchContentExpression` matches an array of child type names against
 * a parsed content expression. It uses the `groupResolver` to resolve
 * group names (like "block") to a list of concrete node type names.
 *
 * Returns `{ valid: true }` if the children match, or
 * `{ valid: false, error: string }` if they do not.
 */
export function matchContentExpression(
  expr: ContentExpr,
  childTypes: Array<string>,
  groupResolver: (name: string) => Array<string>,
): { valid: boolean; error?: string } {
  const positions = matchExpr(expr, childTypes, new Set([0]), groupResolver);
  if (positions.has(childTypes.length)) {
    return { valid: true };
  }
  if (positions.size === 0) {
    return { valid: false, error: 'Children do not match content expression' };
  }
  return {
    valid: false,
    error: `Unexpected child at position ${Math.max(...positions)}`,
  };
}
