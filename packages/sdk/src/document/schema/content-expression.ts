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
    if (expr[i] === ' ') {
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
  if (tokens[pos].type === 'lparen') {
    const result = parseAlternatives(tokens, pos + 1);
    // Skip the closing ')'
    return { expr: result.expr, pos: result.pos + 1 };
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
  const tokens = tokenize(expr.trim());
  const result = parseAlternatives(tokens, 0);
  return result.expr;
}

/**
 * `matchExpr` attempts to match child types starting at `pos` against
 * the given expression. Returns the new position after matching, or
 * `undefined` if matching fails.
 */
function matchExpr(
  expr: ContentExpr,
  types: Array<string>,
  pos: number,
  resolver: (name: string) => Array<string>,
): number | undefined {
  switch (expr.type) {
    case 'node': {
      const allowed = resolver(expr.nodeType!);
      if (pos < types.length && allowed.includes(types[pos])) {
        return pos + 1;
      }
      return undefined;
    }
    case 'sequence': {
      let current: number | undefined = pos;
      for (const child of expr.children!) {
        current = matchExpr(child, types, current, resolver);
        if (current === undefined) {
          return undefined;
        }
      }
      return current;
    }
    case 'alternative': {
      for (const child of expr.children!) {
        const result = matchExpr(child, types, pos, resolver);
        if (result !== undefined) {
          return result;
        }
      }
      return undefined;
    }
    case 'repeat': {
      const min = expr.min ?? 0;
      const max = expr.max ?? Infinity;
      let current = pos;
      let count = 0;
      while (count < max) {
        const result = matchExpr(expr.children![0], types, current, resolver);
        if (result === undefined || result === current) {
          break;
        }
        current = result;
        count++;
      }
      if (count < min) {
        return undefined;
      }
      return current;
    }
  }
  return undefined;
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
  const result = matchExpr(expr, childTypes, 0, groupResolver);
  if (result === undefined) {
    return { valid: false, error: 'Children do not match content expression' };
  }
  if (result < childTypes.length) {
    return {
      valid: false,
      error: `Unexpected child at position ${result}`,
    };
  }
  return { valid: true };
}
